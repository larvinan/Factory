package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.DeviceMapper;
import com.factoryguard.mapper.DeviceStatusMapper;
import com.factoryguard.mapper.SensorReadingMapper;
import com.factoryguard.mapper.WorkshopMapper;
import com.factoryguard.model.Device;
import com.factoryguard.model.DeviceStatus;
import com.factoryguard.model.SensorReading;
import com.factoryguard.model.Workshop;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceMapper deviceMapper;
    private final DeviceStatusMapper deviceStatusMapper;
    private final SensorReadingMapper sensorReadingMapper;
    private final WorkshopMapper workshopMapper;

    @Value("${mqtt.local.default-device-id:rk3568_factory_001}")
    private String gatewayDeviceId;

    public DeviceController(DeviceMapper deviceMapper,
                            DeviceStatusMapper deviceStatusMapper,
                            SensorReadingMapper sensorReadingMapper,
                            WorkshopMapper workshopMapper) {
        this.deviceMapper = deviceMapper;
        this.deviceStatusMapper = deviceStatusMapper;
        this.sensorReadingMapper = sensorReadingMapper;
        this.workshopMapper = workshopMapper;
    }

    /** 工厂 → 车间 ID 集合（不限制车间状态，保证过滤完整性） */
    private List<Long> workshopIdsOfFactory(Long factoryId) {
        QueryWrapper<Workshop> wqw = new QueryWrapper<>();
        wqw.eq("factory_id", factoryId);
        return workshopMapper.selectList(wqw).stream().map(Workshop::getId).toList();
    }

    /** 获取设备列表（支持 workshopId / factoryId 过滤，工厂经其车间集合转换） */
    @GetMapping
    public Map<String, Object> getList(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long workshopId,
            @RequestParam(required = false) Long factoryId) {
        QueryWrapper<Device> qw = new QueryWrapper<>();
        if (workshopId != null) {
            qw.eq("workshop_id", workshopId);
        }
        if (factoryId != null) {
            List<Long> ids = workshopIdsOfFactory(factoryId);
            // 空集合直接返回空列表，避免 IN 空集异常
            if (ids.isEmpty()) {
                return Map.of("status", "ok", "data", List.of());
            }
            qw.in("workshop_id", ids);
        }
        if (category != null && !category.isEmpty()) {
            qw.eq("category", category);
        }
        if (type != null && !type.isEmpty()) {
            qw.eq("type", type);
        }
        if (keyword != null && !keyword.isEmpty()) {
            qw.and(w -> w.like("name", keyword)
                    .or()
                    .like("device_id", keyword)
                    .or()
                    .like("location", keyword));
        }
        qw.orderByAsc("category").orderByAsc("device_id");

        List<Device> devices = deviceMapper.selectList(qw);

        // 获取在线状态
        List<DeviceStatus> statuses = deviceStatusMapper.selectList(null);
        Map<String, DeviceStatus> statusMap = new HashMap<>();
        for (DeviceStatus s : statuses) {
            statusMap.put(s.getDeviceId(), s);
        }

        List<Map<String, Object>> list = new ArrayList<>();
        // 子设备（传感器/执行器）经网关接入、无独立 MQTT 连接，
        // device_status 表只有网关一条记录 —— 在线状态继承网关
        DeviceStatus gateway = statusMap.get(gatewayDeviceId);
        for (Device d : devices) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", d.getId());
            item.put("device_id", d.getDeviceId());
            item.put("name", d.getName());
            item.put("type", d.getType());
            item.put("category", d.getCategory());
            item.put("location", d.getLocation());
            item.put("model", d.getModel());
            item.put("manufacturer", d.getManufacturer());
            item.put("description", d.getDescription());
            item.put("qr_code", d.getQrCode());

            DeviceStatus ds = statusMap.get(d.getDeviceId());
            if (ds != null) {
                item.put("online", ds.getOnline());
                item.put("last_heartbeat", ds.getLastHeartbeat() != null ? ds.getLastHeartbeat().toString() : null);
                item.put("light_on", ds.getLightOn());
                item.put("rgb_color", ds.getRgbColor());
                item.put("beep", ds.getBeep());
                item.put("last_error", ds.getLastError());
            } else if (gateway != null && !"gateway".equals(d.getCategory())) {
                // 从属设备：跟随网关在线状态
                item.put("online", gateway.getOnline());
                item.put("via_gateway", true);
                item.put("last_heartbeat", gateway.getLastHeartbeat() != null ? gateway.getLastHeartbeat().toString() : null);
            } else {
                item.put("online", 0);
            }

            list.add(item);
        }

        return Map.of("status", "ok", "data", list);
    }

    /** 获取设备详情 */
    @GetMapping("/{deviceId}")
    public Map<String, Object> getDetail(@PathVariable String deviceId) {
        QueryWrapper<Device> qw = new QueryWrapper<>();
        qw.eq("device_id", deviceId);
        Device device = deviceMapper.selectOne(qw);

        if (device == null) {
            return Map.of("status", "error", "message", "设备不存在");
        }

        // 获取设备状态
        QueryWrapper<DeviceStatus> sqw = new QueryWrapper<>();
        sqw.eq("device_id", deviceId);
        DeviceStatus status = deviceStatusMapper.selectOne(sqw);

        Map<String, Object> result = new HashMap<>();
        result.put("id", device.getId());
        result.put("device_id", device.getDeviceId());
        result.put("name", device.getName());
        result.put("type", device.getType());
        result.put("category", device.getCategory());
        result.put("location", device.getLocation());
        result.put("model", device.getModel());
        result.put("manufacturer", device.getManufacturer());
        result.put("description", device.getDescription());
        result.put("qr_code", device.getQrCode());

        if (status != null) {
            result.put("online", status.getOnline());
            result.put("last_heartbeat", status.getLastHeartbeat() != null ? status.getLastHeartbeat().toString() : null);
            result.put("light_on", status.getLightOn());
            result.put("rgb_color", status.getRgbColor());
            result.put("beep", status.getBeep());
        } else {
            result.put("online", 0);
        }

        return Map.of("status", "ok", "data", result);
    }

    /** 新增设备（device_id 唯一性校验） */
    @PostMapping
    public Map<String, Object> create(@RequestBody Device device) {
        if (device.getDeviceId() == null || device.getDeviceId().trim().isEmpty()
                || device.getName() == null || device.getName().trim().isEmpty()) {
            return Map.of("status", "error", "message", "设备ID和名称不能为空");
        }
        QueryWrapper<Device> qw = new QueryWrapper<>();
        qw.eq("device_id", device.getDeviceId());
        if (deviceMapper.selectCount(qw) > 0) {
            return Map.of("status", "error", "message", "设备ID已存在: " + device.getDeviceId());
        }
        device.setCreatedAt(java.time.LocalDateTime.now());
        deviceMapper.insert(device);
        return Map.of("status", "ok", "data", device);
    }

    /** 更新设备（device_id 不允许修改，防止破坏 MQTT 数据关联） */
    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Device device) {
        Device existing = deviceMapper.selectById(id);
        if (existing == null) {
            return Map.of("status", "error", "message", "设备不存在");
        }
        device.setId(id);
        // 保持 device_id 与类型等关键字段不被误改
        device.setDeviceId(existing.getDeviceId());
        device.setUpdatedAt(java.time.LocalDateTime.now());
        deviceMapper.updateById(device);
        return Map.of("status", "ok", "message", "更新成功");
    }

    /** 删除设备 */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        Device existing = deviceMapper.selectById(id);
        if (existing == null) {
            return Map.of("status", "error", "message", "设备不存在");
        }
        deviceMapper.deleteById(id);
        return Map.of("status", "ok", "message", "删除成功: " + existing.getName());
    }
}
