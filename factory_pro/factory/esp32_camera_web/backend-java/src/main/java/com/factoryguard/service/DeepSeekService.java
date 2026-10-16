package com.factoryguard.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.*;
import com.factoryguard.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * DeepSeek AI 服务 — 收集系统数据上下文 + 流式调用 API
 */
@Service
public class DeepSeekService {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekService.class);

    @Value("${deepseek.api-key:}")
    private String apiKey;

    @Value("${deepseek.model:deepseek-chat}")
    private String model;

    @Value("${deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String apiUrl;

    private final SensorReadingMapper sensorReadingMapper;
    private final AlertMapper alertMapper;
    private final DetectionMapper detectionMapper;
    private final DeviceStatusMapper deviceStatusMapper;
    private final InspectionTaskMapper inspectionTaskMapper;
    private final FeedbackMapper feedbackMapper;
    private final ObjectMapper objectMapper;

    public DeepSeekService(SensorReadingMapper sensorReadingMapper,
                           AlertMapper alertMapper,
                           DetectionMapper detectionMapper,
                           DeviceStatusMapper deviceStatusMapper,
                           InspectionTaskMapper inspectionTaskMapper,
                           FeedbackMapper feedbackMapper,
                           ObjectMapper objectMapper) {
        this.sensorReadingMapper = sensorReadingMapper;
        this.alertMapper = alertMapper;
        this.detectionMapper = detectionMapper;
        this.deviceStatusMapper = deviceStatusMapper;
        this.inspectionTaskMapper = inspectionTaskMapper;
        this.feedbackMapper = feedbackMapper;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void testConnection() {
        if (apiKey == null || apiKey.isEmpty() || "your-api-key".equals(apiKey)) {
            log.info("[DeepSeek] api-key 未配置，AI问答功能暂不可用");
            System.out.println("========================================");
            System.out.println("  [DeepSeek] api-key 未配置");
            System.out.println("  AI问答功能暂不可用");
            System.out.println("  配置: application.yml → deepseek.api-key");
            System.out.println("========================================");
            return;
        }
        new Thread(() -> {
            try {
                URL url = new URL(apiUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                String testBody = "{\"model\":\"" + model + "\",\"stream\":false,\"max_tokens\":1,"
                        + "\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(testBody.getBytes("UTF-8"));
                }
                int code = conn.getResponseCode();
                if (code == 200) {
                    System.out.println("========================================");
                    System.out.println("  [DeepSeek] API 连接成功！");
                    System.out.println("  AI 工厂助理「小鸿」已就绪");
                    System.out.println("========================================");
                } else {
                    System.out.println("[DeepSeek] 连接失败 HTTP " + code + "，请检查 api-key");
                }
                conn.disconnect();
            } catch (Exception e) {
                System.out.println("[DeepSeek] 连接失败: " + e.getMessage());
            }
        }).start();
    }

    /**
     * 流式调用 DeepSeek
     */
    public void chatStream(String userMessage, StreamCallback callback) {
        if (apiKey == null || apiKey.isEmpty()) {
            callback.onError("DeepSeek API Key 未配置，请在 application.yml 中设置 deepseek.api-key");
            return;
        }

        try {
            String systemPrompt = buildSystemPrompt();
            String body = buildRequestBody(systemPrompt, userMessage);

            URL url = new URL(apiUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(60000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes("UTF-8"));
                os.flush();
            }

            int code = conn.getResponseCode();
            if (code != 200) {
                callback.onError("DeepSeek API 返回错误: " + code);
                return;
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data: ")) {
                        String data = line.substring(6).trim();
                        if ("[DONE]".equals(data)) {
                            callback.onDone();
                            break;
                        }
                        try {
                            Map<String, Object> obj = objectMapper.readValue(data, Map.class);
                            List<Map<String, Object>> choices = (List<Map<String, Object>>) obj.get("choices");
                            if (choices != null && !choices.isEmpty()) {
                                Map<String, Object> delta = (Map<String, Object>) choices.get(0).get("delta");
                                if (delta != null && delta.containsKey("content")) {
                                    String content = (String) delta.get("content");
                                    if (content != null && !content.isEmpty()) {
                                        callback.onToken(content);
                                    }
                                }
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            callback.onError("AI 服务异常: " + e.getMessage());
            log.error("DeepSeek error", e);
        }
    }

    private String buildSystemPrompt() {
        StringBuilder ctx = new StringBuilder();
        ctx.append("你是'小鸿'，FactoryGuard（鸿观智巡）智慧工厂安全监测系统的AI助理。");
        ctx.append("你的职责是帮助工厂管理人员了解生产安全状况、分析数据趋势、处理告警事件。\n");
        ctx.append("\n## 你的角色定位\n");
        ctx.append("- 你是一位经验丰富的工厂安全助理，熟悉智慧工厂的各类传感器、执行器和安全规范\n");
        ctx.append("- 你能根据实时数据给出专业判断，也能解答工厂安全管理的一般性问题\n");
        ctx.append("- 语气友好专业，像一位可靠的同事，回答控制在300字以内\n");
        ctx.append("- 涉及具体数据时必须以系统提供的实时数据为准，不能编造数值\n");
        ctx.append("- 如果是知识性、流程性问题，可以结合工厂安全管理的通用知识来回答\n\n");

        ctx.append("## 系统简介\n");
        ctx.append("FactoryGuard是智慧工厂安全监测控制平台，基于RK3568网关+STM32节点，");
        ctx.append("集成温湿度DHT11、可燃气MQ-5（报警阈值900ppm）、烟雾MQ-2（报警阈值300ppm）、");
        ctx.append("光敏电阻LDR、人体红外PIR、继电器照明灯、RGB状态指示灯、蜂鸣器、");
        ctx.append("货物计数器（count/库存stock），并预留OV2640摄像头YOLO安全帽检测通道。\n\n");

        // 最新传感器数据
        try {
            QueryWrapper<SensorReading> qw = new QueryWrapper<>();
            qw.orderByDesc("timestamp").last("LIMIT 1");
            SensorReading latest = sensorReadingMapper.selectOne(qw);
            if (latest != null) {
                ctx.append("## 最新传感器数据\n");
                ctx.append("- 设备: ").append(latest.getDeviceId()).append("\n");
                if (latest.getTemp() != null) ctx.append("- 温度: ").append(latest.getTemp()).append("℃\n");
                if (latest.getHumi() != null) ctx.append("- 湿度: ").append(latest.getHumi()).append("%\n");
                if (latest.getMq2Ppm() != null) ctx.append("- 烟雾(MQ-2): ").append(latest.getMq2Ppm()).append("ppm (阈值300)\n");
                if (latest.getMq5Ppm() != null) ctx.append("- 可燃气(MQ-5): ").append(latest.getMq5Ppm()).append("ppm (阈值900)\n");
                if (latest.getLdrAdc() != null) ctx.append("- 光照ADC: ").append(latest.getLdrAdc()).append("/4095\n");
                if (latest.getPir() != null) ctx.append("- 人体红外: ").append(latest.getPir() == 1 ? "有人" : "无人").append("\n");
                if (latest.getLightOn() != null) ctx.append("- 照明灯: ").append(latest.getLightOn() == 1 ? "开" : "关").append("\n");
                if (latest.getRgbColor() != null) ctx.append("- RGB颜色代码: ").append(latest.getRgbColor()).append("\n");
                if (latest.getBeep() != null) ctx.append("- 蜂鸣器: ").append(latest.getBeep() == 1 ? "响" : "静音").append("\n");
                if (latest.getCount() != null) ctx.append("- 实时计数: ").append(latest.getCount()).append("\n");
                if (latest.getStock() != null) ctx.append("- Flash库存: ").append(latest.getStock()).append("\n");
                ctx.append("- 采集时间: ").append(latest.getTimestamp()).append("\n\n");
            }
        } catch (Exception e) { log.debug("读取传感器数据失败: {}", e.getMessage()); }

        // 今日检测统计
        try {
            String today = LocalDate.now().toString();
            QueryWrapper<Detection> detQw = new QueryWrapper<>();
            detQw.ge("timestamp", today).orderByDesc("timestamp");
            List<Detection> detections = detectionMapper.selectList(detQw);
            if (!detections.isEmpty()) {
                Detection last = detections.get(0);
                ctx.append("## 今日安全帽检测\n");
                ctx.append("- 最新检测: ").append(last.getTimestamp()).append("\n");
                ctx.append("- 总人数: ").append(last.getTotal()).append("\n");
                ctx.append("- 合规(戴帽): ").append(last.getCompliant()).append("人\n");
                ctx.append("- 违规(未戴帽): ").append(last.getNoHelmet()).append("人\n");
                ctx.append("- 合规率: ").append(String.format("%.1f%%",
                        last.getTotal() > 0 ? 100.0 * last.getCompliant() / last.getTotal() : 0)).append("\n\n");
            }
        } catch (Exception e) { log.debug("读取检测数据失败: {}", e.getMessage()); }

        // 未处理告警
        try {
            QueryWrapper<Alert> altQw = new QueryWrapper<>();
            altQw.eq("handled", 0).orderByDesc("timestamp").last("LIMIT 5");
            List<Alert> alerts = alertMapper.selectList(altQw);
            if (!alerts.isEmpty()) {
                ctx.append("## 未处理告警(最近5条)\n");
                for (Alert a : alerts) {
                    ctx.append("- [").append(a.getAlertLevel()).append("] ")
                       .append(a.getAlertType()).append(" — ").append(a.getTimestamp()).append("\n");
                }
                ctx.append("\n");
            } else {
                ctx.append("## 未处理告警: 无\n\n");
            }
        } catch (Exception e) { log.debug("读取告警数据失败: {}", e.getMessage()); }

        // 设备状态
        try {
            List<DeviceStatus> devices = deviceStatusMapper.selectList(null);
            if (!devices.isEmpty()) {
                ctx.append("## 设备状态\n");
                for (DeviceStatus d : devices) {
                    ctx.append("- ").append(d.getDeviceId())
                       .append(": ").append(d.getOnline() != null && d.getOnline() == 1 ? "在线" : "离线")
                       .append(" | 最后上报:").append(d.getLastHeartbeat() != null ? d.getLastHeartbeat().toString() : "无记录")
                       .append(" | 灯:").append(d.getLightOn() != null && d.getLightOn() == 1 ? "开" : "关")
                       .append(" | RGB:").append(d.getRgbColor())
                       .append(" | 蜂鸣器:").append(d.getBeep() != null && d.getBeep() == 1 ? "响" : "静音").append("\n");
                }
                ctx.append("\n");
            }
        } catch (Exception e) { log.debug("读取设备状态失败: {}", e.getMessage()); }

        // 平台功能导览（回答"某功能在哪/怎么用"类问题时严格按此指引）
    ctx.append("## 平台功能导览（回答功能位置与用法时严格按此指引）\n");
    ctx.append("【Web 管理控制台】左侧导航栏，登录后可见：\n");
    ctx.append("- 综合大屏(/dashboard)：全局实时监控总览\n");
    ctx.append("- 温湿度监控(/temperature)、废气监测(/gas-monitor)：环境浓度与阈值标线\n");
    ctx.append("- 红外照明控制(/lighting)：继电器灯/RGB指示灯/蜂鸣器远程控制\n");
    ctx.append("- 货物感应计数(/counter)：计数统计与 Flash 库存改写/清零（管理员，Flash有擦写寿命）\n");
    ctx.append("- 告警中心(/alarm)：告警查看/单条处理/批量处理/CSV导出\n");
    ctx.append("- 智能联动(/automation)：自定义触发-动作规则、生产/下班/警戒场景一键应用\n");
    ctx.append("- 照明与在场分析(/energy)、环境安全评估(/safety)、3D数字孪生(/digital-twin,管理员)\n");
    ctx.append("- 设备管理(/device,管理员)：设备档案增删改查\n");
    ctx.append("- 工厂管理(/factory,管理员)：多工厂与车间维护、全局工厂切换\n");
    ctx.append("- 意见反馈(/feedback)：提交反馈/查看官方回复（管理员可处理全部反馈）\n");
    ctx.append("- 数据报表(/report,管理员)：CSV导出\n\n");
    ctx.append("【支付宝小程序端】底部5个Tab：\n");
    ctx.append("- 监控Tab：传感器实时卡片、工厂/车间切换\n");
    ctx.append("- 告警Tab：告警列表、批量处理\n");
    ctx.append("- 设备Tab：设备列表与详情\n");
    ctx.append("- 控制Tab：继电器输出/RGB指示灯/蜂鸣器控制、一键系统复位\n");
    ctx.append("- 检测Tab：拍照上传安全帽检测、RK3568视频流(4秒定时检测开关)、环境安全分析、Word/PDF报告导出\n");
    ctx.append("- 我的页：登录、通知设置、意见反馈、工厂管理入口\n");
    ctx.append("- 巡检任务：我的页/监控页进入，支持任务分配、扫码打卡、全部必检点打卡后自动完成\n\n");

    // 今日巡检与反馈概况
    try {
        long pending = inspectionTaskMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.InspectionTask>().eq("status", "pending"));
        long assigned = inspectionTaskMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.InspectionTask>().eq("status", "assigned"));
        long inProgress = inspectionTaskMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.InspectionTask>().eq("status", "in_progress"));
        long completed = inspectionTaskMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.InspectionTask>().eq("status", "completed"));
        ctx.append("## 巡检任务概况\n");
        ctx.append("- 待分配: ").append(pending).append(" | 待巡检: ").append(assigned)
           .append(" | 进行中: ").append(inProgress).append(" | 已完成: ").append(completed).append("\n\n");
    } catch (Exception e) { log.debug("读取巡检数据失败: {}", e.getMessage()); }

    try {
        Long todayFeedback = feedbackMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.Feedback>()
                        .ge("created_at", LocalDate.now().atStartOfDay()));
        Long pendingFeedback = feedbackMapper.selectCount(
                new QueryWrapper<com.factoryguard.model.Feedback>().eq("status", "pending"));
        ctx.append("## 意见反馈概况\n");
        ctx.append("- 今日新增: ").append(todayFeedback).append(" | 待处理: ").append(pendingFeedback).append("\n\n");
    } catch (Exception e) { log.debug("读取反馈数据失败: {}", e.getMessage()); }

    ctx.append("## 告警阈值参考\n");
        ctx.append("- 温度过高: >45℃\n- 烟雾超标: MQ-2 >300ppm\n- 可燃气泄漏: MQ-5 >900ppm\n");
        ctx.append("- 设备离线: 90秒无上报\n\n");

        ctx.append("请根据以上数据为用户提供专业分析。涉及具体数值时必须引用系统数据，一般性知识问题可以结合你的工厂安全管理经验回答。");

        return ctx.toString();
    }

    private String buildRequestBody(String systemPrompt, String userMessage) {
        try {
            Map<String, Object> sysMsg = Map.of("role", "system", "content", systemPrompt);
            Map<String, Object> userMsg = Map.of("role", "user", "content", userMessage);
            Map<String, Object> body = Map.of(
                "model", model,
                "stream", true,
                "messages", List.of(sysMsg, userMsg)
            );
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            return "{}";
        }
    }

    public interface StreamCallback {
        void onToken(String token);
        void onDone();
        void onError(String error);
    }
}
