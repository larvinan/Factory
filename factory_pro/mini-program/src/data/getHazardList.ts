// Mock: getHazardList 云函数
import { HazardListResult, HazardRecord, HazardType, HazardStatus } from '@/types/hazard';

const mockList: HazardRecord[] = [
  {
    _id: 'hazard_001',
    type: 'electrical' as HazardType,
    description: '1号车间 3号机台旁发现电线绝缘层破损，铜线裸露',
    location: '1号车间-3号机台',
    imageUrl: 'https://picsum.photos/id/160/400/300',
    status: 'pending' as HazardStatus,
    reporterName: '张工',
    createTime: '2026-08-03 09:30:00'
  },
  {
    _id: 'hazard_002',
    type: 'blockage' as HazardType,
    description: '产线通道被纸箱堵塞，影响通行',
    location: '产线通道-2号区',
    imageUrl: 'https://picsum.photos/id/119/400/300',
    status: 'processing' as HazardStatus,
    reporterName: '李工',
    createTime: '2026-08-02 15:00:00',
    handler: '王安全员'
  },
  {
    _id: 'hazard_003',
    type: 'storage' as HazardType,
    description: '仓库B 化学品堆放不规范，未分类存放',
    location: '仓库B',
    imageUrl: 'https://picsum.photos/id/201/400/300',
    status: 'resolved' as HazardStatus,
    reporterName: '赵工',
    createTime: '2026-08-01 11:00:00',
    handleTime: '2026-08-01 14:00:00',
    handler: '李工',
    handleNote: '已重新分类存放，并贴标签'
  },
  {
    _id: 'hazard_004',
    type: 'fire' as HazardType,
    description: '3号车间 灭火器过期，需更换',
    location: '3号车间-入口',
    imageUrl: 'https://picsum.photos/id/160/400/300',
    status: 'resolved' as HazardStatus,
    reporterName: '张工',
    createTime: '2026-07-30 10:00:00',
    handleTime: '2026-07-30 16:00:00',
    handler: '王安全员',
    handleNote: '已更换新灭火器'
  },
  {
    _id: 'hazard_005',
    type: 'structural' as HazardType,
    description: '仓库D 货架横梁变形，有坍塌风险',
    location: '仓库D',
    imageUrl: 'https://picsum.photos/id/119/400/300',
    status: 'pending' as HazardStatus,
    reporterName: '赵工',
    createTime: '2026-08-03 08:00:00'
  },
  {
    _id: 'hazard_006',
    type: 'violation' as HazardType,
    description: '2号车间 有员工未佩戴安全帽',
    location: '2号车间',
    imageUrl: 'https://picsum.photos/id/64/400/300',
    status: 'processing' as HazardStatus,
    reporterName: '李工',
    createTime: '2026-08-02 14:00:00',
    handler: '王安全员'
  },
  {
    _id: 'hazard_007',
    type: 'gas_leak' as HazardType,
    description: '燃气管道接口处有异味，疑似泄漏',
    location: '1号车间-管道接口',
    imageUrl: 'https://picsum.photos/id/160/400/300',
    status: 'resolved' as HazardStatus,
    reporterName: '张工',
    createTime: '2026-07-29 09:00:00',
    handleTime: '2026-07-29 09:30:00',
    handler: '维修班',
    handleNote: '更换密封圈后检漏合格'
  },
  {
    _id: 'hazard_008',
    type: 'other' as HazardType,
    description: '4号车间 照明灯闪烁，疑似接触不良',
    location: '4号车间',
    imageUrl: 'https://picsum.photos/id/201/400/300',
    status: 'resolved' as HazardStatus,
    reporterName: '赵工',
    createTime: '2026-07-28 10:00:00',
    handleTime: '2026-07-28 11:00:00',
    handler: '电工班',
    handleNote: '更换灯管驱动'
  },
  {
    _id: 'hazard_009',
    type: 'electrical' as HazardType,
    description: '5号车间 配电箱门未关闭',
    location: '5号车间',
    imageUrl: 'https://picsum.photos/id/119/400/300',
    status: 'pending' as HazardStatus,
    reporterName: '张工',
    createTime: '2026-08-03 10:30:00'
  },
  {
    _id: 'hazard_010',
    type: 'blockage' as HazardType,
    description: '安全出口被物料堵塞',
    location: '1号车间-安全出口',
    imageUrl: 'https://picsum.photos/id/160/400/300',
    status: 'pending' as HazardStatus,
    reporterName: '李工',
    createTime: '2026-08-03 11:00:00'
  }
];

export default function (params?: { status?: string; page?: number; pageSize?: number }): HazardListResult {
  const status = params?.status as HazardStatus | undefined;
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;

  let filtered = mockList;
  if (status) {
    filtered = mockList.filter(h => h.status === status);
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize);

  return { list, total, page, pageSize };
}
