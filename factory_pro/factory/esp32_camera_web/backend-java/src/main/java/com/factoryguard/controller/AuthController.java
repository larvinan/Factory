package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.NotifySettingMapper;
import com.factoryguard.mapper.UserMapper;
import com.factoryguard.model.NotifySetting;
import com.factoryguard.model.User;
import com.factoryguard.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserMapper userMapper;
    private final NotifySettingMapper notifySettingMapper;
    private final AuthService authService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${wechat.appid:}")
    private String wechatAppid;

    @Value("${wechat.secret:}")
    private String wechatSecret;

    public AuthController(UserMapper userMapper,
                          NotifySettingMapper notifySettingMapper,
                          AuthService authService) {
        this.userMapper = userMapper;
        this.notifySettingMapper = notifySettingMapper;
        this.authService = authService;
    }

    /**
     * 登录（双模式）
     * Web 页面：{username, password}；微信小程序：{code}
     */
    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        // ===== Web 用户名密码登录 =====
        if (body.get("username") != null && !body.get("username").isEmpty()) {
            return loginByUsernamePassword(body.get("username"), body.get("password"));
        }

        // ===== 微信小程序登录（原有逻辑） =====
        String code = body.get("code");
        if (code == null || code.isEmpty()) {
            return Map.of("status", "error", "message", "缺少 username 或 code 参数");
        }

        String openid;
        if (wechatAppid == null || wechatAppid.isEmpty()) {
            // 开发模式：直接用 code 作为 openid
            openid = "dev_" + code;
        } else {
            // 生产模式：调用微信 code2session 接口
            try {
                String url = String.format(
                    "https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
                    wechatAppid, wechatSecret, code
                );
                Map<String, Object> response = restTemplate.getForObject(url, Map.class);
                if (response != null && response.containsKey("openid")) {
                    openid = (String) response.get("openid");
                } else {
                    return Map.of("status", "error", "message", "微信接口返回异常");
                }
            } catch (Exception e) {
                return Map.of("status", "error", "message", "微信接口调用失败: " + e.getMessage());
            }
        }

        // 查找或创建用户
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("openid", openid);
        User user = userMapper.selectOne(qw);

        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setNickname("微信用户");
            user.setRole("user");
            user.setCreateTime(LocalDateTime.now());
            userMapper.insert(user);
        }

        // 生成 token
        String token = authService.generateToken(openid);

        Map<String, Object> userData = buildUserResponse(user);
        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", userData);

        return Map.of("status", "ok", "data", data);
    }

    /**
     * Web 用户名密码登录（安全性后续升级为 BCrypt）
     */
    private Map<String, Object> loginByUsernamePassword(String username, String password) {
        if (password == null) {
            return Map.of("status", "error", "message", "密码不能为空");
        }

        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("username", username);
        User user = userMapper.selectOne(qw);

        if (user == null || !password.equals(user.getPassword())) {
            return Map.of("status", "error", "message", "用户名或密码错误");
        }

        // token 体系以 username 作为 Web 用户身份键
        String token = authService.generateToken(user.getUsername());

        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", buildUserResponse(user));
        return Map.of("status", "ok", "data", data);
    }

    /**
     * Web 注册：{username, password, name, role, adminCode}
     * 管理员角色需要注册码（与前端约定 2026）
     */
    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");
        String name = body.get("name");
        String role = body.get("role");
        String adminCode = body.get("adminCode");

        if (username == null || username.trim().isEmpty()
                || password == null || password.trim().isEmpty()) {
            return Map.of("status", "error", "message", "用户名和密码不能为空");
        }
        if (username.length() > 64 || password.length() > 64) {
            return Map.of("status", "error", "message", "用户名或密码过长");
        }
        if (!"admin".equals(role) && !"user".equals(role)) {
            role = "user";
        }
        if ("admin".equals(role) && !"2026".equals(adminCode)) {
            return Map.of("status", "error", "message", "管理员注册码错误");
        }

        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("username", username);
        if (userMapper.selectCount(qw) > 0) {
            return Map.of("status", "error", "message", "该用户名已被注册");
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(password);
        user.setNickname(name == null || name.isEmpty() ? username : name);
        user.setRole(role);
        user.setCreateTime(LocalDateTime.now());
        userMapper.insert(user);

        return Map.of("status", "ok", "message", "注册成功");
    }

    /** 获取当前用户信息 */
    @GetMapping("/user")
    public Map<String, Object> getUserInfo(@RequestHeader("Authorization") String authHeader) {
        String identity = authService.resolveOpenidFromAuthHeader(authHeader);
        if (identity == null) {
            return Map.of("status", "error", "message", "未登录");
        }

        User user = findUserByIdentity(identity);

        if (user == null) {
            return Map.of("status", "error", "message", "用户不存在");
        }

        return Map.of("status", "ok", "data", buildUserResponse(user));
    }

    /** 身份键兼容：微信用户=openid，Web 用户=username */
    private User findUserByIdentity(String identity) {
        QueryWrapper<User> qw = new QueryWrapper<>();
        qw.eq("openid", identity);
        User user = userMapper.selectOne(qw);
        if (user == null) {
            QueryWrapper<User> qw2 = new QueryWrapper<>();
            qw2.eq("username", identity);
            user = userMapper.selectOne(qw2);
        }
        return user;
    }

    /** 获取通知设置 */
    @GetMapping("/notify-setting")
    public Map<String, Object> getNotifySetting(@RequestHeader("Authorization") String authHeader) {
        String openid = authService.resolveOpenidFromAuthHeader(authHeader);
        if (openid == null) {
            return Map.of("status", "error", "message", "未登录");
        }

        QueryWrapper<NotifySetting> qw = new QueryWrapper<>();
        qw.eq("openid", openid);
        NotifySetting setting = notifySettingMapper.selectOne(qw);

        if (setting == null) {
            setting = new NotifySetting();
            setting.setOpenid(openid);
            setting.setGasWarning(true);
            setting.setGasAlarm(true);
            setting.setSmokeAlarm(true);
            setting.setFlameAlarm(true);
            setting.setSystemOffline(true);
            setting.setAllAlarm(true);
            setting.setCreatedAt(LocalDateTime.now());
            notifySettingMapper.insert(setting);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("gas_warning", setting.getGasWarning());
        data.put("gas_alarm", setting.getGasAlarm());
        data.put("smoke_alarm", setting.getSmokeAlarm());
        data.put("flame_alarm", setting.getFlameAlarm());
        data.put("system_offline", setting.getSystemOffline());
        data.put("all_alarm", setting.getAllAlarm());

        return Map.of("status", "ok", "data", data);
    }

    /** 更新通知设置 */
    @PutMapping("/notify-setting")
    public Map<String, Object> updateNotifySetting(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody Map<String, Object> body) {
        String openid = authService.resolveOpenidFromAuthHeader(authHeader);
        if (openid == null) {
            return Map.of("status", "error", "message", "未登录");
        }

        QueryWrapper<NotifySetting> qw = new QueryWrapper<>();
        qw.eq("openid", openid);
        NotifySetting setting = notifySettingMapper.selectOne(qw);

        if (setting == null) {
            setting = new NotifySetting();
            setting.setOpenid(openid);
            setting.setCreatedAt(LocalDateTime.now());
        }

        if (body.containsKey("gas_warning")) setting.setGasWarning((Boolean) body.get("gas_warning"));
        if (body.containsKey("gas_alarm")) setting.setGasAlarm((Boolean) body.get("gas_alarm"));
        if (body.containsKey("smoke_alarm")) setting.setSmokeAlarm((Boolean) body.get("smoke_alarm"));
        if (body.containsKey("flame_alarm")) setting.setFlameAlarm((Boolean) body.get("flame_alarm"));
        if (body.containsKey("system_offline")) setting.setSystemOffline((Boolean) body.get("system_offline"));
        if (body.containsKey("all_alarm")) setting.setAllAlarm((Boolean) body.get("all_alarm"));
        setting.setUpdatedAt(LocalDateTime.now());

        if (setting.getId() == null) {
            notifySettingMapper.insert(setting);
        } else {
            notifySettingMapper.updateById(setting);
        }

        return Map.of("status", "ok", "message", "更新成功");
    }

    private Map<String, Object> buildUserResponse(User user) {
        Map<String, Object> map = new HashMap<>();
        map.put("openid", user.getOpenid());
        map.put("username", user.getUsername());
        map.put("nickname", user.getNickname());
        map.put("name", user.getNickname() == null ? user.getUsername() : user.getNickname());
        map.put("avatar", user.getAvatar());
        map.put("role", user.getRole());
        map.put("phone", user.getPhone());
        map.put("department", user.getDepartment());
        map.put("create_time", user.getCreateTime() != null ? user.getCreateTime().toString() : "");
        return map;
    }
}
