package com.factoryguard.controller;

import com.factoryguard.service.ReportService;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 安全分析报告导出 Controller
 * 支持 Word(.docx) 和 PDF 两种格式
 */
@RestController
@RequestMapping("/api/report")
public class ReportController {

    private static final Logger log = LoggerFactory.getLogger(ReportController.class);

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    /**
     * 导出安全分析报告
     * @param format 导出格式：word 或 pdf
     */
    @GetMapping("/download")
    public void downloadReport(@RequestParam(defaultValue = "pdf") String format,
                               HttpServletResponse response) {
        try {
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            byte[] data;
            String fileName;
            String contentType;

            if ("word".equalsIgnoreCase(format)) {
                data = reportService.generateWordReport();
                fileName = "安全分析报告_" + timestamp + ".docx";
                contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            } else if ("pdf".equalsIgnoreCase(format)) {
                data = reportService.generatePdfReport();
                fileName = "安全分析报告_" + timestamp + ".pdf";
                contentType = MediaType.APPLICATION_PDF_VALUE;
            } else {
                response.setStatus(400);
                response.getWriter().write("{\"status\":\"error\",\"message\":\"format 仅支持 word 或 pdf\"}");
                return;
            }

            String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replaceAll("\\+", "%20");
            response.setContentType(contentType + "; charset=UTF-8");
            response.setHeader("Content-Disposition",
                    "attachment; filename=\"" + encodedFileName + "\"; filename*=UTF-8''" + encodedFileName);
            response.setContentLength(data.length);
            response.getOutputStream().write(data);
            response.getOutputStream().flush();
            log.info("报告导出成功: format={}, fileName={}, size={}bytes", format, fileName, data.length);
        } catch (Exception e) {
            log.error("报告导出失败: format={}", format, e);
            try {
                response.setStatus(500);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}");
            } catch (Exception ignored) {}
        }
    }
}
