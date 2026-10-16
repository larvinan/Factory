package com.factoryguard.model;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/**
 * 设备状态（RK3568 无独立心跳 topic，按最近收到 factory/sensor/data 的时间判离线）
 */
@TableName("device_status")
public class DeviceStatus {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceId;
    private Integer online;
    private LocalDateTime lastHeartbeat;
    private Integer lightOn;
    private Integer rgbColor;
    private Integer beep;
    private String lastError;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime updatedAt;

    // ====== getters & setters ======

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }

    public Integer getOnline() { return online; }
    public void setOnline(Integer online) { this.online = online; }

    public LocalDateTime getLastHeartbeat() { return lastHeartbeat; }
    public void setLastHeartbeat(LocalDateTime lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }

    public Integer getLightOn() { return lightOn; }
    public void setLightOn(Integer lightOn) { this.lightOn = lightOn; }

    public Integer getRgbColor() { return rgbColor; }
    public void setRgbColor(Integer rgbColor) { this.rgbColor = rgbColor; }

    public Integer getBeep() { return beep; }
    public void setBeep(Integer beep) { this.beep = beep; }

    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
