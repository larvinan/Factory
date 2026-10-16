import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import { useFactoryStore } from '@/store/factory';
import { getDeviceList } from '@/services/api';
import {
  DeviceInfo,
  DeviceCategory,
  DeviceTypeLabel,
  DeviceTypeIcon,
  DeviceStatusInfo
} from '@/types/device';
import StatusBadge from '@/components/StatusBadge';
import styles from './index.module.scss';

interface CategoryTab {
  key: 'all' | DeviceCategory;
  label: string;
}

const CATEGORIES: CategoryTab[] = [
  { key: 'all', label: '全部' },
  { key: 'sensor', label: '传感器' },
  { key: 'actuator', label: '执行器' },
  { key: 'vehicle', label: '车辆' }
];

/**
 * 设备管理 Page
 */
const DevicePage: React.FC = () => {
  const factoryStore = useFactoryStore();
  const [activeCategory, setActiveCategory] = useState<'all' | DeviceCategory>('all');
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeCategory !== 'all') params.category = activeCategory;
      if (keyword.trim()) params.keyword = keyword.trim();
      // 按全局当前工厂过滤
      if (factoryStore.currentFactoryId) params.factoryId = String(factoryStore.currentFactoryId);
      const result = await getDeviceList(params);
      setList(result.list);
    } catch (err) {
      console.error('[DevicePage] fetchList error:', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [activeCategory, keyword, factoryStore.currentFactoryId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  usePullDownRefresh(() => {
    fetchList().finally(() => Taro.stopPullDownRefresh());
  });

  useDidShow(() => {
    fetchList();
  });

  // 扫码
  const handleScan = useCallback(async () => {
    try {
      const res = await Taro.scanCode({ onlyFromCamera: true, scanType: ['qrCode'] });
      const deviceId = res.result;
      console.info('[DevicePage] scanCode result:', deviceId);
      Taro.navigateTo({ url: `/pages/device/detail?deviceId=${deviceId}` });
    } catch (err) {
      console.error('[DevicePage] scanCode error:', err);
      Taro.showToast({ title: '扫码取消或失败', icon: 'none' });
    }
  }, []);

  const handleItemClick = (device: DeviceInfo) => {
    Taro.navigateTo({ url: `/pages/device/detail?deviceId=${device.deviceId}` });
  };

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 顶部扫码入口 */}
      <View className={styles.scanEntry} onClick={handleScan}>
        <View className={styles.scanIcon}>
          <Text>📷</Text>
        </View>
        <View className={styles.scanInfo}>
          <Text className={styles.scanTitle}>扫码查设备</Text>
          <Text className={styles.scanDesc}>扫描设备二维码，查看实时数据</Text>
        </View>
        <Text className={styles.scanArrow}>›</Text>
      </View>

      {/* 搜索栏 */}
      <View className={styles.searchBar}>
        <Text className={styles.searchIcon}>🔍</Text>
        <Input
          className={styles.searchInput}
          placeholder="搜索设备名称、编号或位置"
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          confirmType="search"
          onConfirm={() => fetchList()}
        />
      </View>

      {/* 分类 Tab */}
      <ScrollView scrollX className={styles.categoryBar} enhanced showScrollbar={false}>
        {CATEGORIES.map((cat) => (
          <View
            key={cat.key}
            className={classnames(styles.categoryItem, activeCategory === cat.key && styles.active)}
            onClick={() => setActiveCategory(cat.key)}
          >
            <Text>{cat.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 设备列表 */}
      {list.length > 0 ? (
        <View className={styles.list}>
          {list.map((device) => {
            const statusInfo = DeviceStatusInfo[device.status];
            const isOffline = device.status === 'offline';
            const isAlarm = device.status === 'alarm';
            return (
              <View
                key={device._id}
                className={styles.deviceItem}
                onClick={() => handleItemClick(device)}
              >
                <View className={styles.deviceIcon}>
                  <Text>{DeviceTypeIcon[device.type]}</Text>
                </View>
                <View className={styles.deviceContent}>
                  <Text className={styles.deviceName}>{device.name}</Text>
                  <View className={styles.deviceMeta}>
                    <Text className={styles.metaText}>📍 {device.location}</Text>
                    <Text className={styles.metaText}>{DeviceTypeLabel[device.type]}</Text>
                  </View>
                </View>
                {typeof device.lastValue === 'number' && device.lastUnit !== undefined ? (
                  <View className={classnames(
                    styles.deviceValue,
                    isAlarm && styles.alarm,
                    isOffline && styles.offline
                  )}>
                    <Text className={styles.valueNum}>{device.lastValue}</Text>
                    {device.lastUnit ? <Text className={styles.valueUnit}>{device.lastUnit}</Text> : null}
                  </View>
                ) : (
                  <StatusBadge type={isOffline ? 'offline' : isAlarm ? 'alarm' : 'online'} />
                )}
                <Text className={styles.arrowRight}>›</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View className={styles.emptyState}>
          <Text className={styles.emptyIcon}>📡</Text>
          <Text className={styles.emptyText}>{loading ? '加载中...' : '暂无设备'}</Text>
        </View>
      )}
    </ScrollView>
  );
};

export default DevicePage;
