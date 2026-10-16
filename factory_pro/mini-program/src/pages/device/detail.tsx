import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useRouter, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { getDeviceDetail } from '@/services/api';
import { DeviceDetail } from '@/types/device';
import { DeviceTypeLabel, DeviceTypeIcon } from '@/types/device';
import StatusBadge from '@/components/StatusBadge';
import TrendChart from '@/components/TrendChart';
import styles from './index.module.scss';

const riskTextMap = {
  safe: '安全',
  warning: '预警',
  alarm: '报警'
} as const;

/**
 * 设备详情 Page
 */
const DeviceDetailPage: React.FC = () => {
  const router = useRouter();
  const deviceId = router.params.deviceId || '';
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchDetail = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const data = await getDeviceDetail(deviceId);
      setDetail(data);
    } catch (err) {
      console.error('[DeviceDetail] fetch error:', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useDidShow(() => {
    if (deviceId) fetchDetail();
  });

  if (loading && !detail) {
    return (
      <View className={styles.page}>
        <View className={styles.headerCard}>
          <Text>加载中...</Text>
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View className={styles.page}>
        <View className={styles.emptyState}>
          <Text>📡</Text>
          <Text className={styles.emptyText}>未找到设备</Text>
        </View>
      </View>
    );
  }

  const { device, latest, history } = detail;
  const isSensor = device.category === 'sensor';

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 顶部设备头卡片 */}
      <View className={styles.headerCard}>
        <View className={styles.headerTop}>
          <View className={styles.deviceIcon}>
            <Text>{DeviceTypeIcon[device.type]}</Text>
          </View>
          <View className={styles.headerInfo}>
            <Text className={styles.deviceName}>{device.name}</Text>
            <Text className={styles.deviceType}>{DeviceTypeLabel[device.type]}</Text>
          </View>
        </View>
        <View className={styles.headerStatus}>
          <StatusBadge
            type={device.status === 'online' ? 'online' : device.status === 'offline' ? 'offline' : 'alarm'}
            size="md"
          />
          {device.state ? (
            <StatusBadge
              type={device.state === 'on' || device.state === 'open' ? 'online' : 'offline'}
              text={device.state === 'on' ? '开启' : device.state === 'off' ? '关闭' : device.state === 'open' ? '打开' : '关闭'}
            />
          ) : null}
        </View>
      </View>

      {/* 最新读数卡片（仅传感器类显示） */}
      {isSensor && latest ? (
        <View className={styles.latestCard}>
          <Text className={styles.sectionTitle}>最新读数</Text>
          <View className={styles.latestContent}>
            <View className={styles.latestLeft}>
              <View className={styles.latestValueWrap}>
                <Text className={classnames(styles.latestValue, styles[latest.risk])}>
                  {latest.value}
                </Text>
                {latest.unit ? <Text className={styles.latestUnit}>{latest.unit}</Text> : null}
              </View>
              <Text className={styles.latestTime}>
                更新于 {dayjs(latest.time).format('YYYY-MM-DD HH:mm:ss')}
              </Text>
            </View>
            <View className={classnames(styles.latestRisk, styles[latest.risk])}>
              <Text>{riskTextMap[latest.risk]}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* 历史趋势卡片（仅传感器类显示） */}
      {isSensor ? (
        <View className={styles.historyCard}>
          <Text className={styles.sectionTitle}>历史趋势</Text>
          <View className={styles.historyTabs}>
            {[1, 3, 7].map((d) => (
              <View
                key={d}
                className={classnames(styles.historyTab, days === d && styles.active)}
                onClick={() => setDays(d)}
              >
                <Text>{d}天</Text>
              </View>
            ))}
          </View>
          <TrendChart
            data={history.map(h => ({ time: h.time, value: h.value }))}
            unit={latest?.unit}
            height={320}
            color="#1a6dff"
          />
        </View>
      ) : null}

      {/* 设备信息卡片 */}
      <View className={styles.infoCard}>
        <Text className={styles.sectionTitle}>设备信息</Text>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>设备编号</Text>
          <Text className={styles.infoValue}>{device.deviceId}</Text>
        </View>
        <View className={styles.infoRow}>
          <Text className={styles.infoLabel}>设备位置</Text>
          <Text className={styles.infoValue}>📍 {device.location}</Text>
        </View>
        {device.model ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>设备型号</Text>
            <Text className={styles.infoValue}>{device.model}</Text>
          </View>
        ) : null}
        {device.manufacturer ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>设备厂商</Text>
            <Text className={styles.infoValue}>{device.manufacturer}</Text>
          </View>
        ) : null}
        {device.installTime ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>安装时间</Text>
            <Text className={styles.infoValue}>{device.installTime}</Text>
          </View>
        ) : null}
        {device.lastHeartbeat ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>最近心跳</Text>
            <Text className={styles.infoValue}>{device.lastHeartbeat}</Text>
          </View>
        ) : null}
      </View>

      {/* 操作按钮 */}
      {device.category === 'actuator' ? (
        <View className={styles.actionBar}>
          <View
            className={styles.actionBtn}
            onClick={() => Taro.switchTab({ url: '/pages/control/index' })}
          >
            前往控制
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
};

export default DeviceDetailPage;
