package com.factoryguard.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.CommandLogMapper;
import com.factoryguard.mapper.SensorReadingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 数据保留策略服务
 *
 * 真实硬件按 2 秒一帧上报，sensor_readings 每天增长约 4.3 万行。
 * 定期清理超过保留期的历史数据（默认 7 天），防止数据库无限膨胀。
 * 同时清理 command_logs（指令日志同样按天累积）。
 */
@Service
public class DataCleanupService {

    private static final Logger log = LoggerFactory.getLogger(DataCleanupService.class);

    private final SensorReadingMapper sensorReadingMapper;
    private final CommandLogMapper commandLogMapper;

    @Value("${data-retention.enabled:true}")
    private boolean enabled;

    @Value("${data-retention.days:7}")
    private int retentionDays;

    @Value("${data-retention.sweep-interval-hours:6}")
    private int sweepIntervalHours;

    private ScheduledExecutorService sweeper;

    public DataCleanupService(SensorReadingMapper sensorReadingMapper,
                              CommandLogMapper commandLogMapper) {
        this.sensorReadingMapper = sensorReadingMapper;
        this.commandLogMapper = commandLogMapper;
    }

    @PostConstruct
    public void start() {
        if (!enabled) {
            log.info("数据保留策略已关闭 (data-retention.enabled=false)");
            return;
        }
        if (retentionDays <= 0) {
            log.warn("数据保留天数配置非法 ({}), 清理服务不启动", retentionDays);
            return;
        }

        sweeper = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "data-cleanup");
            t.setDaemon(true);
            return t;
        });

        // 启动 30 秒后先执行一次（立即生效），之后按配置间隔循环
        sweeper.scheduleAtFixedRate(this::sweep, 30,
                sweepIntervalHours * 3600L, TimeUnit.SECONDS);
        log.info("数据保留策略已启动: 保留 {} 天，每 {} 小时扫描一次", retentionDays, sweepIntervalHours);
    }

    void sweep() {
        try {
            LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);

            int readings = sensorReadingMapper.delete(
                    new QueryWrapper<com.factoryguard.model.SensorReading>()
                            .lt("timestamp", cutoff));
            int logs = commandLogMapper.delete(
                    new QueryWrapper<com.factoryguard.model.CommandLog>()
                            .lt("timestamp", cutoff));

            if (readings > 0 || logs > 0) {
                log.info("数据清理完成: 删除 {} 天前的传感器读数 {} 行、指令日志 {} 行",
                        retentionDays, readings, logs);
            }
        } catch (Exception e) {
            // 清理失败不能影响主流程，等下个周期重试
            log.error("数据清理异常: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void stop() {
        if (sweeper != null) {
            sweeper.shutdownNow();
        }
    }
}
