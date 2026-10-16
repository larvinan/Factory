// 公共传感器数据组合式函数
// 从后端 /api/sensors 拉取真实数据，并通过 WebSocket 实时更新
// 供各监控页面复用，避免每页重复写轮询/订阅逻辑
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../utils/request'
import { on as wsOn } from '../utils/ws'

export const DEVICE_ID = 'rk3568_factory_001'

/**
 * 实时传感器数据（最新一帧）
 */
export function useLatestSensor() {
  const latest = ref(null)          // 最新一帧（扁平字段: temp/humi/mq5_ppm/...）
  const loading = ref(true)
  const connected = ref(false)      // 是否收到过真实数据

  async function refresh() {
    try {
      const res = await api.get(`/sensors/latest?deviceId=${DEVICE_ID}`)
      if (res.status === 'ok' && res.data && res.data.id) {
        latest.value = res.data      // 后端返回驼峰字段
        connected.value = true
      }
    } catch (e) { /* 后端未启动时静默，页面显示暂无数据 */ }
    loading.value = false
  }

  let offWs
  onMounted(() => {
    refresh()
    // WebSocket 实时推送（后端广播原始扁平 JSON）
    offWs = wsOn('sensors', (data) => {
      latest.value = camelize(data)
      connected.value = true
    })
  })
  onUnmounted(() => { offWs && offWs() })

  return { latest, loading, connected, refresh }
}

/**
 * 历史数据缓冲（用于图表）
 * @param {number} limit 拉取条数（默认 500 帧 ≈ 最近 16 分钟，2 秒一帧）
 */
export function useHistorySensor(limit = 500) {
  const history = ref([])           // 按时间升序
  const loading = ref(true)

  async function refresh() {
    try {
      const res = await api.get(`/sensors/history?deviceId=${DEVICE_ID}&limit=${limit}&page=1`)
      if (res.status === 'ok' && Array.isArray(res.data)) {
        // 后端按时间倒序返回，翻转为升序便于画图
        history.value = res.data.slice().reverse()
      }
    } catch (e) { /* 静默 */ }
    loading.value = false
  }

  let offWs
  onMounted(async () => {
    await refresh()
    // 实时追加：保持缓冲区最多 limit 条
    offWs = wsOn('sensors', (data) => {
      history.value.push(camelize(data))
      if (history.value.length > limit) {
        history.value.splice(0, history.value.length - limit)
      }
    })
  })
  onUnmounted(() => { offWs && offWs() })

  return { history, loading, refresh }
}

/**
 * 后端 WebSocket 推送的是硬件原始字段（snake_case），
 * REST 接口返回的是 MyBatis 驼峰字段，统一转成驼峰供页面使用
 */
export function camelize(raw) {
  if (!raw) return raw
  return {
    id: raw.id,
    deviceId: raw.device_id ?? raw.deviceId,
    timestamp: raw.timestamp,
    temp: raw.temp,
    humi: raw.humi,
    mq5Ppm: raw.mq5_ppm ?? raw.mq5Ppm,
    mq2Ppm: raw.mq2_ppm ?? raw.mq2Ppm,
    mq5Level: raw.mq5_level ?? raw.mq5Level,
    mq2Level: raw.mq2_level ?? raw.mq2Level,
    ldrAdc: raw.ldr_adc ?? raw.ldrAdc,
    pir: raw.pir,
    lightOn: raw.light_on ?? raw.lightOn,
    rgbColor: raw.rgb_color ?? raw.rgbColor,
    beep: raw.beep,
    count: raw.count,
    stock: raw.stock,
  }
}

/** 格式化时间 HH:mm:ss */
export function fmtTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts).replace('T', ' ').slice(11, 19)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
