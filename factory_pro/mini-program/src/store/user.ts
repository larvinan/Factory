import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { UserInfo, UserRole } from '@/types/user';
import { http, setToken, clearToken } from '@/services/http';

interface UserState {
  user: UserInfo | null;
  isLoading: boolean;
  isLogin: boolean;
  login: () => Promise<UserInfo | null>;
  logout: () => void;
  updateProfile: (patch: Partial<UserInfo>) => void;
  canControl: () => boolean;
}

const DEFAULT_USER: UserInfo = {
  openid: 'dev_openid',
  nickname: '管理员',
  avatar: '',
  role: 'admin' as UserRole,
  phone: '',
  department: '安全部',
  createTime: new Date().toISOString()
};

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  isLoading: false,
  isLogin: false,

  login: async () => {
    set({ isLoading: true });
    try {
      // 微信登录获取 code
      let loginCode = '';
      try {
        const loginRes = await Taro.login();
        loginCode = loginRes.code;
      } catch {
        loginCode = 'dev_code';
      }

      // 调用后端换取 token 和用户信息
      const res = await http.post<any>('/api/auth/login', { code: loginCode }, 'login');

      // Mock 模式：直接返回 UserInfo
      let user: UserInfo;
      let token = '';
      if (res && res.openid) {
        // Mock 数据直接返回了 UserInfo
        user = res as UserInfo;
        token = 'mock_token';
      } else {
        // 真实 API 返回 { token, user }
        token = res?.token || res?.data?.token || '';
        const userData = res?.user || res?.data?.user;
        if (userData) {
          user = {
            openid: userData.openid || '',
            nickname: userData.nickname || '微信用户',
            avatar: userData.avatar || '',
            role: userData.role || 'user',
            phone: userData.phone,
            department: userData.department,
            createTime: userData.create_time || ''
          };
        } else {
          user = DEFAULT_USER;
        }
      }

      if (token) {
        setToken(token);
      }

      set({ user, isLogin: true, isLoading: false });
      Taro.setStorageSync('userInfo', user);
      return user;
    } catch (err) {
      console.error('[User] login failed:', err);
      set({ isLoading: false });

      // 降级：尝试从本地缓存读取
      const cached = Taro.getStorageSync('userInfo');
      if (cached) {
        set({ user: cached, isLogin: true });
        return cached;
      }

      // 开发模式：使用默认用户
      const devUser = DEFAULT_USER;
      set({ user: devUser, isLogin: true });
      Taro.setStorageSync('userInfo', devUser);
      return devUser;
    }
  },

  logout: () => {
    clearToken();
    Taro.removeStorageSync('userInfo');
    set({ user: null, isLogin: false });
  },

  updateProfile: (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ user: next });
    Taro.setStorageSync('userInfo', next);
  },

  canControl: () => {
    const user = get().user;
    if (!user) return false;
    return user.role === 'admin' || user.role === 'inspector';
  }
}));

export const DEFAULT_NOTIFY_SETTING = {
  gasWarning: true,
  gasAlarm: true,
  smokeAlarm: true,
  flameAlarm: true,
  systemOffline: true,
  allAlarm: true
};
