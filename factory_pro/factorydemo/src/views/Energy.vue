<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">照明与在场分析</h2>
      <div class="page-desc">
        基于照明继电器（light_on）与人体红外（pir）的真实历史数据，分析车间照明使用与人员在场情况
        <el-tag v-if="!connected" type="info" size="small" style="margin-left:8px">等待硬件数据…</el-tag>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div class="energy-overview">
      <div class="overview-card" v-for="item in overviewData" :key="item.label">
        <div class="overview-icon" :style="{ background: item.color }" v-html="item.icon"></div>
        <div class="overview-info">
          <div class="overview-value">{{ item.value }}<span class="overview-unit">{{ item.unit }}</span></div>
          <div class="overview-label">{{ item.label }}</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>今日照明与在场时间线（真实数据）</h3>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>状态占比</h3>
        </div>
        <div ref="pieChartRef" class="chart-container"></div>
      </div>
    </div>

    <!-- 照明估算说明 -->
    <div class="ranking-section">
      <div class="panel-title">照明用电估算（按灯具额定功率折算）</div>
      <div class="est-note">
        估算口径：车间照明灯按 LED 36W 额定功率计，照明时长由真实 light_on 数据帧累计（2 秒/帧）。此为工程估算值，非电表实测。
      </div>
      <div class="ranking-table">
        <div class="table-head">
          <span class="col-rank">项目</span>
          <span class="col-name">说明</span>
          <span class="col-zone">数据来源</span>
          <span class="col-power">数值</span>
        </div>
        <div class="table-row" v-for="item in estimateRows" :key="item.name">
          <span class="col-rank">{{ item.name }}</span>
          <span class="col-name">{{ item.desc }}</span>
          <span class="col-zone">{{ item.source }}</span>
          <span class="col-power"><b>{{ item.value }}</b> {{ item.unit }}</span>
        </div>
      </div>
    </div>

    <!-- 照明逻辑事件 -->
    <div class="alert-section">
      <div class="panel-title">照明逻辑事件（今日）</div>
      <div class="alert-list" v-if="lightEvents.length">
        <div class="alert-item" v-for="(item, i) in lightEvents" :key="i">
          <span class="alert-level" :class="item.level">{{ item.levelText }}</span>
          <span class="alert-device">{{ item.device }}</span>
          <span class="alert-desc">{{ item.desc }}</span>
          <span class="alert-time">{{ item.time }}</span>
        </div>
      </div>
      <div class="alert-list" v-else>
        <div class="alert-item"><span class="alert-desc">今日暂无照明逻辑事件（人+暗未开灯 / 无人亮灯）</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useLatestSensor, useHistorySensor, fmtTime } from '../utils/useSensorData'

const trendChartRef = ref(null)
const pieChartRef = ref(null)
let trendChart = null
let pieChart = null

// ===== 真实数据源 =====
const { latest, connected } = useLatestSensor()
const { history } = useHistorySensor(2000)

const LIGHT_WATT = 36   // 灯具额定功率（估算口径，页面上已标注）

// 照明帧统计（每帧 2 秒）
const stats = computed(() => {
  const rows = history.value
  let onFrames = 0, pirFrames = 0, switches = 0, bothDarkPerson = 0, lightNoPerson = 0
  let prevOn = null
  for (const r of rows) {
    const on = r.lightOn === 1
    if (on) onFrames++
    if (prevOn !== null && on !== prevOn) switches++
    prevOn = on
    if (r.pir === 1) pirFrames++
    if (r.pir === 1 && (r.ldrAdc ?? 0) > 2000 && !on) bothDarkPerson++
    if (on && r.pir === 0) lightNoPerson++
  }
  const onMinutes = onFrames * 2 / 60
  return {
    onMinutes,
    onHours: +(onMinutes / 60).toFixed(2),
    kwh: +(onFrames * 2 / 3600 * LIGHT_WATT / 1000).toFixed(3),
    switches,
    pirPercent: rows.length ? Math.round(pirFrames / rows.length * 100) : 0,
    onPercent: rows.length ? Math.round(onFrames / rows.length * 100) : 0,
    events: { bothDarkPerson, lightNoPerson },
  }
})

const overviewData = computed(() => [
  { label: '今日照明时长', value: stats.value.onHours, unit: 'h', color: 'linear-gradient(135deg,#ffd700,#ff8c00)', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/></svg>' },
  { label: '估算用电量', value: stats.value.kwh, unit: 'kWh', color: 'linear-gradient(135deg,#00d4ff,#0066cc)', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
  { label: '照明开关次数', value: stats.value.switches, unit: '次', color: 'linear-gradient(135deg,#a855f7,#7c3aed)', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>' },
  { label: '人员在场率', value: stats.value.pirPercent, unit: '%', color: 'linear-gradient(135deg,#00ff88,#009944)', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
])

const estimateRows = computed(() => [
  { name: '照明时长', desc: 'light_on=1 的真实数据帧累计', source: 'factory/sensor/data', value: stats.value.onMinutes.toFixed(1), unit: '分钟' },
  { name: '估算电量', desc: `时长 × ${LIGHT_WATT}W 额定功率折算`, source: '工程估算', value: stats.value.kwh, unit: 'kWh' },
  { name: '当前灯状态', desc: '继电器实时回读', source: 'light_on 字段', value: latest.value?.lightOn === 1 ? '开' : '关', unit: '' },
  { name: '当前光照ADC', desc: '光敏电阻原始值（0~4095，值大=暗）', source: 'ldr_adc 字段', value: latest.value?.ldrAdc ?? '--', unit: '' },
])

// 照明逻辑事件：人+暗未开灯（应亮未亮）、无人亮灯（可能浪费）
const lightEvents = computed(() => {
  const rows = history.value
  const events = []
  let lastEventIdx = -10
  rows.forEach((r, i) => {
    const darkPerson = r.pir === 1 && (r.ldrAdc ?? 0) > 2000 && r.lightOn !== 1
    const noPersonLight = r.lightOn === 1 && r.pir === 0
    if (i - lastEventIdx > 30) {   // 同一事件至少间隔 1 分钟（30帧），避免刷屏
      if (darkPerson) {
        events.push({ device: '照明逻辑', desc: '环境较暗且有人在岗，照明未开启', level: 'warning', levelText: '建议', time: fmtTime(r.timestamp) })
        lastEventIdx = i
      } else if (noPersonLight && rows.slice(Math.max(0, i - 60), i).every(x => x.pir === 0)) {
        events.push({ device: '照明逻辑', desc: '区域无人但照明持续开启超过 2 分钟', level: 'info', levelText: '提示', time: fmtTime(r.timestamp) })
        lastEventIdx = i
      }
    }
  })
  return events.slice(-10).reverse()
})

function initCharts() {
  if (!trendChartRef.value || !pieChartRef.value) return
  trendChart = echarts.init(trendChartRef.value)
  pieChart = echarts.init(pieChartRef.value)

  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['照明(开=1)', '人员在场(1=有)'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', min: 0, max: 1, interval: 1, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: '照明(开=1)', type: 'line', step: 'end', showSymbol: false, data: [], itemStyle: { color: '#ffd700' }, areaStyle: { color: 'rgba(255,215,0,0.15)' } },
      { name: '人员在场(1=有)', type: 'line', step: 'end', showSymbol: false, data: [], itemStyle: { color: '#00ff88' } }
    ]
  })

  pieChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { bottom: 0, textStyle: { color: '#8899b0' } },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#0a1628', borderWidth: 2 },
      label: { color: '#8899b0' },
      data: [
        { value: 1, name: '亮灯', itemStyle: { color: '#ffd700' } },
        { value: 1, name: '关灯', itemStyle: { color: '#334' } }
      ]
    }]
  })
}

watch(history, (rows) => {
  if (!rows.length || !trendChart) return
  trendChart.setOption({
    xAxis: { data: rows.map(r => fmtTime(r.timestamp)) },
    series: [
      { name: '照明(开=1)', data: rows.map(r => r.lightOn === 1 ? 1 : 0) },
      { name: '人员在场(1=有)', data: rows.map(r => r.pir === 1 ? 1 : 0) }
    ]
  })
  pieChart?.setOption({
    series: [{ data: [
      { value: stats.value.onPercent, name: '亮灯', itemStyle: { color: '#ffd700' } },
      { value: 100 - stats.value.onPercent, name: '关灯', itemStyle: { color: '#334' } }
    ] }]
  })
}, { deep: true })

function handleResize() {
  trendChart?.resize()
  pieChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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

.energy-overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.overview-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.overview-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.overview-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.overview-unit {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 4px;
}

.overview-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.overview-trend {
  font-size: 12px;
  margin-top: 4px;
}

.overview-trend.up { color: var(--accent-red); }
.overview-trend.down { color: var(--accent-green); }

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

.ranking-section, .alert-section {
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

.ranking-table, .alert-list {
  display: flex;
  flex-direction: column;
}

.table-head, .table-row {
  display: grid;
  grid-template-columns: 60px 1.5fr 1fr 1fr 1.2fr 1.5fr;
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

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.rank-1 { background: #f56c6c; }
.rank-2 { background: #e6a23c; }
.rank-3 { background: #409eff; }
.rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) { background: #5a6a80; }

.bar-wrap {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}

.bar-text {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-bar {
  display: flex;
  align-items: center;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(64, 158, 255, 0.12);
  font-size: 13px;
}

.alert-level {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.alert-level.danger { background: rgba(245, 108, 108, 0.1); color: var(--accent-red); }
.alert-level.warning { background: rgba(230, 162, 60, 0.1); color: var(--accent-orange); }
.alert-level.info { background: rgba(64, 158, 255, 0.1); color: var(--accent-cyan); }

.alert-device { font-weight: 600; min-width: 120px; }
.alert-desc { flex: 1; color: var(--text-secondary); }
.alert-time { color: var(--text-secondary); flex-shrink: 0; }
</style>
