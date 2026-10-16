package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.AlertMapper;
import com.factoryguard.model.Alert;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertMapper mapper;

    public AlertController(AlertMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public Map<String, Object> getList(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) Integer handled,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int limit) {
        QueryWrapper<Alert> qw = new QueryWrapper<>();
        if (level != null) qw.eq("alert_level", level);
        if (handled != null) qw.eq("handled", handled);
        if (from != null) qw.ge("timestamp", from);
        if (to != null) qw.le("timestamp", to);
        qw.orderByDesc("timestamp");
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<Alert> rows = mapper.selectList(qw);
        return Map.of("status", "ok", "data", rows, "page", page, "limit", limit);
    }

    @GetMapping("/{id}")
    public Map<String, Object> getDetail(@PathVariable Long id) {
        Alert alert = mapper.selectById(id);
        if (alert == null) {
            return Map.of("status", "error", "message", "告警不存在");
        }
        return Map.of("status", "ok", "data", alert);
    }

    @PutMapping("/{id}/handle")
    public Map<String, Object> handleAlert(@PathVariable Long id,
                                           @RequestBody Map<String, String> body) {
        Alert alert = mapper.selectById(id);
        if (alert == null) {
            return Map.of("status", "error", "message", "告警不存在");
        }
        alert.setHandled(1);
        alert.setHandledAt(LocalDateTime.now());
        alert.setHandledBy(body.getOrDefault("handledBy", "unknown"));
        mapper.updateById(alert);

        return Map.of("status", "ok", "message", "已标记为已处理");
    }

    /** 批量标记已处理：body {ids: [1,2,3], handledBy} */
    @PutMapping("/batch-handle")
    public Map<String, Object> batchHandle(@RequestBody Map<String, Object> body) {
        Object idsObj = body.get("ids");
        if (!(idsObj instanceof List)) {
            return Map.of("status", "error", "message", "ids 参数缺失");
        }
        String handledBy = String.valueOf(body.getOrDefault("handledBy", "unknown"));
        int updated = 0;
        for (Object o : (List<?>) idsObj) {
            try {
                Long id = Long.valueOf(String.valueOf(o));
                Alert alert = mapper.selectById(id);
                if (alert != null && alert.getHandled() == 0) {
                    alert.setHandled(1);
                    alert.setHandledAt(LocalDateTime.now());
                    alert.setHandledBy(handledBy);
                    mapper.updateById(alert);
                    updated++;
                }
            } catch (NumberFormatException ignored) {}
        }
        return Map.of("status", "ok", "message", "已处理 " + updated + " 条告警", "updated", updated);
    }
}
