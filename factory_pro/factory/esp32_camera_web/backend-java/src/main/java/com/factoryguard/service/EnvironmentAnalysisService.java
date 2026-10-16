package com.factoryguard.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.SensorReadingMapper;
import com.factoryguard.model.SensorReading;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 环境安全智能分析服务（适配 RK3568+STM32 新硬件协议）
 * 读取最新传感器数据 → 评估各项安全状态 → 综合安全等级 → 生成应对措施
 * 阈值与 application.yml 对齐：temp>45 / mq5>900 / mq2>300
 */
@Service
public class EnvironmentAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(EnvironmentAnalysisService.class);

    private final SensorReadingMapper sensorReadingMapper;
    private final MqttGatewayService mqttGateway;

    @Value("${thresholds.temperature-high:45.0}")
    private double temperatureHigh;

    @Value("${thresholds.temperature-critical:60.0}")
    private double temperatureCritical;

    @Value("${thresholds.mq5-ppm-high:900}")
    private int mq5PpmHigh;

    @Value("${thresholds.mq2-ppm-high:300}")
    private int mq2PpmHigh;

    public EnvironmentAnalysisService(SensorReadingMapper sensorReadingMapper, MqttGatewayService mqttGateway) {
        this.sensorReadingMapper = sensorReadingMapper;
        this.mqttGateway = mqttGateway;
    }

    /**
     * 分析当前环境安全状况
     * @param autoControl 是否自动执行联动控制（RGB 指示灯 + 蜂鸣器）
     */
    public Map<String, Object> analyze(boolean autoControl) {
        // 1. 获取最新传感器数据
        QueryWrapper<SensorReading> qw = new QueryWrapper<>();
        qw.orderByDesc("timestamp").last("LIMIT 1");
        SensorReading latest = sensorReadingMapper.selectOne(qw);

        if (latest == null) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("level", "unknown");
            empty.put("score", 0);
            empty.put("message", "暂无传感器数据");
            empty.put("items", Collections.emptyList());
            empty.put("actions", Collections.emptyList());
            empty.put("timestamp", new Date().toString());
            return empty;
        }

        // 2. 逐项分析传感器
        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> actions = new ArrayList<>();
        Set<String> triggeredTypes = new LinkedHashSet<>();
        String overallLevel = "safe";
        int riskSum = 0;

        // 温度
        if (latest.getTemp() != null) {
            double temp = latest.getTemp();
            String level = "safe";
            String status = "正常";
            int risk = 0;
            if (temp >= temperatureCritical) {
                level = "critical"; status = "严重超标"; risk = 30;
                triggeredTypes.add("temperature_high");
                addActionsTemp(actions, temp, true);
            } else if (temp >= temperatureHigh) {
                level = "warning"; status = "偏高"; risk = 15;
                triggeredTypes.add("temperature_high");
                addActionsTemp(actions, temp, false);
            }
            items.add(buildItem("temperature", "温度", temp + "°C", level, status, risk,
                    "阈值 " + temperatureHigh + "/" + temperatureCritical + "°C"));
            riskSum += risk;
            overallLevel = upgradeLevel(overallLevel, level);
        }

        // 可燃气 MQ-5（后端直接上报 ppm）
        if (latest.getMq5Ppm() != null) {
            int ppm = latest.getMq5Ppm();
            String level = "safe";
            String status = "正常";
            int risk = 0;
            if (ppm >= mq5PpmHigh * 3 / 2) {
                level = "critical"; status = "严重泄漏"; risk = 50;
                triggeredTypes.add("gas_leak");
                addActionsGas(actions, ppm, true);
            } else if (ppm >= mq5PpmHigh) {
                level = "critical"; status = "泄漏"; risk = 35;
                triggeredTypes.add("gas_leak");
                addActionsGas(actions, ppm, false);
            }
            items.add(buildItem("gas", "燃气浓度", ppm + "ppm", level, status, risk,
                    "阈值 " + mq5PpmHigh + "ppm"));
            riskSum += risk;
            overallLevel = upgradeLevel(overallLevel, level);
        }

        // 烟雾 MQ-2（后端直接上报 ppm）
        if (latest.getMq2Ppm() != null) {
            int ppm = latest.getMq2Ppm();
            String level = "safe";
            String status = "正常";
            int risk = 0;
            if (ppm >= mq2PpmHigh * 3 / 2) {
                level = "critical"; status = "严重超标"; risk = 40;
                triggeredTypes.add("fire_smoke");
                addActionsSmoke(actions, ppm, true);
            } else if (ppm >= mq2PpmHigh) {
                level = "danger"; status = "超标"; risk = 25;
                triggeredTypes.add("fire_smoke");
                addActionsSmoke(actions, ppm, false);
            }
            items.add(buildItem("smoke", "烟雾浓度", ppm + "ppm", level, status, risk,
                    "阈值 " + mq2PpmHigh + "ppm"));
            riskSum += risk;
            overallLevel = upgradeLevel(overallLevel, level);
        }

        // 湿度
        if (latest.getHumi() != null) {
            double hum = latest.getHumi();
            String level = "safe";
            String status = "正常";
            int risk = 0;
            if (hum > 85) { level = "warning"; status = "过高"; risk = 10; }
            else if (hum < 20) { level = "warning"; status = "过低"; risk = 10; }
            items.add(buildItem("humidity", "湿度", hum + "%", level, status, risk,
                    "适宜范围 20-85%"));
            riskSum += risk;
            overallLevel = upgradeLevel(overallLevel, level);
        }

        // 人员检测（PIR 人体红外，新协议语义）
        if (latest.getPir() != null && latest.getPir() == 1) {
            items.add(buildItem("presence", "人员检测", "有人", "safe", "正常", 0,
                    "PIR 检测到人员存在"));
        } else {
            items.add(buildItem("presence", "人员检测", "无人", "safe", "正常", 0,
                    "PIR 未检测到人员"));
        }

        // 货物计数 / 库存（仅展示，不计风险）
        if (latest.getCount() != null) {
            items.add(buildItem("goods", "货物计数", String.valueOf(latest.getCount()), "safe", "正常", 0,
                    "RAM 实时计数"));
        }
        if (latest.getStock() != null) {
            items.add(buildItem("stock", "库存", String.valueOf(latest.getStock()), "safe", "正常", 0,
                    "Flash 持久化库存"));
        }

        // 3. 综合安全评分（0-100，越高越安全）
        int score = Math.max(0, 100 - riskSum);

        // 4. 自动联动控制
        List<Map<String, Object>> executedControls = new ArrayList<>();
        if (autoControl && !triggeredTypes.isEmpty()) {
            executedControls = executeAutoControl(latest.getDeviceId(), triggeredTypes);
        }

        // 5. 生成总结
        String message = generateMessage(overallLevel, triggeredTypes);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("level", overallLevel);
        result.put("score", score);
        result.put("message", message);
        result.put("items", items);
        result.put("actions", actions);
        result.put("executedControls", executedControls);
        result.put("autoControl", autoControl);
        result.put("timestamp", latest.getTimestamp() != null ? latest.getTimestamp().toString() : new Date().toString());
        result.put("deviceId", latest.getDeviceId());

        log.info("🔍 环境分析完成: level={}, score={}, actions={}, autoExecuted={}",
                overallLevel, score, actions.size(), executedControls.size());

        return result;
    }

    private Map<String, Object> buildItem(String key, String label, String value,
                                          String level, String status, int risk, String threshold) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        item.put("label", label);
        item.put("value", value);
        item.put("level", level);
        item.put("status", status);
        item.put("risk", risk);
        item.put("threshold", threshold);
        return item;
    }

    private void addActionsTemp(List<Map<String, Object>> actions, double temp, boolean critical) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("type", "rgb");
        a.put("device", "RGB 指示灯");
        a.put("action", "yellow");
        a.put("reason", "温度" + (critical ? "严重超标" : "偏高") + " (" + temp + "°C)，指示灯转黄预警");
        a.put("priority", critical ? "high" : "medium");
        a.put("autoExecuted", false);
        actions.add(a);
    }

    private void addActionsSmoke(List<Map<String, Object>> actions, int ppm, boolean critical) {
        Map<String, Object> a1 = new LinkedHashMap<>();
        a1.put("type", "beep");
        a1.put("device", "蜂鸣器");
        a1.put("action", "on");
        a1.put("reason", "烟雾浓度" + (critical ? "严重超标" : "超标") + " (" + ppm + "ppm)，触发蜂鸣器报警疏散人员");
        a1.put("priority", "high");
        a1.put("autoExecuted", false);
        actions.add(a1);

        Map<String, Object> a2 = new LinkedHashMap<>();
        a2.put("type", "rgb");
        a2.put("device", "RGB 指示灯");
        a2.put("action", "red");
        a2.put("reason", "烟雾超标，指示灯转红警示");
        a2.put("priority", "high");
        a2.put("autoExecuted", false);
        actions.add(a2);
    }

    private void addActionsGas(List<Map<String, Object>> actions, int ppm, boolean critical) {
        Map<String, Object> a1 = new LinkedHashMap<>();
        a1.put("type", "beep");
        a1.put("device", "蜂鸣器");
        a1.put("action", "on");
        a1.put("reason", "燃气" + (critical ? "严重泄漏" : "泄漏") + " (" + ppm + "ppm)，触发蜂鸣器紧急报警");
        a1.put("priority", "high");
        a1.put("autoExecuted", false);
        actions.add(a1);

        Map<String, Object> a2 = new LinkedHashMap<>();
        a2.put("type", "rgb");
        a2.put("device", "RGB 指示灯");
        a2.put("action", "red");
        a2.put("reason", "燃气泄漏，指示灯转红警示现场人员");
        a2.put("priority", "high");
        a2.put("autoExecuted", false);
        actions.add(a2);
    }

    /**
     * 执行自动联动控制（新协议：rgb 颜色 + beep 节奏）
     */
    private List<Map<String, Object>> executeAutoControl(String deviceId, Set<String> triggeredTypes) {
        List<Map<String, Object>> executed = new ArrayList<>();
        try {
            if (triggeredTypes.contains("gas_leak") || triggeredTypes.contains("fire_smoke")) {
                // 燃气泄漏/烟雾：红灯 + 蜂鸣滴答（与 AlertEngineService 联动策略一致）
                mqttGateway.publishCommand(deviceId, "rgb", Map.of("val", 1), "auto", "环境分析联动: 红灯警示");
                mqttGateway.publishCommand(deviceId, "beep", Map.of("on_ms", 200, "off_ms", 200), "auto", "环境分析联动: 蜂鸣报警");
                executed.add(buildExecuted("rgb", "RGB 指示灯", "red", "红灯警示"));
                executed.add(buildExecuted("beep", "蜂鸣器", "on", "紧急报警"));
            } else if (triggeredTypes.contains("temperature_high")) {
                // 温度高：黄灯预警
                mqttGateway.publishCommand(deviceId, "rgb", Map.of("val", 3), "auto", "环境分析联动: 黄灯预警");
                executed.add(buildExecuted("rgb", "RGB 指示灯", "yellow", "温度预警"));
            }
        } catch (Exception e) {
            log.warn("自动联动控制失败: {}", e.getMessage());
        }
        return executed;
    }

    private Map<String, Object> buildExecuted(String type, String device, String action, String reason) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("type", type);
        e.put("device", device);
        e.put("action", action);
        e.put("reason", reason);
        e.put("autoExecuted", true);
        return e;
    }

    private String upgradeLevel(String current, String next) {
        int currentRank = levelRank(current);
        int nextRank = levelRank(next);
        return nextRank > currentRank ? next : current;
    }

    private int levelRank(String level) {
        switch (level) {
            case "critical": return 4;
            case "danger": return 3;
            case "warning": return 2;
            case "safe": return 1;
            default: return 0;
        }
    }

    private String generateMessage(String level, Set<String> types) {
        if (types.isEmpty()) {
            return "当前环境安全，各项指标正常";
        }
        switch (level) {
            case "critical":
                return "⚠️ 紧急！检测到" + String.join("、", translateTypes(types)) + "，已生成应急处置方案";
            case "danger":
                return "⚠️ 危险！检测到" + String.join("、", translateTypes(types)) + "，请及时处理";
            case "warning":
                return "⚠ 预警：检测到" + String.join("、", translateTypes(types)) + "，建议采取措施";
            default:
                return "环境状态正常";
        }
    }

    private List<String> translateTypes(Set<String> types) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("temperature_high", "温度过高");
        map.put("fire_smoke", "烟雾超标");
        map.put("gas_leak", "燃气泄漏");
        List<String> result = new ArrayList<>();
        for (String t : types) {
            result.add(map.getOrDefault(t, t));
        }
        return result;
    }
}
