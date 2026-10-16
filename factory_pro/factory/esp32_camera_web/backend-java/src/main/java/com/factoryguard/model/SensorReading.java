package com.factoryguard.model;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/**
 * 传感器读数（对应上行 factory/sensor/data 扁平 JSON，字段见《MQTT数据格式.md》2.1）
 */
@TableName("sensor_readings")
public class SensorReading {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceId;
    private LocalDateTime timestamp;
    private Float temp;
    private Float humi;
    private Integer mq5Ppm;
    private Integer mq2Ppm;
    private Integer mq5Level;
    private Integer mq2Level;
    private Integer ldrAdc;
    private Integer pir;
    private Integer lightOn;
    private Integer rgbColor;
    private Integer beep;
    private Integer count;
    private Integer stock;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    // ====== getters & setters ======

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public Float getTemp() { return temp; }
    public void setTemp(Float temp) { this.temp = temp; }

    public Float getHumi() { return humi; }
    public void setHumi(Float humi) { this.humi = humi; }

    public Integer getMq5Ppm() { return mq5Ppm; }
    public void setMq5Ppm(Integer mq5Ppm) { this.mq5Ppm = mq5Ppm; }

    public Integer getMq2Ppm() { return mq2Ppm; }
    public void setMq2Ppm(Integer mq2Ppm) { this.mq2Ppm = mq2Ppm; }

    public Integer getMq5Level() { return mq5Level; }
    public void setMq5Level(Integer mq5Level) { this.mq5Level = mq5Level; }

    public Integer getMq2Level() { return mq2Level; }
    public void setMq2Level(Integer mq2Level) { this.mq2Level = mq2Level; }

    public Integer getLdrAdc() { return ldrAdc; }
    public void setLdrAdc(Integer ldrAdc) { this.ldrAdc = ldrAdc; }

    public Integer getPir() { return pir; }
    public void setPir(Integer pir) { this.pir = pir; }

    public Integer getLightOn() { return lightOn; }
    public void setLightOn(Integer lightOn) { this.lightOn = lightOn; }

    public Integer getRgbColor() { return rgbColor; }
    public void setRgbColor(Integer rgbColor) { this.rgbColor = rgbColor; }

    public Integer getBeep() { return beep; }
    public void setBeep(Integer beep) { this.beep = beep; }

    public Integer getCount() { return count; }
    public void setCount(Integer count) { this.count = count; }

    public Integer getStock() { return stock; }
    public void setStock(Integer stock) { this.stock = stock; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
