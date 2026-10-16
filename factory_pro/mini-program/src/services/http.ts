import Taro from '@tarojs/taro';

// ============== 配置 ==============
// 后端地址：FactoryGuard Spring Boot 后端（factory/esp32_camera_web/backend-java），端口 8000
// 开发者工具内 localhost 即可；真机预览/手机访问时必须改成电脑局域网 IP，如 http://192.168.1.100:8000
export const BASE_URL = 'http://localhost:8000';

// Demo 模式：为 true 时直接使用 Mock 数据（无需后端），为 false 时优先请求后端，失败后降级 Mock
export const DEMO_MODE = false;

const TOKEN_KEY = 'factory_token';

export interface ApiResponse<T = any> {
  status: string;
  data: T;
  message?: string;
}

// ============== Token 管理 ==============
export function setToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token);
}

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || '';
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY);
}

// ============== Mock 数据静态导入 ==============
// 支付宝小程序不支持动态 import，必须静态导入所有 mock 文件
import * as mockAnalyzeEnvironment from '../data/analyzeEnvironment';
import * as mockControlDevice from '../data/controlDevice';
import * as mockDetectImage from '../data/detectImage';
import * as mockGetAlarmDetail from '../data/getAlarmDetail';
import * as mockGetAlarmList from '../data/getAlarmList';
import * as mockGetDetectionList from '../data/getDetectionList';
import * as mockGetDetectionStats from '../data/getDetectionStats';
import * as mockGetDeviceDetail from '../data/getDeviceDetail';
import * as mockGetDeviceList from '../data/getDeviceList';
import * as mockGetHazardList from '../data/getHazardList';
import * as mockGetInspectionStats from '../data/getInspectionStats';
import * as mockGetInspectionTaskDetail from '../data/getInspectionTaskDetail';
import * as mockGetInspectionTasks from '../data/getInspectionTasks';
import * as mockGetNotifySetting from '../data/getNotifySetting';
import * as mockGetSensorHistory from '../data/getSensorHistory';
import * as mockGetSensorLatest from '../data/getSensorLatest';
import * as mockGetUserInfo from '../data/getUserInfo';
import * as mockGetWorkshops from '../data/getWorkshops';
import * as mockHandleAlarm from '../data/handleAlarm';
import * as mockLogin from '../data/login';
import * as mockReportHazard from '../data/reportHazard';
import * as mockUpdateNotifySetting from '../data/updateNotifySetting';

const mockRegistry: Record<string, any> = {
  analyzeEnvironment: mockAnalyzeEnvironment,
  controlDevice: mockControlDevice,
  detectImage: mockDetectImage,
  getAlarmDetail: mockGetAlarmDetail,
  getAlarmList: mockGetAlarmList,
  getDetectionList: mockGetDetectionList,
  getDetectionStats: mockGetDetectionStats,
  getDeviceDetail: mockGetDeviceDetail,
  getDeviceList: mockGetDeviceList,
  getHazardList: mockGetHazardList,
  getInspectionStats: mockGetInspectionStats,
  getInspectionTaskDetail: mockGetInspectionTaskDetail,
  getInspectionTasks: mockGetInspectionTasks,
  getNotifySetting: mockGetNotifySetting,
  getSensorHistory: mockGetSensorHistory,
  getSensorLatest: mockGetSensorLatest,
  getUserInfo: mockGetUserInfo,
  getWorkshops: mockGetWorkshops,
  handleAlarm: mockHandleAlarm,
  login: mockLogin,
  reportHazard: mockReportHazard,
  updateNotifySetting: mockUpdateNotifySetting
};

// ============== Mock 数据加载 ==============
async function loadMock<T = any>(name: string, params?: any): Promise<T> {
  try {
    const mod = mockRegistry[name];
    if (!mod) {
      throw new Error(`Mock data not found: ${name}`);
    }
    const fn = mod.default || mod;
    if (typeof fn === 'function') {
      return fn(params) as T;
    }
    return fn as T;
  } catch (e) {
    console.warn(`[Mock] Failed to load ${name}:`, e);
    throw new Error(`Mock data not found: ${name}`);
  }
}

// ============== 请求封装 ==============
async function request<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: any;
    header?: Record<string, string>;
    loading?: boolean;
    mockName?: string; // Mock 数据名称（对应 src/data/xxx.ts）
    mockParams?: any;  // Mock 数据参数
  } = {}
): Promise<T> {
  const { method = 'GET', data, header = {}, loading = false, mockName, mockParams } = options;

  // Demo 模式：直接返回 Mock 数据
  if (DEMO_MODE && mockName) {
    if (loading) {
      Taro.showLoading({ title: '加载中...', mask: true });
    }
    try {
      const result = await loadMock<T>(mockName, mockParams);
      return result;
    } finally {
      if (loading) {
        Taro.hideLoading();
      }
    }
  }

  // 正常请求模式
  const token = getToken();
  const finalHeader: Record<string, string> = {
    'Content-Type': 'application/json',
    ...header
  };
  if (token) {
    finalHeader['Authorization'] = `Bearer ${token}`;
  }

  if (loading) {
    Taro.showLoading({ title: '加载中...', mask: true });
  }

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header: finalHeader,
      timeout: 10000
    });

    if (loading) {
      Taro.hideLoading();
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const body = res.data as ApiResponse<T>;
      if (body.status === 'error') {
        throw new Error(body.message || '请求失败');
      }
      return body.data as T;
    } else if (res.statusCode === 401) {
      clearToken();
      throw new Error('登录已过期，请重新登录');
    } else {
      throw new Error(`请求失败 (${res.statusCode})`);
    }
  } catch (err) {
    if (loading) {
      Taro.hideLoading();
    }

    // API 失败 → 降级 Mock 数据
    if (mockName) {
      console.warn(`[API] ${path} 请求失败，降级到 Mock 数据 (${mockName})`);
      try {
        return await loadMock<T>(mockName, mockParams);
      } catch {
        // Mock 也失败，抛出原始错误
      }
    }

    const msg = err instanceof Error ? err.message : '网络连接失败';
    throw new Error(msg);
  }
}

export const http = {
  get: <T>(path: string, data?: any, mockName?: string, mockParams?: any) =>
    request<T>(path, { method: 'GET', data, mockName, mockParams }),
  post: <T>(path: string, data?: any, mockName?: string, mockParams?: any) =>
    request<T>(path, { method: 'POST', data, mockName, mockParams }),
  put: <T>(path: string, data?: any, mockName?: string, mockParams?: any) =>
    request<T>(path, { method: 'PUT', data, mockName, mockParams }),
  delete: <T>(path: string, data?: any, mockName?: string, mockParams?: any) =>
    request<T>(path, { method: 'DELETE', data, mockName, mockParams })
};
