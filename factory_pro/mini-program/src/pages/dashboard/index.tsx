import { View, Text } from '@tarojs/components'
import { useCallback, useEffect, useState } from 'react'
import {
  getSensorLatest,
  getAlarmList,
  getDetectionStats,
  getDeviceList,
} from '@/services/api'
import styles from './index.module.scss'

// 传感器类型定义
// 与 MQTT 数据格式.md v1.0 的真实字段一一对应（无火焰/AGV 等未接入硬件）
const SENSOR_TYPES = [
  { key: 'temperature', name: '温度', unit: '°C' },
  { key: 'humidity', name: '湿度', unit: '%' },
  { key: 'gas', name: '燃气(MQ-5)', unit: 'ppm' },
  { key: 'smoke', name: '烟雾(MQ-2)', unit: 'ppm' },
  { key: 'goods', name: '货物计数', unit: '个' },
  { key: 'stock', name: '库存', unit: '个' },
]

// 告警等级配置
// 后端 alert_level 经 mapAlertLevel 映射后为 urgent/warning/info 三级
const ALARM_LEVELS = [
  { key: 'urgent', name: '紧急', color: '#ff3b3b' },
  { key: 'warning', name: '警告', color: '#ff8c00' },
  { key: 'info', name: '提示', color: '#86909c' },
]

// 设备分类配置
// 与设备档案 category 实际取值一致（协议中无 AGV 车辆）
const DEVICE_CATEGORIES = [
  { key: 'sensor', name: '传感器', icon: '📡' },
  { key: 'actuator', name: '执行器', icon: '⚙️' },
  { key: 'gateway', name: '网关', icon: '🔗' },
]

// 从接口返回中提取数组
function toArray(res: any): any[] {
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.data)) return res.data
  // getSensorLatest 返回 { sensors, score, ... }
  if (res && Array.isArray(res.sensors)) return res.sensors
  if (res && Array.isArray(res.list)) return res.list
  if (res && Array.isArray(res.items)) return res.items
  return []
}

// 状态颜色映射
function getStatusColor(status?: string | number): string {
  if (status === undefined || status === null) return '#6b7280'
  const s = String(status).toLowerCase()
  if (s.includes('offline') || s.includes('离线')) return '#6b7280'
  if (s.includes('alarm') || s.includes('critical') || s.includes('danger') || s.includes('紧急')) return '#ff3b3b'
  if (s.includes('warning') || s.includes('warn') || s.includes('警告')) return '#ffd700'
  return '#00d97e'
}

function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [sensorList, setSensorList] = useState<any[]>([])
  const [alarmList, setAlarmList] = useState<any[]>([])
  const [detection, setDetection] = useState<any>({})
  const [deviceList, setDeviceList] = useState<any[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)

    // 传感器数据
    let sensors: any[] = []
    try {
      sensors = toArray(await getSensorLatest())
    } catch (_) {
      sensors = []
    }
    const sensorMap: Record<string, any> = {}
    sensors.forEach((s: any) => {
      const key = String(s.type || s.sensorType || s.key || s.name || '').toLowerCase()
      if (key) sensorMap[key] = s
    })
    const mergedSensors = SENSOR_TYPES.map(t => {
      const matched = sensorMap[t.key] || sensorMap[t.name.toLowerCase()]
      const rawValue = matched?.value ?? matched?.reading ?? matched?.latestValue
      return {
        ...t,
        value: rawValue === undefined || rawValue === null ? '—' : rawValue,
        status: matched?.status ?? 'normal',
      }
    })
    setSensorList(mergedSensors)

    // 告警数据
    let alarms: any[] = []
    try {
      alarms = toArray(await getAlarmList())
    } catch (_) {
      alarms = []
    }
    setAlarmList(alarms)

    // 检测统计
    let det: any = {}
    try {
      const res: any = await getDetectionStats()
      det = (res && res.data) ? res.data : (res || {})
    } catch (_) {
      det = {}
    }
    setDetection(det)

    // 设备列表
    let devices: any[] = []
    try {
      devices = toArray(await getDeviceList())
    } catch (_) {
      devices = []
    }
    setDeviceList(devices)

    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ===== 统计卡片 =====
  const onlineDevices = deviceList.filter((d: any) => {
    const s = String(d?.status ?? d?.online ?? '').toLowerCase()
    return s.includes('online') || s.includes('ok') || s === '1' || s.includes('正常') || d?.online === true
  }).length

  const todayAlarmCount = alarmList.length

  // 检测统计字段与后端 /api/detections/stats 对齐：totalDetections/totalPersons/compliant/noHelmet
  const totalDetection = Number(detection?.totalPersons ?? detection?.total ?? detection?.totalCount ?? 0)
  const compliantCount = Number(detection?.compliant ?? detection?.pass ?? detection?.compliantCount ?? 0)
  const noHelmetCount = Number(detection?.noHelmet ?? detection?.uncompliant ?? detection?.noHelmetCount ?? detection?.violation ?? 0)
  const complianceRate = totalDetection > 0 ? Math.round((compliantCount / totalDetection) * 100) : 0

  const safetyScore = Math.max(0, Math.min(100, Math.round(
    complianceRate * 0.7 + Math.max(0, 100 - todayAlarmCount * 3) * 0.3
  )))

  const stats = [
    { label: '在线设备数', value: onlineDevices, unit: '台', color: '#00d4ff' },
    { label: '今日告警数', value: todayAlarmCount, unit: '次', color: '#ff8c00' },
    { label: '今日检测人数', value: totalDetection, unit: '人', color: '#00d97e' },
    { label: '安全评分', value: safetyScore, unit: '分', color: '#a78bfa' },
  ]

  // ===== 告警等级分布 =====
  const alarmDistribution = ALARM_LEVELS.map(level => {
    const count = alarmList.filter((a: any) => {
      const lv = String(a?.level ?? a?.severity ?? a?.priority ?? '').toLowerCase()
      if (level.key === 'normal') {
        return lv === '' || lv.includes('normal') || lv === '0'
      }
      return lv === level.key || lv.includes(level.key)
    }).length
    return { ...level, count }
  })
  const alarmTotal = alarmDistribution.reduce((sum, l) => sum + l.count, 0) || 1

  // ===== 设备分类统计 =====
  const deviceCategoryCounts = DEVICE_CATEGORIES.map(cat => {
    const count = deviceList.filter((d: any) => {
      const t = String(d?.category ?? '').toLowerCase()
      return t === cat.key
    }).length
    return { ...cat, count }
  })

  return (
    <View className={styles.dashboard}>
      {/* 顶部标题 */}
      <View className={styles.header}>
        <Text className={styles.title}>数据大屏</Text>
        <Text className={styles.subtitle}>实时监控 · 安全预警</Text>
      </View>

      {/* 统计卡片 */}
      <View className={styles.statsGrid}>
        {stats.map((s, i) => (
          <View key={i} className={styles.statCard}>
            <View className={styles.statValueRow}>
              <Text className={styles.statValue} style={{ color: s.color }}>{s.value}</Text>
              <Text className={styles.statUnit} style={{ color: s.color }}>{s.unit}</Text>
            </View>
            <Text className={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* 中间区域 */}
      <View className={styles.middleSection}>
        {/* 左：传感器实时数据 */}
        <View className={styles.panel}>
          <View className={styles.panelTitle}>
            <Text className={styles.panelTitleText}>传感器实时数据</Text>
          </View>
          <View className={styles.sensorList}>
            {sensorList.map((s, i) => {
              const color = getStatusColor(s.status)
              const valueText = s.value === '—' ? '—' : `${s.value}${s.unit ? ' ' + s.unit : ''}`
              return (
                <View key={i} className={styles.sensorRow}>
                  <Text className={styles.sensorName}>{s.name}</Text>
                  <Text className={styles.sensorValue}>{valueText}</Text>
                  <View className={styles.statusBlock} style={{ backgroundColor: color }} />
                </View>
              )
            })}
          </View>
        </View>

        {/* 右：告警等级分布 */}
        <View className={styles.panel}>
          <View className={styles.panelTitle}>
            <Text className={styles.panelTitleText}>告警等级分布</Text>
          </View>
          <View className={styles.alarmBars}>
            {alarmDistribution.map((l, i) => {
              const percent = Math.round((l.count / alarmTotal) * 100)
              return (
                <View key={i} className={styles.alarmRow}>
                  <View className={styles.alarmLabelRow}>
                    <Text className={styles.alarmName} style={{ color: l.color }}>{l.name}</Text>
                    <Text className={styles.alarmCount}>{l.count} 次 · {percent}%</Text>
                  </View>
                  <View className={styles.alarmBarBg}>
                    <View
                      className={styles.alarmBarFill}
                      style={{
                        width: `${percent}%`,
                        background: `linear-gradient(90deg, ${l.color}, ${l.color}aa)`,
                      }}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      </View>

      {/* 底部区域 */}
      <View className={styles.bottomSection}>
        {/* AI安全帽检测统计 */}
        <View className={styles.panel}>
          <View className={styles.panelTitle}>
            <Text className={styles.panelTitleText}>AI安全帽检测统计</Text>
          </View>
          <View className={styles.detectGrid}>
            <View className={styles.detectItem}>
              <Text className={styles.detectValue}>{totalDetection}</Text>
              <Text className={styles.detectLabel}>总检测</Text>
            </View>
            <View className={styles.detectItem}>
              <Text className={styles.detectValue} style={{ color: '#00d97e' }}>{compliantCount}</Text>
              <Text className={styles.detectLabel}>合规</Text>
            </View>
            <View className={styles.detectItem}>
              <Text className={styles.detectValue} style={{ color: '#ff3b3b' }}>{noHelmetCount}</Text>
              <Text className={styles.detectLabel}>未戴帽</Text>
            </View>
            <View className={styles.detectItem}>
              <Text className={styles.detectValue} style={{ color: '#00d4ff' }}>{complianceRate}%</Text>
              <Text className={styles.detectLabel}>合规率</Text>
            </View>
          </View>
          <View className={styles.progressWrap}>
            <View className={styles.progressBg}>
              <View className={styles.progressFill} style={{ width: `${complianceRate}%` }} />
            </View>
          </View>
        </View>

        {/* 设备分类统计 */}
        <View className={styles.panel}>
          <View className={styles.panelTitle}>
            <Text className={styles.panelTitleText}>设备分类统计</Text>
          </View>
          <View className={styles.deviceGrid}>
            {deviceCategoryCounts.map((c, i) => (
              <View key={i} className={styles.deviceCard}>
                <Text className={styles.deviceIcon}>{c.icon}</Text>
                <Text className={styles.deviceCount}>{c.count}</Text>
                <Text className={styles.deviceName}>{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 刷新按钮 */}
      <View className={styles.footer}>
        <View className={styles.refreshBtn} onClick={loadData}>
          <Text className={styles.refreshText}>{loading ? '加载中...' : '刷新数据'}</Text>
        </View>
      </View>
    </View>
  )
}

export default Dashboard
