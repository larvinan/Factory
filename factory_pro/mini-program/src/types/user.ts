// 用户与通知设置类型

// 用户角色
export type UserRole = 'admin' | 'inspector' | 'user';

// 用户信息
export interface UserInfo {
  openid: string;
  nickname: string;
  avatar: string;
  role: UserRole;
  phone?: string;
  department?: string;
  createTime: string;
}

// 通知设置
export interface NotifySetting {
  gasWarning: boolean;     // 燃气预警
  gasAlarm: boolean;       // 燃气紧急告警
  smokeAlarm: boolean;     // 烟雾告警
  flameAlarm: boolean;     // 火焰告警
  systemOffline: boolean;  // 系统离线
  allAlarm: boolean;       // 全部告警总开关
}

// 角色显示信息
export const UserRoleInfo: Record<UserRole, { label: string; color: string }> = {
  admin: { label: '管理员', color: '#1a6dff' },
  inspector: { label: '安全员', color: '#00b42a' },
  user: { label: '普通用户', color: '#86909c' }
};
