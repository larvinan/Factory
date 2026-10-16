import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../utils/request'
import { on as wsOn } from '../utils/ws'

export const useDeviceStore = defineStore('device', () => {
  // 初始值全部为 0/关闭：等待真实 WS 数据到达后才显示数值（不做虚构预热）
  const temperature = ref(0)
  const humidity = ref(0)
  const coLevel = ref(0)
  const smokeLevel = ref(0)
  const lightingStatus = ref(false)
  const lightingBrightness = ref(0)
  const goodsCount = ref(0)
  // AGV 硬件未接入，以下为示意数据（使用处均已标注）
  const agvStatus = ref({
    active: 3,
    total: 5,
    obstacles: 0,
    battery: [85, 72, 90, 65, 78]
  })

  // 12 节点为 3D 场景布局锚点；TH-01 绑定真实 DHT11 数据，
  // 其余节点无硬件对应，统一 offline 展示（页面已标注"场景示意"）
  const tempHumidNodes = ref([
    { id: 'TH-01', name: '车间A-DHT11', desc: '车间A环境温湿度（真实硬件）', location: '车间A-环境区', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-02', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-03', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-04', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-05', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-06', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-07', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-08', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-09', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-10', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-11', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' },
    { id: 'TH-12', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', temp: 0, humid: 0, status: 'offline' }
  ])

  // 气体节点：GAS-01=MQ5（真实）、GAS-02=MQ2（真实），其余为场景示意锚点
  const gasNodes = ref([
    { id: 'GAS-01', name: '可燃气传感器 MQ-5', desc: '车间A可燃气浓度监测（真实硬件）', location: '车间A-燃气区', value: 0, unit: 'ppm', threshold: 900, type: 'CO' },
    { id: 'GAS-02', name: '烟雾传感器 MQ-2', desc: '车间A烟雾浓度监测（真实硬件）', location: '车间A-烟雾区', value: 0, unit: 'ppm', threshold: 300, type: 'smoke' },
    { id: 'GAS-03', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', value: 0, unit: 'ppm', threshold: 5, type: 'CO' },
    { id: 'GAS-04', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', value: 0, unit: 'ppb', threshold: 200, type: 'VOC' },
    { id: 'GAS-05', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', value: 0, unit: 'ppm', threshold: 1, type: 'smoke' },
    { id: 'GAS-06', name: '预留点位', desc: '场景示意点位，暂无硬件', location: '预留', value: 0, unit: 'ppm', threshold: 1000, type: 'CO2' }
  ])

  // 告警：真实数据，启动时从后端加载 + WebSocket 实时追加
  const alarms = ref([])

  // 生产设备 —— ID 与 3D 数字孪生场景保持一致（A/B/C 三厂）
  const devices = ref([
    // ===== A 厂 · 台式机总装基地 =====
    { id: 'ASSY_LINE_A1', name: '倍速链组装线 A-1', type: 'assemblyLine', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_A1', name: '轻型皮带流水线 A-1', type: 'conveyor', location: 'A厂-总装区', status: 'maintenance', lastUpdate: '2026-06-12 10:20:00' },
    { id: 'WORKSTATION_A1', name: '防静电工作台 A-1', type: 'workstation', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WORKSTATION_A2', name: '防静电工作台 A-2', type: 'workstation', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'SCREEN_PRESS_A1', name: '屏幕压合机 A-1', type: 'screenPress', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'PRESS_A1', name: 'CPU散热器压合工装 A-1', type: 'press', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'TEST_STATION_A1', name: '整机综合测试工装 A-1', type: 'testStation', location: 'A厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BURN_IN_A1', name: '老化房 A-1', type: 'burnInRoom', location: 'A厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'TEST_A1', name: '老化架 A-1', type: 'test', location: 'A厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BARCODE_A1', name: '条码打印机 A-1', type: 'barcodePrinter', location: 'A厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_A2', name: '轻型皮带流水线 A-2', type: 'conveyor', location: 'A厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'CARTON_A1', name: '自动封箱机 A-1', type: 'cartonSealer', location: 'A厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WRAP_A1', name: '打包缠绕机 A-1', type: 'wrappingMachine', location: 'A厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WAREHOUSE_A1', name: '成品扫码入库终端 A-1', type: 'warehouseTerminal', location: 'A厂-仓储区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    // ===== B 厂 · 笔记本生产基地 =====
    { id: 'ASSY_LINE_B1', name: '倍速链组装线 B-1', type: 'assemblyLine', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_B1', name: '轻型皮带流水线 B-1', type: 'conveyor', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WORKSTATION_B1', name: '防静电工作台 B-1', type: 'workstation', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WORKSTATION_B2', name: '防静电工作台 B-2', type: 'workstation', location: 'B厂-总装区', status: 'offline', lastUpdate: '2026-06-12 08:00:00' },
    { id: 'SCREEN_PRESS_B1', name: '屏幕压合机 B-1', type: 'screenPress', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'PRESS_B1', name: 'CPU散热器压合工装 B-1', type: 'press', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'TEST_STATION_B1', name: '整机综合测试工装 B-1', type: 'testStation', location: 'B厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BURN_IN_B1', name: '老化房 B-1', type: 'burnInRoom', location: 'B厂-测试区', status: 'maintenance', lastUpdate: '2026-06-12 10:20:00' },
    { id: 'TEST_B1', name: '老化架 B-1', type: 'test', location: 'B厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BARCODE_B1', name: '条码打印机 B-1', type: 'barcodePrinter', location: 'B厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_B2', name: '轻型皮带流水线 B-2', type: 'conveyor', location: 'B厂-包装区', status: 'maintenance', lastUpdate: '2026-06-12 10:15:00' },
    { id: 'CARTON_B1', name: '自动封箱机 B-1', type: 'cartonSealer', location: 'B厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WRAP_B1', name: '打包缠绕机 B-1', type: 'wrappingMachine', location: 'B厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WAREHOUSE_B1', name: '成品扫码入库终端 B-1', type: 'warehouseTerminal', location: 'B厂-仓储区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    // ===== C 厂 · 服务器生产基地 =====
    { id: 'ASSY_LINE_C1', name: '倍速链组装线 C-1', type: 'assemblyLine', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_C1', name: '轻型皮带流水线 C-1', type: 'conveyor', location: 'C厂-总装区', status: 'maintenance', lastUpdate: '2026-06-12 10:10:00' },
    { id: 'WORKSTATION_C1', name: '防静电工作台 C-1', type: 'workstation', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WORKSTATION_C2', name: '防静电工作台 C-2', type: 'workstation', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'SCREEN_PRESS_C1', name: '屏幕压合机 C-1', type: 'screenPress', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'PRESS_C1', name: 'CPU散热器压合工装 C-1', type: 'press', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'TEST_STATION_C1', name: '整机综合测试工装 C-1', type: 'testStation', location: 'C厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BURN_IN_C1', name: '老化房 C-1', type: 'burnInRoom', location: 'C厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'TEST_C1', name: '老化架 C-1', type: 'test', location: 'C厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'PRINTER_TEST_C1', name: '打印机测试平台 C-1', type: 'printerTest', location: 'C厂-测试区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'BARCODE_C1', name: '条码打印机 C-1', type: 'barcodePrinter', location: 'C厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'ASSY_C2', name: '轻型皮带流水线 C-2', type: 'conveyor', location: 'C厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'CARTON_C1', name: '自动封箱机 C-1', type: 'cartonSealer', location: 'C厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WRAP_C1', name: '打包缠绕机 C-1', type: 'wrappingMachine', location: 'C厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'WAREHOUSE_C1', name: '成品扫码入库终端 C-1', type: 'warehouseTerminal', location: 'C厂-仓储区', status: 'offline', lastUpdate: '2026-06-12 08:00:00' },
    // ===== 公共设备（AGV / 照明 / 计数）=====
    { id: 'AGV-01', name: 'AGV搬运车 01', type: 'agv', location: 'A厂-物流通道', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'AGV-02', name: 'AGV搬运车 02', type: 'agv', location: 'B厂-物流通道', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'AGV-03', name: 'AGV搬运车 03', type: 'agv', location: '充电站', status: 'charging', lastUpdate: '2026-06-12 10:24:00' },
    { id: 'AGV-04', name: 'AGV搬运车 04', type: 'agv', location: 'C厂-物流通道', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'AGV-05', name: 'AGV搬运车 05', type: 'agv', location: 'A厂-仓储区', status: 'offline', lastUpdate: '2026-06-12 08:00:00' },
    { id: 'L-001', name: '红外照明灯组 A', type: 'lighting', location: 'A厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:20:00' },
    { id: 'L-002', name: '红外照明灯组 B', type: 'lighting', location: 'B厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:20:00' },
    { id: 'L-003', name: '红外照明灯组 C', type: 'lighting', location: 'C厂-总装区', status: 'online', lastUpdate: '2026-06-12 10:20:00' },
    { id: 'C-001', name: '光电计数器 A线', type: 'counter', location: 'A厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'C-002', name: '光电计数器 B线', type: 'counter', location: 'B厂-包装区', status: 'online', lastUpdate: '2026-06-12 10:25:00' },
    { id: 'C-003', name: '光电计数器 C线', type: 'counter', location: 'C厂-包装区', status: 'offline', lastUpdate: '2026-06-12 08:00:00' }
  ])

  const onlineCount = computed(() => allDevices.value.filter(d => d.status === 'online').length)
  const totalCount = computed(() => allDevices.value.length)
  const alarmCount = computed(() => alarms.value.filter(a => !a.resolved).length)
  const criticalCount = computed(() => alarms.value.filter(a => !a.resolved && a.level === 'critical').length)

  function updateTemperature(val) { temperature.value = val }
  function updateHumidity(val) { humidity.value = val }
  function updateCO(val) { coLevel.value = val }
  function updateSmoke(val) { smokeLevel.value = val }
  function toggleLighting() { lightingStatus.value = !lightingStatus.value }
  function setBrightness(val) { lightingBrightness.value = val }
  function addAlarm(alarm) { alarms.value.unshift({ id: Date.now(), resolved: false, ...alarm }) }
  async function resolveAlarm(id) {
    const alarm = alarms.value.find(a => a.id === id)
    if (alarm) alarm.resolved = true
    // 同步到后端
    try { await api.put(`/alerts/${id}/handle`, { handledBy: 'web' }) } catch (e) { /* 离线时仅本地标记 */ }
  }

  // ===== 真实数据接入 =====
  // 后端告警等级 warning/serious/emergency → 前端 info/warning/critical
  const levelMap = { warning: 'info', serious: 'warning', emergency: 'critical' }
  const typeMap = {
    gas_leak: 'gas', fire_smoke: 'gas', temperature_high: 'temperature',
    high_humidity: 'temperature', device_offline: 'device', no_helmet: 'video',
  }
  const typeTextMap = {
    gas: '气体告警', temperature: '温度告警', device: '设备告警',
    video: '视觉告警', agv: 'AGV告警', other: '其他',
  }
  function getTypeText(t) { return typeTextMap[t] || '其他' }

  function mapBackendAlert(a) {
    const msg = (() => {
      try { return JSON.parse(a.details || '{}').message || a.alertType } catch (e) { return a.alertType }
    })()
    return {
      id: a.id,
      level: levelMap[a.alertLevel] || 'info',
      type: typeMap[a.alertType] || 'other',
      message: msg,
      location: a.deviceId,
      time: String(a.timestamp || '').replace('T', ' ').slice(0, 19),
      resolved: a.handled === 1,
    }
  }

  async function loadAlarms() {
    try {
      const res = await api.get('/alerts?limit=100')
      if (res.status === 'ok' && Array.isArray(res.data)) {
        alarms.value = res.data.map(mapBackendAlert)
      }
    } catch (e) { /* 后端未启动时保持空列表 */ }
  }

  let realtimeStarted = false
  /**
   * 启动真实数据订阅（AdminLayout 挂载时调用一次）
   * WebSocket 收到 factory/sensor/data 广播后刷新核心指标与真实节点
   */
  function startRealtime() {
    if (realtimeStarted) return
    realtimeStarted = true

    loadAlarms()

    wsOn('sensors', (d) => {
      // WS 推送为硬件原始 snake_case 字段
      temperature.value = +(d.temp ?? 0).toFixed(1)
      humidity.value = Math.round(d.humi ?? 0)
      smokeLevel.value = d.mq2_ppm ?? 0
      coLevel.value = d.mq5_ppm ?? 0
      lightingStatus.value = d.light_on === 1
      goodsCount.value = d.count ?? 0

      // 同步真实节点（3D 场景 + 设备管理页共用）
      const th = tempHumidNodes.value.find(n => n.id === 'TH-01')
      if (th) {
        th.temp = +(d.temp ?? 0).toFixed(1)
        th.humid = Math.round(d.humi ?? 0)
        th.status = 'online'
      }
      const g1 = gasNodes.value.find(g => g.id === 'GAS-01')
      if (g1) g1.value = d.mq5_ppm ?? 0
      const g2 = gasNodes.value.find(g => g.id === 'GAS-02')
      if (g2) g2.value = d.mq2_ppm ?? 0
    })

    wsOn('alert', () => { loadAlarms() })   // 新告警到达 → 重新拉取
    wsOn('device_offline', () => { loadAlarms() })
  }

  /** 兼容保留：原 mock 模拟函数不再需要（真实数据由 WS 驱动） */
  function simulateData() {}

  // 统一设备列表：生产设备 + 温湿度传感器 + 气体传感器
  // 字段归一化，确保设备管理页、3D 大屏、监测页共享同一套编号与数据
  const allDevices = computed(() => {
    const list = []
    // 1. 生产设备
    devices.value.forEach(d => list.push({ ...d, statusLabel: statusLabelOf(d.status) }))
    // 2. 温湿度传感器（编号 TH-XX）
    tempHumidNodes.value.forEach(n => {
      list.push({
        id: n.id,
        name: `温湿度传感器 ${n.id}`,
        type: 'tempHumid',
        location: n.location,
        status: n.status, // online / warning / danger
        statusLabel: statusLabelOf(n.status),
        temp: n.temp,
        humid: n.humid,
        desc: n.desc,
        lastUpdate: '实时'
      })
    })
    // 3. 气体传感器（编号 GAS-XX）
    gasNodes.value.forEach(g => {
      const st = g.value > g.threshold ? 'danger' : g.value > g.threshold * 0.8 ? 'warning' : 'online'
      list.push({
        id: g.id,
        name: `${gasTypeLabel(g.type)}传感器 ${g.id}`,
        type: 'gas',
        location: g.location,
        status: st,
        statusLabel: statusLabelOf(st),
        value: g.value,
        unit: g.unit,
        threshold: g.threshold,
        gasType: g.type,
        desc: g.desc,
        lastUpdate: '实时'
      })
    })
    return list.sort((a, b) => {
      // 传感器排最前：温湿度 → 气体 → 生产设备
      const order = { tempHumid: 0, gas: 1 }
      const oa = order[a.type] ?? 2
      const ob = order[b.type] ?? 2
      if (oa !== ob) return oa - ob
      // 同组内按 ID 升序
      return a.id.localeCompare(b.id)
    })
  })

  function statusLabelOf(s) {
    return { online: '在线', offline: '离线', warning: '预警', danger: '告警', maintenance: '维护中', charging: '充电中' }[s] || s
  }
  function gasTypeLabel(t) {
    return { CO: 'CO一氧化碳', smoke: '烟雾', VOC: 'VOC', CO2: 'CO₂二氧化碳' }[t] || t
  }

  return {
    temperature, humidity, coLevel, smokeLevel,
    lightingStatus, lightingBrightness,
    goodsCount, agvStatus, alarms, devices,
    tempHumidNodes, gasNodes, allDevices,
    onlineCount, totalCount, alarmCount, criticalCount,
    updateTemperature, updateHumidity, updateCO, updateSmoke,
    toggleLighting, setBrightness, addAlarm, resolveAlarm,
    simulateData, startRealtime, loadAlarms
  }
})
