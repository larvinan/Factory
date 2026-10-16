package com.factoryguard.service;

import com.factoryguard.model.Feedback;
import jakarta.annotation.PreDestroy;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 反馈通知邮件服务（QQ 邮箱 SMTP 465 SSL）
 * 授权码未配置时跳过发送；异步发送避免拖慢反馈提交接口；发送失败只记日志
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final ExecutorService mailExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "feedback-mail");
        t.setDaemon(true);
        return t;
    });

    @Value("${spring.mail.username:}")
    private String from;

    @Value("${mail.notify-to:}")
    private String notifyTo;

    public MailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /** 邮件功能是否可用（返回检测是否发件账号与授权码均已配置） */
    public boolean isConfigured() {
        return from != null && !from.isBlank();
    }

    /** 异步发送新反馈通知，任何异常都不影响主流程 */
    public void sendFeedbackNotice(Feedback fb) {
        if (!isConfigured()) {
            log.warn("[Mail] 未配置 MAIL_USERNAME/MAIL_AUTH_CODE，跳过反馈通知邮件（反馈已正常入库）");
            return;
        }
        String to = (notifyTo != null && !notifyTo.isBlank()) ? notifyTo : from;
        String subject = String.format("[FactoryGuard 反馈] %s/%s：%s",
                typeText(fb.getType()), severityText(fb.getSeverity()), fb.getTitle());
        String html = buildHtml(fb);

        mailExecutor.submit(() -> {
            try {
                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(from);
                helper.setTo(to);
                helper.setSubject(subject);
                helper.setText(html, true);
                mailSender.send(message);
                log.info("[Mail] 反馈通知已发送至 {} (feedbackId={})", to, fb.getId());
            } catch (Exception e) {
                log.warn("[Mail] 反馈通知发送失败（不影响反馈数据）: {}", e.getMessage());
            }
        });
    }

    private String buildHtml(Feedback fb) {
        String time = fb.getCreatedAt() != null
                ? fb.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                : "";
        return "<div style=\"font-family:Microsoft YaHei,sans-serif;max-width:640px\">"
                + "<h2 style=\"color:#1a6dff;margin-bottom:4px\">FactoryGuard 新反馈</h2>"
                + "<table style=\"border-collapse:collapse;font-size:14px\">"
                + row("编号", "#" + fb.getId())
                + row("类型", typeText(fb.getType()))
                + row("影响程度", severityText(fb.getSeverity()))
                + row("标题", escape(fb.getTitle()))
                + row("详情", escape(fb.getContent()).replace("\n", "<br/>"))
                + row("联系方式", fb.getContact() == null || fb.getContact().isBlank() ? "未填写" : escape(fb.getContact()))
                + row("提交人", escape(fb.getReporterName()) + "（" + fb.getReporterType() + "）")
                + row("提交时间", time)
                + "</table>"
                + "<p style=\"color:#86909c;font-size:12px\">请登录平台在「意见反馈」页面处理该反馈。</p>"
                + "</div>";
    }

    private String row(String k, String v) {
        return "<tr><td style=\"padding:6px 12px;background:#f5f7fa;width:90px\">" + k
                + "</td><td style=\"padding:6px 12px\">" + v + "</td></tr>";
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String typeText(String t) {
        switch (t == null ? "" : t) {
            case "bug": return "功能缺陷";
            case "suggestion": return "功能建议";
            case "experience": return "体验问题";
            default: return "其他";
        }
    }

    private String severityText(String s) {
        switch (s == null ? "" : s) {
            case "high": return "严重";
            case "medium": return "一般";
            default: return "轻微";
        }
    }

    @PreDestroy
    public void shutdown() {
        mailExecutor.shutdownNow();
    }
}
