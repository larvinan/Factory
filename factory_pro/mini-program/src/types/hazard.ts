// 隐患上报相关类型

// 隐患类型
export type HazardType =
  | 'fire'
  | 'gas_leak'
  | 'electrical'
  | 'structural'
  | 'blockage'
  | 'violation'
  | 'storage'
  | 'other';

// 隐患状态
export type HazardStatus = 'pending' | 'processing' | 'resolved';

// 隐患上报记录
export interface HazardRecord {
  _id: string;
  type: HazardType;
  description: string;
  location: string;
  imageUrl: string;
  status: HazardStatus;
  reporterName?: string;
  createTime: string;
  handleTime?: string;
  handler?: string;
  handleNote?: string;
}

// 上报隐患参数
export interface ReportHazardParams {
  type: HazardType;
  description: string;
  location: string;
  imageUrl: string;
}

// 隐患列表查询参数
export interface HazardListParams {
  status?: HazardStatus;
  page?: number;
  pageSize?: number;
}

// 隐患列表返回
export interface HazardListResult {
  list: HazardRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// 隐患类型显示信息（含 emoji）
export const HazardTypeInfo: Record<HazardType, { label: string; icon: string }> = {
  fire: { label: '火灾隐患', icon: '🔥' },
  gas_leak: { label: '气体泄漏', icon: '💨' },
  electrical: { label: '电气隐患', icon: '⚡' },
  structural: { label: '结构损坏', icon: '🏗️' },
  blockage: { label: '通道堵塞', icon: '🚧' },
  violation: { label: '人员违规', icon: '👷' },
  storage: { label: '物料堆放', icon: '📦' },
  other: { label: '其他', icon: '⚠️' }
};

// 隐患状态显示
export const HazardStatusInfo: Record<HazardStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: '#f53f3f' },
  processing: { label: '处理中', color: '#ff7d00' },
  resolved: { label: '已处理', color: '#00b42a' }
};
