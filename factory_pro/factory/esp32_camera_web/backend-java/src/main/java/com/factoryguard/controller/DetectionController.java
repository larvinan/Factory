package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.DetectionMapper;
import com.factoryguard.model.Detection;
import com.factoryguard.service.DetectionService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.*;

@RestController
@RequestMapping("/api/detections")
public class DetectionController {

    private final DetectionMapper mapper;
    private final DetectionService detectionService;

    public DetectionController(DetectionMapper mapper, DetectionService detectionService) {
        this.mapper = mapper;
        this.detectionService = detectionService;
    }

    @GetMapping
    public Map<String, Object> getList(@RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int limit) {
        QueryWrapper<Detection> qw = new QueryWrapper<>();
        qw.orderByDesc("timestamp");
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<Detection> rows = mapper.selectList(qw);

        QueryWrapper<Detection> countQw = new QueryWrapper<>();
        long total = mapper.selectCount(countQw);

        List<Map<String, Object>> list = new ArrayList<>();
        for (Detection d : rows) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", d.getId());
            item.put("timestamp", d.getTimestamp() != null ? d.getTimestamp().toString() : null);
            item.put("deviceId", d.getDeviceId());
            item.put("camera", d.getCamera());
            item.put("total", d.getTotal());
            item.put("compliant", d.getCompliant());
            item.put("noHelmet", d.getNoHelmet());
            item.put("unknown", d.getUnknown());
            item.put("imagePath", d.getImagePath());
            list.add(item);
        }

        return Map.of("status", "ok", "data", list, "total", total, "page", page, "limit", limit);
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        Map<String, Object> stats = detectionService.getTodayStats();
        return Map.of("status", "ok", "data", stats);
    }

    @PostMapping("/detect")
    public Map<String, Object> detect(
            @RequestParam("image") MultipartFile image,
            @RequestParam(value = "deviceId", required = false) String deviceId,
            @RequestParam(value = "camera", required = false) String camera) {
        try {
            byte[] bytes = image.getBytes();
            Map<String, Object> result = detectionService.detect(bytes, deviceId, camera);
            return Map.of("status", "ok", "data", result);
        } catch (Exception e) {
            return Map.of("status", "error", "message", e.getMessage());
        }
    }

    @PostMapping("/detect-bytes")
    public Map<String, Object> detectBytes(
            @RequestBody byte[] imageBytes,
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestHeader(value = "X-Camera", required = false) String camera) {
        try {
            Map<String, Object> result = detectionService.detect(imageBytes, deviceId, camera);
            return Map.of("status", "ok", "data", result);
        } catch (Exception e) {
            return Map.of("status", "error", "message", e.getMessage());
        }
    }

    @GetMapping("/{imageId}")
    public ResponseEntity<?> getDetail(@PathVariable String imageId) {
        Detection det = mapper.findByImageId(imageId);
        if (det == null) {
            return ResponseEntity.ok(Map.of("status", "error", "message", "未找到"));
        }

        String imgPath = det.getBoxedImagePath() != null ? det.getBoxedImagePath() : det.getImagePath();
        if (imgPath != null) {
            Path path = Path.of(imgPath);
            if (path.toFile().exists()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .body(new FileSystemResource(path));
            }
        }

        Map<String, Object> data = new HashMap<>();
        data.put("id", det.getId());
        data.put("timestamp", det.getTimestamp() != null ? det.getTimestamp().toString() : null);
        data.put("deviceId", det.getDeviceId());
        data.put("camera", det.getCamera());
        data.put("total", det.getTotal());
        data.put("compliant", det.getCompliant());
        data.put("noHelmet", det.getNoHelmet());
        data.put("unknown", det.getUnknown());
        data.put("personsJson", det.getPersonsJson());
        return ResponseEntity.ok(Map.of("status", "ok", "data", data));
    }
}
