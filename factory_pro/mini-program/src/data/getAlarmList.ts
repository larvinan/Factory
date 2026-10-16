// Mock: getAlarmList 云函数
import { AlarmListResult, AlarmRecord, AlarmType, AlarmLevel, AlarmStatus } from '@/types/alarm';

const mockList: AlarmRecord[] = [
  {
    _id: 'alarm_001',
    type: 'gas_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '1号车间燃气浓度超标',
    description: '1号车间燃气浓度达到 520ppm，超过报警阈值 500ppm',
    deviceId: 'mq5_01',
    deviceName: '燃气监测点-01',
    location: '1号车间',
    status: 'pending' as AlarmStatus,
    value: 520,
    unit: 'ppm',
    createTime: '2026-08-03 09:15:00'
  },
  {
    _id: 'alarm_002',
    type: 'gas_warning' as AlarmType,
    level: 'warning' as AlarmLevel,
    title: '2号车间燃气浓度偏高',
    description: '2号车间燃气浓度 280ppm，超过预警阈值 200ppm',
    deviceId: 'mq5_02',
    deviceName: '燃气监测点-02',
    location: '2号车间',
    status: 'handling' as AlarmStatus,
    value: 280,
    unit: 'ppm',
    createTime: '2026-08-03 08:30:00'
  },
  {
    _id: 'alarm_003',
    type: 'smoke_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '仓库烟雾浓度报警',
    description: '仓库区域烟雾浓度 320ppm，超过报警阈值 300ppm',
    deviceId: 'mq2_03',
    deviceName: '烟雾监测点-仓库',
    location: '仓库',
    status: 'resolved' as AlarmStatus,
    value: 320,
    unit: 'ppm',
    createTime: '2026-08-02 14:00:00',
    handleTime: '2026-08-02 14:30:00',
    handler: '李工',
    handleNote: '排风开启，浓度恢复正常'
  },
  {
    _id: 'alarm_004',
    type: 'flame_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '3号车间检测到火焰',
    description: '3号车间火焰传感器检测到明火信号',
    deviceId: 'flame_01',
    deviceName: '火焰监测点-01',
    location: '3号车间',
    status: 'resolved' as AlarmStatus,
    createTime: '2026-08-01 16:20:00',
    handleTime: '2026-08-01 16:45:00',
    handler: '王安全员',
    handleNote: '焊接作业导致误报，确认安全'
  },
  {
    _id: 'alarm_005',
    type: 'agv_too_close' as AlarmType,
    level: 'warning' as AlarmLevel,
    title: 'AGV距离障碍物过近',
    description: 'AGV-01 距前方障碍物 22cm，小于安全距离 30cm',
    deviceId: 'agv_01',
    deviceName: 'AGV-01',
    location: '产线通道',
    status: 'pending' as AlarmStatus,
    value: 22,
    unit: 'cm',
    createTime: '2026-08-03 10:05:00'
  },
  {
    _id: 'alarm_006',
    type: 'system_offline' as AlarmType,
    level: 'info' as AlarmLevel,
    title: '边缘端短暂离线',
    description: '边缘端设备于 08:00 离线，08:05 自动恢复',
    status: 'resolved' as AlarmStatus,
    createTime: '2026-08-03 08:00:00',
    handleTime: '2026-08-03 08:05:00',
    handleNote: '自动恢复，无需人工处理'
  },
  {
    _id: 'alarm_007',
    type: 'device_offline' as AlarmType,
    level: 'info' as AlarmLevel,
    title: 'DHT11-03 设备离线',
    description: '4号车间 温湿度传感器 DHT11-03 超过 10 分钟无数据上报',
    deviceId: 'dht11_03',
    deviceName: '温湿度监测点-03',
    location: '4号车间',
    status: 'handling' as AlarmStatus,
    createTime: '2026-08-02 22:00:00'
  },
  {
    _id: 'alarm_008',
    type: 'gas_warning' as AlarmType,
    level: 'warning' as AlarmLevel,
    title: '5号车间燃气轻微超标',
    description: '5号车间燃气浓度 210ppm',
    deviceId: 'mq5_05',
    deviceName: '燃气监测点-03',
    location: '5号车间',
    status: 'resolved' as AlarmStatus,
    value: 210,
    unit: 'ppm',
    createTime: '2026-07-30 09:00:00',
    handleTime: '2026-07-30 09:15:00',
    handler: '赵工',
    handleNote: '开启排风后恢复'
  },
  {
    _id: 'alarm_009',
    type: 'smoke_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '1号车间烟雾报警',
    description: '1号车间烟雾浓度 350ppm',
    deviceId: 'mq2_01',
    deviceName: '烟雾监测点-01',
    location: '1号车间',
    status: 'pending' as AlarmStatus,
    value: 350,
    unit: 'ppm',
    createTime: '2026-08-03 10:30:00'
  },
  {
    _id: 'alarm_010',
    type: 'gas_alarm' as AlarmType,
    level: 'urgent' as AlarmLevel,
    title: '6号车间燃气严重超标',
    description: '6号车间燃气浓度 600ppm，紧急告警',
    deviceId: 'mq5_06',
    deviceName: '燃气监测点-04',
    location: '6号车间',
    status: 'pending' as AlarmStatus,
    value: 600,
    unit: 'ppm',
    createTime: '2026-08-03 10:40:00'
  }
];

export default function (params?: { status?: string; page?: number; pageSize?: number }): AlarmListResult {
  const status = params?.status as AlarmStatus | undefined;
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;

  let filtered = mockList;
  if (status) {
    filtered = mockList.filter(a => a.status === status);
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize);

  return { list, total, page, pageSize };
}
