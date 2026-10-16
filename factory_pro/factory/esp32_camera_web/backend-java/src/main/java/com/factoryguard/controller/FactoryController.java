package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.AlertMapper;
import com.factoryguard.mapper.DeviceMapper;
import com.factoryguard.mapper.DeviceStatusMapper;
import com.factoryguard.mapper.FactoryMapper;
import com.factoryguard.mapper.UserMapper;
import com.factoryguard.mapper.WorkshopMapper;
import com.factoryguard.model.Alert;
import com.factoryguard.model.Device;
import com.factoryguard.model.DeviceStatus;
import com.factoryguard.model.Factory;
import com.factoryguard.model.User;
import com.factoryguard.model.Workshop;
import com.factoryguard.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 工厂管理接口
 * 层级：工厂 → 车间（workshops.factory_id）→ 设备（devices.workshop_id）
 * 读取公开；写操作仅 admin
 */
@RestController
@RequestMapping("/api/factories")
public class FactoryController {

    private final FactoryMapper factoryMapper;
    private final WorkshopMapper workshopMapper;
    private final DeviceMapper deviceMapper;
    private final DeviceStatusMapper deviceStatusMapper;
    private final AlertMapper alertMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public FactoryController(FactoryMapper factoryMapper, WorkshopMapper workshopMapper,
                             DeviceMapper deviceMapper, DeviceStatusMapper deviceStatusMapper,
                             AlertMapper alertMapper, UserMapper userMapper, AuthService authService) {
        this.factoryMapper = factoryMapper;
        this.workshopMapper = workshopMapper;
        this.deviceMapper = deviceMapper;
        this.deviceStatusMapper = deviceStatusMapper;
        this.alertMapper = alertMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    /** 工厂列表（active），附每厂统计：车间数/设备数/在线设备/未处理告警 */
    @GetMapping
    public Map<String, Object> getList() {
        QueryWrapper<Factory> qw = new QueryWrapper<>();
        qw.eq("status", "active").orderByAsc("sort_order");
        List<Factory> factories = factoryMapper.selectList(qw);

        List<Map<String, Object>> data = new ArrayList<>();
        for (Factory f : factories) {
            data.add(buildFactoryItem(f));
        }
        return Map.of("status", "ok", "data", data);
    }

    @GetMapping("/{id}")
    public Map<String, Object> getById(@PathVariable Long id) {
        Factory factory = factoryMapper.selectById(id);
        if (factory == null) {
            return Map.of("status", "error", "message", "工厂不存在");
        }
        return Map.of("status", "ok", "data", buildFactoryItem(factory));
    }

    /** 新增工厂（admin） */
    @PostMapping
    public Map<String, Object> create(@RequestBody Factory factory, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        if (factory.getCode() == null || factory.getCode().isBlank()) {
            return Map.of("status", "error", "message", "工厂编码不能为空");
        }
        if (factory.getName() == null || factory.getName().isBlank()) {
            return Map.of("status", "error", "message", "工厂名称不能为空");
        }
        QueryWrapper<Factory> qw = new QueryWrapper<>();
        qw.eq("code", factory.getCode());
        if (factoryMapper.selectCount(qw) > 0) {
            return Map.of("status", "error", "message", "工厂编码已存在: " + factory.getCode());
        }
        if (factory.getStatus() == null) factory.setStatus("active");
        if (factory.getSortOrder() == null) factory.setSortOrder(0);
        factory.setId(null);
        factoryMapper.insert(factory);
        return Map.of("status", "ok", "data", factory, "message", "工厂创建成功");
    }

    /** 修改工厂（admin），code 不可变更 */
    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Factory body, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        Factory factory = factoryMapper.selectById(id);
        if (factory == null) {
            return Map.of("status", "error", "message", "工厂不存在");
        }
        if (body.getName() != null) factory.setName(body.getName());
        if (body.getAddress() != null) factory.setAddress(body.getAddress());
        if (body.getManager() != null) factory.setManager(body.getManager());
        if (body.getPhone() != null) factory.setPhone(body.getPhone());
        if (body.getSortOrder() != null) factory.setSortOrder(body.getSortOrder());
        if (body.getStatus() != null) factory.setStatus(body.getStatus());
        factoryMapper.updateById(factory);
        return Map.of("status", "ok", "data", factory, "message", "工厂已更新");
    }

    /** 删除工厂（admin）：存在 active 车间时拒绝，避免悬空数据 */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        Factory factory = factoryMapper.selectById(id);
        if (factory == null) {
            return Map.of("status", "error", "message", "工厂不存在");
        }
        if ("active".equals(factory.getStatus())) {
            return Map.of("status", "error", "message",
                    "工厂仍在启用中，请先停用或将车间转移后再删除");
        }
        QueryWrapper<Workshop> qw = new QueryWrapper<>();
        qw.eq("factory_id", id);
        if (workshopMapper.selectCount(qw) > 0) {
            return Map.of("status", "error", "message", "工厂下仍有车间，请先处理车间归属");
        }
        factoryMapper.deleteById(id);
        return Map.of("status", "ok", "message", "工厂已删除");
    }

    // ==================== 工具 ====================

    /** 单厂信息 + 统计（车间数/设备数/在线设备/未处理告警） */
    private Map<String, Object> buildFactoryItem(Factory f) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", f.getId());
        item.put("code", f.getCode());
        item.put("name", f.getName());
        item.put("address", f.getAddress());
        item.put("manager", f.getManager());
        item.put("phone", f.getPhone());
        item.put("sortOrder", f.getSortOrder());
        item.put("status", f.getStatus());

        QueryWrapper<Workshop> wqw = new QueryWrapper<>();
        wqw.eq("factory_id", f.getId()).eq("status", "active");
        List<Workshop> workshops = workshopMapper.selectList(wqw);
        List<Long> workshopIds = workshops.stream().map(Workshop::getId).toList();

        item.put("workshopCount", workshopIds.size());
        if (workshopIds.isEmpty()) {
            item.put("deviceCount", 0);
            item.put("onlineDevices", 0);
            item.put("pendingAlerts", 0);
            return item;
        }

        QueryWrapper<Device> dqw = new QueryWrapper<>();
        dqw.in("workshop_id", workshopIds);
        List<Device> devices = deviceMapper.selectList(dqw);
        item.put("deviceCount", devices.size());

        long online = 0;
        if (!devices.isEmpty()) {
            QueryWrapper<DeviceStatus> sqw = new QueryWrapper<>();
            sqw.in("device_id", devices.stream().map(Device::getDeviceId).toList())
               .eq("online", 1);
            online = deviceStatusMapper.selectCount(sqw);
        }
        item.put("onlineDevices", online);

        QueryWrapper<Alert> aqw = new QueryWrapper<>();
        aqw.in("workshop_id", workshopIds).eq("handled", 0);
        item.put("pendingAlerts", alertMapper.selectCount(aqw));
        return item;
    }

    /** 写操作权限校验：admin 通过返回 null，否则返回错误响应 */
    private Map<String, Object> checkAdmin(HttpServletRequest request) {
        // token 身份键：小程序为 openid，web 端为 username，两者都要兼容
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
