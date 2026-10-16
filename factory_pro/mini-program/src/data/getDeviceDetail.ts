// Mock: getDeviceDetail 云函数
import { DeviceDetail } from '@/types/device';
import { SensorType } from '@/types/sensor';

export default function (params?: { deviceId?: string }): DeviceDetail {
  const deviceId = params?.deviceId || 'dht11_01';
  const now = Date.now();
  const history: { time: string; value: number }[] = [];
  // 生成 7 天历史数据
  for (let i = 7 * 8 - 1; i >= 0; i--) {
    const time = new Date(now - i * 3 * 3600 * 1000).toISOString();
    const base = 26;
    const wave = Math.sin(i / 4) * 3 + Math.random() * 2;
    history.push({ time, value: Number((base + wave).toFixed(1)) });
  }

  // 简单的设备映射
  const deviceMap: Record<string, DeviceDetail['device']> = {
    dht11_01: {
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
    mq5_01: {
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
    valve_01: {
      _id: 'dev_101',
      deviceId: 'valve_01',
      name: '电磁阀-1号车间',
      type: 'valve',
      category: 'actuator',
      location: '1号车间-主管道',
      status: 'online',
      state: 'open',
      model: 'DN25 电磁阀',
      manufacturer: 'ASCO',
      installTime: '2026-06-01',
      lastHeartbeat: '2026-08-03 10:45:00'
    }
  };

  const device = deviceMap[deviceId] || deviceMap.dht11_01;

  return {
    device,
    latest: {
      value: device.lastValue || 0,
      unit: device.lastUnit || '',
      time: new Date().toISOString(),
      risk: device.risk || 'safe'
    },
    history
  };
}
