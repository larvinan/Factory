package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.FeedbackMapper;
import com.factoryguard.mapper.UserMapper;
import com.factoryguard.model.Feedback;
import com.factoryguard.model.User;
import com.factoryguard.service.AuthService;
import com.factoryguard.service.MailService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 反馈服务接口
 * 提交：登录即可（web/小程序均记录提交人）；管理：仅 admin
 */
@RestController
@RequestMapping("/api/feedbacks")
public class FeedbackController {

    private final FeedbackMapper feedbackMapper;
    private final UserMapper userMapper;
    private final AuthService authService;
    private final MailService mailService;

    public FeedbackController(FeedbackMapper feedbackMapper, UserMapper userMapper,
                              AuthService authService, MailService mailService) {
        this.feedbackMapper = feedbackMapper;
        this.userMapper = userMapper;
        this.authService = authService;
        this.mailService = mailService;
    }

    /** 提交反馈（登录用户；触发异步邮件通知） */
    @PostMapping
    public Map<String, Object> create(@RequestBody Feedback body, HttpServletRequest request) {
        Identity identity = resolveIdentity(request);
        if (identity == null) {
            return Map.of("status", "error", "message", "请先登录后再提交反馈");
        }
        if (body.getTitle() == null || body.getTitle().isBlank()) {
            return Map.of("status", "error", "message", "反馈标题不能为空");
        }
        if (body.getContent() == null || body.getContent().isBlank()) {
            return Map.of("status", "error", "message", "反馈内容不能为空");
        }

        Feedback fb = new Feedback();
        fb.setType(validOf(body.getType(), Set.of("bug", "suggestion", "experience", "other"), "bug"));
        fb.setSeverity(validOf(body.getSeverity(), Set.of("low", "medium", "high"), "medium"));
        fb.setTitle(body.getTitle().trim().substring(0, Math.min(128, body.getTitle().trim().length())));
        fb.setContent(body.getContent());
        fb.setContact(body.getContact());
        fb.setImages(body.getImages());
        fb.setStatus("pending");
        fb.setReporterType(identity.type);
        fb.setReporterId(identity.id);
        fb.setReporterName(identity.name);
        feedbackMapper.insert(fb);

        mailService.sendFeedbackNotice(fb);
        return Map.of("status", "ok", "data", fb, "message", "反馈已提交，感谢您的宝贵意见");
    }

    /**
     * 反馈列表：admin 查看全部并支持 status/type 筛选；普通用户只看自己提交的
     */
    @GetMapping
    public Map<String, Object> getList(HttpServletRequest request,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) String type,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int limit) {
        Identity identity = resolveIdentity(request);
        if (identity == null) {
            return Map.of("status", "error", "message", "请先登录");
        }
        boolean admin = isAdmin(identity.id);

        QueryWrapper<Feedback> qw = new QueryWrapper<>();
        if (!admin) {
            qw.eq("reporter_id", identity.id);
        }
        if (status != null && !status.isBlank()) qw.eq("status", status);
        if (type != null && !type.isBlank()) qw.eq("type", type);
        qw.orderByDesc("created_at");

        long total = feedbackMapper.selectCount(qw);
        qw.last("LIMIT " + ((page - 1) * limit) + "," + limit);
        List<Feedback> rows = feedbackMapper.selectList(qw);

        Map<String, Object> data = new HashMap<>();
        data.put("list", rows);
        data.put("total", total);
        data.put("page", page);
        data.put("limit", limit);
        data.put("isAdmin", admin);
        return Map.of("status", "ok", "data", data);
    }

    /** 反馈统计（admin）：各状态数量 */
    @GetMapping("/stats")
    public Map<String, Object> stats(HttpServletRequest request) {
        Identity identity = resolveIdentity(request);
        if (identity == null) {
            return Map.of("status", "error", "message", "请先登录");
        }
        if (!isAdmin(identity.id)) {
            return Map.of("status", "error", "message", "仅管理员可查看统计");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        for (String s : Arrays.asList("pending", "processing", "resolved", "closed")) {
            QueryWrapper<Feedback> qw = new QueryWrapper<>();
            qw.eq("status", s);
            data.put(s, feedbackMapper.selectCount(qw));
        }
        QueryWrapper<Feedback> qw = new QueryWrapper<>();
        data.put("total", feedbackMapper.selectCount(qw));
        return Map.of("status", "ok", "data", data);
    }

    /** 处理反馈（admin）：修改状态 + 填写回复 */
    @PutMapping("/{id}/handle")
    public Map<String, Object> handle(@PathVariable Long id,
                                      @RequestBody Map<String, String> body,
                                      HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;

        Feedback fb = feedbackMapper.selectById(id);
        if (fb == null) {
            return Map.of("status", "error", "message", "反馈不存在");
        }
        String status = validOf(body.get("status"), Set.of("pending", "processing", "resolved", "closed"), fb.getStatus());
        fb.setStatus(status);
        if (body.get("reply") != null) {
            fb.setReply(body.get("reply"));
        }
        fb.setHandledBy(body.getOrDefault("handledBy", "admin"));
        fb.setHandledAt(LocalDateTime.now());
        feedbackMapper.updateById(fb);
        return Map.of("status", "ok", "data", fb, "message", "反馈已更新");
    }

    /** 删除反馈（admin） */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id, HttpServletRequest request) {
        Map<String, Object> perm = checkAdmin(request);
        if (perm != null) return perm;
        feedbackMapper.deleteById(id);
        return Map.of("status", "ok", "message", "反馈已删除");
    }

    // ==================== 工具 ====================

    private static class Identity {
        String type;   // web / miniprogram
        String id;     // username 或 openid
        String name;   // 展示名
    }

    /** 解析登录身份（兼容 web username 与小程序 openid 两种 token 键），未登录返回 null */
    private Identity resolveIdentity(HttpServletRequest request) {
        String identity = authService.resolveOpenidFromAuthHeader(request.getHeader("Authorization"));
        if (identity == null) return null;
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("openid", identity).or().eq("username", identity);
        User user = userMapper.selectOne(qw);
        if (user == null) return null;
        Identity id = new Identity();
        boolean isWeb = identity.equals(user.getUsername());
        id.type = isWeb ? "web" : "miniprogram";
        id.id = isWeb ? user.getUsername() : user.getOpenid();
        id.name = user.getNickname() != null && !user.getNickname().isBlank()
                ? user.getNickname() : (isWeb ? user.getUsername() : "微信用户");
        return id;
    }

    private boolean isAdmin(String identityId) {
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("openid", identityId).or().eq("username", identityId);
        User user = userMapper.selectOne(qw);
        return user != null && "admin".equals(user.getRole());
    }

    /** 写操作权限校验：admin 通过返回 null（与 FactoryController 同款） */
    private Map<String, Object> checkAdmin(HttpServletRequest request) {
        String identity = authService.resolveOpenidFromAuthHeader(request.getHeader("Authorization"));
        if (identity == null) {
            return Map.of("status", "error", "message", "未登录或登录已过期", "code", 401);
        }
        if (!isAdmin(identity)) {
            return Map.of("status", "error", "message", "仅管理员可执行该操作", "code", 403);
        }
        return null;
    }

    private String validOf(String value, Set<String> allowed, String fallback) {
        return value != null && allowed.contains(value) ? value : fallback;
    }
}
