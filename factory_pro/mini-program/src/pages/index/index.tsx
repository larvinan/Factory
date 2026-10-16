import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import { useFactoryStore } from '@/store/factory';
import dayjs from 'dayjs';
import { usePolling } from '@/hooks/usePolling';
import { getSensorLatest, getDetectionStats, getWorkshops, DetectionStats } from '@/services/api';
import { SensorLatest, SensorReading, SensorType, SystemStatus } from '@/types/sensor';
import SensorCard from '@/components/SensorCard';
import GaugeChart from '@/components/GaugeChart';
import styles from './index.module.scss';

const statusTextMap: Record<SystemStatus, string> = {
  online: '系统运行中',
  offline: '系统离线',
  alarm: '系统告警'
};

const statusDescMap: Record<SystemStatus, string> = {
  online: '所有设备运行正常，正在实时采集数据',
  offline: '边缘端离线，无法获取最新传感器数据',
  alarm: '检测到异常情况，请立即处理'
};

/**
 * 监控首页 Page
 */
const IndexPage: React.FC = () => {
  const { data, refresh, loading } = usePolling<SensorLatest>(getSensorLatest, 60000);
  const [hasPendingAlarm, setHasPendingAlarm] = useState(true);
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [workshopId, setWorkshopId] = useState(1);
  const { factories, currentFactoryId, setCurrentFactory, loadFactories } = useFactoryStore();
  const [detectStats, setDetectStats] = useState<DetectionStats>({
    totalDetections: 0,
    totalPersons: 0,
    compliant: 0,
    noHelmet: 0
  });

  // 加载 AI 检测统计
  const loadDetectStats = useCallback(async () => {
    try {
      const stats = await getDetectionStats();
      setDetectStats(stats);
    } catch {
      /* ignore */
    }
  }, []);

  // 工厂变化 → 按厂加载车间
  useEffect(() => {
    loadDetectStats();
    getWorkshops(currentFactoryId ?? undefined).then((ws: any[]) => {
      if (Array.isArray(ws) && ws.length > 0) setWorkshops(ws);
      else setWorkshops([]);
    }).catch(() => {});
  }, [loadDetectStats, currentFactoryId]);

  // 进入页面时初始化工厂列表
  useEffect(() => {
    loadFactories();
  }, [loadFactories]);

  // 下拉刷新
  usePullDownRefresh(() => {
    Promise.all([refresh(), loadDetectStats()]).finally(() => {
      Taro.stopPullDownRefresh();
    });
  });

  // 页面显示时刷新一次
  useDidShow(() => {
    refresh();
    loadDetectStats();
  });

  const handleSensorClick = useCallback((sensor: SensorReading) => {
    // 跳转到对应设备详情
    const deviceIdMap: Partial<Record<SensorType, string>> = {
      [SensorType.TEMPERATURE]: 'dht11_01',
      [SensorType.HUMIDITY]: 'dht11_02',
      [SensorType.GAS]: 'mq5_01',
      [SensorType.SMOKE]: 'mq2_01',
      [SensorType.FLAME]: 'flame_01',
      [SensorType.AGV_DISTANCE]: 'hcsr04_01',
      [SensorType.GOODS_COUNT]: 'photo_01'
    };
    const deviceId = deviceIdMap[sensor.type];
    if (deviceId) {
      Taro.navigateTo({ url: `/pages/device/detail?deviceId=${deviceId}` });
    }
  }, []);

  const goAlarm = useCallback(() => {
    Taro.switchTab({ url: '/pages/alarm/index' });
  }, []);

  const goDetect = useCallback(() => {
    Taro.switchTab({ url: '/pages/detect/index' });
  }, []);

  const goMine = useCallback(() => {
    Taro.navigateTo({ url: '/pages/mine/index' });
  }, []);

  const goDashboard = useCallback(() => {
    Taro.navigateTo({ url: '/pages/dashboard/index' });
  }, []);

  const goInspection = useCallback(() => {
    Taro.navigateTo({ url: '/pages/inspection/index' });
  }, []);

  const currentWorkshopName = workshops.find(w => w.id === workshopId)?.name || '1号车间';

  const lastUpdateText = data?.lastUpdate
    ? dayjs(data.lastUpdate).format('YYYY-MM-DD HH:mm:ss')
    : '加载中...';

  const systemStatus: SystemStatus = data?.systemStatus || 'online';

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 工厂 + 车间切换器 */}
      {factories.length > 0 && (
        <ScrollView scrollX className={styles.workshopBar} enhanced showScrollbar={false}>
          {factories.map((f) => (
            <View
              key={f.id}
              className={classnames(styles.workshopChip, styles.factoryChip, currentFactoryId === f.id && styles.workshopChipActive)}
              onClick={() => setCurrentFactory(f.id)}
            >
              <Text>{f.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      {workshops.length > 0 && (
        <ScrollView scrollX className={styles.workshopBar} enhanced showScrollbar={false}>
          {workshops.map((ws) => (
            <View
              key={ws.id}
              className={classnames(styles.workshopChip, workshopId === ws.id && styles.workshopChipActive)}
              onClick={() => setWorkshopId(ws.id)}
            >
              <Text>{ws.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 快捷功能入口 */}
      <View className={styles.quickAccess}>
        <View className={styles.quickItem} onClick={goDashboard}>
          <Text className={styles.quickIcon}>📊</Text>
          <Text className={styles.quickText}>数据大屏</Text>
        </View>
        <View className={styles.quickItem} onClick={goInspection}>
          <Text className={styles.quickIcon}>📋</Text>
          <Text className={styles.quickText}>巡检任务</Text>
        </View>
        <View className={styles.quickItem} onClick={goDetect}>
          <Text className={styles.quickIcon}>🤖</Text>
          <Text className={styles.quickText}>AI检测</Text>
        </View>
        <View className={styles.quickItem} onClick={goMine}>
          <Text className={styles.quickIcon}>👤</Text>
          <Text className={styles.quickText}>我的</Text>
        </View>
      </View>

      {/* 紧急告警横幅 */}
      {hasPendingAlarm ? (
        <View className={styles.alarmBanner} onClick={goAlarm}>
          <Text className={styles.alarmIcon}>⚠️</Text>
          <Text className={styles.alarmText}>1号车间燃气浓度超标，请立即处理</Text>
          <Text className={styles.alarmArrow}>›</Text>
        </View>
      ) : null}

      {/* 系统状态卡片 */}
      <View
        className={classnames(
          styles.statusCard,
          systemStatus === 'offline' && styles.offline,
          systemStatus === 'alarm' && styles.alarmState
        )}
      >
        <View className={styles.statusTop}>
          <View className={styles.statusLeft}>
            <View className={styles.statusDot} />
            <Text className={styles.statusText}>{statusTextMap[systemStatus]}</Text>
          </View>
          <Text className={styles.mineEntry} onClick={goMine}>
            我的 ›
          </Text>
        </View>
        <Text className={styles.statusDesc}>{statusDescMap[systemStatus]}</Text>
        <Text className={styles.updateTime}>最后更新：{lastUpdateText}</Text>
      </View>

      {/* 安全评分卡片 */}
      <View className={styles.scoreCard}>
        <Text className={styles.scoreTitle}>安全风险评分</Text>
        <View className={styles.scoreContent}>
          <GaugeChart score={data?.score || 0} level={data?.scoreLevel || 'low'} size={320} />
        </View>
        <Text className={styles.scoreTips}>综合评估传感器数据、设备状态、告警情况</Text>
      </View>

      {/* AI 智能分析入口 */}
      <View className={styles.aiCard} onClick={goDetect}>
        <View className={styles.aiHeader}>
          <View className={styles.aiTitleWrap}>
            <Text className={styles.aiIcon}>🤖</Text>
            <Text className={styles.aiTitle}>AI 智能分析</Text>
          </View>
          <Text className={styles.aiArrow}>›</Text>
        </View>
        <Text className={styles.aiDesc}>基于 YOLOv5 视觉模型，实时识别工人安全帽佩戴情况</Text>
        <View className={styles.aiStats}>
          <View className={styles.aiStatItem}>
            <Text className={styles.aiStatValue}>{detectStats.totalDetections}</Text>
            <Text className={styles.aiStatLabel}>今日检测</Text>
          </View>
          <View className={styles.aiStatDivider} />
          <View className={styles.aiStatItem}>
            <Text className={styles.aiStatValue}>{detectStats.totalPersons}</Text>
            <Text className={styles.aiStatLabel}>检测人数</Text>
          </View>
          <View className={styles.aiStatDivider} />
          <View className={styles.aiStatItem}>
            <Text
              className={classnames(
                styles.aiStatValue,
                detectStats.noHelmet > 0 && styles.aiStatDanger
              )}
            >
              {detectStats.noHelmet}
            </Text>
            <Text className={styles.aiStatLabel}>未戴安全帽</Text>
          </View>
          <View className={styles.aiStatDivider} />
          <View className={styles.aiStatItem}>
            <Text className={styles.aiStatValue}>
              {detectStats.totalPersons > 0
                ? Math.round((detectStats.compliant / detectStats.totalPersons) * 100)
                : 100}
              %
            </Text>
            <Text className={styles.aiStatLabel}>合规率</Text>
          </View>
        </View>
        <View className={styles.aiAction}>
          <Text className={styles.aiActionText}>点击拍照检测 ›</Text>
        </View>
      </View>

      {/* 传感器数据网格 */}
      <View className={styles.sectionTitle}>
        <View className={styles.sectionTitleLeft}>
          <Text className={styles.sectionTitleText}>{currentWorkshopName} · 实时传感器</Text>
          <Text className={styles.sectionSubText}>{data?.sensors?.length || 0} 项指标</Text>
        </View>
        <Text className={styles.sectionAction} onClick={() => refresh()}>刷新</Text>
      </View>

      {/* 传感器概览统计条 */}
      {data?.sensors && data.sensors.length > 0 ? (
        <View className={styles.sensorSummary}>
          {(() => {
            const safe = data.sensors.filter((s) => s.risk === 'safe').length;
            const warn = data.sensors.filter((s) => s.risk === 'warning').length;
            const alarm = data.sensors.filter((s) => s.risk === 'alarm').length;
            return (
              <>
                <View className={styles.summaryItem}>
                  <Text className={styles.summaryNum}>{data.sensors.length}</Text>
                  <Text className={styles.summaryLabel}>总数</Text>
                </View>
                <View className={classnames(styles.summaryItem, styles.summarySafe)}>
                  <Text className={styles.summaryNum}>{safe}</Text>
                  <Text className={styles.summaryLabel}>正常</Text>
                </View>
                <View className={classnames(styles.summaryItem, styles.summaryWarn)}>
                  <Text className={styles.summaryNum}>{warn}</Text>
                  <Text className={styles.summaryLabel}>预警</Text>
                </View>
                <View className={classnames(styles.summaryItem, styles.summaryAlarm)}>
                  <Text className={styles.summaryNum}>{alarm}</Text>
                  <Text className={styles.summaryLabel}>报警</Text>
                </View>
              </>
            );
          })()}
        </View>
      ) : null}

      {data?.sensors && data.sensors.length > 0 ? (
        <View className={styles.sensorGrid}>
          {data.sensors.map((sensor) => {
            const isWide = sensor.type === SensorType.GOODS_COUNT;
            return (
              <View key={sensor.type} className={classnames(isWide && styles.fullCol)}>
                <SensorCard data={sensor} onClick={handleSensorClick} />
              </View>
            );
          })}
        </View>
      ) : (
        <View className={styles.emptyState}>
          <Text>📡</Text>
          <Text className={styles.emptyText}>暂无传感器数据</Text>
        </View>
      )}

      {/* 底部数据更新时间 */}
      <View className={styles.footerTime}>
        <View className={styles.footerDot} />
        <Text className={styles.footerText}>数据更新于 {lastUpdateText}</Text>
      </View>
    </ScrollView>
  );
};

export default IndexPage;
