import Taro from '@tarojs/taro';
import { http, BASE_URL } from '@/services/http';
import { FactoryInfo, FactoryForm } from '@/types/factory';
import {
  SensorLatest,
  SensorHistoryPoint,
  SensorType,
  SensorReading,
  RiskLevel
} from '@/types/sensor';
import {
  AlarmListParams,
  AlarmListResult,
  AlarmRecord,
  HandleAlarmParams,
  AlarmLevel,
  AlarmStatus,
  AlarmType,
  AlarmSuggestion
} from '@/types/alarm';
import {
  DeviceListParams,
  DeviceInfo,
  DeviceDetail,
  DeviceType
} from '@/types/device';
import {
  ReportHazardParams,
  HazardListParams,
  HazardListResult,
  HazardRecord
} from '@/types/hazard';
import { UserInfo, NotifySetting } from '@/types/user';

// ============== 工具函数 ==============

function buildSensorReading(type: SensorType, value: number, risk: RiskLevel, progress: number): SensorReading {
  return {
    type,
    value,
    unit: {
      [SensorType.TEMPERATURE]: '°C',
      [SensorType.HUMIDITY]: '%',
      [SensorType.GAS]: 'ppm',
      [SensorType.SMOKE]: 'ppm',
      [SensorType.FLAME]: '',
      [SensorType.AGV_DISTANCE]: 'cm',
      [SensorType.GOODS_COUNT]: '件'
    }[type],
    label: {
      [SensorType.TEMPERATURE]: '温度',
      [SensorType.HUMIDITY]: '湿度',
      [SensorType.GAS]: '燃气浓度',
      [SensorType.SMOKE]: '烟雾浓度',
      [SensorType.FLAME]: '火焰状态',
      [SensorType.AGV_DISTANCE]: 'AGV距离',
      [SensorType.GOODS_COUNT]: '货物计数'
    }[type],
    risk,
    progress
  };
}

// 阈值与后端 AlertEngineService / application.yml 对齐：mq5>900 报警、mq2>300 报警、temp>45 告警(warning级)
function calcGasRisk(ppm: number): RiskLevel {
  if (ppm > 900) return 'alarm';
  if (ppm > 450) return 'warning';
  return 'safe';
}

function calcSmokeRisk(ppm: number): RiskLevel {
  if (ppm > 300) return 'alarm';
  if (ppm > 150) return 'warning';
  return 'safe';
}

function calcTempRisk(temp: number): RiskLevel {
  if (temp > 60) return 'alarm';
  if (temp > 45) return 'warning';
  return 'safe';
}

function mapAlertType(backendType: string): AlarmType {
  const map: Record<string, AlarmType> = {
    gas_leak: 'gas_alarm',
    fire_smoke: 'smoke_alarm',
    temperature_high: 'gas_warning',
    no_helmet: 'no_helmet',
    zone_violation: 'gas_warning',
    vibration_anomaly: 'device_offline',
    flame_detected: 'flame_alarm'
  };
  return map[backendType] || 'gas_warning';
}

function mapAlertLevel(backendLevel: string): AlarmLevel {
  const map: Record<string, AlarmLevel> = {
    emergency: 'urgent',
    serious: 'warning',
    warning: 'info'
  };
  return map[backendLevel] || 'info';
}

function mapAlertStatus(handled: number): AlarmStatus {
  return handled === 1 ? 'resolved' : 'pending';
}

/**
 * 解析告警 details 字段
 * - 安全帽告警为 JSON: { message, suggestions: [{text, priority}] }
 * - 其他告警可能是纯文本
 */
function parseAlertDetails(raw: any): { message: string; suggestions: AlarmSuggestion[] } {
  if (!raw) return { message: '告警', suggestions: [] };

  // 已是对象
  if (typeof raw === 'object') {
    return {
      message: typeof raw.message === 'string' ? raw.message : '告警',
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : []
    };
  }

  // 字符串：尝试解析为 JSON
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed);
        return {
          message: typeof obj.message === 'string' ? obj.message : '告警',
          suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : []
        };
      } catch {
        // 非 JSON，当作纯文本
      }
    }
    return { message: raw, suggestions: [] };
  }

  return { message: String(raw), suggestions: [] };
}

// ============== 传感器 ==============

export const getSensorLatest = async (): Promise<SensorLatest> => {
  try {
    const row = await http.get<any>('/api/sensors/latest', undefined, 'getSensorLatest');

    // Mock 数据直接返回（已转换好前端格式）
    if (row && row.sensors && Array.isArray(row.sensors)) {
      return row as SensorLatest;
    }

    // 真实 API：新硬件(RK3568+STM32)实体字段为驼峰 temp/humi/mq5Ppm/mq2Ppm/pir/count/stock
    if (!row || row === '暂无数据') {
      return {
        sensors: [],
        score: 100,
        scoreLevel: 'high',
        systemStatus: 'online',
        lastUpdate: new Date().toISOString()
      };
    }

    const temp = row.temp ?? 25;
    const humidity = row.humi ?? 50;
    const gasPpm = row.mq5Ppm ?? 0;
    const smokePpm = row.mq2Ppm ?? 0;
    const counter = row.count ?? 0;

    const tempRisk = calcTempRisk(temp);
    const gasRisk = calcGasRisk(gasPpm);
    const smokeRisk = calcSmokeRisk(smokePpm);

    // 新协议无 AGV 距离 / 火焰传感器，仅返回实际存在的 5 项指标
    const sensors: SensorReading[] = [
      buildSensorReading(SensorType.TEMPERATURE, Math.round(temp), tempRisk, Math.min(100, (temp / 60) * 100)),
      buildSensorReading(SensorType.HUMIDITY, Math.round(humidity), humidity > 80 ? 'warning' : 'safe', Math.min(100, humidity)),
      buildSensorReading(SensorType.GAS, gasPpm, gasRisk, Math.min(100, (gasPpm / 1000) * 100)),
      buildSensorReading(SensorType.SMOKE, smokePpm, smokeRisk, Math.min(100, (smokePpm / 500) * 100)),
      buildSensorReading(SensorType.GOODS_COUNT, counter, 'safe', 0),
      buildSensorReading(SensorType.STOCK, row.stock ?? 0, 'safe', 0)
    ];

    let score = 100;
    if (gasRisk === 'alarm') score -= 40;
    else if (gasRisk === 'warning') score -= 20;
    if (smokeRisk === 'alarm') score -= 30;
    else if (smokeRisk === 'warning') score -= 15;
    if (tempRisk === 'alarm') score -= 20;
    else if (tempRisk === 'warning') score -= 10;
    score = Math.max(0, score);

    const scoreLevel: SensorLatest['scoreLevel'] =
      score >= 80 ? 'high' : score >= 60 ? 'mid' : score >= 30 ? 'low' : 'critical';

    return {
      sensors,
      score,
      scoreLevel,
      systemStatus: 'online',
      lastUpdate: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString()
    };
  } catch {
    return {
      sensors: [],
      score: 100,
      scoreLevel: 'high',
      systemStatus: 'offline',
      lastUpdate: new Date().toISOString()
    };
  }
};

export const getSensorHistory = async (deviceId: string, days: number = 7): Promise<SensorHistoryPoint[]> => {
  try {
    const fromDate = new Date(Date.now() - days * 24 * 3600 * 1000);
    const from = fromDate.toISOString().replace('T', ' ').substring(0, 19);
    const data = await http.get<any[]>('/api/sensors/history', {
      deviceId,
      from,
      limit: 500
    }, 'getSensorHistory', { deviceId, days });

    // Mock 数据已经是正确格式
    if (Array.isArray(data) && data.length > 0 && data[0].time !== undefined) {
      return data as SensorHistoryPoint[];
    }

    // 真实 API 返回的是后端实体列表（驼峰字段）
    const rows = data as any[];
    return rows.map((row: any) => ({
      time: row.timestamp ? new Date(row.timestamp).toISOString() : '',
      value: row.temp ?? row.mq5Ppm ?? row.mq2Ppm ?? row.count ?? 0
    }));
  } catch {
    return [];
  }
};

// ============== 告警 ==============

export const getAlarmList = async (params: AlarmListParams = {}): Promise<AlarmListResult> => {
  try {
    const query: Record<string, any> = {};
    if (params.status) query.handled = params.status === 'resolved' ? 1 : 0;
    query.page = params.page || 1;
    query.limit = params.pageSize || 50;

    const data = await http.get<any>('/api/alerts', query, 'getAlarmList', params);

    // Mock 数据已经是 AlarmListResult 格式
    if (data && data.list && Array.isArray(data.list)) {
      return data as AlarmListResult;
    }

    // 真实 API 返回的是后端实体数组（驼峰字段）
    const rows = (data as any[]) || [];
    const list: AlarmRecord[] = rows.map((row: any) => {
      const parsed = parseAlertDetails(row.details);
      return {
        _id: String(row.id),
        type: mapAlertType(row.alertType),
        level: mapAlertLevel(row.alertLevel),
        title: parsed.message,
        description: parsed.message,
        deviceId: row.deviceId,
        deviceName: row.deviceId,
        location: '',
        status: mapAlertStatus(row.handled),
        value: row.riskScore,
        createTime: row.timestamp ? new Date(row.timestamp).toISOString() : '',
        handleTime: row.handledAt ? new Date(row.handledAt).toISOString() : undefined,
        handler: row.handledBy,
        suggestions: parsed.suggestions
      };
    });

    return {
      list,
      total: list.length,
      page: query.page,
      pageSize: query.limit
    };
  } catch {
    return { list: [], total: 0, page: 1, pageSize: 50 };
  }
};

export const getAlarmDetail = async (id: string): Promise<AlarmRecord> => {
  try {
    const row = await http.get<any>(`/api/alerts/${id}`, undefined, 'getAlarmDetail', { id });

    // Mock 数据已经是 AlarmRecord 格式
    if (row && row._id) {
      return row as AlarmRecord;
    }

    // 真实 API（驼峰字段）
    const parsedDetail = parseAlertDetails(row.details);
    return {
      _id: String(row.id),
      type: mapAlertType(row.alertType),
      level: mapAlertLevel(row.alertLevel),
      title: parsedDetail.message,
      description: parsedDetail.message,
      deviceId: row.deviceId,
      deviceName: row.deviceId,
      location: '',
      status: mapAlertStatus(row.handled),
      value: row.riskScore,
      createTime: row.timestamp ? new Date(row.timestamp).toISOString() : '',
      handleTime: row.handledAt ? new Date(row.handledAt).toISOString() : undefined,
      handler: row.handledBy,
      handleNote: '',
      suggestions: parsedDetail.suggestions
    };
  } catch {
    return {
      _id: id,
      type: 'gas_warning',
      level: 'info',
      title: '告警详情加载失败',
      description: '',
      deviceId: '',
      deviceName: '',
      location: '',
      status: 'pending',
      createTime: '',
      value: 0
    };
  }
};

export const handleAlarm = async (params: HandleAlarmParams): Promise<{ success: boolean }> => {
  const userStore = require('@/store/user').useUserStore.getState();
  const handledBy = userStore.user?.nickname || '微信用户';

  // 失败不再伪装成功：抛错让页面提示真实结果
  await http.put<any>(`/api/alerts/${params.id}/handle`, {
    handledBy,
    handleNote: params.note || ''
  }, 'handleAlarm');

  return { success: true };
};

// ============== 设备 ==============

export const getDeviceList = async (params: DeviceListParams = {}): Promise<{ list: DeviceInfo[] }> => {
  try {
    const query: Record<string, any> = {};
    if (params.category) query.category = params.category;
    if (params.type) query.type = params.type;
    if (params.keyword) query.keyword = params.keyword;

    const data = await http.get<any>('/api/devices', query, 'getDeviceList', params);

    // Mock 数据已经是 { list: DeviceInfo[] } 格式
    if (data && data.list && Array.isArray(data.list)) {
      return data as { list: DeviceInfo[] };
    }

    // 真实 API 返回后端实体数组（Device + DeviceStatus，驼峰字段）
    const deviceList = (data as any[]) || [];

    // 获取在线状态
    let statusList: any[] = [];
    try {
      const statusRes = await http.get<any[]>('/api/devices/status');
      statusList = statusRes || [];
    } catch { /* ignore */ }

    const list: DeviceInfo[] = deviceList.map((row: any) => {
      // 后端 DeviceController 手动输出 snake_case（device_id/last_heartbeat），做双格式兼容
      const deviceId = row.deviceId || row.device_id || '';
      const statusInfo = statusList.find((s: any) => (s.deviceId || s.device_id) === deviceId) || {};
      const isOnline = statusInfo.online ?? row.online ?? 1;

      let devType: DeviceType = 'temperature';
      // 优先使用后端档案里的 type 字段，缺失时再按 deviceId 命名推断
      const rawType = String(row.type || '');
      const knownTypes: DeviceType[] = ['temperature', 'humidity', 'gas', 'smoke', 'flame', 'agv', 'goods', 'valve', 'fan', 'light', 'buzzer'];
      if (knownTypes.includes(rawType as DeviceType)) {
        devType = rawType as DeviceType;
      } else if (deviceId.includes('dht11') || deviceId.includes('temp')) devType = 'temperature';
      else if (deviceId.includes('humi')) devType = 'humidity';
      else if (deviceId.includes('mq5') || deviceId.includes('gas')) devType = 'gas';
      else if (deviceId.includes('mq2') || deviceId.includes('smoke')) devType = 'smoke';
      else if (deviceId.includes('flame')) devType = 'flame';
      else if (deviceId.includes('hcsr04') || deviceId.includes('agv')) devType = 'agv';
      else if (deviceId.includes('photo') || deviceId.includes('counter') || deviceId.includes('stock')) devType = 'goods';
      else if (deviceId.includes('valve')) devType = 'valve';
      else if (deviceId.includes('fan')) devType = 'fan';
      else if (deviceId.includes('light') || deviceId.includes('rgb')) devType = 'light';
      else if (deviceId.includes('buzzer') || deviceId.includes('beep')) devType = 'buzzer';
      else if (deviceId.includes('rk3568') || deviceId.includes('gateway')) devType = 'light';

      let category: DeviceInfo['category'] = 'sensor';
      const rawCategory = String(row.category || '');
      if (rawCategory === 'actuator' || rawCategory === 'vehicle' || rawCategory === 'sensor') {
        category = rawCategory as DeviceInfo['category'];
      } else if (['valve', 'fan', 'light', 'buzzer'].includes(devType)) {
        category = 'actuator';
      } else if (devType === 'agv') {
        category = 'vehicle';
      }

      // 新协议执行器状态：lightOn(继电器) / rgbColor(0~7) / beep(0/1)
      let state: DeviceInfo['state'] | undefined;
      if (['valve', 'fan', 'light'].includes(devType)) {
        state = (statusInfo.lightOn ?? 0) === 1 ? 'on' : 'off';
      }

      const hb = statusInfo.lastHeartbeat || statusInfo.last_heartbeat;
      return {
        _id: row.id ? String(row.id) : deviceId,
        deviceId,
        name: row.name || deviceId,
        type: devType,
        category,
        location: row.location || '1号车间',
        status: isOnline === 1 ? 'online' : 'offline',
        model: row.model,
        manufacturer: row.manufacturer,
        lastHeartbeat: hb ? new Date(hb).toISOString() : undefined
      };
    });

    return { list };
  } catch {
    return { list: [] };
  }
};

export const getDeviceDetail = async (deviceId: string): Promise<DeviceDetail> => {
  try {
    const data = await http.get<any>(`/api/devices/${deviceId}`, undefined, 'getDeviceDetail', { deviceId });

    // Mock 数据已经是 DeviceDetail 格式
    if (data && data.device) {
      return data as DeviceDetail;
    }

    // 真实 API：先获取设备信息（后端输出 snake_case，双格式兼容）
    const row = data;
    const deviceInfo: DeviceInfo = {
      _id: row.id ? String(row.id) : deviceId,
      deviceId: row.deviceId || row.device_id || deviceId,
      name: row.name || deviceId,
      type: (row.type || 'temperature') as DeviceType,
      category: (row.category || 'sensor') as DeviceInfo['category'],
      location: row.location || '1号车间',
      status: row.online === 0 ? 'offline' : 'online',
      model: row.model,
      manufacturer: row.manufacturer
    };

    // 获取最新传感器读数
    let latest: DeviceDetail['latest'] = null;
    try {
      const sensorRow = await http.get<any>('/api/sensors/latest', { deviceId });
      if (sensorRow && sensorRow !== '暂无数据') {
        const mainValue = sensorRow.temp ?? sensorRow.mq5Ppm ?? sensorRow.mq2Ppm ?? sensorRow.count ?? 0;
        latest = {
          value: typeof mainValue === 'number' ? mainValue : Number(mainValue),
          unit: deviceInfo.type === 'temperature' ? '°C' : deviceInfo.type === 'gas' ? 'ppm' : '',
          time: sensorRow.timestamp ? new Date(sensorRow.timestamp).toISOString() : new Date().toISOString(),
          risk: 'safe'
        };
      }
    } catch { /* ignore */ }

    // 获取7天历史
    let history: DeviceDetail['history'] = [];
    try {
      const historyData = await http.get<any[]>('/api/sensors/history', { deviceId, limit: 200 });
      const rows = (historyData as any[]) || [];
      history = rows.map((r: any) => ({
        time: r.timestamp ? new Date(r.timestamp).toISOString() : '',
        value: r.temp ?? r.mq5Ppm ?? r.mq2Ppm ?? r.count ?? 0
      }));
    } catch { /* ignore */ }

    return { device: deviceInfo, latest, history };
  } catch {
    return {
      device: {
        _id: deviceId,
        deviceId,
        name: deviceId,
        type: 'temperature',
        category: 'sensor',
        location: '1号车间',
        status: 'online'
      },
      latest: null,
      history: []
    };
  }
};

// ============== 控制 ==============
// 新硬件协议（MQTT数据格式.md 3.2）：
//   relay: {val: 0|1}  单路继电器开关
//   rgb:   {val: 0~7}  0=关 1=红 2=绿 3=黄 4=蓝 5=品红 6=青 7=白
//   beep:  {on_ms, off_ms}  两参都 0 = 静音
type ControlTarget = 'relay' | 'rgb' | 'beep';

const CONTROL_PATHS: Record<ControlTarget, string> = {
  relay: 'relay',
  rgb: 'rgb',
  beep: 'beep'
};

function buildControlBody(target: ControlTarget, action: string, reason: string): Record<string, any> {
  if (target === 'relay') {
    return { val: action === 'on' ? 1 : 0, reason };
  }
  if (target === 'rgb') {
    // off=0 关闭 / red=1 / green=2 / yellow=3
    const colorMap: Record<string, number> = { off: 0, red: 1, green: 2, yellow: 3 };
    return { val: colorMap[action] ?? 0, reason };
  }
  // beep：on=滴答(200/200)，off=静音
  const on = action === 'on' ? 200 : 0;
  return { on_ms: on, off_ms: on > 0 ? 200 : 0, reason };
}

export const controlDevice = async (
  target: string,
  action: string,
  deviceId?: string
): Promise<{ success: boolean; message: string }> => {
  const userStore = require('@/store/user').useUserStore.getState();
  const operator = userStore.user?.nickname || '当前用户';

  if (target === 'system' && action === 'reset') {
    const defaultDeviceId = deviceId || 'rk3568_factory_001';
    const sequence: { t: ControlTarget; a: string }[] = [
      { t: 'relay', a: 'on' },
      { t: 'rgb', a: 'green' },
      { t: 'beep', a: 'off' }
    ];
    let failed = 0;
    for (const step of sequence) {
      try {
        await http.post<any>(`/api/control/${defaultDeviceId}/${CONTROL_PATHS[step.t]}`,
          buildControlBody(step.t, step.a, '一键系统复位'));
      } catch {
        failed++; // 记录失败数，复位不因单项失败中断
      }
    }
    if (failed === sequence.length) {
      throw new Error('系统复位全部失败，请检查后端与设备连接');
    }
    return { success: true, message: failed > 0 ? `复位完成（${failed} 项失败）` : '已执行一键复位' };
  }

  const controlTarget = target as ControlTarget;
  if (!CONTROL_PATHS[controlTarget]) {
    throw new Error(`不支持的控制目标: ${target}`);
  }

  const defaultDeviceId = deviceId || 'rk3568_factory_001';
  // 失败抛错：页面 catch 提示"操作失败"，不再伪装成功
  await http.post<any>(`/api/control/${defaultDeviceId}/${CONTROL_PATHS[controlTarget]}`,
    buildControlBody(controlTarget, action, `${operator} 执行 ${action} 操作`),
    'controlDevice');

  return { success: true, message: '操作成功' };
};

// ============== 隐患上报 ==============

export const reportHazard = async (params: ReportHazardParams): Promise<{ id: string }> => {
  // 失败抛错：页面 catch 提示真实结果，不再伪造 ID 伪装成功
  const res = await http.post<any>('/api/hazards', {
    type: params.type,
    description: params.description,
    location: params.location,
    image_url: params.imageUrl
  }, 'reportHazard');

  return { id: res?.id ? String(res.id) : Date.now().toString() };
};

export const getHazardList = async (params: HazardListParams = {}): Promise<HazardListResult> => {
  try {
    const query: Record<string, any> = {};
    if (params.status) query.status = params.status;
    query.page = params.page || 1;
    query.limit = params.pageSize || 50;

    const data = await http.get<any>('/api/hazards', query, 'getHazardList', params);

    // Mock 数据已经是 HazardListResult 格式
    if (data && data.list && Array.isArray(data.list)) {
      return data as HazardListResult;
    }

    // 真实 API：后端 HazardController 手动输出 snake_case，双格式兼容
    const rows = (data as any[]) || [];
    const list: HazardRecord[] = rows.map((row: any) => ({
      _id: String(row.id),
      type: (row.type || 'other') as any,
      description: row.description || '',
      location: row.location || '',
      imageUrl: row.imageUrl || row.image_url || '',
      status: (row.status || 'pending') as any,
      reporterName: row.reporterName || row.reporter_name,
      createTime: row.createdAt || row.created_at || '',
      handleTime: row.handledAt || row.handled_at || undefined,
      handler: row.handledBy || row.handled_by,
      handleNote: row.handleNote || row.handle_note
    }));

    return {
      list,
      total: list.length,
      page: query.page,
      pageSize: query.limit
    };
  } catch {
    return { list: [], total: 0, page: 1, pageSize: 50 };
  }
};

// ============== 用户与通知 ==============

export const login = async (code: string): Promise<{ token: string; user: UserInfo }> => {
  try {
    const res = await http.post<any>('/api/auth/login', { code }, 'login');
    // Mock 数据直接返回 UserInfo
    if (res && res.openid) {
      return { token: 'mock_token', user: res as UserInfo };
    }
    return {
      token: res?.token || 'mock_token',
      user: res?.user || res
    };
  } catch {
    return {
      token: 'mock_token',
      user: {
        openid: 'mock_openid',
        nickname: '演示用户',
        avatar: '',
        role: 'admin',
        phone: '',
        department: '安全部',
        createTime: new Date().toISOString()
      }
    };
  }
};

export const getUserInfo = async (): Promise<UserInfo> => {
  try {
    const data = await http.get<any>('/api/auth/user', undefined, 'getUserInfo');
    if (data && data.openid) {
      return data as UserInfo;
    }
    const u = data;
    return {
      openid: u.openid || '',
      nickname: u.nickname || '微信用户',
      avatar: u.avatar || '',
      role: u.role || 'user',
      phone: u.phone,
      department: u.department,
      createTime: u.createTime || u.create_time || ''
    };
  } catch {
    return {
      openid: 'mock_openid',
      nickname: '演示用户',
      avatar: '',
      role: 'admin',
      phone: '',
      department: '安全部',
      createTime: new Date().toISOString()
    };
  }
};

export const getNotifySetting = async (): Promise<NotifySetting> => {
  try {
    const data = await http.get<any>('/api/auth/notify-setting', undefined, 'getNotifySetting');
    if (data && data.gasWarning !== undefined) {
      return data as NotifySetting;
    }
    const d = data || {};
    return {
      gasWarning: d.gas_warning !== undefined ? d.gas_warning : true,
      gasAlarm: d.gas_alarm !== undefined ? d.gas_alarm : true,
      smokeAlarm: d.smoke_alarm !== undefined ? d.smoke_alarm : true,
      flameAlarm: d.flame_alarm !== undefined ? d.flame_alarm : true,
      systemOffline: d.system_offline !== undefined ? d.system_offline : true,
      allAlarm: d.all_alarm !== undefined ? d.all_alarm : true
    };
  } catch {
    return {
      gasWarning: true,
      gasAlarm: true,
      smokeAlarm: true,
      flameAlarm: true,
      systemOffline: true,
      allAlarm: true
    };
  }
};

export const updateNotifySetting = async (settings: NotifySetting): Promise<{ success: boolean }> => {
  // 失败抛错：保存失败时页面提示真实结果（如未登录 401）
  await http.put<any>('/api/auth/notify-setting', {
    gas_warning: settings.gasWarning,
    gas_alarm: settings.gasAlarm,
    smoke_alarm: settings.smokeAlarm,
    flame_alarm: settings.flameAlarm,
    system_offline: settings.systemOffline,
    all_alarm: settings.allAlarm
  }, 'updateNotifySetting');
  return { success: true };
};

export { SensorType };

// ============== AI 安全帽检测 ==============

export interface DetectionStats {
  totalDetections: number;
  totalPersons: number;
  compliant: number;
  noHelmet: number;
}

export interface DetectionPerson {
  status: 'compliant' | 'no_helmet';
  confidence: number;
  bbox?: number[];
}

export interface DetectionResult {
  detectionId?: number;
  imageId?: string;
  persons: DetectionPerson[];
  summary: {
    total_persons: number;
    compliant: number;
    no_helmet: number;
    unknown: number;
  };
  imageUrl?: string;
  annotatedImage?: string;
  suggestions?: AlarmSuggestion[];
  alertMessage?: string;
  error?: string;
}

export interface DetectionRecord {
  id: number;
  timestamp: string;
  deviceId: string;
  camera: string;
  total: number;
  compliant: number;
  noHelmet: number;
}

export const getDetectionStats = async (): Promise<DetectionStats> => {
  try {
    const data = await http.get<any>('/api/detections/stats', undefined, 'getDetectionStats');
    if (data && data.totalDetections !== undefined) {
      return data as DetectionStats;
    }
    const d = data || {};
    return {
      totalDetections: d.totalDetections || 0,
      totalPersons: d.totalPersons || 0,
      compliant: d.compliant || 0,
      noHelmet: d.noHelmet || 0
    };
  } catch {
    return { totalDetections: 0, totalPersons: 0, compliant: 0, noHelmet: 0 };
  }
};

export const detectImage = async (imagePath: string): Promise<DetectionResult> => {
  // 后端 /api/detections/detect 只接受 multipart 上传（字段名 image），不能用 JSON imagePath
  try {
    const uploadRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      Taro.uploadFile({
        url: `${BASE_URL}/api/detections/detect`,
        filePath: imagePath,
        name: 'image',
        formData: { deviceId: 'mp_user', camera: 'api_helper' },
        header: { Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}` },
        success: (r) => resolve({ statusCode: r.statusCode, data: r.data }),
        fail: (e) => reject(e)
      });
    });
    if (uploadRes.statusCode !== 200) {
      throw new Error(`检测服务响应 ${uploadRes.statusCode}`);
    }
    const parsed = JSON.parse(uploadRes.data);
    if (parsed.status !== 'ok') {
      throw new Error(parsed.message || '检测失败');
    }
    return {
      ...parsed.data,
      annotatedImage: parsed.data.annotated_image
    } as DetectionResult;
  } catch (e) {
    return {
      persons: [],
      summary: { total_persons: 0, compliant: 0, no_helmet: 0, unknown: 0 },
      error: e instanceof Error ? e.message : '检测服务不可用'
    };
  }
};

export const getDetectionList = async (params: { page?: number; pageSize?: number } = {}): Promise<{ list: DetectionRecord[]; total: number }> => {
  try {
    const query: Record<string, any> = {};
    query.page = params.page || 1;
    query.limit = params.pageSize || 10;

    const data = await http.get<any>('/api/detections', query, 'getDetectionList', params);

    // Mock 数据直接返回
    if (data && data.list && Array.isArray(data.list)) {
      return data as { list: DetectionRecord[]; total: number };
    }

    // 真实 API
    const rows = (data as any[]) || [];
    const list: DetectionRecord[] = rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : '',
      deviceId: row.deviceId || '',
      camera: row.camera || '',
      total: row.total || 0,
      compliant: row.compliant || 0,
      noHelmet: row.noHelmet || 0
    }));

    return { list, total: list.length };
  } catch {
    return { list: [], total: 0 };
  }
};

// ============== 环境安全智能分析 ==============

export type EnvLevel = 'safe' | 'warning' | 'danger' | 'critical' | 'unknown';

export interface EnvAnalysisItem {
  key: string;
  label: string;
  value: string;
  level: EnvLevel;
  status: string;
  risk: number;
  threshold: string;
}

export interface EnvAction {
  type: string;
  device: string;
  action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  autoExecuted: boolean;
}

export interface EnvAnalysisResult {
  level: EnvLevel;
  score: number;
  message: string;
  items: EnvAnalysisItem[];
  actions: EnvAction[];
  executedControls: EnvAction[];
  autoControl: boolean;
  timestamp: string;
  deviceId: string;
}

export const analyzeEnvironment = async (autoControl = false): Promise<EnvAnalysisResult> => {
  try {
    const data = await http.get<any>(
      '/api/ai/analyze-environment',
      { autoControl },
      'analyzeEnvironment',
      { autoControl }
    );
    if (data && data.level) {
      return data as EnvAnalysisResult;
    }
    // 兜底空结果
    return {
      level: 'unknown',
      score: 0,
      message: '暂无分析数据',
      items: [],
      actions: [],
      executedControls: [],
      autoControl: false,
      timestamp: '',
      deviceId: ''
    };
  } catch {
    return {
      level: 'unknown',
      score: 0,
      message: '分析服务不可用',
      items: [],
      actions: [],
      executedControls: [],
      autoControl: false,
      timestamp: '',
      deviceId: ''
    };
  }
};

// ============== 安全分析报告导出 ==============

/**
 * 导出安全分析报告
 * @param format 'word' | 'pdf'
 * H5：直接打开下载链接
 * 小程序：downloadFile + openDocument 打开/保存
 */
export const exportReport = async (format: 'word' | 'pdf'): Promise<void> => {
  const url = `${BASE_URL}/api/report/download?format=${format}`;

  if (process.env.TARO_ENV === 'h5') {
    // H5：fetch 转 Blob 再下载（同源 Blob URL 让 download 属性生效，跨源也能正常下载且文件名正确）
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `安全分析报告.${format === 'word' ? 'docx' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    return;
  }

  // 小程序：下载后打开文档
  return new Promise((resolve, reject) => {
    Taro.downloadFile({
      url,
      header: { Authorization: `Bearer ${Taro.getStorageSync('factory_token') || ''}` },
      success: (res) => {
        if (res.statusCode === 200) {
          const filePath = res.tempFilePath;
          Taro.openDocument({
            filePath,
            fileType: format === 'word' ? 'docx' : 'pdf',
            showMenu: true,
            success: () => resolve(),
            fail: (e) => reject(e)
          });
        } else {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
        }
      },
      fail: (e) => reject(e)
    });
  });
};

// ============================================
// 车间管理 API
// ============================================
export const getWorkshops = async (factoryId?: number): Promise<any[]> => {
  const query = factoryId ? { factoryId } : undefined;
  return http.get('/api/workshops', query, 'getWorkshops');
};

// ============================================
// 巡检任务 API
// ============================================
export const getInspectionTasks = async (params?: {
  workshopId?: number;
  status?: string;
  priority?: string;
}): Promise<any[]> => {
  return http.get('/api/inspection-tasks', params, 'getInspectionTasks', params);
};

export const getInspectionTaskDetail = async (id: number): Promise<any> => {
  return http.get(`/api/inspection-tasks/${id}`, undefined, 'getInspectionTaskDetail');
};

export const createInspectionTask = async (data: any): Promise<any> => {
  return http.post('/api/inspection-tasks', data);
};

export const assignInspectionTask = async (
  id: number,
  data: { inspectorName: string; inspectorOpenid?: string }
): Promise<any> => {
  return http.put(`/api/inspection-tasks/${id}/assign`, data);
};

export const startInspectionTask = async (id: number): Promise<any> => {
  return http.put(`/api/inspection-tasks/${id}/start`);
};

export const completeInspectionTask = async (
  id: number,
  data: { resultNote: string }
): Promise<any> => {
  return http.put(`/api/inspection-tasks/${id}/complete`, data);
};

export const cancelInspectionTask = async (id: number): Promise<any> => {
  return http.put(`/api/inspection-tasks/${id}/cancel`);
};

export const getInspectionStats = async (): Promise<any> => {
  return http.get('/api/inspection-tasks/stats', undefined, 'getInspectionStats');
};

// ============================================
// 巡检点位 + 扫码打卡 API
// ============================================
export const getInspectionPoints = async (taskId: number): Promise<any> => {
  return http.get(`/api/inspection-tasks/${taskId}/points`);
};

export const checkinPoint = async (taskId: number, data: {
  pointId?: number;
  code?: string;
}): Promise<any> => {
  return http.post(`/api/inspection-tasks/${taskId}/checkin`, data);
};

// ============================================
// 告警批量处理 API
// ============================================
export const batchHandleAlerts = async (
  ids: number[],
  handledBy?: string
): Promise<any> => {
  return http.put('/api/alerts/batch-handle', { ids, handledBy: handledBy || '巡检员' });
};

// ============================================
// 工厂管理 API（写操作仅 admin，后端校验）
// ============================================
export const getFactories = async (): Promise<FactoryInfo[]> => {
  return http.get('/api/factories');
};

export const getFactoryDetail = async (id: number): Promise<FactoryInfo> => {
  return http.get(`/api/factories/${id}`);
};

export const createFactory = async (data: FactoryForm): Promise<FactoryInfo> => {
  return http.post('/api/factories', data);
};

export const updateFactory = async (id: number, data: Partial<FactoryForm> & { status?: string }): Promise<FactoryInfo> => {
  return http.put(`/api/factories/${id}`, data);
};

export const deleteFactory = async (id: number): Promise<void> => {
  return http.delete(`/api/factories/${id}`);
};

export const createWorkshop = async (data: { name: string; location?: string; description?: string; factoryId?: number }): Promise<any> => {
  return http.post('/api/workshops', data);
};

export const deleteWorkshop = async (id: number): Promise<void> => {
  return http.delete(`/api/workshops/${id}`);
};
