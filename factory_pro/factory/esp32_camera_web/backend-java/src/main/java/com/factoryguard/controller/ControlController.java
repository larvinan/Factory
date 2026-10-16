package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.*;
import com.factoryguard.model.*;
import com.factoryguard.service.MqttGatewayService;
import com.factoryguard.service.WebSocketService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

/**
 * 设备控制接口（下行 factory/device/cmd，{method, params}，QoS 0）
 *
 * 协议命令：relay / rgb / beep / stock / stock_reset
 * stock 类命令会触发 STM32 Flash 整页擦写（寿命约1万次），仅限管理员确认操作
 */
@RestController
@RequestMapping("/api")
public class ControlController {

    private final MqttGatewayService mqttGateway;
    private final CommandLogMapper commandLogMapper;
    private final SensorReadingMapper sensorReadingMapper;
    private final DetectionMapper detectionMapper;
    private final AlertMapper alertMapper;
    private final DeviceStatusMapper deviceStatusMapper;
    private final WebSocketService webSocketService;

    public ControlController(MqttGatewayService mqttGateway, CommandLogMapper commandLogMapper,
                             SensorReadingMapper sensorReadingMapper, DetectionMapper detectionMapper,
                             AlertMapper alertMapper, DeviceStatusMapper deviceStatusMapper,
                             WebSocketService webSocketService) {
        this.mqttGateway = mqttGateway;
        this.commandLogMapper = commandLogMapper;
        this.sensorReadingMapper = sensorReadingMapper;
        this.detectionMapper = detectionMapper;
        this.alertMapper = alertMapper;
        this.deviceStatusMapper = deviceStatusMapper;
        this.webSocketService = webSocketService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "FactoryGuard",
                "websocketClients", webSocketService.getOnlineCount());
    }

    @GetMapping("/stats/summary")
    public Map<String, Object> getSummary() {
        String today = LocalDate.now().toString();

        // 今日检测统计（视觉通道，本期硬件未接入，有数据则统计）
        QueryWrapper<Detection> detQw = new QueryWrapper<>();
        detQw.ge("timestamp", today);
        detQw.select("COUNT(*) AS total, COALESCE(SUM(total),0) AS persons, "
                    + "COALESCE(SUM(compliant),0) AS compliant, COALESCE(SUM(no_helmet),0) AS noHelmet");
        List<Map<String, Object>> detStats = detectionMapper.selectMaps(detQw);

        // 今日告警数
        QueryWrapper<Alert> altQw = new QueryWrapper<>();
        altQw.ge("timestamp", today);
        long alertCount = alertMapper.selectCount(altQw);

        // 今日最后一条读数（计数/库存）
        SensorReading lastReading = getLatestReading(today);

        Map<String, Object> det = detStats.isEmpty() ? Map.of() : detStats.get(0);
        return Map.of("status", "ok", "data", Map.of(
            "date", today,
            "totalDetections", det.getOrDefault("total", 0),
            "totalPersons", det.getOrDefault("persons", 0),
            "compliant", det.getOrDefault("compliant", 0),
            "noHelmet", det.getOrDefault("noHelmet", 0),
            "totalAlerts", alertCount,
            "todayCount", lastReading != null && lastReading.getCount() != null ? lastReading.getCount() : 0,
            "stock", lastReading != null && lastReading.getStock() != null ? lastReading.getStock() : 0
        ));
    }

    @GetMapping("/counter")
    public Map<String, Object> getCounter() {
        String today = LocalDate.now().toString();
        SensorReading last = getLatestReading(today);
        SensorReading first = getFirstReading(today);

        // 协议说明：count 为 RAM 实时计数，stock 为 Flash 持久化库存
        int lastCount = last != null && last.getCount() != null ? last.getCount() : 0;
        int firstCount = first != null && first.getCount() != null ? first.getCount() : 0;
        int stock = last != null && last.getStock() != null ? last.getStock() : 0;
        return Map.of("status", "ok", "data", Map.of(
            "todayCount", Math.max(0, lastCount - firstCount),
            "totalCount", lastCount,
            "stock", stock
        ));
    }

    @GetMapping("/devices/status")
    public Map<String, Object> getDevices() {
        List<DeviceStatus> devices = deviceStatusMapper.selectList(null);
        return Map.of("status", "ok", "data", devices);
    }

    // ==================== 手动控制（协议 3.2 命令列表） ====================

    /** 控制继电器灯：relay val=1 开 / 0 关 */
    @PostMapping("/control/{deviceId}/relay")
    public Map<String, Object> controlRelay(@PathVariable String deviceId,
                                            @RequestBody Map<String, Object> body) {
        int val = toInt(body.get("val"), -1);
        if (val != 0 && val != 1) {
            return Map.of("status", "error", "message", "val 取值必须为 0 或 1");
        }
        String reason = str(body.get("reason"), "手动操作");
        String requestId = mqttGateway.publishCommand(deviceId, "relay", Map.of("val", val),
                "manual", reason);
        return resp(requestId, Map.of("method", "relay", "val", val));
    }

    /** 设置 RGB 指示灯颜色：rgb val=0~7 */
    @PostMapping("/control/{deviceId}/rgb")
    public Map<String, Object> controlRgb(@PathVariable String deviceId,
                                          @RequestBody Map<String, Object> body) {
        int val = toInt(body.get("val"), -1);
        if (val < 0 || val > 7) {
            return Map.of("status", "error", "message", "val 取值必须为 0~7");
        }
        String reason = str(body.get("reason"), "手动操作");
        String requestId = mqttGateway.publishCommand(deviceId, "rgb", Map.of("val", val),
                "manual", reason);
        return resp(requestId, Map.of("method", "rgb", "val", val));
    }

    /** 控制蜂鸣器节奏：beep on_ms/off_ms，两参都 0 = 静音 */
    @PostMapping("/control/{deviceId}/beep")
    public Map<String, Object> controlBeep(@PathVariable String deviceId,
                                           @RequestBody Map<String, Object> body) {
        // 协议限制：uint8 0~255
        int onMs = Math.min(255, Math.max(0, toInt(body.get("on_ms"), 0)));
        int offMs = Math.min(255, Math.max(0, toInt(body.get("off_ms"), 0)));
        String reason = str(body.get("reason"), "手动操作");
        String requestId = mqttGateway.publishCommand(deviceId, "beep",
                Map.of("on_ms", onMs, "off_ms", offMs), "manual", reason);
        return resp(requestId, Map.of("method", "beep", "on_ms", onMs, "off_ms", offMs));
    }

    /**
     * 改写 Flash 库存：stock val=0~65535
     * ⚠️ 触发 Flash 整页擦写（寿命约 1 万次），仅限管理员确认操作，勿高频调用
     */
    @PostMapping("/control/{deviceId}/stock")
    public Map<String, Object> controlStock(@PathVariable String deviceId,
                                            @RequestBody Map<String, Object> body) {
        int val = toInt(body.get("val"), -1);
        if (val < 0 || val > 65535) {
            return Map.of("status", "error", "message", "val 取值必须为 0~65535");
        }
        String reason = str(body.get("reason"), "管理员确认改写库存");
        String requestId = mqttGateway.publishCommand(deviceId, "stock", Map.of("val", val),
                "manual", reason + "（Flash擦写，注意寿命）");
        return resp(requestId, Map.of("method", "stock", "val", val));
    }

    /** 清零 Flash 库存：stock_reset（同 stock val=0，无需 params） */
    @PostMapping("/control/{deviceId}/stock_reset")
    public Map<String, Object> controlStockReset(@PathVariable String deviceId,
                                                 @RequestBody(required = false) Map<String, Object> body) {
        String reason = str(body == null ? null : body.get("reason"), "管理员确认清零库存");
        String requestId = mqttGateway.publishCommand(deviceId, "stock_reset", Map.of(),
                "manual", reason + "（Flash擦写，注意寿命）");
        return resp(requestId, Map.of("method", "stock_reset"));
    }

    // ==================== 工具方法 ====================

    private SensorReading getLatestReading(String today) {
        QueryWrapper<SensorReading> qw = new QueryWrapper<>();
        qw.ge("timestamp", today).orderByDesc("timestamp").last("LIMIT 1");
        return sensorReadingMapper.selectOne(qw);
    }

    private SensorReading getFirstReading(String today) {
        QueryWrapper<SensorReading> qw = new QueryWrapper<>();
        qw.ge("timestamp", today).orderByAsc("timestamp").last("LIMIT 1");
        return sensorReadingMapper.selectOne(qw);
    }

    private Map<String, Object> resp(String requestId, Map<String, Object> data) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("status", requestId != null ? "ok" : "error");
        r.put("request_id", requestId);
        r.put("data", data);
        return r;
    }

    private int toInt(Object v, int def) {
        if (v instanceof Number n) return n.intValue();
        try {
            return v == null ? def : Integer.parseInt(v.toString());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private String str(Object v, String def) {
        return v == null || v.toString().isEmpty() ? def : v.toString();
    }
}
