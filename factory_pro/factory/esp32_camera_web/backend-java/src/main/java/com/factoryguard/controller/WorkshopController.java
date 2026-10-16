package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.DeviceMapper;
import com.factoryguard.mapper.UserMapper;
import com.factoryguard.mapper.WorkshopMapper;
import com.factoryguard.model.Device;
import com.factoryguard.model.User;
import com.factoryguard.model.Workshop;
import com.factoryguard.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 车间管理接口
 * 读取公开；写操作仅 admin；车间归属工厂（factory_id，默认 1）
 */
@RestController
@RequestMapping("/api/workshops")
public class WorkshopController {

    private final WorkshopMapper workshopMapper;
    private final DeviceMapper deviceMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public WorkshopController(WorkshopMapper workshopMapper, DeviceMapper deviceMapper,
                              UserMapper userMapper, AuthService authService) {
        this.workshopMapper = workshopMapper;
        this.deviceMapper = deviceMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    /** 获取车间列表，支持 ?factoryId= 过滤 */
    @GetMapping
    public Map<String, Object> getList(@RequestParam(required = false) Long factoryId) {
        QueryWrapper<Workshop> qw = new QueryWrapper<>();
        qw.eq("status", "active");
        if (factoryId != null) {
            qw.eq("factory_id", factoryId);
        }
        qw.orderByAsc("sort_order");
        List<Workshop> workshops = workshopMapper.selectList(qw);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("data", workshops);
        return result;
    }

    /** 获取单个车间详情 */
    @GetMapping("/{id}")
    public Map<String, Object> getById(@PathVariable Long id) {
        Workshop workshop = workshopMapper.selectById(id);
        Map<String, Object> result = new HashMap<>();
        if (workshop == null) {
            result.put("status", "error");
            result.put("message", "车间不存在");
        } else {
            result.put("status", "ok");
            result.put("data", workshop);
        }
        return result;
    }

    /** 新增车间（admin） */
    @PostMapping
    public Map<String, Object> create(@RequestBody Workshop workshop, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        if (workshop.getName() == null || workshop.getName().isBlank()) {
            return Map.of("status", "error", "message", "车间名称不能为空");
        }
        if (workshop.getFactoryId() == null) workshop.setFactoryId(1L);
        if (workshop.getStatus() == null) workshop.setStatus("active");
        if (workshop.getSortOrder() == null) workshop.setSortOrder(0);
        if (workshop.getCode() == null || workshop.getCode().isBlank()) {
            // 编码缺省时自动生成，保证唯一键不冲突
            workshop.setCode("WS-" + System.currentTimeMillis());
        }
        QueryWrapper<Workshop> qw = new QueryWrapper<>();
        qw.eq("code", workshop.getCode());
        if (workshopMapper.selectCount(qw) > 0) {
            return Map.of("status", "error", "message", "车间编码已存在: " + workshop.getCode());
        }
        workshop.setId(null);
        workshopMapper.insert(workshop);
        return Map.of("status", "ok", "data", workshop, "message", "车间创建成功");
    }

    /** 修改车间（admin） */
    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Workshop body, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        Workshop workshop = workshopMapper.selectById(id);
        if (workshop == null) {
            return Map.of("status", "error", "message", "车间不存在");
        }
        if (body.getName() != null) workshop.setName(body.getName());
        if (body.getLocation() != null) workshop.setLocation(body.getLocation());
        if (body.getDescription() != null) workshop.setDescription(body.getDescription());
        if (body.getFactoryId() != null) workshop.setFactoryId(body.getFactoryId());
        if (body.getSortOrder() != null) workshop.setSortOrder(body.getSortOrder());
        if (body.getStatus() != null) workshop.setStatus(body.getStatus());
        workshopMapper.updateById(workshop);
        return Map.of("status", "ok", "data", workshop, "message", "车间已更新");
    }

    /** 删除车间（admin）：车间下仍有设备档案时拒绝 */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        Workshop workshop = workshopMapper.selectById(id);
        if (workshop == null) {
            return Map.of("status", "error", "message", "车间不存在");
        }
        QueryWrapper<Device> dqw = new QueryWrapper<>();
        dqw.eq("workshop_id", id);
        if (deviceMapper.selectCount(dqw) > 0) {
            return Map.of("status", "error", "message",
                    "车间下仍有设备档案，请先在设备管理中转移或删除设备");
        }
        workshopMapper.deleteById(id);
        return Map.of("status", "ok", "message", "车间已删除");
    }

    /** 写操作权限校验：admin 通过返回 null（兼容小程序 openid 与 web username 两种 token 身份键） */
    private Map<String, Object> checkAdmin(HttpServletRequest request) {
        String identity = authService.resolveOpenidFromAuthHeader(request.getHeader("Authorization"));
        if (identity == null) {
            return Map.of("status", "error", "message", "未登录或登录已过期", "code", 401);
        }
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("openid", identity).or().eq("username", identity);
        User user = userMapper.selectOne(qw);
        if (user == null || !"admin".equals(user.getRole())) {
            return Map.of("status", "error", "message", "仅管理员可执行该操作", "code", 403);
        }
        return null;
    }
}
