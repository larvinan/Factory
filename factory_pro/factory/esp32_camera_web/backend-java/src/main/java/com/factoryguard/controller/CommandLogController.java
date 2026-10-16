package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.CommandLogMapper;
import com.factoryguard.model.CommandLog;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/commands")
public class CommandLogController {

    private final CommandLogMapper mapper;

    public CommandLogController(CommandLogMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping("/logs")
    public Map<String, Object> getLogs(
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String target,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int limit) {
        QueryWrapper<CommandLog> qw = new QueryWrapper<>();
        if (deviceId != null) qw.eq("device_id", deviceId);
        if (target != null) qw.eq("target", target);
        if (from != null) qw.ge("timestamp", from);
        if (to != null) qw.le("timestamp", to);
        qw.orderByDesc("timestamp");
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<CommandLog> rows = mapper.selectList(qw);
        return Map.of("status", "ok", "data", rows, "page", page, "limit", limit);
    }
}
