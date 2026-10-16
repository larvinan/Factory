package com.factoryguard.service;

import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.element.Text;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import org.apache.poi.xwpf.usermodel.*;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTblWidth;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STTblWidth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 安全分析报告生成服务
 * 支持 Word(.docx) 和 PDF 两种格式导出
 * 报告内容：环境安全分析 + 传感器风险条形图 + AI安全帽检测统计 + 详细分析 + 智能建议
 */
@Service
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    private final EnvironmentAnalysisService environmentAnalysisService;
    private final DetectionService detectionService;

    public ReportService(EnvironmentAnalysisService environmentAnalysisService,
                         DetectionService detectionService) {
        this.environmentAnalysisService = environmentAnalysisService;
        this.detectionService = detectionService;
    }

    /**
     * 生成 Word(.docx) 报告
     */
    public byte[] generateWordReport() throws IOException {
        Map<String, Object> env = environmentAnalysisService.analyze(false);
        Map<String, Object> detectStats = detectionService.getTodayStats();

        try (XWPFDocument doc = new XWPFDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            // ===== 标题 =====
            XWPFParagraph title = doc.createParagraph();
            title.setAlignment(ParagraphAlignment.CENTER);
            XWPFRun titleRun = title.createRun();
            titleRun.setText("智慧工厂安全监测分析报告");
            titleRun.setBold(true);
            titleRun.setFontSize(22);
            titleRun.setFontFamily("宋体");
            titleRun.setColor("1A6DFF");

            // 报告信息
            XWPFParagraph info = doc.createParagraph();
            info.setAlignment(ParagraphAlignment.CENTER);
            XWPFRun infoRun = info.createRun();
            infoRun.setText("报告编号：FG-" + System.currentTimeMillis() +
                    "    生成时间：" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            infoRun.setFontSize(10);
            infoRun.setColor("666666");

            // ===== 一、环境安全综合评估 =====
            addHeading(doc, "一、环境安全综合评估", 14);

            int score = toInt(env.get("score"));
            String level = String.valueOf(env.getOrDefault("level", "unknown"));

            XWPFTable envTable = doc.createTable(2, 4);
            setTableWidth(envTable, 9000);
            setCellText(envTable, 0, 0, "安全等级");
            setCellText(envTable, 0, 1, translateLevel(level));
            setCellText(envTable, 0, 2, "安全评分");
            setCellText(envTable, 0, 3, score + " / 100");
            setCellText(envTable, 1, 0, "设备ID");
            setCellText(envTable, 1, 1, String.valueOf(env.getOrDefault("deviceId", "-")));
            setCellText(envTable, 1, 2, "分析时间");
            setCellText(envTable, 1, 3, String.valueOf(env.getOrDefault("timestamp", "-")));

            XWPFParagraph msgP = doc.createParagraph();
            XWPFRun msgRun = msgP.createRun();
            msgRun.setText("综合评估：" + env.getOrDefault("message", "-"));
            msgRun.setFontSize(11);

            // ===== 二、传感器数据分析 =====
            addHeading(doc, "二、传感器数据分析", 14);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) env.getOrDefault("items", Collections.emptyList());
            if (!items.isEmpty()) {
                XWPFTable sensorTable = doc.createTable(items.size() + 1, 6);
                setTableWidth(sensorTable, 9000);
                String[] headers = {"传感器", "当前值", "安全等级", "状态", "风险分", "阈值说明"};
                for (int i = 0; i < headers.length; i++) {
                    setCellText(sensorTable, 0, i, headers[i]);
                }
                for (int i = 0; i < items.size(); i++) {
                    Map<String, Object> item = items.get(i);
                    setCellText(sensorTable, i + 1, 0, String.valueOf(item.getOrDefault("label", "-")));
                    setCellText(sensorTable, i + 1, 1, String.valueOf(item.getOrDefault("value", "-")));
                    setCellText(sensorTable, i + 1, 2, translateLevel(String.valueOf(item.getOrDefault("level", "safe"))));
                    setCellText(sensorTable, i + 1, 3, String.valueOf(item.getOrDefault("status", "-")));
                    setCellText(sensorTable, i + 1, 4, String.valueOf(item.getOrDefault("risk", 0)));
                    setCellText(sensorTable, i + 1, 5, String.valueOf(item.getOrDefault("threshold", "-")));
                }
            }

            // —— 风险分布条形图（字符块） ——
            addHeading(doc, "  ▍传感器风险分布图", 11);
            addWordBarChart(doc, items);

            // ===== 三、AI 安全帽检测统计 =====
            addHeading(doc, "三、AI 安全帽检测统计（今日）", 14);

            XWPFTable detectTable = doc.createTable(3, 4);
            setTableWidth(detectTable, 9000);
            setCellText(detectTable, 0, 0, "检测次数");
            setCellText(detectTable, 0, 1, String.valueOf(detectStats.getOrDefault("totalDetections", 0)));
            setCellText(detectTable, 0, 2, "检测人数");
            setCellText(detectTable, 0, 3, String.valueOf(detectStats.getOrDefault("totalPersons", 0)));
            setCellText(detectTable, 1, 0, "合规人数");
            setCellText(detectTable, 1, 1, String.valueOf(detectStats.getOrDefault("compliant", 0)));
            setCellText(detectTable, 1, 2, "未戴安全帽");
            setCellText(detectTable, 1, 3, String.valueOf(detectStats.getOrDefault("noHelmet", 0)));

            int totalPersons = toInt(detectStats.get("totalPersons"));
            int compliant = toInt(detectStats.get("compliant"));
            int noHelmet = toInt(detectStats.get("noHelmet"));
            String rate = totalPersons > 0 ? Math.round(compliant * 100.0 / totalPersons) + "%" : "100%";
            setCellText(detectTable, 2, 0, "合规率");
            setCellText(detectTable, 2, 1, rate);
            setCellText(detectTable, 2, 2, "检测模型");
            setCellText(detectTable, 2, 3, "YOLOv8 + best.pt");

            // —— 合规率条形图 ——
            addHeading(doc, "  ▍安全帽合规率", 11);
            addWordRateBar(doc, compliant, noHelmet);

            // ===== 四、总结分析 =====
            addHeading(doc, "四、总结分析", 14);
            XWPFParagraph analysisP = doc.createParagraph();
            XWPFRun analysisRun = analysisP.createRun();
            analysisRun.setText(generateDetailedAnalysis(level, score, items, detectStats));
            analysisRun.setFontSize(11);
            analysisRun.setFontFamily("宋体");

            // ===== 五、处置建议 =====
            addHeading(doc, "五、处置建议", 14);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> actions = (List<Map<String, Object>>) env.getOrDefault("actions", Collections.emptyList());
            List<String> recommendations = generateRecommendations(items, actions, level, score, noHelmet);
            int recIdx = 1;
            for (String rec : recommendations) {
                XWPFParagraph rp = doc.createParagraph();
                XWPFRun rr = rp.createRun();
                rr.setText(recIdx + ". " + rec);
                rr.setFontSize(11);
                rr.setFontFamily("宋体");
                recIdx++;
            }

            // ===== 六、已自动执行的联动控制 =====
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> executed = (List<Map<String, Object>>) env.getOrDefault("executedControls", Collections.emptyList());
            int sectionIdx = 6;
            if (!executed.isEmpty()) {
                addHeading(doc, "六、已自动执行的联动控制", 14);
                XWPFTable execTable = doc.createTable(executed.size() + 1, 3);
                setTableWidth(execTable, 9000);
                setCellText(execTable, 0, 0, "设备");
                setCellText(execTable, 0, 1, "操作");
                setCellText(execTable, 0, 2, "原因");
                for (int i = 0; i < executed.size(); i++) {
                    Map<String, Object> e = executed.get(i);
                    setCellText(execTable, i + 1, 0, String.valueOf(e.getOrDefault("device", "-")));
                    setCellText(execTable, i + 1, 1, translateAction(String.valueOf(e.getOrDefault("action", "-"))));
                    setCellText(execTable, i + 1, 2, String.valueOf(e.getOrDefault("reason", "-")));
                }
                sectionIdx = 7;
            }

            // ===== 报告结论 =====
            addHeading(doc, numberToChinese(sectionIdx) + "、报告结论", 14);
            XWPFParagraph conclusion = doc.createParagraph();
            XWPFRun conRun = conclusion.createRun();
            conRun.setText(generateConclusion(level, score, actions.size(), executed.size(), noHelmet));
            conRun.setFontSize(11);
            conRun.setFontFamily("宋体");

            // 页脚
            XWPFParagraph footer = doc.createParagraph();
            footer.setAlignment(ParagraphAlignment.CENTER);
            XWPFRun footerRun = footer.createRun();
            footerRun.setText("\n— FactoryGuard 鸿观智巡平台 自动生成 —");
            footerRun.setFontSize(9);
            footerRun.setColor("999999");

            doc.write(out);
            log.info("Word 报告生成成功，大小：{} bytes", out.size());
            return out.toByteArray();
        }
    }

    /**
     * 生成 PDF 报告
     */
    public byte[] generatePdfReport() throws IOException {
        Map<String, Object> env = environmentAnalysisService.analyze(false);
        Map<String, Object> detectStats = detectionService.getTodayStats();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(out);
        PdfDocument pdf = new PdfDocument(writer);
        Document document = new Document(pdf, PageSize.A4);
        document.setMargins(36, 36, 36, 36);

        // 中文字体：使用 Windows SimSun TrueType 字体（嵌入子集），避免 CID 字体缺字 NPE
        PdfFont chinese = PdfFontFactory.createFont("C:/Windows/Fonts/simsun.ttc,0", "Identity-H",
                PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED);

        int score = toInt(env.get("score"));
        String level = String.valueOf(env.getOrDefault("level", "unknown"));

        // ===== 标题 =====
        document.add(new Paragraph("智慧工厂安全监测分析报告")
                .setFont(chinese).setFontSize(20).setBold()
                .setFontColor(new DeviceRgb(0x1A, 0x6D, 0xFF))
                .setTextAlignment(TextAlignment.CENTER).setMarginBottom(5));
        document.add(new Paragraph("报告编号：FG-" + System.currentTimeMillis() +
                        "    生成时间：" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")))
                .setFont(chinese).setFontSize(9).setFontColor(new DeviceRgb(0x66, 0x66, 0x66))
                .setTextAlignment(TextAlignment.CENTER).setMarginBottom(20));

        // ===== 一、环境安全综合评估 =====
        document.add(new Paragraph("一、环境安全综合评估")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));

        Table envTable = new Table(UnitValue.createPercentArray(new float[]{1, 1.5f, 1, 1.5f}))
                .useAllAvailableWidth().setMarginBottom(10);
        addPdfRow(envTable, chinese, "安全等级", translateLevel(level),
                "安全评分", score + " / 100");
        addPdfRow(envTable, chinese, "设备ID", String.valueOf(env.getOrDefault("deviceId", "-")),
                "分析时间", String.valueOf(env.getOrDefault("timestamp", "-")));
        document.add(envTable);
        document.add(new Paragraph("综合评估：" + env.getOrDefault("message", "-"))
                .setFont(chinese).setFontSize(11).setMarginBottom(10));

        // ===== 二、传感器数据分析 =====
        document.add(new Paragraph("二、传感器数据分析")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) env.getOrDefault("items", Collections.emptyList());
        if (!items.isEmpty()) {
            float[] cols = {1.2f, 1, 1, 1, 0.8f, 2f};
            Table sensorTable = new Table(UnitValue.createPercentArray(cols)).useAllAvailableWidth().setMarginBottom(10);
            String[] headers = {"传感器", "当前值", "安全等级", "状态", "风险分", "阈值说明"};
            for (String h : headers) {
                sensorTable.addHeaderCell(new Cell().add(new Paragraph(h).setFont(chinese).setFontSize(10))
                        .setBackgroundColor(new DeviceRgb(0xE6, 0xF0, 0xFF)));
            }
            for (Map<String, Object> item : items) {
                addPdfCell(sensorTable, chinese, String.valueOf(item.getOrDefault("label", "-")));
                addPdfCell(sensorTable, chinese, String.valueOf(item.getOrDefault("value", "-")));
                addPdfCell(sensorTable, chinese, translateLevel(String.valueOf(item.getOrDefault("level", "safe"))));
                addPdfCell(sensorTable, chinese, String.valueOf(item.getOrDefault("status", "-")));
                addPdfCell(sensorTable, chinese, String.valueOf(item.getOrDefault("risk", 0)));
                addPdfCell(sensorTable, chinese, String.valueOf(item.getOrDefault("threshold", "-")));
            }
            document.add(sensorTable);
        }

        // —— 风险分布条形图 ——
        document.add(new Paragraph("▍ 传感器风险分布图")
                .setFont(chinese).setFontSize(11).setBold().setMarginTop(8).setMarginBottom(6)
                .setFontColor(new DeviceRgb(0x33, 0x33, 0x33)));
        addPdfBarChart(document, chinese, items);

        // ===== 三、AI 安全帽检测统计 =====
        document.add(new Paragraph("三、AI 安全帽检测统计（今日）")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));

        Table detectTable = new Table(UnitValue.createPercentArray(new float[]{1, 1, 1, 1}))
                .useAllAvailableWidth().setMarginBottom(10);
        addPdfRow(detectTable, chinese, "检测次数", String.valueOf(detectStats.getOrDefault("totalDetections", 0)),
                "检测人数", String.valueOf(detectStats.getOrDefault("totalPersons", 0)));
        addPdfRow(detectTable, chinese, "合规人数", String.valueOf(detectStats.getOrDefault("compliant", 0)),
                "未戴安全帽", String.valueOf(detectStats.getOrDefault("noHelmet", 0)));
        int totalPersons = toInt(detectStats.get("totalPersons"));
        int compliant = toInt(detectStats.get("compliant"));
        int noHelmet = toInt(detectStats.get("noHelmet"));
        String rate = totalPersons > 0 ? Math.round(compliant * 100.0 / totalPersons) + "%" : "100%";
        addPdfRow(detectTable, chinese, "合规率", rate, "检测模型", "YOLOv8 + best.pt");
        document.add(detectTable);

        // —— 合规率条形图 ——
        document.add(new Paragraph("▍ 安全帽合规率")
                .setFont(chinese).setFontSize(11).setBold().setMarginTop(8).setMarginBottom(6)
                .setFontColor(new DeviceRgb(0x33, 0x33, 0x33)));
        addPdfRateBar(document, chinese, compliant, noHelmet);

        // ===== 四、总结分析 =====
        document.add(new Paragraph("四、总结分析")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));
        document.add(new Paragraph(generateDetailedAnalysis(level, score, items, detectStats))
                .setFont(chinese).setFontSize(11).setMarginBottom(10));

        // ===== 五、处置建议 =====
        document.add(new Paragraph("五、处置建议")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> actions = (List<Map<String, Object>>) env.getOrDefault("actions", Collections.emptyList());
        List<String> recommendations = generateRecommendations(items, actions, level, score, noHelmet);
        int recIdx = 1;
        for (String rec : recommendations) {
            document.add(new Paragraph(recIdx + ". " + rec)
                    .setFont(chinese).setFontSize(11).setMarginBottom(3));
            recIdx++;
        }

        // ===== 六、已自动执行的联动控制 =====
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> executed = (List<Map<String, Object>>) env.getOrDefault("executedControls", Collections.emptyList());
        int sectionIdx = 6;
        if (!executed.isEmpty()) {
            document.add(new Paragraph("六、已自动执行的联动控制")
                    .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));
            float[] eCols = {1, 1, 3};
            Table execTable = new Table(UnitValue.createPercentArray(eCols)).useAllAvailableWidth().setMarginBottom(10);
            String[] eHeaders = {"设备", "操作", "原因"};
            for (String h : eHeaders) {
                execTable.addHeaderCell(new Cell().add(new Paragraph(h).setFont(chinese).setFontSize(10))
                        .setBackgroundColor(new DeviceRgb(0xE6, 0xF0, 0xFF)));
            }
            for (Map<String, Object> e : executed) {
                addPdfCell(execTable, chinese, String.valueOf(e.getOrDefault("device", "-")));
                addPdfCell(execTable, chinese, translateAction(String.valueOf(e.getOrDefault("action", "-"))));
                addPdfCell(execTable, chinese, String.valueOf(e.getOrDefault("reason", "-")));
            }
            document.add(execTable);
            sectionIdx = 7;
        }

        // ===== 报告结论 =====
        document.add(new Paragraph(numberToChinese(sectionIdx) + "、报告结论")
                .setFont(chinese).setFontSize(14).setBold().setMarginBottom(8).setMarginTop(10));
        document.add(new Paragraph(generateConclusion(level, score, actions.size(), executed.size(), noHelmet))
                .setFont(chinese).setFontSize(11));

        // 页脚
        document.add(new Paragraph("\n— FactoryGuard 鸿观智巡平台 自动生成 —")
                .setFont(chinese).setFontSize(9).setFontColor(new DeviceRgb(0x99, 0x99, 0x99))
                .setTextAlignment(TextAlignment.CENTER).setMarginTop(30));

        document.close();
        log.info("PDF 报告生成成功，大小：{} bytes", out.size());
        return out.toByteArray();
    }

    // ============ 图表：PDF 条形图 ============
    private void addPdfBarChart(Document document, PdfFont font, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) return;
        for (Map<String, Object> item : items) {
            String label = String.valueOf(item.getOrDefault("label", "-"));
            String value = String.valueOf(item.getOrDefault("value", "-"));
            int risk = toInt(item.get("risk"));
            String lv = String.valueOf(item.getOrDefault("level", "safe"));
            int pct = Math.min(Math.max(risk * 2, 2), 100); // 0-50 映射到 0-100%，最小 2% 保证可见

            // 标签行
            document.add(new Paragraph(label + "  " + value + "    风险分 " + risk)
                    .setFont(font).setFontSize(9).setFontColor(new DeviceRgb(0x55, 0x55, 0x55))
                    .setMarginTop(4).setMarginBottom(2));
            // 条形：用 Table + 带背景色的 Cell 实现可靠着色
            if (risk > 0) {
                Table bar = new Table(UnitValue.createPercentArray(new float[]{pct, Math.max(100 - pct, 0)}));
                bar.setWidth(UnitValue.createPercentValue(100));
                bar.setMarginBottom(6);
                Cell fill = new Cell().add(new Paragraph(" ").setFont(font).setFontSize(6))
                        .setBackgroundColor(colorForLevel(lv)).setBorder(Border.NO_BORDER);
                Cell empty = new Cell().add(new Paragraph(" ").setFont(font).setFontSize(6))
                        .setBorder(Border.NO_BORDER);
                bar.addCell(fill);
                bar.addCell(empty);
                document.add(bar);
            } else {
                document.add(new Paragraph("● 安全")
                        .setFont(font).setFontSize(9).setFontColor(colorForLevel("safe"))
                        .setMarginBottom(6));
            }
        }
    }

    private void addPdfRateBar(Document document, PdfFont font, int compliant, int noHelmet) {
        int total = compliant + noHelmet;
        if (total <= 0) {
            document.add(new Paragraph("今日暂无检测数据").setFont(font).setFontSize(10)
                    .setFontColor(new DeviceRgb(0x99, 0x99, 0x99)));
            return;
        }
        int compPct = Math.round(compliant * 100f / total);
        int noHelmetPct = 100 - compPct;
        // 合规段 + 未戴段：用 Table 双 Cell 着色
        int compWidth = Math.max(compPct, 1);
        int noWidth = noHelmet > 0 ? Math.max(noHelmetPct, 1) : 0;
        Table bar = new Table(UnitValue.createPercentArray(new float[]{compWidth, noWidth > 0 ? noWidth : 1}));
        bar.setWidth(UnitValue.createPercentValue(100));
        bar.setMarginBottom(4);
        Cell green = new Cell().add(new Paragraph(" ").setFont(font).setFontSize(6))
                .setBackgroundColor(new DeviceRgb(0x00, 0xB4, 0x2A)).setBorder(Border.NO_BORDER);
        bar.addCell(green);
        if (noHelmet > 0) {
            Cell red = new Cell().add(new Paragraph(" ").setFont(font).setFontSize(6))
                    .setBackgroundColor(new DeviceRgb(0xF5, 0x3F, 0x3F)).setBorder(Border.NO_BORDER);
            bar.addCell(red);
        } else {
            Cell blank = new Cell().add(new Paragraph(" ").setFont(font).setFontSize(6))
                    .setBorder(Border.NO_BORDER);
            bar.addCell(blank);
        }
        document.add(bar);
        document.add(new Paragraph("合规 " + compliant + "（" + compPct + "%）   未戴 " + noHelmet + "（" + noHelmetPct + "%）")
                .setFont(font).setFontSize(9).setFontColor(new DeviceRgb(0x55, 0x55, 0x55)).setMarginBottom(6));
    }

    // ============ 图表：Word 字符块条形图 ============
    private void addWordBarChart(XWPFDocument doc, List<Map<String, Object>> items) {
        if (items == null) return;
        for (Map<String, Object> item : items) {
            String label = String.valueOf(item.getOrDefault("label", "-"));
            String value = String.valueOf(item.getOrDefault("value", "-"));
            int risk = toInt(item.get("risk"));
            String lv = String.valueOf(item.getOrDefault("level", "safe"));
            String color = wordColorForLevel(lv);

            XWPFParagraph p = doc.createParagraph();
            XWPFRun labelRun = p.createRun();
            labelRun.setText(label + " " + value + "    风险分 " + risk);
            labelRun.setFontSize(9);
            labelRun.setFontFamily("宋体");
            labelRun.setColor("555555");

            XWPFParagraph barP = doc.createParagraph();
            XWPFRun barRun = barP.createRun();
            int blocks = Math.min(20, Math.max(risk, 1) * 2 / 5); // 0-50 → 0-20 个块
            if (risk > 0 && blocks == 0) blocks = 1;
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < blocks; i++) sb.append("■");
            if (risk == 0) {
                barRun.setText("● 安全");
                barRun.setColor(color);
            } else {
                barRun.setText(sb.toString());
                barRun.setColor(color);
                barRun.setFontSize(11);
            }
        }
    }

    private void addWordRateBar(XWPFDocument doc, int compliant, int noHelmet) {
        int total = compliant + noHelmet;
        XWPFParagraph p = doc.createParagraph();
        XWPFRun r = p.createRun();
        if (total <= 0) {
            r.setText("今日暂无检测数据");
            r.setFontSize(10);
            r.setColor("999999");
            return;
        }
        int compPct = Math.round(compliant * 100f / total);
        int compBlocks = Math.max(1, compPct / 5);
        int noBlocks = noHelmet > 0 ? Math.max(1, (100 - compPct) / 5) : 0;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < compBlocks; i++) sb.append("■");
        r.setText(sb.toString());
        r.setColor("00B42A");
        r.setFontSize(11);
        XWPFRun r2 = p.createRun();
        StringBuilder sb2 = new StringBuilder();
        for (int i = 0; i < noBlocks; i++) sb2.append("■");
        r2.setText(sb2.toString());
        r2.setColor("F53F3F");
        r2.setFontSize(11);
        XWPFRun r3 = p.createRun();
        r3.setText("  合规 " + compliant + "（" + compPct + "%）  未戴 " + noHelmet);
        r3.setFontSize(9);
        r3.setColor("555555");
    }

    // ============ Word 辅助方法 ============
    private void addHeading(XWPFDocument doc, String text, int fontSize) {
        XWPFParagraph p = doc.createParagraph();
        p.setSpacingBefore(200);
        XWPFRun run = p.createRun();
        run.setText(text);
        run.setBold(true);
        run.setFontSize(fontSize);
        run.setFontFamily("宋体");
        run.setColor("1A6DFF");
    }

    private void setTableWidth(XWPFTable table, int widthTwips) {
        CTTblWidth w = table.getCTTbl().addNewTblPr().addNewTblW();
        w.setType(STTblWidth.DXA);
        w.setW(java.math.BigInteger.valueOf(widthTwips));
    }

    private void setCellText(XWPFTable table, int row, int col, String text) {
        XWPFTableRow r = table.getRow(row);
        if (r == null) r = table.createRow();
        XWPFTableCell cell = r.getCell(col);
        if (cell == null) return;
        cell.removeParagraph(0);
        XWPFParagraph p = cell.addParagraph();
        XWPFRun run = p.createRun();
        run.setText(text == null ? "-" : text);
        run.setFontSize(10);
        run.setFontFamily("宋体");
        if (row == 0) {
            run.setBold(true);
            cell.setColor("E6F0FF");
        }
    }

    // ============ PDF 辅助方法 ============
    private void addPdfCell(Table table, PdfFont font, String text) {
        table.addCell(new Cell().add(new Paragraph(text == null ? "-" : text)
                .setFont(font).setFontSize(10)));
    }

    private void addPdfRow(Table table, PdfFont font,
                           String k1, String v1, String k2, String v2) {
        table.addCell(new Cell().add(new Paragraph(k1).setFont(font).setFontSize(10).setBold())
                .setBackgroundColor(new DeviceRgb(0xF5, 0xF7, 0xFA)));
        table.addCell(new Cell().add(new Paragraph(v1 == null ? "-" : v1).setFont(font).setFontSize(10)));
        table.addCell(new Cell().add(new Paragraph(k2).setFont(font).setFontSize(10).setBold())
                .setBackgroundColor(new DeviceRgb(0xF5, 0xF7, 0xFA)));
        table.addCell(new Cell().add(new Paragraph(v2 == null ? "-" : v2).setFont(font).setFontSize(10)));
    }

    // ============ 颜色 ============
    private DeviceRgb colorForLevel(String level) {
        switch (level) {
            case "critical": return new DeviceRgb(0xF5, 0x3F, 0x3F);
            case "danger": return new DeviceRgb(0xFF, 0x7D, 0x00);
            case "warning": return new DeviceRgb(0xFF, 0xB8, 0x20);
            case "safe": return new DeviceRgb(0x00, 0xB4, 0x2A);
            default: return new DeviceRgb(0x99, 0x99, 0x99);
        }
    }

    private String wordColorForLevel(String level) {
        switch (level) {
            case "critical": return "F53F3F";
            case "danger": return "FF7D00";
            case "warning": return "FFB820";
            case "safe": return "00B42A";
            default: return "999999";
        }
    }

    // ============ 通用辅助 ============
    private int toInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).intValue();
        try { return Integer.parseInt(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    private String translateLevel(String level) {
        switch (level) {
            case "safe": return "安全";
            case "warning": return "预警";
            case "danger": return "危险";
            case "critical": return "紧急";
            default: return "未知";
        }
    }

    private String translateAction(String action) {
        switch (action) {
            case "on": return "开启";
            case "close": return "关闭";
            default: return action;
        }
    }

    private String translatePriority(String p) {
        switch (p) {
            case "high": return "高";
            case "medium": return "中";
            case "low": return "低";
            default: return p;
        }
    }

    private String numberToChinese(int n) {
        switch (n) {
            case 1: return "一";
            case 2: return "二";
            case 3: return "三";
            case 4: return "四";
            case 5: return "五";
            case 6: return "六";
            case 7: return "七";
            case 8: return "八";
            default: return String.valueOf(n);
        }
    }

    /**
     * 详细分析：数据概览 + 风险点 + 趋势判断
     */
    private String generateDetailedAnalysis(String level, int score,
                                            List<Map<String, Object>> items, Map<String, Object> detectStats) {
        StringBuilder sb = new StringBuilder();
        int safe = 0, warn = 0, danger = 0;
        List<String> abnormal = new ArrayList<>();
        for (Map<String, Object> it : items) {
            String lv = String.valueOf(it.getOrDefault("level", "safe"));
            int r = toInt(it.get("risk"));
            if (r == 0) safe++;
            else if ("warning".equals(lv)) { warn++; abnormal.add(it.getOrDefault("label", "") + "(" + it.getOrDefault("value", "") + ")"); }
            else { danger++; abnormal.add(it.getOrDefault("label", "") + "(" + it.getOrDefault("value", "") + ")"); }
        }
        sb.append("本次共采集 ").append(items.size()).append(" 项传感器指标，其中 ").append(safe).append(" 项正常");
        if (warn > 0) sb.append("，").append(warn).append(" 项预警");
        if (danger > 0) sb.append("，").append(danger).append(" 项异常");
        sb.append("。");
        if (!abnormal.isEmpty()) {
            sb.append("重点关注：").append(String.join("、", abnormal)).append("。");
        }
        sb.append("综合评分 ").append(score).append("/100，");
        if (score >= 85) sb.append("整体安全状况良好，各系统运行稳定，建议保持当前监测策略。");
        else if (score >= 60) sb.append("存在部分风险因素，建议关注预警指标并适时调整设备运行参数。");
        else sb.append("安全状况不佳，存在显著隐患，需立即启动应急处置并排查根因。");

        // AI 检测分析
        int totalPersons = toInt(detectStats.get("totalPersons"));
        int noHelmet = toInt(detectStats.get("noHelmet"));
        if (totalPersons > 0) {
            int compliant = toInt(detectStats.get("compliant"));
            int rate = totalPersons > 0 ? Math.round(compliant * 100 / totalPersons) : 100;
            sb.append(" AI 安全帽检测：今日共检测 ").append(totalPersons).append(" 人，合规 ").append(compliant)
                    .append(" 人（").append(rate).append("%）");
            if (noHelmet > 0) sb.append("，未戴 ").append(noHelmet).append(" 人，存在违规行为。");
            else sb.append("，全员合规。");
        } else {
            sb.append(" 今日暂无 AI 安全帽检测数据。");
        }
        return sb.toString();
    }

    /**
     * 智能建议：优先具体联动动作，再按等级/场景补充通用建议
     */
    private List<String> generateRecommendations(List<Map<String, Object>> items,
                                                 List<Map<String, Object>> actions,
                                                 String level, int score, int noHelmet) {
        List<String> recs = new ArrayList<>();

        // 1. 优先列出具体联动建议
        for (Map<String, Object> a : actions) {
            String pr = translatePriority(String.valueOf(a.getOrDefault("priority", "medium")));
            String device = String.valueOf(a.getOrDefault("device", "-"));
            String action = translateAction(String.valueOf(a.getOrDefault("action", "-")));
            String reason = String.valueOf(a.getOrDefault("reason", "-"));
            recs.add("[" + pr + "优先] " + device + action + "：" + reason);
        }

        // 2. 按等级补充
        switch (level) {
            case "critical":
                recs.add("[高优先] 立即启动应急预案，组织人员疏散并上报安全管理部门");
                recs.add("[高优先] 切断相关危险源（气源/电源），保持现场通风");
                break;
            case "danger":
                recs.add("[高优先] 排查超标根因，调整设备运行参数至安全区间");
                break;
            case "warning":
                recs.add("[中优先] 增加巡检频次，观察预警指标变化趋势");
                break;
            default:
                recs.add("[中优先] 保持日常巡检，确保各项指标稳定在安全范围");
        }

        // 3. 安全帽违规建议
        if (noHelmet > 0) {
            recs.add("[高优先] 针对未戴安全帽人员开展安全培训，强化入厂门禁与标识提醒");
            recs.add("[中优先] 优化摄像头布点与检测角度，提升 AI 识别覆盖率");
        } else if (score >= 85) {
            recs.add("[低优先] 持续推进安全文化建设，定期开展安全演练");
        }

        // 4. 通用运维建议
        recs.add("[中优先] 定期校准传感器并维护联动设备，确保监测数据准确可靠");
        recs.add("[低优先] 完善数据归档与趋势分析，为安全管理决策提供数据支撑");

        return recs;
    }

    private String generateConclusion(String level, int score, int actionCount, int executedCount, int noHelmet) {
        StringBuilder sb = new StringBuilder();
        sb.append("本次报告基于实时传感器数据与 AI 安全帽检测结果综合生成。");
        sb.append("环境安全等级为「").append(translateLevel(level)).append("」，综合评分 ").append(score).append("/100。");
        if (actionCount > 0) {
            sb.append("共生成 ").append(actionCount).append(" 项应对措施建议");
            if (executedCount > 0) sb.append("，已自动执行 ").append(executedCount).append(" 项联动控制");
            sb.append("。");
        } else {
            sb.append("各项传感器指标均在安全范围内。");
        }
        if (noHelmet > 0) {
            sb.append("AI 检测发现 ").append(noHelmet).append(" 人未佩戴安全帽，已生成告警并给出处置建议。");
        } else {
            sb.append("今日 AI 安全帽检测未发现违规情况。");
        }
        sb.append("详见上方总结分析与处置建议。");
        return sb.toString();
    }
}
