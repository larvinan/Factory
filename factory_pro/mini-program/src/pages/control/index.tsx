import React, { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import { controlDevice } from '@/services/api';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

interface ControlTarget {
  key: string;       // 控制目标标识
  icon: string;
  title: string;
  desc: string;
  currentState: 'on' | 'off' | 'open' | 'closed';
  actions: { label: string; action: string; type: 'danger' | 'success' | 'default' }[];
}

interface LogItem {
  time: string;
  content: string;
  operator: string;
}

// 控制目标与新硬件协议对齐（MQTT数据格式.md 3.2）：
//   relay {val:0|1} 单路继电器 / rgb {val:0~7} 指示灯颜色 / beep {on_ms,off_ms} 蜂鸣器
const TARGETS: ControlTarget[] = [
  {
    key: 'relay',
    icon: '⚡',
    title: '继电器输出',
    desc: '远程通断继电器控制外接设备',
    currentState: 'off',
    actions: [
      { label: '接通输出', action: 'on', type: 'success' },
      { label: '断开输出', action: 'off', type: 'default' }
    ]
  },
  {
    key: 'rgb',
    icon: '🚦',
    title: 'RGB 指示灯',
    desc: '设置现场指示灯颜色状态',
    currentState: 'off',
    actions: [
      { label: '设为红色', action: 'red', type: 'danger' },
      { label: '设为绿色', action: 'green', type: 'success' },
      { label: '设为黄色', action: 'yellow', type: 'default' },
      { label: '关闭', action: 'off', type: 'default' }
    ]
  },
  {
    key: 'beep',
    icon: '🔔',
    title: '蜂鸣器',
    desc: '远程复位报警声响',
    currentState: 'off',
    actions: [
      { label: '开启报警', action: 'on', type: 'danger' },
      { label: '复位静音', action: 'off', type: 'default' }
    ]
  }
];

const MOCK_LOGS: LogItem[] = [
  {
    time: '2026-08-03 09:18:00',
    content: '接通继电器输出（1号车间）',
    operator: '张工'
  },
  {
    time: '2026-08-03 09:16:00',
    content: 'RGB 指示灯设为绿色（1号车间）',
    operator: '系统自动'
  },
  {
    time: '2026-08-03 09:15:00',
    content: '蜂鸣器静音（1号车间）',
    operator: '系统自动'
  },
  {
    time: '2026-08-02 14:25:00',
    content: 'RGB 指示灯设为红色（仓库）',
    operator: '李工'
  },
  {
    time: '2026-08-02 08:00:00',
    content: '接通继电器输出（1号车间）',
    operator: '王安全员'
  }
];

/**
 * 远程控制 Page
 */
const DEFAULT_DEVICE_ID = 'rk3568_factory_001';

const ControlPage: React.FC = () => {
  const { canControl, user } = useUserStore();
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>(MOCK_LOGS);

  const hasPermission = canControl();

  const executeControl = useCallback(async (target: ControlTarget, action: string, label: string) => {
    if (!hasPermission) {
      Taro.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '操作确认',
        content: `确定要${label}「${target.title}」吗？`,
        confirmText: '确定',
        cancelText: '取消',
        confirmColor: (action === 'red' || (action === 'on' && target.key === 'beep')) ? '#f53f3f' : '#1a6dff',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) return;

    setSubmitting(true);
    try {
      const result = await controlDevice(target.key, action, DEFAULT_DEVICE_ID);
      Taro.showToast({ title: result.message || '操作成功', icon: 'success' });
      // 更新日志
      const newLog: LogItem = {
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        content: `${label}「${target.title}」`,
        operator: user?.nickname || '当前用户'
      };
      setLogs(prev => [newLog, ...prev]);
    } catch (err) {
      console.error('[ControlPage] control error:', err);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }, [hasPermission, user]);

  const handleSystemReset = useCallback(async () => {
    if (!hasPermission) {
      Taro.showToast({ title: '无操作权限', icon: 'none' });
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '一键复位',
        content: '将使全部执行器恢复到安全状态（继电器接通、指示灯绿色、蜂鸣器静音），确定继续吗？',
        confirmText: '确认复位',
        cancelText: '取消',
        confirmColor: '#f53f3f',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const result = await controlDevice('system', 'reset', DEFAULT_DEVICE_ID);
      Taro.showToast({ title: result.message || '已执行一键复位', icon: 'success' });
      const newLog: LogItem = {
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        content: '一键系统复位（全部执行器恢复安全状态）',
        operator: user?.nickname || '当前用户'
      };
      setLogs(prev => [newLog, ...prev]);
    } catch (err) {
      console.error('[ControlPage] reset error:', err);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }, [hasPermission, user]);

  return (
    <View className={styles.page}>
      {/* 权限提示 */}
      {!hasPermission ? (
        <View className={styles.permissionTip}>
          <Text className={styles.tipIcon}>⚠️</Text>
          <Text className={styles.tipText}>您当前为普通用户，仅可查看，无法执行控制操作。请联系管理员升级权限。</Text>
        </View>
      ) : null}

      {/* 一键复位卡片 */}
      <View
        className={classnames(styles.resetCard, !hasPermission && submitting && styles.disabled)}
        onClick={handleSystemReset}
      >
        <View className={styles.resetIcon}>
          <Text>🚨</Text>
        </View>
        <View className={styles.resetInfo}>
          <Text className={styles.resetTitle}>一键系统复位</Text>
          <Text className={styles.resetDesc}>全部执行器恢复安全状态</Text>
        </View>
        <Text className={styles.resetArrow}>›</Text>
      </View>

      {/* 各类执行器控制卡片 */}
      {TARGETS.map((target) => (
        <View key={target.key} className={styles.controlCard}>
          <View className={styles.cardHeader}>
            <View className={classnames(styles.cardIcon, target.key === 'beep' && styles.danger)}>
              <Text>{target.icon}</Text>
            </View>
            <View className={styles.cardTitleWrap}>
              <Text className={styles.cardTitle}>{target.title}</Text>
              <Text className={styles.cardDesc}>{target.desc}</Text>
            </View>
            <View className={classnames(styles.currentState, (target.currentState === 'on' || target.currentState === 'open') ? styles.on : styles.off)}>
              <Text>{target.currentState === 'on' ? '开启' : target.currentState === 'off' ? '关闭' : target.currentState === 'open' ? '打开' : '关闭'}</Text>
            </View>
          </View>
          <View className={styles.actionGroup}>
            {target.actions.map((act) => (
              <View
                key={act.action}
                className={classnames(
                  styles.actionBtn,
                  styles[`btn${act.type.charAt(0).toUpperCase() + act.type.slice(1)}`],
                  (!hasPermission || submitting) && styles.disabled
                )}
                onClick={() => executeControl(target, act.action, act.label)}
              >
                {act.label}
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* 操作日志 */}
      <View className={styles.logCard}>
        <Text className={styles.sectionTitle}>最近操作记录</Text>
        {logs.map((log, idx) => (
          <View key={idx} className={styles.logItem}>
            <Text className={styles.logTime}>{dayjs(log.time).format('MM-DD HH:mm')}</Text>
            <View className={styles.logContent}>
              <Text>{log.content}</Text>
              <Text className={styles.logOperator}>操作人：{log.operator}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default ControlPage;
