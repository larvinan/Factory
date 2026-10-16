import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import type { SensorReading, RiskLevel } from '@/types/sensor';
import styles from './index.module.scss';

interface SensorCardProps {
  data: SensorReading;
  onClick?: (data: SensorReading) => void;
}

const riskTextMap: Record<RiskLevel, string> = {
  safe: '正常',
  warning: '预警',
  alarm: '报警'
};

// 每种传感器的图标（主题色由 scss 的 type_xxx 控制）
const sensorIcon: Record<string, string> = {
  temperature: '🌡',
  humidity: '💧',
  gas: '⛽',
  smoke: '🌫',
  flame: '🔥',
  agv: '📏',
  goods: '📦'
};

/**
 * 传感器数据卡片
 * 左侧图标圆 + 数值 + 渐变进度条 + 胶囊风险标签
 */
const SensorCard: React.FC<SensorCardProps> = ({ data, onClick }) => {
  const { label, value, unit, risk, progress } = data;
  const type = String(data.type);
  const icon = sensorIcon[type] || '📊';
  const isFlameAlarm = type === 'flame' && risk === 'alarm';
  const pct = typeof progress === 'number' ? Math.min(Math.max(progress, 0), 100) : null;

  return (
    <View
      className={classnames(styles.card, styles[`type_${type}`], onClick && styles.clickable)}
      onClick={() => onClick?.(data)}
    >
      <View className={styles.accent} />
      <View className={styles.body}>
        <View className={styles.top}>
          <View className={styles.iconBox}>
            <Text className={styles.icon}>{icon}</Text>
          </View>
          <View className={styles.meta}>
            <Text className={styles.label}>{label}</Text>
            <View className={classnames(styles.riskTag, styles[`risk_${risk}`])}>
              <Text className={styles.riskDot} />
              <Text className={styles.riskText}>{riskTextMap[risk]}</Text>
            </View>
          </View>
        </View>
        <View className={styles.valueWrap}>
          <Text className={classnames(styles.value, isFlameAlarm && styles.flameAlarm)}>
            {value}
          </Text>
          {unit ? <Text className={styles.unit}>{unit}</Text> : null}
        </View>
        {pct !== null ? (
          <View className={styles.progressBg}>
            <View
              className={classnames(styles.progressFill, styles[`fill_${risk}`])}
              style={{ width: `${pct}%` }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default SensorCard;
