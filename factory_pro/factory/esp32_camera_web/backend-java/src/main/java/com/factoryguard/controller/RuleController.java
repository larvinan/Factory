package com.factoryguard.controller;

import com.factoryguard.mapper.AutomationRuleMapper;
import com.factoryguard.model.AutomationRule;
import com.factoryguard.service.MqttGatewayService;
import com.factoryguard.service.RuleEngineService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 智能联动接口
 * - /api/rules          规则 CRUD（Trigger-Action 模式，参考 Home Assistant automations）
 * - /api/scenarios/**   一键场景模式（生产/下班/警戒），批量下发真实设备命令
 */
@RestController
@RequestMapping("/api")
public class RuleController {

    /** 场景定义：命令组全部为协议 3.2 支持的真实命令 */
    private static final Map<String, Map<String, Object>> SCENARIOS = new LinkedHashMap<>();

    static {
        // 生产模式：开灯 + RGB 绿 + 蜂鸣静音
        Map<String, Object> production = new LinkedHashMap<>();
        production.put("label", "生产模式");
        production.put("commands", List.of(
                Map.of("method", "relay", "params", Map.of("val", 1)),
                Map.of("method", "rgb", "params", Map.of("val", 2)),
                Map.of("method", "beep", "params", Map.of("on_ms", 0, "off_ms", 0))));
        SCENARIOS.put("production", production);

        // 下班模式：关灯 + RGB 灭 + 蜂鸣静音
        Map<String, Object> offWork = new LinkedHashMap<>();
        offWork.put("label", "下班模式");
        offWork.put("commands", List.of(
                Map.of("method", "relay", "params", Map.of("val", 0)),
                Map.of("method", "rgb", "params", Map.of("val", 0)),
                Map.of("method", "beep", "params", Map.of("on_ms", 0, "off_ms", 0))));
        SCENARIOS.put("off_work", offWork);

        // 警戒模式：开灯 + RGB 红 + 蜂鸣滴答
        Map<String, Object> guard = new LinkedHashMap<>();
        guard.put("label", "警戒模式");
        guard.put("commands", List.of(
                Map.of("method", "relay", "params", Map.of("val", 1)),
                Map.of("method", "rgb", "params", Map.of("val", 1)),
                Map.of("method", "beep", "params", Map.of("on_ms", 200, "off_ms", 200))));
        SCENARIOS.put("guard", guard);
    }

    private final AutomationRuleMapper ruleMapper;
    private final RuleEngineService ruleEngine;
    private final MqttGatewayService mqttGateway;

    public RuleController(AutomationRuleMapper ruleMapper,
                          RuleEngineService ruleEngine,
                          MqttGatewayService mqttGateway) {
        this.ruleMapper = ruleMapper;
        this.ruleEngine = ruleEngine;
        this.mqttGateway = mqttGateway;
    }

    // ==================== 规则 CRUD ====================

    @GetMapping("/rules")
    public Map<String, Object> list() {
        QueryWrapper<AutomationRule> qw = new QueryWrapper<>();
        qw.orderByDesc("created_at");
        return Map.of("status", "ok", "data", ruleMapper.selectList(qw));
    }

    @PostMapping("/rules")
    public Map<String, Object> create(@RequestBody AutomationRule rule) {
        String err = ruleEngine.validate(rule);
        if (err != null) return Map.of("status", "error", "message", err);
        if (rule.getEnabled() == null) rule.setEnabled(1);
        rule.setLastState(0);
        rule.setCreatedAt(LocalDateTime.now());
        ruleMapper.insert(rule);
        return Map.of("status", "ok", "data", rule);
    }

    @PutMapping("/rules/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody AutomationRule rule) {
        AutomationRule existing = ruleMapper.selectById(id);
        if (existing == null) return Map.of("status", "error", "message", "规则不存在");
        // 编辑时保留触发状态机字段，避免误触发
        rule.setId(id);
        rule.setLastState(existing.getLastState());
        rule.setLastFiredAt(existing.getLastFiredAt());
        rule.setCreatedAt(existing.getCreatedAt());
        String err = ruleEngine.validate(rule);
        if (err != null) return Map.of("status", "error", "message", err);
        ruleMapper.updateById(rule);
        return Map.of("status", "ok", "message", "更新成功");
    }

    @PutMapping("/rules/{id}/toggle")
    public Map<String, Object> toggle(@PathVariable Long id) {
        AutomationRule rule = ruleMapper.selectById(id);
        if (rule == null) return Map.of("status", "error", "message", "规则不存在");
        AutomationRule update = new AutomationRule();
        update.setId(id);
        update.setEnabled(rule.getEnabled() != null && rule.getEnabled() == 1 ? 0 : 1);
        // 禁用/启用时复位状态机，避免残留 last_state 造成跳变
        update.setLastState(0);
        ruleMapper.updateById(update);
        return Map.of("status", "ok", "enabled", update.getEnabled());
    }

    @DeleteMapping("/rules/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        ruleMapper.deleteById(id);
        return Map.of("status", "ok", "message", "删除成功");
    }

    // ==================== 场景模式 ====================

    /** 场景列表（供前端渲染按钮） */
    @GetMapping("/scenarios")
    public Map<String, Object> scenarios() {
        List<Map<String, Object>> list = new ArrayList<>();
        SCENARIOS.forEach((key, def) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", key);
            item.put("label", def.get("label"));
            item.put("commands", def.get("commands"));
            list.add(item);
        });
        return Map.of("status", "ok", "data", list);
    }

    /** 应用场景：按顺序批量下发真实命令 */
    @PostMapping("/scenarios/{key}/apply")
    public Map<String, Object> applyScenario(@PathVariable String key,
                                             @RequestParam(defaultValue = "rk3568_factory_001") String deviceId) {
        Map<String, Object> def = SCENARIOS.get(key);
        if (def == null) return Map.of("status", "error", "message", "未知场景: " + key);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> commands = (List<Map<String, Object>>) def.get("commands");
        List<String> requestIds = new ArrayList<>();
        String label = String.valueOf(def.get("label"));
        for (Map<String, Object> cmd : commands) {
            @SuppressWarnings("unchecked")
            Map<String, Object> params = (Map<String, Object>) cmd.get("params");
            String rid = mqttGateway.publishCommand(deviceId,
                    String.valueOf(cmd.get("method")), params, "scenario", "场景模式: " + label);
            if (rid != null) requestIds.add(rid);
        }
        return Map.of("status", "ok", "scenario", key, "label", label,
                "sent", requestIds.size(), "request_ids", requestIds);
    }
}
