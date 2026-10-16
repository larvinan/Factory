// 设备相关类型
import { SensorType, RiskLevel } from './sensor';

// 设备大类
export type DeviceCategory =
  | 'sensor'    // 传感器类
  | 'actuator'  // 执行器类
  | 'vehicle';  // 车辆类

// 设备子类型（与传感器类型对应 + 执行器类型）
export type DeviceType =
  | SensorType
  | 'valve'      // 电磁阀
  | 'fan'        // 排风扇
  | 'light'      // 照明
  | 'buzzer';    // 蜂鸣器

// 设备状态
export type DeviceStatus = 'online' | 'offline' | 'alarm';

// 执行器开关状态
export type ActuatorState = 'on' | 'off' | 'closed' | 'open';

// 设备信息
export interface DeviceInfo {
  _id: string;
  deviceId: string;
  name: string;
  type: DeviceType;
  category: DeviceCategory;
  location: string;
  status: DeviceStatus;
  lastValue?: number;
  lastUnit?: string;
  risk?: RiskLevel;
  state?: ActuatorState;       // 执行器当前状态
  model?: string;              // 设备型号
  manufacturer?: string;       // 厂商
  installTime?: string;        // 安装时间
  lastHeartbeat?: string;      // 最近心跳
}

// 设备列表查询参数
export interface DeviceListParams {
  category?: DeviceCategory;
  type?: DeviceType;
  keyword?: string;
}

// 设备详情返回（包含最新读数 + 7天历史）
export interface DeviceDetail {
  device: DeviceInfo;
  latest: {
    value: number;
    unit: string;
    time: string;
    risk: RiskLevel;
  } | null;
  history: {
    time: string;
    value: number;
  }[];
}

// 设备类型中文名映射
export const DeviceTypeLabel: Record<DeviceType, string> = {
  temperature: '温度监测点',
  humidity: '湿度监测点',
  gas: '燃气监测点',
  smoke: '烟雾监测点',
  flame: '火焰监测点',
  agv: 'AGV小车',
  goods: '货物计数点',
  valve: '电磁阀',
  fan: '排风扇',
  light: '照明控制器',
  buzzer: '蜂鸣器'
};

// 设备类型图标标识（用 emoji 简化）
export const DeviceTypeIcon: Record<DeviceType, string> = {
  temperature: '🌡',
  humidity: '💧',
  gas: '💨',
  smoke: '🌫',
  flame: '🔥',
  agv: '🤖',
  goods: '📦',
  valve: '⚙️',
  fan: '🌀',
  light: '💡',
  buzzer: '🔔'
};

// 设备状态显示信息
export const DeviceStatusInfo: Record<DeviceStatus, { label: string; color: string }> = {
  online: { label: '在线', color: '#00b42a' },
  offline: { label: '离线', color: '#86909c' },
  alarm: { label: '告警', color: '#f53f3f' }
};
