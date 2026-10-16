package com.factoryguard.controller;

import com.factoryguard.service.ThresholdService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 报警阈值运行时配置接口（废气监测页等前端调用，修改后立即生效无需重启）
 */
@RestController
@RequestMapping("/api/thresholds")
public class ThresholdController {

    private final ThresholdService thresholdService;

    public ThresholdController(ThresholdService thresholdService) {
        this.thresholdService = thresholdService;
    }

    @GetMapping
    public Map<String, Object> get() {
        Map<String, Object> data = new LinkedHashMap<>(thresholdService.all());
        return Map.of("status", "ok", "data", data);
    }

    /** body: {"mq5_ppm_high": 800, "mq2_ppm_high": 250} —— 仅白名单 key 可更新 */
    @PutMapping
    public Map<String, Object> update(@RequestBody Map<String, Object> body) {
        int updated = 0;
        for (Map.Entry<String, Object> e : body.entrySet()) {
            String key = e.getKey();
            if (!ThresholdService.ALLOWED_KEYS.containsKey(key)) {
                return Map.of("status", "error", "message", "不支持的配置项: " + key);
            }
            double value;
            try {
                value = Double.parseDouble(String.valueOf(e.getValue()));
            } catch (NumberFormatException nfe) {
                return Map.of("status", "error", "message", key + " 的值必须为数字");
            }
            if (value < 0 || value > 100000) {
                return Map.of("status", "error", "message", key + " 超出合理范围(0~100000)");
            }
            thresholdService.update(key, value);
            updated++;
        }
        return Map.of("status", "ok", "updated", updated, "data", thresholdService.all());
    }
}
