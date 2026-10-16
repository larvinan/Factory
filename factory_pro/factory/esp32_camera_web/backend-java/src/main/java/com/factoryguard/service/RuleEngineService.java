package com.factoryguard.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.AutomationRuleMapper;
import com.factoryguard.model.AutomationRule;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 智能联动规则引擎
 *
 * 设计参考 Home Assistant 的 Trigger-Action 自动化模式：
 * - Trigger：字段阈值（numeric_state trigger）
 * - Action：下发 MQTT 设备命令
 * - 去抖：借鉴 HA 的 hysteresis 思想，只在「未命中 → 命中」状态翻转瞬间执行一次动作，
 *   避免每 2 秒一帧的数据流对执行器高频重复下发
 *
 * 数据流：MqttGatewayService.handleSensorData → evaluate(每帧)
 */
@Service
public class RuleEngineService {

    private static final Logger log = LoggerFactory.getLogger(RuleEngineService.class);

    /** 允许作为触发字段的协议字段（白名单，防止 SQL/路径注入） */
    private static final Map<String, String> FIELD_JSON_KEY = Map.ofEntries(
            Map.entry("temp", "temp"),
            Map.entry("humi", "humi"),
            Map.entry("mq5_ppm", "mq5_ppm"),
            Map.entry("mq2_ppm", "mq2_ppm"),
            Map.entry("ldr_adc", "ldr_adc"),
            Map.entry("pir", "pir"),
            Map.entry("light_on", "light_on"),
            Map.entry("count", "count"),
            Map.entry("stock", "stock")
    );

    /** 允许下发的动作命令白名单（必须与硬件协议 3.2 一致） */
    private static final Map<String, Integer> ACTION_MAX = Map.of(
            "relay", 1,   // val 0/1
            "rgb", 7,     // val 0~7
            "beep", 255   // on_ms/off_ms 0~255
    );

    private final AutomationRuleMapper ruleMapper;
    private final MqttGatewayService mqttGateway;
    private final ObjectMapper objectMapper;

    public RuleEngineService(AutomationRuleMapper ruleMapper,
                             @Lazy MqttGatewayService mqttGateway,
                             ObjectMapper objectMapper) {
        this.ruleMapper = ruleMapper;
        this.mqttGateway = mqttGateway;
        this.objectMapper = objectMapper;
    }

    /**
     * 每帧传感器数据到达时评估所有启用规则
     */
    public void evaluate(String deviceId, JsonNode root) {
        List<AutomationRule> rules;
        try {
            QueryWrapper<AutomationRule> qw = new QueryWrapper<>();
            qw.eq("enabled", 1);
            rules = ruleMapper.selectList(qw);
        } catch (Exception e) {
            log.error("规则引擎读取规则失败: {}", e.getMessage());
            return;
        }
        if (rules == null || rules.isEmpty()) return;

        for (AutomationRule rule : rules) {
            try {
                evaluateOne(deviceId, rule, root);
            } catch (Exception e) {
                log.error("规则[{}]评估异常: {}", rule.getName(), e.getMessage());
            }
        }
    }

    private void evaluateOne(String deviceId, AutomationRule rule, JsonNode root) {
        String jsonKey = FIELD_JSON_KEY.get(rule.getField());
        if (jsonKey == null) return;

        JsonNode valNode = root.path(jsonKey);
        if (valNode.isMissingNode() || !valNode.isNumber()) return;
        double value = valNode.asDouble();

        boolean hit = compare(value, rule.getOperator(), rule.getThreshold());
        boolean lastState = rule.getLastState() != null && rule.getLastState() == 1;

        if (hit && !lastState) {
            // 「未命中 → 命中」翻转瞬间：执行动作
            fire(deviceId, rule, value);
            AutomationRule update = new AutomationRule();
            update.setId(rule.getId());
            update.setLastState(1);
            update.setLastFiredAt(LocalDateTime.now());
            ruleMapper.updateById(update);
        } else if (!hit && lastState) {
            // 「命中 → 未命中」：仅复位状态，不执行动作
            AutomationRule update = new AutomationRule();
            update.setId(rule.getId());
            update.setLastState(0);
            ruleMapper.updateById(update);
            log.info("规则[{}]条件恢复 ({} {} {})", rule.getName(), rule.getField(), rule.getOperator(), rule.getThreshold());
        }
    }

    private void fire(String deviceId, AutomationRule rule, double value) {
        String method = rule.getActionMethod();
        if (!ACTION_MAX.containsKey(method)) {
            log.warn("规则[{}]动作命令不在白名单: {}", rule.getName(), method);
            return;
        }
        Map<String, Object> params;
        try {
            params = objectMapper.readValue(rule.getActionParams() == null ? "{}" : rule.getActionParams(), Map.class);
        } catch (Exception e) {
            log.error("规则[{}]动作参数解析失败: {}", rule.getName(), rule.getActionParams());
            return;
        }
        // 参数范围钳制（uint8 等协议限制）
        params = clampParams(method, params);
        String reason = "联动规则: " + rule.getName()
                + " (" + rule.getField() + " " + opSymbol(rule.getOperator()) + " " + rule.getThreshold()
                + ", 实际=" + value + ")";
        log.info("⚡ 规则触发 [{}] → {} {}", rule.getName(), method, params);
        mqttGateway.publishCommand(deviceId, method, params, "auto", reason);
    }

    private boolean compare(double value, String op, Double threshold) {
        if (threshold == null) return false;
        switch (op == null ? "" : op) {
            case "gt": return value > threshold;
            case "lt": return value < threshold;
            case "eq": return Math.abs(value - threshold) < 1e-6;
            default: return false;
        }
    }

    private String opSymbol(String op) {
        return switch (op == null ? "" : op) {
            case "gt" -> ">";
            case "lt" -> "<";
            case "eq" -> "=";
            default -> op;
        };
    }

    /** 按协议上限钳制参数值（beep 的 on_ms/off_ms ≤255 等） */
    @SuppressWarnings("unchecked")
    private Map<String, Object> clampParams(String method, Map<String, Object> params) {
        Map<String, Object> out = new HashMap<>(params);
        int max = ACTION_MAX.get(method);
        for (Map.Entry<String, Object> e : out.entrySet()) {
            if (e.getValue() instanceof Number n) {
                int v = n.intValue();
                if (v < 0) out.put(e.getKey(), 0);
                else if (v > max) out.put(e.getKey(), max);
            }
        }
        return out;
    }

    /** 校验并规范化前端提交的规则，非法返回错误信息，合法返回 null */
    public String validate(AutomationRule rule) {
        if (rule.getName() == null || rule.getName().trim().isEmpty()) return "规则名称不能为空";
        if (!FIELD_JSON_KEY.containsKey(rule.getField())) return "不支持的触发字段: " + rule.getField();
        if (!"gt".equals(rule.getOperator()) && !"lt".equals(rule.getOperator()) && !"eq".equals(rule.getOperator())) {
            return "比较符必须为 gt/lt/eq";
        }
        if (rule.getThreshold() == null) return "阈值不能为空";
        if (!ACTION_MAX.containsKey(rule.getActionMethod())) return "不支持的action_method: " + rule.getActionMethod();
        // 动作参数必须是合法 JSON 对象，且 method 限定在白名单
        try {
            Map<?, ?> p = objectMapper.readValue(rule.getActionParams() == null ? "{}" : rule.getActionParams(), Map.class);
            for (Map.Entry<?, ?> e : p.entrySet()) {
                Object v = e.getValue();
                if (!(v instanceof Number)) return "动作参数值必须为数字";
            }
        } catch (Exception e) {
            return "action_params 必须是合法 JSON，如 {\"val\":1}";
        }
        return null;
    }
}
