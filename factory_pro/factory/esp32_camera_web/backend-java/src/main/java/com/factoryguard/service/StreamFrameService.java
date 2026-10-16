package com.factoryguard.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 摄像头视频流最新帧缓存服务
 * RK3568/ESP32-CAM 经 MQTT fg/{deviceId}/camera（或 HTTP /api/stream/frame）上传的
 * JPEG 帧统一沉淀到 data/images/stream/latest.jpg，供小程序端轮询拉取实现准实时画面
 */
@Service
public class StreamFrameService {

    private static final Logger log = LoggerFactory.getLogger(StreamFrameService.class);

    @Value("${image.save-dir:data/images}")
    private String saveDir;

    /** 最新帧字节（内存缓存，避免频繁读盘） */
    private volatile byte[] latestFrame;

    private volatile String latestDeviceId;
    private volatile LocalDateTime latestTime;
    private volatile long latestFrameMillis = 0;

    /** 服务启动以来累计收到的帧数。硬件联调时连续两次调 /api/stream/info，
     *  该值不增长 = 硬件帧根本没到后端（显示/检测的都是旧帧） */
    private final java.util.concurrent.atomic.AtomicLong framesReceived =
            new java.util.concurrent.atomic.AtomicLong();

    /** 写入最新帧（原子替换：先写临时文件再移动，避免拉取到半张图）。
     *  仅接受 JPEG（FF D8 魔数开头，rk_camera.c 侧同样校验过），非法帧丢弃防污染视频流 */
    public synchronized void updateFrame(String deviceId, byte[] jpegBytes) {
        if (jpegBytes == null || jpegBytes.length < 4
                || (jpegBytes[0] & 0xFF) != 0xFF || (jpegBytes[1] & 0xFF) != 0xD8) {
            log.warn("丢弃非法摄像头帧: deviceId={}, size={}", deviceId,
                    jpegBytes == null ? 0 : jpegBytes.length);
            return;
        }
        try {
            File dir = new File(saveDir, "stream");
            if (!dir.exists()) dir.mkdirs();
            File tmp = new File(dir, "latest.jpg.tmp");
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                fos.write(jpegBytes);
            }
            Files.move(tmp.toPath(), new File(dir, "latest.jpg").toPath(),
                    StandardCopyOption.REPLACE_EXISTING);
            this.latestFrame = jpegBytes;
            this.latestDeviceId = deviceId;
            this.latestTime = LocalDateTime.now();
            this.latestFrameMillis = System.currentTimeMillis();
            framesReceived.incrementAndGet();
        } catch (Exception e) {
            log.warn("保存视频流最新帧失败: {}", e.getMessage());
        }
    }

    /** 获取最新帧字节，无帧返回 null */
    public byte[] getLatestFrame() {
        byte[] frame = latestFrame;
        if (frame != null) return frame;
        // 服务重启后内存为空，尝试从磁盘恢复
        return loadFromDisk();
    }

    private synchronized byte[] loadFromDisk() {
        try {
            Path p = new File(saveDir, "stream/latest.jpg").toPath();
            if (Files.exists(p)) {
                byte[] data = Files.readAllBytes(p);
                latestFrame = data;
                // 帧时间必须取文件 mtime 而非"当前时间"：这是磁盘上残留的历史帧，
                // 若标成 now，实时流会把旧图当刚收到的新帧推送，帧龄判断也随之失真
                // （硬件联调时将无法区分"硬件实时上传"与"昨天的测试图"）
                latestFrameMillis = Files.getLastModifiedTime(p).toMillis();
                if (latestTime == null) {
                    latestTime = LocalDateTime.ofInstant(
                            Files.getLastModifiedTime(p).toInstant(),
                            java.time.ZoneId.systemDefault());
                }
                if (latestDeviceId == null) {
                    latestDeviceId = "unknown";  // 磁盘恢复的帧不知道来自哪台设备
                }
                return data;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** 最新帧的接收时刻（毫秒），供 MJPEG 实时流检测帧更新 */
    public long lastFrameMillis() {
        getLatestFrame(); // 确保服务重启后从磁盘恢复
        return latestFrameMillis;
    }

    /** 最新帧元信息 */
    public Map<String, Object> getInfo() {
        byte[] frame = getLatestFrame();
        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("available", frame != null);
        data.put("deviceId", latestDeviceId);
        data.put("timestamp", latestTime != null
                ? latestTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : null);
        data.put("sizeBytes", frame != null ? frame.length : 0);
        // 帧龄：距后端收到这一帧过了多少秒。硬件 3 秒一帧，帧龄持续 >15s
        // 说明画面/检测用的是旧帧（服务重启从磁盘恢复的历史图或硬件断流）
        data.put("frameAgeSeconds", latestFrameMillis > 0
                ? (System.currentTimeMillis() - latestFrameMillis) / 1000 : null);
        data.put("framesReceived", framesReceived.get());
        return data;
    }
}
