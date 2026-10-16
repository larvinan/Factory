import React, { useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface TrendPoint {
  time: string;
  value: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;          // 图表高度 rpx，默认 320
  unit?: string;
  color?: string;           // 折线颜色，默认主题色
  warningLine?: number;     // 预警阈值线
  alarmLine?: number;       // 报警阈值线
  showAxis?: boolean;       // 是否显示坐标轴，默认 true
}

/**
 * 简易趋势图组件
 * 使用纯 CSS + View 绘制折线图，不依赖第三方图表库，兼容小程序
 */
const TrendChart: React.FC<TrendChartProps> = ({
  data,
  height = 320,
  unit = '',
  color = '#1a6dff',
  warningLine,
  alarmLine,
  showAxis = true
}) => {
  const { points, minVal, maxVal, pathD, areaD, xLabels } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: [], minVal: 0, maxVal: 0, pathD: '', areaD: '', xLabels: [] };
    }
    const values = data.map(d => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (typeof warningLine === 'number') min = Math.min(min, warningLine);
    if (typeof alarmLine === 'number') max = Math.max(max, alarmLine);
    // 留 10% 上下边距
    const range = max - min || 1;
    const pad = range * 0.1;
    min = min - pad;
    max = max + pad;
    const fullRange = max - min;

    const n = data.length;
    const W = 100; // 使用百分比坐标系 0-100
    const H = 100;
    const pts = data.map((d, i) => {
      const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
      const y = H - ((d.value - min) / fullRange) * H;
      return { x, y, raw: d };
    });

    // 构造折线路径（使用百分比坐标）
    const dPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const dArea = `${dPath} L ${W} ${H} L 0 ${H} Z`;

    // 取 5 个时间标签
    const labelCount = Math.min(5, n);
    const step = Math.max(1, Math.floor(n / labelCount));
    const labels: { x: number; text: string }[] = [];
    for (let i = 0; i < n; i += step) {
      const date = new Date(d.data ? data[i].time : data[i].time);
      const text = `${date.getMonth() + 1}/${date.getDate()}`;
      labels.push({ x: pts[i].x, text });
    }

    return { points: pts, minVal: min, maxVal: max, pathD: dPath, areaD: dArea, xLabels: labels };
  }, [data, warningLine, alarmLine]);

  if (!data || data.length === 0) {
    return (
      <View className={styles.emptyWrap} style={{ height: `${height}rpx` }}>
        <Text className={styles.emptyText}>暂无数据</Text>
      </View>
    );
  }

  // 阈值线位置（百分比）
  const warningY = typeof warningLine === 'number'
    ? 100 - ((warningLine - minVal) / (maxVal - minVal || 1)) * 100
    : null;
  const alarmY = typeof alarmLine === 'number'
    ? 100 - ((alarmLine - minVal) / (maxVal - minVal || 1)) * 100
    : null;

  return (
    <View className={styles.container}>
      <View className={styles.chartArea} style={{ height: `${height}rpx` }}>
        {/* 警戒线 */}
        {alarmY !== null && alarmY >= 0 && alarmY <= 100 ? (
          <View
            className={styles.thresholdLine}
            style={{ top: `${alarmY}%`, background: '#f53f3f' }}
          />
        ) : null}
        {warningY !== null && warningY >= 0 && warningY <= 100 ? (
          <View
            className={styles.thresholdLine}
            style={{ top: `${warningY}%`, background: '#ff7d00' }}
          />
        ) : null}

        {/* 折线区域（使用 SVG） */}
        <View className={styles.svgLayer}>
          {/* 由于小程序在 H5 下支持 svg 标签，这里用纯 View 拼接简化版 */}
          {/* 折线点连线（使用 transform 旋转的小段拼接不现实，改用 mask 思路） */}
          <View
            className={styles.area}
            style={{
              clipPath: `path('${areaD}')`,
              background: `linear-gradient(180deg, ${color}33 0%, ${color}05 100%)`
            }}
          />
          <View
            className={styles.line}
            style={{
              clipPath: `path('${pathD}')`,
              background: color
            }}
          />
          {/* 端点圆点 */}
          {points.map((p, i) => (
            <View
              key={i}
              className={styles.dot}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                background: color
              }}
            />
          ))}
        </View>
      </View>

      {showAxis ? (
        <View className={styles.axisRow}>
          {xLabels.map((l, i) => (
            <Text
              key={i}
              className={styles.axisLabel}
              style={{ left: `${l.x}%` }}
            >
              {l.text}
            </Text>
          ))}
          {unit ? <Text className={styles.unitText}>单位：{unit}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

export default TrendChart;
