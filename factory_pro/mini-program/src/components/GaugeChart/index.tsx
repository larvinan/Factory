import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

type ScoreLevel = 'low' | 'mid' | 'high' | 'critical';

interface GaugeChartProps {
  score: number;        // 0-100
  level: ScoreLevel;
  size?: number;        // 直径 rpx，默认 280
}

const levelTextMap: Record<ScoreLevel, string> = {
  low: '安全',
  mid: '注意',
  high: '风险',
  critical: '危险'
};

/**
 * 半圆仪表盘 - 用于安全风险评分展示
 * 使用 SVG 实现的弧形进度条
 */
const GaugeChart: React.FC<GaugeChartProps> = ({ score, level, size = 280 }) => {
  // 半圆周长：弧形长度 = π * r
  const radius = 80;         // SVG 内部使用统一半径
  const halfCircleLength = Math.PI * radius;
  const percent = Math.min(Math.max(score, 0), 100) / 100;
  const dashOffset = halfCircleLength * (1 - percent);

  return (
    <View className={styles.container} style={{ width: `${size}rpx`, height: `${size * 0.65}rpx` }}>
      <View className={styles.svgWrap}>
        {/* 背景弧 */}
        <View className={classnames(styles.arcBg, styles[`arc_${level}`])} />
        {/* 进度弧 - 用 conic-gradient 模拟 */}
        <View
          className={classnames(styles.arcFill, styles[`fill_${level}`])}
          style={{
            // 使用半圆 conic gradient 实现进度
            background: `conic-gradient(from 270deg, currentColor ${percent * 180}deg, transparent ${percent * 180}deg)`
          }}
        />
        <View className={styles.arcMask} />
      </View>
      <View className={styles.center}>
        <Text className={classnames(styles.score, styles[`score_${level}`])}>{Math.round(score)}</Text>
        <Text className={styles.label}>安全评分</Text>
        <View className={classnames(styles.levelTag, styles[`level_${level}`])}>
          <Text className={styles.levelText}>{levelTextMap[level]}</Text>
        </View>
      </View>
    </View>
  );
};

export default GaugeChart;
