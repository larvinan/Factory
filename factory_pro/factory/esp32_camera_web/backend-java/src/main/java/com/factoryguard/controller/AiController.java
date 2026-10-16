package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.FaqMapper;
import com.factoryguard.model.Faq;
import com.factoryguard.service.DeepSeekService;
import com.factoryguard.service.EnvironmentAnalysisService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import java.io.PrintWriter;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final DeepSeekService deepSeekService;
    private final FaqMapper faqMapper;
    private final EnvironmentAnalysisService environmentAnalysisService;

    public AiController(DeepSeekService deepSeekService, FaqMapper faqMapper,
                        EnvironmentAnalysisService environmentAnalysisService) {
        this.deepSeekService = deepSeekService;
        this.faqMapper = faqMapper;
        this.environmentAnalysisService = environmentAnalysisService;
    }

    @GetMapping("/faqs")
    public Map<String, Object> getFaqs() {
        QueryWrapper<Faq> qw = new QueryWrapper<>();
        qw.orderByAsc("sort_order");
        List<Faq> faqs = faqMapper.selectList(qw);
        return Map.of("status", "ok", "data", faqs);
    }

    @GetMapping("/chat")
    public void chat(@RequestParam String message, HttpServletResponse response) {
        String decoded;
        try {
            decoded = URLDecoder.decode(message, StandardCharsets.UTF_8);
        } catch (Exception e) {
            decoded = message;
        }

        response.setContentType("text/plain;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");

        try {
            PrintWriter writer = response.getWriter();
            deepSeekService.chatStream(decoded, new DeepSeekService.StreamCallback() {
                @Override
                public void onToken(String token) {
                    writer.print(token);
                    writer.flush();
                }

                @Override
                public void onDone() {
                    writer.close();
                }

                @Override
                public void onError(String error) {
                    writer.print("[error] " + error);
                    writer.close();
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * 环境安全智能分析
     * @param autoControl 是否自动执行联动控制（默认 false）
     */
    @GetMapping("/analyze-environment")
    public Map<String, Object> analyzeEnvironment(
            @RequestParam(defaultValue = "false") boolean autoControl) {
        try {
            Map<String, Object> result = environmentAnalysisService.analyze(autoControl);
            return Map.of("status", "ok", "data", result);
        } catch (Exception e) {
            return Map.of("status", "error", "message", e.getMessage());
        }
    }
}
