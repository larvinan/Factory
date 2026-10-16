package com.factoryguard.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@RestController
@RequestMapping("/api")
public class UploadController {

    @Value("${image.save-dir:data/images}")
    private String saveDir;

    /** 上传图片 */
    @PostMapping("/upload")
    public Map<String, Object> upload(@RequestParam("image") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Map.of("status", "error", "message", "文件为空");
        }

        try {
            // 确保目录存在
            Path dir = Paths.get(saveDir, "hazards");
            Files.createDirectories(dir);

            // 生成唯一文件名
            String originalFilename = file.getOriginalFilename();
            String ext = "";
            if (originalFilename != null && originalFilename.contains(".")) {
                ext = originalFilename.substring(originalFilename.lastIndexOf("."));
            } else {
                ext = ".jpg";
            }
            String fileName = "hazard_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;
            Path filePath = dir.resolve(fileName);

            // 保存文件
            file.transferTo(filePath.toFile());

            // 返回可访问的 URL
            String url = "/api/images/hazards/" + fileName;

            Map<String, Object> data = new HashMap<>();
            data.put("url", url);
            data.put("fileName", fileName);
            data.put("size", file.getSize());

            return Map.of("status", "ok", "data", data);
        } catch (IOException e) {
            return Map.of("status", "error", "message", "文件上传失败: " + e.getMessage());
        }
    }

    /** 访问图片：/api/images/{子目录}/{文件名}，通配路径需从请求 URI 手工解析 */
    @GetMapping("/images/**")
    public ResponseEntity<FileSystemResource> getImage(jakarta.servlet.http.HttpServletRequest request) {
        String uri = request.getRequestURI(); // 例如 /api/images/hazards/xxx.jpg
        String relativePath = uri.substring(uri.indexOf("/images/") + "/images/".length());
        // 防目录穿越：拒绝 .. 片段
        if (relativePath.contains("..")) {
            return ResponseEntity.badRequest().build();
        }
        Path filePath = Paths.get(saveDir, relativePath).normalize();
        if (!filePath.startsWith(Paths.get(saveDir).normalize())) {
            return ResponseEntity.badRequest().build();
        }
        File file = filePath.toFile();

        if (file.exists() && file.isFile()) {
            String contentType = determineContentType(filePath.getFileName().toString());
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(new FileSystemResource(file));
        }

        return ResponseEntity.notFound().build();
    }

    private String determineContentType(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".bmp")) return "image/bmp";
        return "application/octet-stream";
    }
}
