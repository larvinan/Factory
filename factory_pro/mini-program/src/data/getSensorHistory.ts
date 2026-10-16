// Mock: getSensorHistory 云函数
import { SensorHistoryPoint } from '@/types/sensor';

export default function (params?: { deviceId?: string; days?: number }): SensorHistoryPoint[] {
  const days = params?.days || 7;
  const now = Date.now();
  const list: SensorHistoryPoint[] = [];
  // 生成 7 天 * 每天 8 个点 的数据
  const pointsPerDay = 8;
  const totalPoints = days * pointsPerDay;
  for (let i = totalPoints - 1; i >= 0; i--) {
    const time = new Date(now - i * 3 * 3600 * 1000).toISOString();
    // 模拟波动：温度 22~32°C
    const base = 26;
    const wave = Math.sin(i / 4) * 3 + Math.random() * 2;
    list.push({
      time,
      value: Number((base + wave).toFixed(1))
    });
  }
  return list;
}
