package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.HazardMapper;
import com.factoryguard.mapper.UserMapper;
import com.factoryguard.model.Hazard;
import com.factoryguard.model.User;
import com.factoryguard.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/hazards")
public class HazardController {

    private final HazardMapper hazardMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public HazardController(HazardMapper hazardMapper,
                            UserMapper userMapper,
                            AuthService authService) {
        this.hazardMapper = hazardMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    /** 上报隐患 */
    @PostMapping
    public Map<String, Object> report(
            @RequestBody Map<String, Object> body,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        Hazard hazard = new Hazard();
        hazard.setType((String) body.get("type"));
        hazard.setDescription((String) body.get("description"));
        hazard.setLocation((String) body.get("location"));
        hazard.setImageUrl((String) body.get("image_url"));
        hazard.setStatus("pending");
        hazard.setCreatedAt(LocalDateTime.now());

        String openid = authService.resolveOpenidFromAuthHeader(authHeader);
        if (openid != null) {
            hazard.setReporterOpenid(openid);
            QueryWrapper<User> qw = new QueryWrapper<>();
            qw.eq("openid", openid);
            User user = userMapper.selectOne(qw);
            if (user != null) {
                hazard.setReporterName(user.getNickname());
            }
        }

        hazardMapper.insert(hazard);

        Map<String, Object> data = new HashMap<>();
        data.put("id", hazard.getId());
        return Map.of("status", "ok", "data", data);
    }

    /** 获取隐患列表 */
    @GetMapping
    public Map<String, Object> getList(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int limit) {
        QueryWrapper<Hazard> qw = new QueryWrapper<>();
        if (status != null && !status.isEmpty()) {
            qw.eq("status", status);
        }
        qw.orderByDesc("created_at");

        long total = hazardMapper.selectCount(qw);
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<Hazard> rows = hazardMapper.selectList(qw);

        List<Map<String, Object>> list = new ArrayList<>();
        for (Hazard h : rows) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", h.getId());
            item.put("type", h.getType());
            item.put("description", h.getDescription());
            item.put("location", h.getLocation());
            item.put("image_url", h.getImageUrl());
            item.put("status", h.getStatus());
            item.put("reporter_name", h.getReporterName());
            item.put("created_at", h.getCreatedAt() != null ? h.getCreatedAt().toString() : "");
            item.put("handled_at", h.getHandledAt() != null ? h.getHandledAt().toString() : null);
            item.put("handled_by", h.getHandledBy());
            item.put("handle_note", h.getHandleNote());
            list.add(item);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", total);
        data.put("page", page);
        data.put("limit", limit);

        return Map.of("status", "ok", "data", data);
    }

    /** 获取隐患详情 */
    @GetMapping("/{id}")
    public Map<String, Object> getDetail(@PathVariable Long id) {
        Hazard h = hazardMapper.selectById(id);
        if (h == null) {
            return Map.of("status", "error", "message", "隐患记录不存在");
        }
        return Map.of("status", "ok", "data", h);
    }

    /** 处理隐患 */
    @PutMapping("/{id}/handle")
    public Map<String, Object> handle(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Hazard h = hazardMapper.selectById(id);
        if (h == null) {
            return Map.of("status", "error", "message", "隐患记录不存在");
        }
        h.setStatus("resolved");
        h.setHandledAt(LocalDateTime.now());
        h.setHandledBy(body.getOrDefault("handledBy", "unknown"));
        h.setHandleNote(body.getOrDefault("handleNote", ""));
        hazardMapper.updateById(h);

        return Map.of("status", "ok", "message", "已处理");
    }
}
