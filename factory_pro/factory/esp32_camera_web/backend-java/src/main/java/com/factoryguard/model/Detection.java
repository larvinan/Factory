package com.factoryguard.model;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

@TableName("detections")
public class Detection {
    @TableId(type = IdType.AUTO)
    private Long id;

    private LocalDateTime timestamp;
    private String deviceId;
    private String camera;
    private String imagePath;
    private String boxedImagePath;
    private String personsJson;
    private Integer total;
    private Integer compliant;
    private Integer noHelmet;
    private Integer unknown;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    // ====== getters & setters ======

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }

    public String getCamera() { return camera; }
    public void setCamera(String camera) { this.camera = camera; }

    public String getImagePath() { return imagePath; }
    public void setImagePath(String imagePath) { this.imagePath = imagePath; }

    public String getBoxedImagePath() { return boxedImagePath; }
    public void setBoxedImagePath(String boxedImagePath) { this.boxedImagePath = boxedImagePath; }

    public String getPersonsJson() { return personsJson; }
    public void setPersonsJson(String personsJson) { this.personsJson = personsJson; }

    public Integer getTotal() { return total; }
    public void setTotal(Integer total) { this.total = total; }

    public Integer getCompliant() { return compliant; }
    public void setCompliant(Integer compliant) { this.compliant = compliant; }

    public Integer getNoHelmet() { return noHelmet; }
    public void setNoHelmet(Integer noHelmet) { this.noHelmet = noHelmet; }

    public Integer getUnknown() { return unknown; }
    public void setUnknown(Integer unknown) { this.unknown = unknown; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
