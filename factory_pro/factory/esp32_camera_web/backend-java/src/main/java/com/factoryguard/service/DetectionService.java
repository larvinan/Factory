package com.factoryguard.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.AlertMapper;
import com.factoryguard.mapper.DetectionMapper;
import com.factoryguard.model.Alert;
import com.factoryguard.model.Detection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class DetectionService {

    // 摄像安全帽佩戴识别
    private static final Logger log = LoggerFactory.getLogger(DetectionService.class);
    private final DetectionMapper detectionMapper;
    private final AlertMapper alertMapper;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${inference.server.url:http://localhost:8001}")
    private String inferenceServerUrl;

    @Value("${image.save-dir:data/images}")
    private String imageSaveDir;

    public DetectionService(DetectionMapper detectionMapper, AlertMapper alertMapper, ObjectMapper objectMapper) {
        this.detectionMapper = detectionMapper;
        this.alertMapper = alertMapper;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .build();
    }

    /**
     * 接收图片 → 调用 YOLO 推理服务 → 保存检测结果
     */
    public Map<String, Object> detect(byte[] imageBytes, String deviceId, String camera) {
        try {
            File dir = new File(imageSaveDir, "raw");
            if (!dir.exists()) dir.mkdirs();
            String imageId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            String rawPath = new File(dir, imageId + ".jpg").getAbsolutePath();
            try (FileOutputStream fos = new FileOutputStream(rawPath)) {
                fos.write(imageBytes);
            }

            Map<String, Object> inferenceResult = callInference(imageBytes);

            // 推理服务返回的标注图（JPEG base64），保存为 boxed 图并透传给前端展示
            String annotatedBase64 = (String) inferenceResult.get("annotated_image");
            String boxedPath = null;
            if (annotatedBase64 != null && !annotatedBase64.isEmpty()) {
                try {
                    File boxedDir = new File(imageSaveDir, "boxed");
                    if (!boxedDir.exists()) boxedDir.mkdirs();
                    boxedPath = new File(boxedDir, imageId + ".jpg").getAbsolutePath();
                    try (FileOutputStream fos = new FileOutputStream(boxedPath)) {
                        fos.write(Base64.getDecoder().decode(annotatedBase64));
                    }
                } catch (Exception e) {
                    log.warn("保存标注图失败: {}", e.getMessage());
                    boxedPath = null;
                }
            }

            Detection detection = new Detection();
            detection.setTimestamp(LocalDateTime.now());
            detection.setDeviceId(deviceId != null ? deviceId : "mp_user");
            detection.setCamera(camera != null ? camera : "mobile");
            detection.setImagePath(rawPath);
            detection.setBoxedImagePath(boxedPath);
            detection.setPersonsJson(objectMapper.writeValueAsString(inferenceResult.get("persons")));
            detection.setTotal((Integer) inferenceResult.getOrDefault("total_persons", 0));
            detection.setCompliant((Integer) inferenceResult.getOrDefault("compliant", 0));
            detection.setNoHelmet((Integer) inferenceResult.getOrDefault("no_helmet", 0));
            detection.setUnknown((Integer) inferenceResult.getOrDefault("unknown", 0));
            detectionMapper.insert(detection);

            int noHelmet = detection.getNoHelmet();
            if (noHelmet > 0) {
                createHelmetAlert(detection, noHelmet);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("detectionId", detection.getId());
            result.put("imageId", imageId);
            result.put("persons", inferenceResult.get("persons"));
            if (annotatedBase64 != null) {
                result.put("annotated_image", annotatedBase64);
            }
            result.put("summary", Map.of(
                    "total_persons", detection.getTotal(),
                    "compliant", detection.getCompliant(),
                    "no_helmet", detection.getNoHelmet(),
                    "unknown", detection.getUnknown()
            ));
            return result;

        } catch (Exception e) {
            log.error("Detection failed", e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            error.put("summary", Map.of("total_persons", 0, "compliant", 0, "no_helmet", 0, "unknown", 0));
            return error;
        }
    }

    private Map<String, Object> callInference(byte[] imageBytes) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(inferenceServerUrl + "/detect"))
                    .header("Content-Type", "image/jpeg")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(imageBytes))
                    .timeout(java.time.Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode summary = root.path("summary");
                JsonNode persons = root.path("persons");

                List<Map<String, Object>> personList = new ArrayList<>();
                if (persons.isArray()) {
                    for (JsonNode p : persons) {
                        Map<String, Object> person = new HashMap<>();
                        person.put("status", p.path("status").asText());
                        person.put("confidence", p.path("confidence").asDouble());
                        if (p.has("helmet_bbox")) {
                            person.put("bbox", objectMapper.treeToValue(p.path("helmet_bbox"), List.class));
                        } else if (p.has("no_helmet_bbox")) {
                            person.put("bbox", objectMapper.treeToValue(p.path("no_helmet_bbox"), List.class));
                        }
                        personList.add(person);
                    }
                }

                Map<String, Object> result = new HashMap<>();
                result.put("persons", personList);
                result.put("total_persons", summary.path("total_persons").asInt());
                result.put("compliant", summary.path("compliant").asInt());
                result.put("no_helmet", summary.path("no_helmet").asInt());
                result.put("unknown", summary.path("unknown").asInt());
                JsonNode annotated = root.path("annotated_image");
                if (annotated.isTextual() && !annotated.asText().isEmpty()) {
                    result.put("annotated_image", annotated.asText());
                }
                return result;
            } else {
                log.warn("Inference server returned status: {}", response.statusCode());
            }
        } catch (Exception e) {
            log.warn("Failed to call inference server: {}", e.getMessage());
        }
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("persons", Collections.emptyList());
        fallback.put("total_persons", 0);
        fallback.put("compliant", 0);
        fallback.put("no_helmet", 0);
        fallback.put("unknown", 0);
        return fallback;
    }

    private void createHelmetAlert(Detection detection, int noHelmetCount) {
        try {
            Alert alert = new Alert();
            alert.setTimestamp(LocalDateTime.now());
            alert.setDeviceId(detection.getDeviceId());
            alert.setAlertType("no_helmet");
            alert.setAlertLevel(noHelmetCount >= 3 ? "emergency" : "serious");
            // details 列为 JSON 类型，写入与前端 parseAlertDetails 兼容的结构
            String message = "检测到" + noHelmetCount + "人未佩戴安全帽";
            alert.setDetails(objectMapper.writeValueAsString(Map.of(
                    "message", message,
                    "suggestions", List.of(Map.of(
                            "text", "立即核查现场人员安全帽佩戴情况并留存记录",
                            "priority", noHelmetCount >= 3 ? "high" : "medium"
                    ))
            )));
            alert.setRiskScore(noHelmetCount >= 3 ? 80 : 60);
            alert.setHandled(0);
            alertMapper.insert(alert);
            log.info("Created helmet alert: noHelmetCount={}, alertId={}", noHelmetCount, alert.getId());
        } catch (Exception e) {
            log.warn("Failed to create helmet alert", e);
        }
    }

    public Map<String, Object> getTodayStats() {
        String today = LocalDateTime.now().toLocalDate().toString();
        QueryWrapper<Detection> qw = new QueryWrapper<>();
        qw.ge("timestamp", today);
        qw.select("COUNT(*) AS total",
                "COALESCE(SUM(total),0) AS persons",
                "COALESCE(SUM(compliant),0) AS compliant",
                "COALESCE(SUM(no_helmet),0) AS noHelmet");
        List<Map<String, Object>> stats = detectionMapper.selectMaps(qw);

        if (stats.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("totalDetections", 0);
            empty.put("totalPersons", 0);
            empty.put("compliant", 0);
            empty.put("noHelmet", 0);
            return empty;
        }

        Map<String, Object> row = stats.get(0);
        Map<String, Object> result = new HashMap<>();
        result.put("totalDetections", row.getOrDefault("total", 0));
        result.put("totalPersons", row.getOrDefault("persons", 0));
        result.put("compliant", row.getOrDefault("compliant", 0));
        result.put("noHelmet", row.getOrDefault("noHelmet", 0));
        return result;
    }
}
