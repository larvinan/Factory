// Mock: getAlarmDetail 云函数
import { AlarmRecord, AlarmType, AlarmLevel, AlarmStatus } from '@/types/alarm';

const detailMap: Record<string, AlarmRecord> = {
  alarm_001: {
    _id: 'alarm_001',
    type: 'gas_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '1号车间燃气浓度超标',
    description: '1号车间燃气浓度达到 520ppm，超过报警阈值 500ppm。MQ-5 传感器连续 5 秒读数超标，自动触发紧急告警。建议立即检查气源、关闭电磁阀并启动排风。',
    deviceId: 'mq5_01',
    deviceName: '燃气监测点-01',
    location: '1号车间-3号机台',
    status: 'pending' as AlarmStatus,
    value: 520,
    unit: 'ppm',
    createTime: '2026-08-03 09:15:00'
  }
};

export default function (params?: { id?: string }): AlarmRecord {
  const id = params?.id || 'alarm_001';
  if (detailMap[id]) return detailMap[id];
  // 默认返回一条
  return detailMap.alarm_001;
}
