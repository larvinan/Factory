package com.factoryguard.service;

import com.factoryguard.mapper.*;
import com.factoryguard.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
// MqttCallbackExtended 在主包中，通配导入已覆盖
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.*;

/**
 * MQTT 网关服务（RK3568 协议，见《MQTT数据格式.md》v1.0）
 *
 * 上行：订阅 factory/sensor/data（QoS 0，2 秒一次扁平 JSON）
 * 下行：发布 factory/device/cmd（QoS 0，{method, params}）
 * 另保留 fg/+/camera 视觉检测通道（ESP32-CAM，本期硬件未接入）
 */
@Service
public class MqttGatewayService {

    private static final Logger log = LoggerFactory.getLogger(MqttGatewayService.class);

    private final SensorReadingMapper sensorReadingMapper;
    private final AlertMapper alertMapper;
    private final CommandLogMapper commandLogMapper;
    private final DeviceStatusMapper deviceStatusMapper;
    private final WebSocketService webSocketService;
    private final AlertEngineService alertEngine;
    private final ObjectMapper objectMapper;
    private final RuleEngineService ruleEngine;
    private final StreamFrameService streamFrameService;

    @Value("${mqtt.local.host}")
    private String brokerUrl;

    @Value("${mqtt.local.client-id}")
    private String clientId;

    @Value("${mqtt.local.topics.sensor-data}")
    private String sensorDataTopic;

    @Value("${mqtt.local.topics.device-cmd}")
    private String deviceCmdTopic;

    @Value("${mqtt.local.topics.camera:fg/+/camera}")
    private String cameraTopic;

    /** 上行 topic 无设备标识，协议为单网关部署，设备名走配置 */
    @Value("${mqtt.local.default-device-id:rk3568_factory_001}")
    private String defaultDeviceId;

    @Value("${thresholds.device-offline-seconds:90}")
    private int offlineSeconds;

    private final DetectionMapper detectionMapper;

    private MqttClient mqttClient;
    private final ExecutorService cameraQueue = Executors.newSingleThreadExecutor();
    private final ExecutorService mqttWorker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mqtt-worker");
        t.setDaemon(true);
        return t;
    });
    private ScheduledExecutorService offlineScanner;

    public MqttGatewayService(SensorReadingMapper sensorReadingMapper,
                              AlertMapper alertMapper,
                              CommandLogMapper commandLogMapper,
                              DeviceStatusMapper deviceStatusMapper,
                              DetectionMapper detectionMapper,
                              WebSocketService webSocketService,
                              AlertEngineService alertEngine,
                              ObjectMapper objectMapper,
                              RuleEngineService ruleEngine,
                              StreamFrameService streamFrameService) {
        this.sensorReadingMapper = sensorReadingMapper;
        this.alertMapper = alertMapper;
        this.commandLogMapper = commandLogMapper;
        this.deviceStatusMapper = deviceStatusMapper;
        this.detectionMapper = detectionMapper;
        this.webSocketService = webSocketService;
        this.alertEngine = alertEngine;
        this.objectMapper = objectMapper;
        this.ruleEngine = ruleEngine;
        this.streamFrameService = streamFrameService;
    }

    @PostConstruct
    public void connect() {
        try {
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());
            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setKeepAliveInterval(60);
            options.setCleanSession(true);

            // 注意：不能用 MqttCallback，必须用 Extended 版本才能拿到重连事件
            mqttClient.setCallback(new MqttCallbackExtended() {
                @Override
                public void connectComplete(boolean reconnect, String serverURI) {
                    // Paho 自动重连后（cleanSession=true）订阅会丢失，必须重新订阅
                    try {
                        mqttClient.subscribe(new String[]{sensorDataTopic, cameraTopic},
                                             new int[]{0, 0});
                        log.info("MQTT {}完成并重新订阅: {}",
                                reconnect ? "自动重连" : "连接", serverURI);
                    } catch (MqttException e) {
                        log.error("重连后订阅失败: {}", e.getMessage());
                    }
                }

                @Override
                public void connectionLost(Throwable cause) {
                    log.warn("MQTT 断连: {}", cause.getMessage());
                }

                @Override
                public void messageArrived(String topic, MqttMessage message) {
                    // 关键：回调线程里绝不能做耗时/发布操作（Paho 会死锁），
                    // 只把消息转交独立工作线程，立即返回
                    // 注意：camera topic 是二进制 JPEG，必须保留原始字节，
                    // 不能经 String(UTF-8) 往返（无效字节会被替换为 U+FFFD 损坏图片）
                    byte[] payload = message.getPayload();
                    mqttWorker.submit(() -> {
                        try {
                            handleMessage(topic, payload);
                        } catch (Exception e) {
                            log.error("MQTT 消息处理异常: {}", e.getMessage());
                        }
                    });
                }

                @Override
                public void deliveryComplete(IMqttDeliveryToken token) {}
            });

            mqttClient.connect(options);
            // 协议约定只处理 QoS 0，订阅侧也用 0
            mqttClient.subscribe(new String[]{sensorDataTopic, cameraTopic},
                                 new int[]{0, 0});
            System.out.println("========================================");
            System.out.println("  [MQTT] Broker 连接成功！");
            System.out.println("  地址: " + brokerUrl);
            System.out.println("  订阅: " + sensorDataTopic + " (RK3568 传感器上行)");
            System.out.println("  下行: " + deviceCmdTopic + " (设备控制)");
            System.out.println("  等待 RK3568 网关上线...");
            System.out.println("========================================");

            startOfflineScanner();
        } catch (MqttException e) {
            log.error("MQTT 连接失败: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void disconnect() {
        if (offlineScanner != null) {
            offlineScanner.shutdownNow();
        }
        mqttWorker.shutdownNow();
        try {
            if (mqttClient != null && mqttClient.isConnected()) {
                mqttClient.disconnect();
            }
        } catch (MqttException e) {
            log.error("MQTT 断开异常: {}", e.getMessage());
        }
    }

    // ==================== 消息处理 ====================

    private void handleMessage(String topic, byte[] payload) {
        if (sensorDataTopic.equals(topic)) {
            handleSensorData(new String(payload, StandardCharsets.UTF_8));
        } else if (topic.contains("/camera")) {
            // 原始 JPEG 字节直接透传，不做任何编码转换
            // 硬件约定 topic 为 fg/{deviceId}/camera（如 rk_camera.c 的 fg/rk3568_factory_001/camera），解析真实设备号
            String camDeviceId = defaultDeviceId;
            if (topic.startsWith("fg/") && topic.endsWith("/camera") && topic.length() > 10) {
                String parsed = topic.substring(3, topic.length() - "/camera".length());
                if (!parsed.isBlank()) camDeviceId = parsed;
            }
            handleCamera(camDeviceId, payload);
        }
    }

    /**
     * 处理上行传感器数据（扁平 JSON：ts/temp/humi/mq5_ppm/.../stock）
     */
    private void handleSensorData(String jsonStr) {
        try {
            JsonNode root = objectMapper.readTree(jsonStr);
            String deviceId = defaultDeviceId;

            // ts 为 Unix 秒时间戳，0 表示 RK3568 时钟未同步，回退服务器时间
            long ts = root.path("ts").asLong(0);
            LocalDateTime timestamp = ts > 0
                    ? LocalDateTime.ofInstant(Instant.ofEpochSecond(ts), ZoneId.systemDefault())
                    : LocalDateTime.now();

            // 写入数据库
            SensorReading reading = new SensorReading();
            reading.setDeviceId(deviceId);
            reading.setTimestamp(timestamp);
            reading.setTemp(root.path("temp").floatValue());
            reading.setHumi(root.path("humi").floatValue());
            reading.setMq5Ppm(root.path("mq5_ppm").asInt());
            reading.setMq2Ppm(root.path("mq2_ppm").asInt());
            reading.setMq5Level(root.path("mq5_level").asInt());
            reading.setMq2Level(root.path("mq2_level").asInt());
            reading.setLdrAdc(root.path("ldr_adc").asInt());
            reading.setPir(root.path("pir").asInt());
            reading.setLightOn(root.path("light_on").asInt());
            reading.setRgbColor(root.path("rgb_color").asInt());
            reading.setBeep(root.path("beep").asInt());
            reading.setCount(root.path("count").asInt());
            reading.setStock(root.path("stock").asInt());
            sensorReadingMapper.insert(reading);

            // 更新设备状态（RK3568 无心跳包，收到数据即视为在线）
            upsertDeviceStatus(deviceId, reading);

            // WebSocket 推送（整条扁平数据，前端直接渲染）
            webSocketService.broadcast("sensors", jsonStr);

            // 阈值检查 + 告警联动
            List<Alert> alerts = alertEngine.checkSensorThresholds(deviceId, root);
            for (Alert alert : alerts) {
                alertMapper.insert(alert);
                webSocketService.broadcast("alert", objectMapper.writeValueAsString(alert));
            }

            // 智能联动规则引擎（用户自定义 Trigger-Action 规则）
            ruleEngine.evaluate(deviceId, root);
        } catch (Exception e) {
            // 带上原始报文定位硬件组包问题（如 DHT11 读失败拼出 "temp":, 这类非法 JSON）
            String preview = jsonStr.length() > 200 ? jsonStr.substring(0, 200) + "..." : jsonStr;
            log.error("处理传感器数据失败: {} | 原始报文: {}", e.getMessage(), preview);
        }
    }

    private void upsertDeviceStatus(String deviceId, SensorReading reading) {
        try {
            QueryWrapper<DeviceStatus> qw = new QueryWrapper<>();
            qw.eq("device_id", deviceId);
            DeviceStatus existing = deviceStatusMapper.selectOne(qw);

            boolean wasOffline = existing == null || existing.getOnline() == null
                    || existing.getOnline() == 0;

            DeviceStatus status = new DeviceStatus();
            status.setDeviceId(deviceId);
            status.setOnline(1);
            status.setLastHeartbeat(LocalDateTime.now());
            status.setLightOn(reading.getLightOn());
            status.setRgbColor(reading.getRgbColor());
            status.setBeep(reading.getBeep());
            status.setLastError("");

            if (existing != null) {
                status.setId(existing.getId());
                deviceStatusMapper.updateById(status);
            } else {
                deviceStatusMapper.insert(status);
            }

            if (wasOffline) {
                System.out.println("========================================");
                System.out.println("  [设备上线] " + deviceId);
                System.out.println("  RK3568 已连接，开始接收数据");
                System.out.println("========================================");
                webSocketService.broadcast("device_online",
                        "{\"device_id\":\"" + deviceId + "\"}");
            }
        } catch (Exception e) {
            log.error("更新设备状态失败: {}", e.getMessage());
        }
    }

    // ==================== 离线扫描 ====================

    /**
     * 上报周期 2 秒，超过 offlineSeconds 秒未收到数据判定离线
     */
    private void startOfflineScanner() {
        offlineScanner = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "offline-scanner");
            t.setDaemon(true);
            return t;
        });
        offlineScanner.scheduleAtFixedRate(this::scanOfflineDevices,
                offlineSeconds, 15, TimeUnit.SECONDS);
    }

    private void scanOfflineDevices() {
        try {
            QueryWrapper<DeviceStatus> qw = new QueryWrapper<>();
            qw.eq("online", 1);
            for (DeviceStatus ds : deviceStatusMapper.selectList(qw)) {
                if (ds.getLastHeartbeat() == null) continue;
                long silentSeconds = java.time.Duration.between(
                        ds.getLastHeartbeat(), LocalDateTime.now()).getSeconds();
                if (silentSeconds > offlineSeconds) {
                    DeviceStatus update = new DeviceStatus();
                    update.setId(ds.getId());
                    update.setOnline(0);
                    update.setLastError("超过 " + silentSeconds + " 秒未上报数据");
                    deviceStatusMapper.updateById(update);
                    log.warn("设备离线: {} ({}秒未上报)", ds.getDeviceId(), silentSeconds);
                    webSocketService.broadcast("device_offline",
                            objectMapper.writeValueAsString(update));
                }
            }
        } catch (Exception e) {
            log.error("离线扫描异常: {}", e.getMessage());
        }
    }

    // ==================== 视觉检测通道（RK3568/ESP32-CAM 视频流） ====================

    /** MQTT 帧自动推理节流间隔（毫秒），与小程序端 4 秒定时检测节奏一致 */
    @Value("${mqtt.camera-detect-interval-ms:4000}")
    private long cameraDetectIntervalMs;

    /** 复用连接：每帧新建 HttpClient 无谓开销；必须带超时——
     *  cameraQueue 是单线程且 updateFrame 也在同一队列，YOLO 一旦假死无超时会永久冻结视频流 */
    private final HttpClient yoloHttpClient = HttpClient.newBuilder().build();

    private volatile long lastAutoDetectAt = 0;

    private void handleCamera(String deviceId, byte[] jpegBytes) {
        cameraQueue.submit(() -> {
            try {
                // 每帧都沉淀为最新帧，供小程序轮询 /api/stream/latest 显示视频流
                streamFrameService.updateFrame(deviceId, jpegBytes);

                // 节流：间隔内的帧只缓存不推理，防止高频帧打爆 CPU 推理服务
                long now = System.currentTimeMillis();
                if (now - lastAutoDetectAt < cameraDetectIntervalMs) {
                    return;
                }
                lastAutoDetectAt = now;

                // 调用 Python YOLO 推理服务（10s 超时，防推理服务假死拖垮帧管道）
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:8001/detect"))
                        .header("Content-Type", "application/octet-stream")
                        .timeout(java.time.Duration.ofSeconds(10))
                        .POST(HttpRequest.BodyPublishers.ofByteArray(jpegBytes))
                        .build();
                HttpResponse<String> response = yoloHttpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    log.error("YOLO 推理服务返回错误: {}", response.statusCode());
                    return;
                }

                JsonNode result = objectMapper.readTree(response.body());
                JsonNode summary = result.path("summary");
                JsonNode persons = result.path("persons");
                if (!summary.isObject() || !persons.isArray()) {
                    log.warn("YOLO 返回格式异常(缺 summary/persons): {}", response.body());
                    return;
                }

                // 写入检测记录（camera 标记真实来源：RK3568 USB 摄像头，
                // 与小程序端 'rk3568_stream' 区分——排查"检测的是旧帧还是实时帧"时靠这个字段溯源）
                Detection det = new Detection();
                det.setTimestamp(LocalDateTime.now());
                det.setDeviceId(deviceId);
                det.setCamera("rk3568_usb");
                det.setPersonsJson(persons.toString());
                det.setTotal(summary.get("total_persons").asInt());
                det.setCompliant(summary.get("compliant").asInt());
                det.setNoHelmet(summary.get("no_helmet").asInt());
                det.setUnknown(summary.get("unknown").asInt());
                detectionMapper.insert(det);

                log.info("📸 YOLO检测: {}人(合规:{} 违规:{})",
                        det.getTotal(), det.getCompliant(), det.getNoHelmet());

                // WebSocket 推送
                webSocketService.broadcast("detection", objectMapper.writeValueAsString(result));

                // 安全帽告警
                for (JsonNode p : persons) {
                    if ("no_helmet".equals(p.get("status").asText())) {
                        Alert alert = new Alert();
                        alert.setTimestamp(LocalDateTime.now());
                        alert.setDeviceId(deviceId);
                        alert.setAlertType("no_helmet");
                        alert.setAlertLevel("warning");
                        alert.setRiskScore(10);
                        alert.setDetails(objectMapper.writeValueAsString(p));
                        alert.setHandled(0);
                        alertMapper.insert(alert);
                        webSocketService.broadcast("alert", objectMapper.writeValueAsString(alert));
                    }
                }
            } catch (Exception e) {
                log.error("摄像头帧处理失败: {}", e.getMessage());
            }
        });
    }

    // ==================== 指令下发（下行 factory/device/cmd，QoS 0） ====================

    /**
     * 按协议格式下发命令：{method, params}
     *
     * @param method 命令名：relay/rgb/beep/stock/stock_reset
     * @param params 命令参数（可为 null，如 stock_reset）
     * @param source manual=手动 / auto=告警联动
     * @param reason 触发原因（写指令日志）
     * @return 追踪 ID，发布失败返回 null
     */
    public String publishCommand(String deviceId, String method, Map<String, Object> params,
                                 String source, String reason) {
        String requestId = UUID.randomUUID().toString().substring(0, 12);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("method", method);
            payload.put("params", params == null ? Map.of() : params);

            String json = objectMapper.writeValueAsString(payload);
            mqttClient.publish(deviceCmdTopic, json.getBytes(StandardCharsets.UTF_8), 0, false);
            log.info("MQTT 指令: {} {} ({}, {})", deviceCmdTopic, json, source, reason);

            // 指令日志统一在网关记录，调用方无需关心
            CommandLog cmdLog = new CommandLog();
            cmdLog.setTimestamp(LocalDateTime.now());
            cmdLog.setDeviceId(deviceId);
            cmdLog.setTarget(method);
            cmdLog.setAction(params == null || params.isEmpty()
                    ? "(无参数)" : params.toString());
            cmdLog.setSource(source);
            cmdLog.setReason(reason);
            cmdLog.setRequestId(requestId);
            commandLogMapper.insert(cmdLog);
            return requestId;
        } catch (Exception e) {
            log.error("指令下发失败: {}", e.getMessage());
            return null;
        }
    }

    /** 便捷方法：构造 params 后下发 */
    public String publishCommand(String deviceId, String method, Map<String, Object> params) {
        return publishCommand(deviceId, method, params, "manual", "手动操作");
    }

    public String getDeviceCmdTopic() {
        return deviceCmdTopic;
    }
}
