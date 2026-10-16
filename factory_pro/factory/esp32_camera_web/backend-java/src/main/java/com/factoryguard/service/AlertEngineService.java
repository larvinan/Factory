package com.factoryguard.service;

import com.factoryguard.model.Alert;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 告警引擎（对齐《MQTT数据格式.md》2.2 业务逻辑）
 *
 * 气体报警：mq5_ppm > 900 或 mq2_ppm > 300 → 硬件联动 rgb=红 + beep 滴答
 * 上报周期 2 秒，因此只在「安全→超标」状态翻转时落库告警，避免告警刷屏；
 * 「超标→安全」恢复时自动解除联动（rgb 关 + beep 静音）
 */
@Service
public class AlertEngineService {

    private static final Logger log = LoggerFactory.getLogger(AlertEngineService.class);

    // 阈值不再来自 application.yml 静态绑定，改为运行时可调（app_config 表，前端废气监测页可修改）
    private static final double DEFAULT_TEMPERATURE_HIGH = 45.0;
    private static final double DEFAULT_MQ5_PPM_HIGH = 900;
    private static final double DEFAULT_MQ2_PPM_HIGH = 300;

    /** 告警硬件联动开关（application.yml: thresholds.alarm-linkage-enabled） */
    @Value("${thresholds.alarm-linkage-enabled:true}")
    private boolean linkageEnabled;

    private final MqttGatewayService mqttGateway;
    private final ThresholdService thresholdService;

    /** 每设备的告警状态：true=当前处于超标告警中 */
    private final Map<String, Boolean> alarmingState = new ConcurrentHashMap<>();

    public AlertEngineService(@Lazy MqttGatewayService mqttGateway,
                              ThresholdService thresholdService) {
        this.mqttGateway = mqttGateway;
        this.thresholdService = thresholdService;
    }

    /**
     * 检查传感器阈值，返回本轮新产生的告警（仅状态翻转时产生）
     */
    public List<Alert> checkSensorThresholds(String deviceId, JsonNode root) {
        List<Alert> alerts = new ArrayList<>();

        double temperatureHigh = thresholdService.get("temperature_high", DEFAULT_TEMPERATURE_HIGH);
        int mq5PpmHigh = (int) thresholdService.get("mq5_ppm_high", DEFAULT_MQ5_PPM_HIGH);
        int mq2PpmHigh = (int) thresholdService.get("mq2_ppm_high", DEFAULT_MQ2_PPM_HIGH);

        // 温度过高（warning，只告警不联动）
        double temp = root.path("temp").asDouble();
        if (temp > temperatureHigh) {
            alerts.add(makeAlert(deviceId, "temperature_high", "warning", 10,
                    "温度过高: " + temp + "℃"));
        }

        // 气体类告警统一按状态翻转处理
        int mq5 = root.path("mq5_ppm").asInt();
        int mq2 = root.path("mq2_ppm").asInt();
        boolean gasAlarm = mq5 > mq5PpmHigh;
        boolean smokeAlarm = mq2 > mq2PpmHigh;
        boolean shouldAlarm = gasAlarm || smokeAlarm;
        boolean wasAlarming = Boolean.TRUE.equals(alarmingState.get(deviceId));

        if (shouldAlarm && !wasAlarming) {
            if (gasAlarm) {
                // MQ5 可燃气泄漏：紧急
                alerts.add(makeAlert(deviceId, "gas_leak", "emergency", 30,
                        "可燃气泄漏: " + mq5 + "ppm (阈值" + mq5PpmHigh + ")"));
            }
            if (smokeAlarm) {
                // MQ2 烟雾：严重
                alerts.add(makeAlert(deviceId, "fire_smoke", "serious", 20,
                        "烟雾超标: " + mq2 + "ppm (阈值" + mq2PpmHigh + ")"));
            }
            if (linkageEnabled) {
                triggerAlarmDevices(deviceId);
            }
            alarmingState.put(deviceId, true);
            log.warn("⚠️ 气体告警触发 mq5={}ppm mq2={}ppm", mq5, mq2);
        } else if (!shouldAlarm && wasAlarming) {
            // 恢复正常：解除硬件联动
            if (linkageEnabled) {
                releaseAlarmDevices(deviceId);
            }
            alarmingState.put(deviceId, false);
            log.info("✅ 气体告警恢复 mq5={}ppm mq2={}ppm", mq5, mq2);
        }

        if (!alerts.isEmpty()) {
            log.info("⚠️ 传感器告警: {}条", alerts.size());
        }
        return alerts;
    }

    /** 联动：RGB 红灯 + 蜂鸣器滴答（协议 3.2 第 2/3 条命令） */
    private void triggerAlarmDevices(String deviceId) {
        mqttGateway.publishCommand(deviceId, "rgb", Map.of("val", 1),
                "auto", "气体超标告警联动: 红灯");
        mqttGateway.publishCommand(deviceId, "beep",
                Map.of("on_ms", 200, "off_ms", 200),
                "auto", "气体超标告警联动: 蜂鸣滴答");
    }

    /** 解除联动：RGB 关 + 蜂鸣器静音（on_ms=0 即静音） */
    private void releaseAlarmDevices(String deviceId) {
        mqttGateway.publishCommand(deviceId, "rgb", Map.of("val", 0),
                "auto", "气体告警恢复: 关闭指示灯");
        mqttGateway.publishCommand(deviceId, "beep",
                Map.of("on_ms", 0, "off_ms", 0),
                "auto", "气体告警恢复: 蜂鸣器静音");
    }

    private Alert makeAlert(String deviceId, String type, String level, int risk, String msg) {
        Alert alert = new Alert();
        alert.setTimestamp(LocalDateTime.now());
        alert.setDeviceId(deviceId);
        alert.setAlertType(type);
        alert.setAlertLevel(level);
        alert.setRiskScore(risk);
        alert.setDetails("{\"message\":\"" + msg + "\"}");
        alert.setHandled(0);
        return alert;
    }
}
