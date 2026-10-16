<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">环境安全评估</h2>
      <div class="page-desc">基于真实传感器数据（温湿度/气体/光照/人员）动态评估车间环境安全</div>
    </div>

    <!-- 安全评分总览 -->
    <div class="safety-overview">
      <div class="score-card">
        <div ref="radarChartRef" class="radar-chart"></div>
      </div>
      <div class="score-summary">
        <div class="total-score">
          <div class="score-ring" :class="scoreLevel">
            <div class="score-num">{{ totalScore }}</div>
            <div class="score-label">综合评分</div>
          </div>
          <div class="score-level-text" :class="scoreLevel">{{ scoreLevelText }}</div>
        </div>
        <div class="score-items">
          <div class="score-item" v-for="item in safetyItems" :key="item.name">
            <div class="score-item-header">
              <span class="score-item-name">{{ item.name }}</span>
              <span class="score-item-value" :class="item.level">{{ item.score }}分</span>
            </div>
            <div class="score-item-bar">
              <div class="score-item-fill" :style="{ width: item.score + '%', background: item.color }"></div>
            </div>
            <div class="score-item-status">{{ item.statusText }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>今日安全评分走势</h3>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>隐患类型分布</h3>
        </div>
        <div ref="pieChartRef" class="chart-container"></div>
      </div>
    </div>

    <!-- 隐患排查列表 -->
    <div class="hazard-section">
      <div class="panel-title">最近告警记录</div>
      <div class="hazard-table">
        <div class="table-head">
          <span class="col-id">编号</span>
          <span class="col-type">隐患类型</span>
          <span class="col-desc">描述</span>
          <span class="col-zone">区域</span>
          <span class="col-level">等级</span>
          <span class="col-status">状态</span>
          <span class="col-time">发现时间</span>
        </div>
        <div class="table-row" v-for="item in hazardList" :key="item.id">
          <span class="col-id">{{ item.id }}</span>
          <span class="col-type">{{ item.type }}</span>
          <span class="col-desc">{{ item.desc }}</span>
          <span class="col-zone">{{ item.zone }}</span>
          <span class="col-level">
            <span class="level-tag" :class="item.level">{{ item.levelText }}</span>
          </span>
          <span class="col-status">
            <span class="status-tag" :class="item.status">{{ item.statusText }}</span>
          </span>
          <span class="col-time">{{ item.time }}</span>
        </div>
      </div>
    </div>

    <!-- 安全建议 -->
    <div class="advice-section">
      <div class="panel-title">安全改善建议</div>
      <div class="advice-list">
        <div class="advice-item" v-for="(item, i) in adviceList" :key="i">
          <div class="advice-icon">{{ i + 1 }}</div>
          <div class="advice-content">
            <div class="advice-title">{{ item.title }}</div>
            <div class="advice-desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import api from '../utils/request'
import { useLatestSensor, useHistorySensor, fmtTime } from '../utils/useSensorData'

const radarChartRef = ref(null)
const trendChartRef = ref(null)
const pieChartRef = ref(null)
let radarChart = null
let trendChart = null
let pieChart = null

// ===== 真实数据源 =====
const { latest } = useLatestSensor()
const { history } = useHistorySensor(1000)
const backendAlarms = ref([])

async function loadAlarms() {
  try {
    const res = await api.get('/alerts?limit=100')
    if (res.status === 'ok' && Array.isArray(res.data)) backendAlarms.value = res.data
  } catch (e) { /* 静默 */ }
}

// ===== 三项真实评分（全部由实测数据推导，无硬件项不参与评分）=====
// 评分原则：指标离安全中心越近分越高；越接近硬件报警阈值分越低
const tempScore = computed(() => {
  const t = latest.value?.temp ?? 0
  if (!t) return 0
  // 以 22℃ 为理想中心，45℃（后端告警阈值）为 0 分
  return Math.max(0, Math.round(100 - Math.abs(t - 22) * (100 / 23)))
})

const gasScore = computed(() => {
  const mq5 = latest.value?.mq5Ppm ?? 0
  const mq2 = latest.value?.mq2Ppm ?? 0
  if (!latest.value) return 0
  // 分别按 900/300 阈值归一，取较差者
  const s5 = Math.max(0, 100 - (mq5 / 900) * 100)
  const s2 = Math.max(0, 100 - (mq2 / 300) * 100)
  return Math.round(Math.min(s5, s2))
})

const envScore = computed(() => {
  if (!latest.value) return 0
  const humi = latest.value?.humi ?? 0
  const pir = latest.value?.pir ?? 0
  const lightOn = latest.value?.lightOn ?? 0
  const ldr = latest.value?.ldrAdc ?? 0
  // 湿度 40~65 为宜；黑暗环境有人未开灯扣分（能耗与安全）
  let s = 100
  if (humi > 65) s -= (humi - 65) * 2
  if (humi < 30) s -= (30 - humi) * 2
  if (pir === 1 && ldr > 2000 && lightOn === 0) s -= 20
  return Math.max(0, Math.round(s))
})

const safetyItems = computed(() => {
  const item = (name, score, warnText, okText) => ({
    name,
    score,
    level: score >= 70 ? 'good' : score >= 40 ? 'warning' : 'danger',
    statusText: score >= 70 ? okText : warnText,
    color: score >= 70 ? '#67c23a' : score >= 40 ? '#e6a23c' : '#f56c6c',
  })
  const t = latest.value?.temp ?? 0
  const mq5 = latest.value?.mq5Ppm ?? 0
  const mq2 = latest.value?.mq2Ppm ?? 0
  return [
    item('温湿度安全', tempScore.value, `温度 ${t.toFixed(1)}℃ 偏离适宜区`, `温度 ${(t ?? 0).toFixed(1)}℃ 适宜`),
    item('气体安全', gasScore.value, mq2 > 300 ? '烟雾接近/超标' : '可燃气浓度偏高', 'MQ-5/MQ-2 正常'),
    item('照明与人员', envScore.value, '环境阴暗且人员在场未开灯', '照明逻辑正常'),
  ]
})

const totalScore = computed(() => {
  const valid = safetyItems.value.filter(i => i.score > 0)
  if (!valid.length) return 0
  return Math.round(valid.reduce((a, b) => a + b.score, 0) / valid.length)
})

const scoreLevel = computed(() => {
  const s = totalScore.value
  if (s >= 85) return 'good'
  if (s >= 70) return 'warning'
  return 'danger'
})

const scoreLevelText = computed(() => {
  const map = { good: '安全', warning: '需关注', danger: '风险' }
  return map[scoreLevel.value]
})

// 隐患记录 = 真实未处理告警
const hazardList = computed(() => {
  const typeText = { gas_leak: '气体超标', fire_smoke: '烟雾超标', temperature_high: '温度过高' }
  const levelMap = { emergency: ['danger', '重大'], serious: ['warning', '一般'], warning: ['info', '轻微'] }
  return backendAlarms.value.slice(0, 8).map(a => {
    const [lv, lvText] = levelMap[a.alertLevel] || ['info', '轻微']
    const msg = (() => {
      try { return JSON.parse(a.details || '{}').message || a.alertType } catch (e) { return a.alertType }
    })()
    return {
      id: `AL-${a.id}`,
      type: typeText[a.alertType] || a.alertType,
      desc: msg,
      zone: a.deviceId,
      level: lv,
      levelText: lvText,
      status: a.handled === 1 ? 'resolved' : 'pending',
      statusText: a.handled === 1 ? '已处理' : '待处理',
      time: String(a.timestamp || '').replace('T', ' ').slice(5, 16),
    }
  })
})

// 动态安全建议（根据当前实测值生成，不编造）
const adviceList = computed(() => {
  const list = []
  const t = latest.value?.temp ?? 0
  const mq5 = latest.value?.mq5Ppm ?? 0
  const mq2 = latest.value?.mq2Ppm ?? 0
  const ldr = latest.value?.ldrAdc ?? 0
  const pir = latest.value?.pir ?? 0
  const lightOn = latest.value?.lightOn ?? 0
  if (!latest.value) {
    return [{ title: '等待硬件接入', desc: '暂未收到传感器数据，请确认 RK3568 网关已上线' }]
  }
  if (mq5 > 700) list.push({ title: '可燃气浓度偏高', desc: `MQ-5 当前 ${mq5}ppm，接近 900ppm 报警阈值，建议检查燃气管路并保持通风` })
  if (mq2 > 250) list.push({ title: '烟雾浓度偏高', desc: `MQ-2 当前 ${mq2}ppm，接近 300ppm 报警阈值，建议排查烟雾来源` })
  if (t > 32) list.push({ title: '温度偏高', desc: `当前 ${t.toFixed(1)}℃，建议加强通风降温` })
  if (pir === 1 && ldr > 2000 && lightOn === 0) list.push({ title: '照明建议', desc: '环境较暗且有人员在岗，建议开启车间照明（硬件自动逻辑同样会触发）' })
  if (backendAlarms.value.filter(a => a.handled === 0).length > 0) list.push({ title: '待处理告警', desc: `当前有 ${backendAlarms.value.filter(a => a.handled === 0).length} 条告警待处理，请前往告警中心跟进` })
  if (!list.length) list.push({ title: '环境状况良好', desc: '各项指标均在安全范围内，请继续保持定期巡检' })
  return list.slice(0, 4)
})

function initCharts() {
  if (!radarChartRef.value || !trendChartRef.value || !pieChartRef.value) return

  radarChart = echarts.init(radarChartRef.value)
  trendChart = echarts.init(trendChartRef.value)
  pieChart = echarts.init(pieChartRef.value)

  const radarOption = () => ({
    tooltip: {},
    radar: {
      indicator: safetyItems.value.map(item => ({ name: item.name, max: 100 })),
      radius: '65%',
      axisName: { color: '#8899b0', fontSize: 12 },
      splitArea: { areaStyle: { color: ['rgba(0, 212, 255, 0.03)', 'rgba(0, 212, 255, 0.06)'] } },
      splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.2)' } },
      axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.25)' } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: safetyItems.value.map(item => item.score),
        name: '当前评分',
        areaStyle: { color: 'rgba(64,158,255,0.2)' },
        lineStyle: { color: '#409eff', width: 2 },
        itemStyle: { color: '#409eff' }
      }]
    }]
  })
  radarChart.setOption(radarOption())

  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136, 153, 176, 0.2)' } } },
    series: [{
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: [],
      itemStyle: { color: '#409eff' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(64,158,255,0.3)' }, { offset: 1, color: 'rgba(64,158,255,0)' }]) },
      markLine: { data: [{ yAxis: 85, name: '安全线', lineStyle: { color: '#67c23a', type: 'dashed' }, label: { formatter: '安全线' } }] }
    }]
  })

  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '42%'],
      data: [{ value: 1, name: '暂无告警', itemStyle: { color: '#8899b0' } }]
    }]
  })
}

// 评分走势：用 history 每帧重算三项均值（真实滚动评分）
function scoreOfRow(r) {
  const s1 = Math.max(0, Math.round(100 - Math.abs((r.temp ?? 0) - 22) * (100 / 23)))
  const s5 = Math.max(0, 100 - ((r.mq5Ppm ?? 0) / 900) * 100)
  const s2 = Math.max(0, 100 - ((r.mq2Ppm ?? 0) / 300) * 100)
  return Math.round((s1 + Math.min(s5, s2)) / 2)
}

function refreshCharts() {
  const rows = history.value
  if (!rows.length) return

  radarChart?.setOption({
    radar: { indicator: safetyItems.value.map(item => ({ name: item.name, max: 100 })) },
    series: [{ data: [{ value: safetyItems.value.map(item => item.score), name: '当前评分' }] }]
  })

  trendChart?.setOption({
    xAxis: { data: rows.map(r => fmtTime(r.timestamp)) },
    series: [{ data: rows.map(scoreOfRow) }]
  })

  const typeText = { gas_leak: '气体超标', fire_smoke: '烟雾超标', temperature_high: '温度过高' }
  const counts = {}
  backendAlarms.value.forEach(a => {
    const k = typeText[a.alertType] || a.alertType
    counts[k] = (counts[k] || 0) + 1
  })
  const pieData = Object.entries(counts).map(([name, value], i) => ({
    name, value,
    itemStyle: { color: ['#ff4757', '#ff9500', '#00d4ff', '#a855f7'][i % 4] }
  }))
  pieChart?.setOption({
    series: [{ data: pieData.length ? pieData : [{ value: 1, name: '暂无告警', itemStyle: { color: '#8899b0' } }] }]
  })
}

function handleResize() {
  radarChart?.resize()
  trendChart?.resize()
  pieChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initCharts()
  await loadAlarms()
  refreshCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  radarChart?.dispose()
  trendChart?.dispose()
  pieChart?.dispose()
})
</script>

<style scoped>
.page-container {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.page-header {
  padding: 0 4px 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.safety-overview {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;
  margin-bottom: 16px;
}

.score-card, .score-summary {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.radar-chart {
  height: 320px;
}

.score-summary {
  display: flex;
  flex-direction: column;
}

.total-score {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.score-ring {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  border: 4px solid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.score-ring.good { border-color: var(--accent-green); color: var(--accent-green); }
.score-ring.warning { border-color: var(--accent-orange); color: var(--accent-orange); }
.score-ring.danger { border-color: var(--accent-red); color: var(--accent-red); }

.score-num {
  font-size: 28px;
  font-weight: 700;
}

.score-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.score-level-text {
  font-size: 18px;
  font-weight: 600;
}

.score-level-text.good { color: var(--accent-green); }
.score-level-text.warning { color: var(--accent-orange); }
.score-level-text.danger { color: var(--accent-red); }

.score-items {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.score-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.score-item-name {
  font-size: 13px;
  color: var(--text-primary);
}

.score-item-value {
  font-size: 13px;
  font-weight: 600;
}

.score-item-value.good { color: var(--accent-green); }
.score-item-value.warning { color: var(--accent-orange); }
.score-item-value.danger { color: var(--accent-red); }

.score-item-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 2px;
}

.score-item-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.score-item-status {
  font-size: 11px;
  color: var(--text-secondary);
}

.chart-section {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.chart-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.chart-container {
  height: 280px;
}

.hazard-section, .advice-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.hazard-table {
  display: flex;
  flex-direction: column;
}

.table-head, .table-row {
  display: grid;
  grid-template-columns: 70px 90px 1.5fr 80px 70px 80px 100px;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
}

.table-head {
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.table-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid rgba(64, 158, 255, 0.12);
}

.table-row:hover {
  background: rgba(0, 212, 255, 0.06);
}

.col-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.level-tag.danger { background: rgba(245, 108, 108, 0.1); color: var(--accent-red); }
.level-tag.warning { background: rgba(230, 162, 60, 0.1); color: var(--accent-orange); }
.level-tag.info { background: rgba(64, 158, 255, 0.1); color: var(--accent-cyan); }

.status-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-tag.pending { background: rgba(230, 162, 60, 0.1); color: var(--accent-orange); }
.status-tag.resolved { background: rgba(103, 194, 58, 0.1); color: var(--accent-green); }

.advice-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.advice-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: rgba(15, 36, 64, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.15);
  border-radius: 8px;
}

.advice-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-cyan);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.advice-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.advice-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
