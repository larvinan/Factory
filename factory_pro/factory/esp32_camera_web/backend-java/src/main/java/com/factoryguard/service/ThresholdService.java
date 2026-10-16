package com.factoryguard.service;

import com.factoryguard.mapper.AppConfigMapper;
import com.factoryguard.model.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 运行时阈值服务：从 app_config 表读取报警阈值（带 60 秒缓存），
 * 修改后立即刷新缓存，AlertEngineService 每帧动态取值 —— 无需重启后端
 */
@Service
public class ThresholdService {

    private static final Logger log = LoggerFactory.getLogger(ThresholdService.class);

    /** 允许运行时修改的阈值白名单 */
    public static final Map<String, String> ALLOWED_KEYS = Map.of(
            "temperature_high", "温度告警阈值(℃)",
            "mq5_ppm_high", "可燃气报警阈值(ppm)",
            "mq2_ppm_high", "烟雾报警阈值(ppm)"
    );

    private final AppConfigMapper configMapper;
    private final Map<String, Double> cache = new ConcurrentHashMap<>();
    private volatile long cacheAt = 0;
    private static final long CACHE_TTL_MS = 60_000;

    public ThresholdService(AppConfigMapper configMapper) {
        this.configMapper = configMapper;
    }

    /** 读取某个阈值（表里没有时返回 def 兜底） */
    public double get(String key, double def) {
        refreshIfNeeded();
        Double v = cache.get(key);
        return v != null ? v : def;
    }

    /** 全部阈值（供接口展示） */
    public Map<String, Double> all() {
        refreshIfNeeded();
        return Map.copyOf(cache);
    }

    /** 更新阈值并立即刷新缓存 */
    public void update(String key, double value) {
        AppConfig row = new AppConfig();
        row.setConfigKey(key);
        row.setConfigValue(String.valueOf(value));
        AppConfig existing = configMapper.selectById(key);
        if (existing != null) {
            configMapper.updateById(row);
        } else {
            row.setDescription(ALLOWED_KEYS.getOrDefault(key, key));
            configMapper.insert(row);
        }
        refreshNow();
        log.info("阈值已更新: {} = {}", key, value);
    }

    private void refreshIfNeeded() {
        if (System.currentTimeMillis() - cacheAt > CACHE_TTL_MS) {
            refreshNow();
        }
    }

    private synchronized void refreshNow() {
        try {
            Map<String, Double> fresh = new ConcurrentHashMap<>();
            for (AppConfig row : configMapper.selectList(null)) {
                try {
                    fresh.put(row.getConfigKey(), Double.parseDouble(row.getConfigValue()));
                } catch (NumberFormatException ignored) {}
            }
            cache.clear();
            cache.putAll(fresh);
            cacheAt = System.currentTimeMillis();
        } catch (Exception e) {
            // 读库失败时沿用旧缓存，不影响告警主流程
            log.error("阈值缓存刷新失败: {}", e.getMessage());
        }
    }
}
