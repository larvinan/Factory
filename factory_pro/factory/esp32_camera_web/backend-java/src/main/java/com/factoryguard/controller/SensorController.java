package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.SensorReadingMapper;
import com.factoryguard.model.SensorReading;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/sensors")
public class SensorController {

    private final SensorReadingMapper mapper;

    public SensorController(SensorReadingMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping("/latest")
    public Map<String, Object> getLatest(@RequestParam(required = false) String deviceId) {
        QueryWrapper<SensorReading> qw = new QueryWrapper<>();
        if (deviceId != null) qw.eq("device_id", deviceId);
        qw.orderByDesc("timestamp").last("LIMIT 1");
        SensorReading row = mapper.selectOne(qw);
        return Map.of("status", "ok", "data", row != null ? row : "暂无数据");
    }

    @GetMapping("/history")
    public Map<String, Object> getHistory(
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int limit) {
        QueryWrapper<SensorReading> qw = new QueryWrapper<>();
        if (deviceId != null) qw.eq("device_id", deviceId);
        if (from != null) qw.ge("timestamp", from);
        if (to != null) qw.le("timestamp", to);
        qw.orderByDesc("timestamp");
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<SensorReading> rows = mapper.selectList(qw);
        return Map.of("status", "ok", "data", rows, "page", page, "limit", limit);
    }
}
