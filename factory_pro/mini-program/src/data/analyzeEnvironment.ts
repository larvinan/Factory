// 环境安全智能分析 Mock 数据
export default function analyzeEnvironment(params?: any) {
  return {
    level: 'warning',
    score: 72,
    message: '⚠ 预警：检测到烟雾超标、温度偏高，建议采取措施',
    items: [
      {
        key: 'temperature',
        label: '温度',
        value: '42.3°C',
        level: 'warning',
        status: '偏高',
        risk: 15,
        threshold: '阈值 40/50°C'
      },
      {
        key: 'humidity',
        label: '湿度',
        value: '58%',
        level: 'safe',
        status: '正常',
        risk: 0,
        threshold: '适宜范围 20-85%'
      },
      {
        key: 'smoke',
        label: '烟雾浓度',
        value: '85ppm',
        level: 'danger',
        status: '超标',
        risk: 25,
        threshold: '电压 2.13V / 阈值 2.0V'
      },
      {
        key: 'gas',
        label: '燃气浓度',
        value: '320ppm',
        level: 'safe',
        status: '正常',
        risk: 0,
        threshold: '电压 1.60V / 阈值 2.0V'
      },
      {
        key: 'flame',
        label: '火焰状态',
        value: '无',
        level: 'safe',
        status: '正常',
        risk: 0,
        threshold: 'PIR 传感器未触发'
      },
      {
        key: 'vibration',
        label: '振动状态',
        value: '正常',
        level: 'safe',
        status: '正常',
        risk: 0,
        threshold: '振动传感器未触发'
      }
    ],
    actions: [
      {
        type: 'fan',
        device: '排风扇',
        action: 'on',
        reason: '温度偏高 (42.3°C)，开启排风扇降温',
        priority: 'medium',
        autoExecuted: false
      },
      {
        type: 'fan',
        device: '排风扇',
        action: 'on',
        reason: '烟雾浓度超标 (85ppm)，开启排风扇排出烟雾',
        priority: 'high',
        autoExecuted: false
      },
      {
        type: 'buzzer',
        device: '蜂鸣器',
        action: 'on',
        reason: '烟雾超标，触发蜂鸣器报警疏散人员',
        priority: 'high',
        autoExecuted: false
      }
    ],
    executedControls: [],
    autoControl: false,
    timestamp: new Date().toISOString(),
    deviceId: 'esp32_01'
  };
}
