package com.factoryguard.model;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

@TableName("notify_settings")
public class NotifySetting {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String openid;
    private Boolean gasWarning;
    private Boolean gasAlarm;
    private Boolean smokeAlarm;
    private Boolean flameAlarm;
    private Boolean systemOffline;
    private Boolean allAlarm;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getOpenid() { return openid; }
    public void setOpenid(String openid) { this.openid = openid; }
    public Boolean getGasWarning() { return gasWarning; }
    public void setGasWarning(Boolean gasWarning) { this.gasWarning = gasWarning; }
    public Boolean getGasAlarm() { return gasAlarm; }
    public void setGasAlarm(Boolean gasAlarm) { this.gasAlarm = gasAlarm; }
    public Boolean getSmokeAlarm() { return smokeAlarm; }
    public void setSmokeAlarm(Boolean smokeAlarm) { this.smokeAlarm = smokeAlarm; }
    public Boolean getFlameAlarm() { return flameAlarm; }
    public void setFlameAlarm(Boolean flameAlarm) { this.flameAlarm = flameAlarm; }
    public Boolean getSystemOffline() { return systemOffline; }
    public void setSystemOffline(Boolean systemOffline) { this.systemOffline = systemOffline; }
    public Boolean getAllAlarm() { return allAlarm; }
    public void setAllAlarm(Boolean allAlarm) { this.allAlarm = allAlarm; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
