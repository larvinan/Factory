package com.factoryguard.controller;

import com.factoryguard.service.StreamFrameService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * 视频流帧接口
 * GET  /api/stream/latest  拉取最新 JPEG 帧（小程序轮询显示用）
 * GET  /api/stream/live    MJPEG 实时流（浏览器 img 直接显示实时画面，实时监控升级接口）
 * GET  /api/stream/info    最新帧元信息（设备号/时间戳/帧龄/累计帧数）
 * POST /api/stream/frame   HTTP 直传 JPEG 帧（raw 或 multipart，rk_camera.c 调试模式兼容）
 */
@RestController
@RequestMapping("/api/stream")
public class StreamController {

    private final StreamFrameService streamFrameService;

    public StreamController(StreamFrameService streamFrameService) {
        this.streamFrameService = streamFrameService;
    }

    @GetMapping("/latest")
    public ResponseEntity<byte[]> latest() {
        byte[] frame = streamFrameService.getLatestFrame();
        if (frame == null) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> info = streamFrameService.getInfo();
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header("X-Frame-Timestamp", String.valueOf(info.get("timestamp")))
                .header("X-Frame-Device", String.valueOf(info.get("deviceId")))
                // 帧龄暴露在响应头：排查"这张图是不是硬件刚传的"直接看头，不用另调 info
                .header("X-Frame-Age-Seconds", String.valueOf(info.get("frameAgeSeconds")))
                .header("Cache-Control", "no-store")
                .body(frame);
    }

    /**
     * MJPEG 实时流（multipart/x-mixed-replace）。
     * 浏览器直接 img src=/api/stream/live 即显示实时画面；客户端断开时写入抛 IOException 自动结束。
     * 10 分钟兜底断开，img 标签会自动重连。
     */
    @GetMapping("/live")
    public ResponseEntity<StreamingResponseBody> live() {
        StreamingResponseBody body = out -> {
            long deadline = System.currentTimeMillis() + 10 * 60 * 1000L;
            long lastSent = -1;
            byte[] boundary = ("--frame" + "\r\n").getBytes();
            while (System.currentTimeMillis() < deadline) {
                long ts = streamFrameService.lastFrameMillis();
                byte[] frame = ts != lastSent ? streamFrameService.getLatestFrame() : null;
                if (frame != null && ts != lastSent) {
                    out.write(boundary);
                    out.write(("Content-Type: image/jpeg" + "\r\n"
                            + "Content-Length: " + frame.length + "\r\n" + "\r\n").getBytes());
                    out.write(frame);
                    out.write(("\r\n").getBytes());
                    out.flush();
                    lastSent = ts;
                }
                try {
                    Thread.sleep(120); // 硬件 3s 一帧，120ms 轮询帧时间戳足够跟帧
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("multipart/x-mixed-replace; boundary=frame"))
                .header("Cache-Control", "no-store")
                .body(body);
    }

    @GetMapping("/info")
    public Map<String, Object> info() {
        return Map.of("status", "ok", "data", streamFrameService.getInfo());
    }

    /** raw JPEG 直传（Content-Type: image/jpeg 或 application/octet-stream）*/
    @PostMapping(value = "/frame", consumes = {"image/jpeg", "application/octet-stream"})
    public Map<String, Object> pushFrame(@RequestBody byte[] frame) {
        if (frame == null || frame.length == 0) {
            return Map.of("status", "error", "message", "帧数据为空");
        }
        streamFrameService.updateFrame("http_stream", frame);
        return Map.of("status", "ok", "data", streamFrameService.getInfo());
    }

    /** multipart 直传（rk_camera.c 的 HTTP 调试模式：form-data 字段 file）*/
    @PostMapping(value = "/frame", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> pushFrameMultipart(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Map.of("status", "error", "message", "帧数据为空");
        }
        try {
            streamFrameService.updateFrame("http_stream", file.getBytes());
            return Map.of("status", "ok", "data", streamFrameService.getInfo());
        } catch (Exception e) {
            return Map.of("status", "error", "message", "读取帧失败: " + e.getMessage());
        }
    }
}
