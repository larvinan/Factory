// Mock: getSensorLatest 云函数
import { SensorLatest, SensorReading, SensorType, SensorUnit, SensorLabel } from '@/types/sensor';

export default function (): SensorLatest {
  const sensors: SensorReading[] = [
    {
      type: SensorType.TEMPERATURE,
      value: 26.5,
      unit: SensorUnit[SensorType.TEMPERATURE],
      label: SensorLabel[SensorType.TEMPERATURE],
      risk: 'safe',
      threshold: { warning: 35, alarm: 40 },
      progress: 66
    },
    {
      type: SensorType.HUMIDITY,
      value: 58,
      unit: SensorUnit[SensorType.HUMIDITY],
      label: SensorLabel[SensorType.HUMIDITY],
      risk: 'safe',
      threshold: { warning: 80, alarm: 90 },
      progress: 64
    },
    {
      type: SensorType.GAS,
      value: 280,
      unit: SensorUnit[SensorType.GAS],
      label: SensorLabel[SensorType.GAS],
      risk: 'warning',
      threshold: { warning: 200, alarm: 500 },
      progress: 56
    },
    {
      type: SensorType.SMOKE,
      value: 80,
      unit: SensorUnit[SensorType.SMOKE],
      label: SensorLabel[SensorType.SMOKE],
      risk: 'safe',
      threshold: { warning: 150, alarm: 300 },
      progress: 27
    },
    {
      type: SensorType.FLAME,
      value: 0,
      unit: SensorUnit[SensorType.FLAME],
      label: SensorLabel[SensorType.FLAME],
      risk: 'safe'
    },
    {
      type: SensorType.AGV_DISTANCE,
      value: 45,
      unit: SensorUnit[SensorType.AGV_DISTANCE],
      label: SensorLabel[SensorType.AGV_DISTANCE],
      risk: 'safe',
      threshold: { warning: 30, alarm: 15 },
      progress: 45
    },
    {
      type: SensorType.GOODS_COUNT,
      value: 1286,
      unit: SensorUnit[SensorType.GOODS_COUNT],
      label: SensorLabel[SensorType.GOODS_COUNT],
      risk: 'safe'
    }
  ];

  return {
    sensors,
    score: 72,
    scoreLevel: 'mid',
    systemStatus: 'online',
    lastUpdate: new Date().toISOString()
  };
}
