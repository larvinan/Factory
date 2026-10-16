import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Textarea, Button } from '@tarojs/components';
import Taro, { useRouter, useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { getAlarmDetail, handleAlarm } from '@/services/api';
import { AlarmRecord, AlarmLevel, AlarmTypeLabel } from '@/types/alarm';
import StatusBadge from '@/components/StatusBadge';
import styles from './index.module.scss';

const levelClassMap: Record<AlarmLevel, string> = {
  urgent: '',
  warning: 'warning',
  info: 'info'
};

const levelTextMap: Record<AlarmLevel, string> = {
  urgent: '紧急',
  warning: '预警',
  info: '提示'
};

const suggestionPriorityMap: Record<string, { label: string; color: string }> = {
  high: { label: '紧急', color: '#f53f3f' },
  medium: { label: '建议', color: '#ff7d00' },
  low: { label: '记录', color: '#86909c' }
};

/**
 * 告警详情 Page
 */
const AlarmDetailPage: React.FC = () => {
  const router = useRouter();
  const alarmId = router.params.id || '';
  const [record, setRecord] = useState<AlarmRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!alarmId) return;
    setLoading(true);
    try {
      const data = await getAlarmDetail(alarmId);
      setRecord(data);
    } catch (err) {
      console.error('[AlarmDetail] fetch error:', err);
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [alarmId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useDidShow(() => {
    if (alarmId) fetchDetail();
  });

  const onHandle = async (action: 'resolve' | 'ignore') => {
    if (!record) return;
    setSubmitting(true);
    try {
      await handleAlarm({ id: record._id, action, note });
      Taro.showToast({ title: action === 'resolve' ? '已标记处理' : '已忽略', icon: 'success' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 1200);
    } catch (err) {
      console.error('[AlarmDetail] handle error:', err);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !record) {
    return (
      <View className={styles.page}>
        <View className={styles.headerCard}>
          <Text>加载中...</Text>
        </View>
      </View>
    );
  }

  if (!record) {
    return (
      <View className={styles.page}>
        <View className={styles.headerCard}>
          <Text>未找到告警记录</Text>
        </View>
      </View>
    );
  }

  const isResolved = record.status === 'resolved';

  return (
    <View className={styles.page}>
      {/* 顶部告警头卡片 */}
      <View className={classnames(styles.headerCard, styles[levelClassMap[record.level]])}>
        <View className={styles.titleRow}>
          <Text className={styles.title}>{record.title}</Text>
          <StatusBadge type={record.status === 'pending' ? 'alarm' : record.status === 'handling' ? 'warning' : 'safe'} size="md" />
        </View>
        <View className={styles.metaRow}>
          <Text className={styles.metaText}>级别：{levelTextMap[record.level]}</Text>
          <Text className={styles.metaText}>·</Text>
          <Text className={styles.metaText}>{AlarmTypeLabel[record.type]}</Text>
          <Text className={styles.metaText}>·</Text>
          <Text className={styles.metaText}>{dayjs(record.createTime).format('YYYY-MM-DD HH:mm:ss')}</Text>
        </View>
      </View>

      {/* 告警描述 */}
      <View className={styles.infoCard}>
        <Text className={styles.sectionTitle}>告警描述</Text>
        <Text className={styles.descText}>{record.description}</Text>
      </View>

      {/* 关键信息 */}
      <View className={styles.infoCard}>
        <Text className={styles.sectionTitle}>告警信息</Text>
        {record.deviceName ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>关联设备</Text>
            <Text className={styles.infoValue}>{record.deviceName}</Text>
          </View>
        ) : null}
        {record.location ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>发生位置</Text>
            <Text className={styles.infoValue}>📍 {record.location}</Text>
          </View>
        ) : null}
        {typeof record.value === 'number' ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>告警数值</Text>
            <Text className={classnames(styles.infoValue, styles.valueHighlight)}>
              {record.value} {record.unit}
            </Text>
          </View>
        ) : null}
        {record.deviceId ? (
          <View className={styles.infoRow}>
            <Text className={styles.infoLabel}>设备编号</Text>
            <Text className={styles.infoValue}>{record.deviceId}</Text>
          </View>
        ) : null}
      </View>

      {/* AI 处置建议 */}
      {record.suggestions && record.suggestions.length > 0 ? (
        <View className={styles.suggestionCard}>
          <Text className={styles.sectionTitle}>📋 AI 处置建议</Text>
          {record.suggestions.map((s, idx) => {
            const cfg = suggestionPriorityMap[s.priority] || suggestionPriorityMap.low;
            return (
              <View
                key={idx}
                className={classnames(
                  styles.suggestionItem,
                  s.priority === 'high' && styles.suggestionHigh
                )}
              >
                <Text className={styles.suggestionBadge} style={{ color: cfg.color, borderColor: cfg.color }}>
                  {cfg.label}
                </Text>
                <Text className={styles.suggestionText}>{s.text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* 处理记录（已处理才显示） */}
      {isResolved ? (
        <View className={styles.infoCard}>
          <Text className={styles.sectionTitle}>处理记录</Text>
          <View className={styles.handleLog}>
            {record.handler ? (
              <>
                <Text className={styles.handleLogLabel}>处理人</Text>
                <Text className={styles.handleLogText}>{record.handler}</Text>
              </>
            ) : null}
            {record.handleTime ? (
              <>
                <Text className={styles.handleLogLabel}>处理时间</Text>
                <Text className={styles.handleLogText}>
                  {dayjs(record.handleTime).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              </>
            ) : null}
            {record.handleNote ? (
              <>
                <Text className={styles.handleLogLabel}>处理备注</Text>
                <Text className={styles.handleLogText}>{record.handleNote}</Text>
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          {/* 处理备注输入 */}
          <View className={styles.infoCard}>
            <Text className={styles.sectionTitle}>处理备注</Text>
            <View className={styles.noteWrap}>
              <Textarea
                className={styles.noteInput}
                placeholder="请输入处理说明（可选）"
                value={note}
                onInput={(e) => setNote(e.detail.value)}
                maxlength={200}
              />
            </View>
          </View>

          {/* 底部操作栏 */}
          <View className={styles.footerBar}>
            <Button
              className={classnames(styles.actionBtn, styles.btnSecondary)}
              onClick={() => onHandle('ignore')}
              disabled={submitting}
            >
              忽略
            </Button>
            <Button
              className={classnames(styles.actionBtn, styles.btnPrimary, submitting && styles.btnDisabled)}
              onClick={() => onHandle('resolve')}
              disabled={submitting}
            >
              {submitting ? '提交中...' : '标记已处理'}
            </Button>
          </View>
        </>
      )}
    </View>
  );
};

export default AlarmDetailPage;
