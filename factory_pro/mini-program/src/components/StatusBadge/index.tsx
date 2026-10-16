import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

type BadgeType = 'online' | 'offline' | 'alarm' | 'safe' | 'warning' | 'urgent';

interface StatusBadgeProps {
  type: BadgeType;
  text?: string;
  size?: 'sm' | 'md';
}

const defaultTextMap: Record<BadgeType, string> = {
  online: '在线',
  offline: '离线',
  alarm: '告警',
  safe: '安全',
  warning: '预警',
  urgent: '紧急'
};

/**
 * 通用状态徽章
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({ type, text, size = 'sm' }) => {
  const label = text ?? defaultTextMap[type];
  return (
    <View className={classnames(styles.badge, styles[`type_${type}`], styles[`size_${size}`])}>
      <View className={styles.dot} />
      <Text className={styles.text}>{label}</Text>
    </View>
  );
};

export default StatusBadge;
