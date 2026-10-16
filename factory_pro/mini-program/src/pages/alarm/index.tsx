import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { usePullDownRefresh, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { getAlarmList, batchHandleAlerts } from '@/services/api';
import {
  AlarmRecord,
  AlarmStatus,
  AlarmLevel,
  AlarmTypeLabel
} from '@/types/alarm';
import StatusBadge from '@/components/StatusBadge';
import styles from './index.module.scss';

interface TabItem {
  key: 'all' | AlarmStatus;
  label: string;
}

const TABS: TabItem[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'handling', label: '处理中' },
  { key: 'resolved', label: '已处理' }
];

const statusBadgeTypeMap: Record<AlarmStatus, 'alarm' | 'warning' | 'safe'> = {
  pending: 'alarm',
  handling: 'warning',
  resolved: 'safe'
};

/**
 * 告警中心 Page
 */
const AlarmPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | AlarmStatus>('all');
  const [list, setList] = useState<AlarmRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab === 'all' ? {} : { status: activeTab };
      const result = await getAlarmList(params);
      setList(result.list);
    } catch (err) {
      console.error('[AlarmPage] fetchList error:', err);
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

  const handleTabChange = (key: 'all' | AlarmStatus) => {
    setActiveTab(key);
  };

  const handleItemClick = (record: AlarmRecord) => {
    if (batchMode) {
      // 批量模式下切换选中状态
      setSelectedIds(prev =>
        prev.includes(record._id)
          ? prev.filter(id => id !== record._id)
          : [...prev, record._id]
      );
    } else {
      Taro.navigateTo({ url: `/pages/alarm/detail?id=${record._id}` });
    }
  };

  const handleBatchToggle = () => {
    setBatchMode(!batchMode);
    setSelectedIds([]);
  };

  const handleSelectAll = () => {
    const pendingIds = list.filter(r => r.status === 'pending').map(r => r._id);
    setSelectedIds(prev =>
      prev.length === pendingIds.length ? [] : pendingIds
    );
  };

  const handleBatchHandle = async () => {
    if (selectedIds.length === 0) {
      Taro.showToast({ title: '请选择告警', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '批量处理',
      content: `确认处理 ${selectedIds.length} 条告警？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await batchHandleAlerts(selectedIds.map(id => Number(id)));
            Taro.showToast({ title: '批量处理成功', icon: 'success' });
            setBatchMode(false);
            setSelectedIds([]);
            fetchList();
          } catch (err) {
            Taro.showToast({ title: '处理失败', icon: 'none' });
          }
        }
      }
    });
  };

  return (
    <ScrollView scrollY className={styles.page} enhanced bounces showScrollbar={false}>
      {/* 顶部 Tab 筛选栏 */}
      <View className={styles.tabBar}>
        {TABS.map((tab) => (
          <View
            key={tab.key}
            className={classnames(styles.tabItem, activeTab === tab.key && styles.active)}
            onClick={() => handleTabChange(tab.key)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
        <View className={styles.batchBtn} onClick={handleBatchToggle}>
          <Text>{batchMode ? '✕ 取消' : '☑ 批量'}</Text>
        </View>
      </View>

      {/* 告警列表 */}
      {list.length > 0 ? (
        <View className={styles.list}>
          {list.map((record) => (
            <View
              key={record._id}
              className={classnames(styles.alarmItem, batchMode && selectedIds.includes(record._id) && styles.alarmItemSelected)}
              onClick={() => handleItemClick(record)}
            >
              {batchMode && (
                <View className={classnames(styles.checkbox, selectedIds.includes(record._id) && styles.checkboxChecked)}>
                  {selectedIds.includes(record._id) && <Text>✓</Text>}
                </View>
              )}
              <View className={classnames(styles.alarmBar, styles[`bar_${record.level}`])} />
              <View className={styles.alarmContent}>
                <View className={styles.alarmHeader}>
                  <Text className={styles.alarmTitle}>{record.title}</Text>
                  <StatusBadge type={statusBadgeTypeMap[record.status]} />
                </View>
                <Text className={styles.alarmDesc}>{record.description}</Text>
                <View className={styles.alarmMeta}>
                  <Text className={styles.metaItem}>📍 {record.location || '未指定'}</Text>
                  <Text className={styles.metaItem}>🏷 {AlarmTypeLabel[record.type]}</Text>
                  {typeof record.value === 'number' ? (
                    <View className={styles.valueTag}>
                      <Text className={styles.valueNum}>{record.value}</Text>
                      {record.unit ? <Text className={styles.valueUnit}>{record.unit}</Text> : null}
                    </View>
                  ) : null}
                  <Text className={styles.metaItem}>
                    🕒 {dayjs(record.createTime).format('MM-DD HH:mm')}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View className={styles.emptyState}>
          <Text className={styles.emptyIcon}>🔔</Text>
          <Text className={styles.emptyText}>{loading ? '加载中...' : '暂无告警记录'}</Text>
          {!loading ? <Text className={styles.emptySub}>下拉刷新试试</Text> : null}
        </View>
      )}

      {/* 批量操作栏 */}
      {batchMode && (
        <View className={styles.batchBar}>
          <View className={styles.batchSelectAll} onClick={handleSelectAll}>
            <Text>{selectedIds.length > 0 ? `已选${selectedIds.length}条` : '全选'}</Text>
          </View>
          <View
            className={classnames(styles.batchActionBtn, selectedIds.length === 0 && styles.batchActionDisabled)}
            onClick={handleBatchHandle}
          >
            <Text>批量处理</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

export default AlarmPage;
