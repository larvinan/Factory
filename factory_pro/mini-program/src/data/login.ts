// Mock: login 云函数
import { UserInfo } from '@/types/user';

export default function (): UserInfo {
  return {
    openid: 'mock_openid_admin',
    nickname: '张工',
    avatar: 'https://picsum.photos/id/64/200/200',
    role: 'admin',
    phone: '138****8888',
    department: '安全部',
    createTime: '2026-07-01 10:00:00'
  };
}
