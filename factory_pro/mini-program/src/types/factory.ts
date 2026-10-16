// 工厂相关类型
export interface FactoryInfo {
  id: number;
  code: string;
  name: string;
  address?: string;
  manager?: string;
  phone?: string;
  sortOrder?: number;
  status?: string;
  // 统计字段（后端列表附带）
  workshopCount?: number;
  deviceCount?: number;
  onlineDevices?: number;
  pendingAlerts?: number;
}

export interface FactoryForm {
  code: string;
  name: string;
  address?: string;
  manager?: string;
  phone?: string;
}
