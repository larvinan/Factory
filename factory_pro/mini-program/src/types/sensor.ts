// 传感器类型与数据结构

// 传感器类型枚举
export enum SensorType {
  TEMPERATURE = 'temperature', // 温度 DHT11
  HUMIDITY = 'humidity',       // 湿度 DHT11
  GAS = 'gas',                 // 燃气浓度 MQ-5
  SMOKE = 'smoke',             // 烟雾浓度 MQ-2
  FLAME = 'flame',             // 火焰状态
  AGV_DISTANCE = 'agv',        // AGV 距离 HC-SR04
  GOODS_COUNT = 'goods',       // 货物计数 光电开关
  STOCK = 'stock'              // 库存 STM32 Flash 持久化
}

// 风险等级（三色状态）
export type RiskLevel = 'safe' | 'warning' | 'alarm';

// 传感器单位
export const SensorUnit: Record<SensorType, string> = {
  [SensorType.TEMPERATURE]: '°C',
  [SensorType.HUMIDITY]: '%',
  [SensorType.GAS]: 'ppm',
  [SensorType.SMOKE]: 'ppm',
  [SensorType.FLAME]: '',
  [SensorType.AGV_DISTANCE]: 'cm',
  [SensorType.GOODS_COUNT]: '件'
};

// 传感器中文名
export const SensorLabel: Record<SensorType, string> = {
  [SensorType.TEMPERATURE]: '温度',
  [SensorType.HUMIDITY]: '湿度',
  [SensorType.GAS]: '燃气浓度',
  [SensorType.SMOKE]: '烟雾浓度',
  [SensorType.FLAME]: '火焰状态',
  [SensorType.AGV_DISTANCE]: 'AGV距离',
  [SensorType.GOODS_COUNT]: '货物计数'
};

// 传感器读数
export interface SensorReading {
  type: SensorType;
  value: number;
  unit: string;
  label: string;
  risk: RiskLevel;            // 风险等级
  threshold?: {               // 阈值信息
    warning?: number;
    alarm?: number;
  };
  progress?: number;          // 0-100 进度条百分比
}

// 历史数据点
export interface SensorHistoryPoint {
  time: string;   // 时间戳 ISO
  value: number;
}

// 系统运行状态
export type SystemStatus = 'online' | 'offline' | 'alarm';

// 最新传感器数据聚合（首页仪表盘使用）
export interface SensorLatest {
  sensors: SensorReading[];
  score: number;              // 安全风险评分 0-100
  scoreLevel: 'low' | 'mid' | 'high' | 'critical';
  systemStatus: SystemStatus;
  lastUpdate: string;         // 最后更新时间
}
