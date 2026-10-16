// 告警相关类型

// 告警级别
export type AlarmLevel = 'info' | 'warning' | 'urgent';

// 告警状态
export type AlarmStatus = 'pending' | 'handling' | 'resolved';

// 告警类型
export type AlarmType =
  | 'gas_warning'
  | 'gas_alarm'
  | 'smoke_alarm'
  | 'flame_alarm'
  | 'system_offline'
  | 'agv_too_close'
  | 'device_offline'
  | 'no_helmet';

// 处置建议
export interface AlarmSuggestion {
  text: string;
  priority: 'high' | 'medium' | 'low';
}

// 告警记录
export interface AlarmRecord {
  _id: string;
  type: AlarmType;
  level: AlarmLevel;
  title: string;
  description: string;
  deviceId?: string;
  deviceName?: string;
  location?: string;
  status: AlarmStatus;
  value?: number;
  unit?: string;
  createTime: string;
  handleTime?: string;
  handler?: string;
  handleNote?: string;
  suggestions?: AlarmSuggestion[];
}

// 告警列表查询参数
export interface AlarmListParams {
  status?: AlarmStatus;
  page?: number;
  pageSize?: number;
}

// 告警列表返回
export interface AlarmListResult {
  list: AlarmRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// 处理告警参数
export interface HandleAlarmParams {
  id: string;
  action: 'resolve' | 'ignore';
  note?: string;
}

// 告警级别显示信息
export const AlarmLevelInfo: Record<AlarmLevel, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: '#f53f3f', bg: 'rgba(245, 63, 63, 0.1)' },
  warning: { label: '预警', color: '#ff7d00', bg: 'rgba(255, 125, 0, 0.1)' },
  info: { label: '提示', color: '#1a6dff', bg: 'rgba(26, 109, 255, 0.1)' }
};

// 告警状态显示信息
export const AlarmStatusInfo: Record<AlarmStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: '#f53f3f' },
  handling: { label: '处理中', color: '#ff7d00' },
  resolved: { label: '已处理', color: '#00b42a' }
};

// 告警类型中文名映射
export const AlarmTypeLabel: Record<AlarmType, string> = {
  gas_warning: '燃气预警',
  gas_alarm: '燃气超标',
  smoke_alarm: '烟雾报警',
  flame_alarm: '火焰告警',
  system_offline: '系统离线',
  agv_too_close: 'AGV距离过近',
  device_offline: '设备离线',
  no_helmet: '未戴安全帽'
};
