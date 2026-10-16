import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { BASE_URL } from '@/services/http';
import { getHazardList } from '@/services/api';
import { HazardRecord, HazardStatus, HazardTypeInfo, HazardStatusInfo } from '@/types/hazard';
import styles from './index.module.scss';

interface TabItem {
  key: 'all' | HazardStatus;
  label: string;
}

const TABS: TabItem[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'resolved', label: '已处理' }
];

/**
 * 上报历史 Page
 */
const HazardHistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | HazardStatus>('all');
  const [list, setList] = useState<HazardRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab === 'all' ? {} : { status: activeTab };
      const result = await getHazardList(params);
      setList(result.list);
    } catch (err) {
      console.error('[HazardHistory] fetchList error:', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  usePullDownRefresh(() => {
    fetchList().finally(() => Taro.stopPullDownRefresh());
  });

  useDidShow(() => {
    fetchList();
  });

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 顶部 Tab */}
      <View className={styles.tabBar}>
        {TABS.map((tab) => (
          <View
            key={tab.key}
            className={classnames(styles.tabItem, activeTab === tab.key && styles.active)}
            onClick={() => setActiveTab(tab.key)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* 列表 */}
      {list.length > 0 ? (
        <View className={styles.list}>
          {list.map((record) => {
            const typeInfo = HazardTypeInfo[record.type];
            const statusInfo = HazardStatusInfo[record.status];
            // 后端返回相对路径 /api/images/...，小程序 Image 需要绝对 URL
            const imgUrl = record.imageUrl
              ? (record.imageUrl.startsWith('http') ? record.imageUrl : `${BASE_URL}${record.imageUrl}`)
              : '';
            return (
              <View key={record._id} className={styles.hazardItem}>
                <Image
                  className={styles.itemImage}
                  src={imgUrl}
                  mode="aspectFill"
                  onError={(e) => console.error('[HazardHistory] image error:', e)}
                />
                <View className={styles.itemBody}>
                  <View className={styles.itemHeader}>
                    <View className={styles.typeTag}>
                      <Text>{typeInfo.icon}</Text>
                      <Text>{typeInfo.label}</Text>
                    </View>
                    <Text style={{ color: statusInfo.color, fontSize: '24rpx', fontWeight: 500 }}>
                      {statusInfo.label}
                    </Text>
                  </View>
                  <Text className={styles.itemDesc}>{record.description}</Text>
                  <View className={styles.itemMeta}>
                    <Text>📍 {record.location}</Text>
                    <Text>🕒 {dayjs(record.createTime).format('MM-DD HH:mm')}</Text>
                    {record.reporterName ? <Text>👤 {record.reporterName}</Text> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View className={styles.emptyState}>
          <Text className={styles.emptyIcon}>📋</Text>
          <Text className={styles.emptyText}>{loading ? '加载中...' : '暂无上报记录'}</Text>
        </View>
      )}
    </ScrollView>
  );
};

export default HazardHistoryPage;
