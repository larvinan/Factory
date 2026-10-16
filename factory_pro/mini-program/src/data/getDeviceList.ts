// Mock: getDeviceList 云函数
import { DeviceInfo } from '@/types/device';
import { SensorType } from '@/types/sensor';

const mockDevices: DeviceInfo[] = [
  // 传感器类
  {
    _id: 'dev_001',
    deviceId: 'dht11_01',
    name: '温湿度监测点-01',
    type: SensorType.TEMPERATURE,
    category: 'sensor',
    location: '1号车间',
    status: 'online',
    lastValue: 26.5,
    lastUnit: '°C',
    risk: 'safe',
    model: 'DHT11',
    manufacturer: 'Aosong',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_002',
    deviceId: 'dht11_02',
    name: '温湿度监测点-02',
    type: SensorType.HUMIDITY,
    category: 'sensor',
    location: '2号车间',
    status: 'online',
    lastValue: 58,
    lastUnit: '%',
    risk: 'safe',
    model: 'DHT11',
    manufacturer: 'Aosong',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_003',
    deviceId: 'mq5_01',
    name: '燃气监测点-01',
    type: SensorType.GAS,
    category: 'sensor',
    location: '1号车间',
    status: 'alarm',
    lastValue: 520,
    lastUnit: 'ppm',
    risk: 'alarm',
    model: 'MQ-5',
    manufacturer: 'Hanwei',
    installTime: '2026-06-05',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_004',
    deviceId: 'mq2_01',
    name: '烟雾监测点-01',
    type: SensorType.SMOKE,
    category: 'sensor',
    location: '1号车间',
    status: 'online',
    lastValue: 80,
    lastUnit: 'ppm',
    risk: 'safe',
    model: 'MQ-2',
    manufacturer: 'Hanwei',
    installTime: '2026-06-05',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_005',
    deviceId: 'flame_01',
    name: '火焰监测点-01',
    type: SensorType.FLAME,
    category: 'sensor',
    location: '3号车间',
    status: 'online',
    lastValue: 0,
    lastUnit: '',
    risk: 'safe',
    model: 'IR Flame',
    installTime: '2026-06-08',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_006',
    deviceId: 'hcsr04_01',
    name: 'AGV-01 测距',
    type: SensorType.AGV_DISTANCE,
    category: 'sensor',
    location: '产线通道',
    status: 'online',
    lastValue: 45,
    lastUnit: 'cm',
    risk: 'safe',
    model: 'HC-SR04',
    installTime: '2026-06-10',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_007',
    deviceId: 'photo_01',
    name: '货物计数点-产线末端',
    type: SensorType.GOODS_COUNT,
    category: 'sensor',
    location: '产线末端',
    status: 'online',
    lastValue: 1286,
    lastUnit: '件',
    risk: 'safe',
    model: 'E18-D80NK',
    installTime: '2026-06-12',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_008',
    deviceId: 'dht11_03',
    name: '温湿度监测点-03',
    type: SensorType.TEMPERATURE,
    category: 'sensor',
    location: '4号车间',
    status: 'offline',
    lastValue: 0,
    lastUnit: '°C',
    risk: 'safe',
    model: 'DHT11',
    installTime: '2026-06-15',
    lastHeartbeat: '2026-08-02 21:50:00'
  },
  // 执行器类
  {
    _id: 'dev_101',
    deviceId: 'valve_01',
    name: '电磁阀-01',
    type: 'valve',
    category: 'actuator',
    location: '1号车间-主管道',
    status: 'online',
    state: 'open',
    model: 'DN25 电磁阀',
    manufacturer: 'ASCO',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_102',
    deviceId: 'fan_01',
    name: '排风扇-01',
    type: 'fan',
    category: 'actuator',
    location: '1号车间-顶部',
    status: 'online',
    state: 'off',
    model: '工业排风扇 600mm',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_103',
    deviceId: 'light_01',
    name: '照明-01',
    type: 'light',
    category: 'actuator',
    location: '1号车间-顶部',
    status: 'online',
    state: 'on',
    model: 'LED 工矿灯 200W',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  {
    _id: 'dev_104',
    deviceId: 'buzzer_01',
    name: '蜂鸣器-01',
    type: 'buzzer',
    category: 'actuator',
    location: '1号车间-入口',
    status: 'online',
    state: 'off',
    model: '工业蜂鸣器 90dB',
    installTime: '2026-06-01',
    lastHeartbeat: '2026-08-03 10:45:00'
  },
  // 车辆类
  {
    _id: 'dev_201',
    deviceId: 'agv_01',
    name: 'AGV-01',
    type: SensorType.AGV_DISTANCE,
    category: 'vehicle',
    location: '产线通道',
    status: 'online',
    lastValue: 45,
    lastUnit: 'cm',
    risk: 'safe',
    model: 'AGV-X1',
    manufacturer: '自研',
    installTime: '2026-06-10',
    lastHeartbeat: '2026-08-03 10:45:00'
  }
];

export default function (params?: { category?: string; type?: string; keyword?: string }): { list: DeviceInfo[] } {
  let list = mockDevices;
  if (params?.category) {
    list = list.filter(d => d.category === params.category);
  }
  if (params?.type) {
    list = list.filter(d => d.type === params.type);
  }
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    list = list.filter(d =>
      d.name.toLowerCase().includes(kw) ||
      d.deviceId.toLowerCase().includes(kw) ||
      d.location.toLowerCase().includes(kw)
    );
  }
  return { list };
}
