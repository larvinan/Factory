<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">废气监测</h2>
      <div class="page-desc">
        实时监测可燃气（MQ-5）与烟雾（MQ-2）浓度，超标自动联动红灯与蜂鸣器
        <el-tag v-if="!connected" type="info" size="small" style="margin-left:8px">等待硬件数据…</el-tag>
        <el-tag v-else type="success" size="small" style="margin-left:8px">实时连接中</el-tag>
      </div>
    </div>

    <!-- 报警阈值设置（运行时可调，修改立即生效） -->
    <div class="threshold-panel">
      <div class="panel-title">报警阈值设置</div>
      <div class="threshold-row">
        <div class="threshold-item">
          <span class="threshold-label">可燃气 MQ-5 (ppm)</span>
          <el-input-number v-model="thresholdForm.mq5_ppm_high" :min="50" :max="5000" :step="50" />
        </div>
        <div class="threshold-item">
          <span class="threshold-label">烟雾 MQ-2 (ppm)</span>
          <el-input-number v-model="thresholdForm.mq2_ppm_high" :min="20" :max="5000" :step="20" />
        </div>
        <div class="threshold-item">
          <span class="threshold-label">温度 (℃)</span>
          <el-input-number v-model="thresholdForm.temperature_high" :min="30" :max="120" :step="1" />
        </div>
        <el-button type="primary" :loading="savingThreshold" @click="saveThresholds">保存阈值</el-button>
        <span class="threshold-tip">保存后立即生效（告警联动与页面标线同步更新），无需重启</span>
      </div>
    </div>

    <div class="gas-grid two-col">
      <div class="gas-card" :class="g.level" v-for="g in gasCards" :key="g.id">
        <div class="gas-header">
          <div class="gas-type">{{ g.name }}</div>
          <div class="gas-level" :class="g.level">{{ g.levelText }}</div>
        </div>
        <div class="gas-gauge">
          <div class="gauge-ring" :style="{ background: `conic-gradient(${g.color} ${g.percent * 3.6}deg, rgba(255,255,255,0.05) 0deg)` }">
            <div class="gauge-inner">
              <div class="gauge-value" :style="{ color: g.color }">{{ g.value }}</div>
              <div class="gauge-unit">{{ g.unit }}</div>
              <div class="gauge-label">{{ g.location }}</div>
            </div>
          </div>
        </div>
        <div class="gas-bar">
          <div class="bar-bg">
            <div class="bar-fill" :style="{ width: g.percent + '%', background: g.color }"></div>
          </div>
          <div class="bar-labels">
            <span>安全 (0-50%)</span>
            <span>警告 (50-80%)</span>
            <span>危险 (80-100%)</span>
          </div>
        </div>
        <div class="gas-info">
          <span>报警阈值: {{ g.threshold }}</span>
          <span>更新: {{ fmtTime(latest?.timestamp) }}</span>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>浓度等级实时对比 (0~100)</h3>
        </div>
        <div ref="barChartRef" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>气体浓度趋势 (真实数据)</h3>
        </div>
        <div ref="lineChartRef" class="chart-container"></div>
      </div>
    </div>

    <div class="device-status-card">
      <div class="panel-title">监测设备状态</div>
      <div class="device-list">
        <div class="device-item" v-for="dev in gasDevices" :key="dev.id">
          <div class="dev-icon" :class="dev.status">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="dev-info">
            <div class="dev-name">{{ dev.name }}</div>
            <div class="dev-meta">{{ dev.location }} · {{ dev.lastUpdate }}</div>
          </div>
          <div class="dev-status" :class="dev.status">{{ dev.statusText }}</div>
          <div class="dev-value">{{ dev.currentValue }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import api from '../utils/request'
import { useLatestSensor, useHistorySensor, fmtTime } from '../utils/useSensorData'

const barChartRef = ref(null)
const lineChartRef = ref(null)
let barChart = null
let lineChart = null

// ===== 真实数据源 =====
const { latest, connected } = useLatestSensor()
const { history } = useHistorySensor(500)

const mq5Ppm = computed(() => latest.value?.mq5Ppm ?? 0)
const mq2Ppm = computed(() => latest.value?.mq2Ppm ?? 0)

// ===== 运行时可调阈值（app_config，修改立即生效）=====
const thresholds = ref({ mq5_ppm_high: 900, mq2_ppm_high: 300, temperature_high: 45 })
const thresholdForm = ref({ mq5_ppm_high: 900, mq2_ppm_high: 300, temperature_high: 45 })
const savingThreshold = ref(false)

async function loadThresholds() {
  try {
    const res = await api.get('/thresholds')
    if (res.status === 'ok' && res.data) {
      thresholds.value = { ...thresholds.value, ...res.data }
      thresholdForm.value = { ...thresholds.value }
    }
  } catch (e) { /* 后端未启动时用默认值 */ }
}

async function saveThresholds() {
  savingThreshold.value = true
  try {
    const res = await api.put('/thresholds', {
      mq5_ppm_high: thresholdForm.value.mq5_ppm_high,
      mq2_ppm_high: thresholdForm.value.mq2_ppm_high,
      temperature_high: thresholdForm.value.temperature_high,
    })
    if (res.status === 'ok') {
      thresholds.value = { ...res.data }
      ElMessage.success('阈值已保存并即时生效')
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  savingThreshold.value = false
}

// 等级：0-50% 安全 / 50-80% 警告 / 80-100% 危险（直接使用硬件归一 level 0~100）
function levelOf(level) {
  if (level >= 80) return { cls: 'danger', text: '危险', color: '#ff4757' }
  if (level >= 50) return { cls: 'warning', text: '警告', color: '#ffd700' }
  return { cls: 'normal', text: '安全', color: '#00ff88' }
}

const gasCards = computed(() => {
  const l5v = latest.value?.mq5Level ?? 0
  const l2v = latest.value?.mq2Level ?? 0
  const l5 = levelOf(l5v)
  const l2 = levelOf(l2v)
  return [
    { id: 'mq5', name: '可燃气 MQ-5', value: mq5Ppm.value, unit: 'ppm', percent: l5v, threshold: `${thresholds.value.mq5_ppm_high} ppm`, location: '车间A-燃气区', level: l5.cls, levelText: l5.text, color: l5.color },
    { id: 'mq2', name: '烟雾 MQ-2', value: mq2Ppm.value, unit: 'ppm', percent: l2v, threshold: `${thresholds.value.mq2_ppm_high} ppm`, location: '车间A-烟雾区', level: l2.cls, levelText: l2.text, color: l2.color },
  ]
})

const gasDevices = computed(() => [
  { id: 'mq5_01', name: '可燃气传感器 MQ-5', location: '车间A-燃气区', lastUpdate: fmtTime(latest.value?.timestamp) || '--', status: mq5Ppm.value > thresholds.value.mq5_ppm_high ? 'danger' : 'normal', statusText: mq5Ppm.value > thresholds.value.mq5_ppm_high ? '报警' : '正常', currentValue: `${mq5Ppm.value} ppm` },
  { id: 'mq2_01', name: '烟雾传感器 MQ-2', location: '车间A-烟雾区', lastUpdate: fmtTime(latest.value?.timestamp) || '--', status: mq2Ppm.value > thresholds.value.mq2_ppm_high ? 'danger' : 'normal', statusText: mq2Ppm.value > thresholds.value.mq2_ppm_high ? '报警' : '正常', currentValue: `${mq2Ppm.value} ppm` },
])

function initCharts() {
  if (!barChartRef.value || !lineChartRef.value) return

  barChart = echarts.init(barChartRef.value)
  lineChart = echarts.init(lineChartRef.value)

  barChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['MQ-5 等级', 'MQ-2 等级'], top: 0, textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '20%', containLabel: true },
    xAxis: { type: 'category', data: ['可燃气 MQ-5', '烟雾 MQ-2'], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', max: 100, name: '等级(0~100)', axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: 'MQ-5 等级', type: 'bar', data: [0, 0], itemStyle: { color: '#ff9500' }, barWidth: '30%' },
      { name: 'MQ-2 等级', type: 'bar', data: [0, 0], itemStyle: { color: '#00d4ff' }, barWidth: '30%' }
    ]
  })

  lineChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['MQ-5 (ppm)', 'MQ-2 (ppm)'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', name: 'ppm', axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: 'MQ-5 (ppm)', type: 'line', smooth: true, showSymbol: false, data: [], itemStyle: { color: '#ff4757' }, areaStyle: { color: 'rgba(255,71,87,0.15)' },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: thresholds.value.mq5_ppm_high, lineStyle: { color: '#ff4757', type: 'dashed' }, label: { formatter: `MQ-5 阈值 ${thresholds.value.mq5_ppm_high}`, color: '#ff4757' } }] } },
      { name: 'MQ-2 (ppm)', type: 'line', smooth: true, showSymbol: false, data: [], itemStyle: { color: '#ffd700' }, areaStyle: { color: 'rgba(255,215,0,0.15)' },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: thresholds.value.mq2_ppm_high, lineStyle: { color: '#ffd700', type: 'dashed' }, label: { formatter: `MQ-2 阈值 ${thresholds.value.mq2_ppm_high}`, color: '#ffd700' } }] } }
    ]
  })
}

// 阈值修改后同步更新趋势图标线
watch(thresholds, () => {
  if (!lineChart) return
  lineChart.setOption({
    series: [
      { markLine: { silent: true, symbol: 'none', data: [{ yAxis: thresholds.value.mq5_ppm_high, lineStyle: { color: '#ff4757', type: 'dashed' }, label: { formatter: `MQ-5 阈值 ${thresholds.value.mq5_ppm_high}`, color: '#ff4757' } }] } },
      { markLine: { silent: true, symbol: 'none', data: [{ yAxis: thresholds.value.mq2_ppm_high, lineStyle: { color: '#ffd700', type: 'dashed' }, label: { formatter: `MQ-2 阈值 ${thresholds.value.mq2_ppm_high}`, color: '#ffd700' } }] } }
    ]
  })
}, { deep: true })

// 真实历史数据驱动图表
watch(history, (rows) => {
  if (!rows.length) return
  if (barChart) {
    const l5v = latest.value?.mq5Level ?? 0
    const l2v = latest.value?.mq2Level ?? 0
    barChart.setOption({ series: [ { data: [l5v, 0] }, { data: [0, l2v] } ] })
  }
  if (lineChart) {
    lineChart.setOption({
      xAxis: { data: rows.map(r => fmtTime(r.timestamp)) },
      series: [
        { name: 'MQ-5 (ppm)', data: rows.map(r => r.mq5Ppm ?? 0) },
        { name: 'MQ-2 (ppm)', data: rows.map(r => r.mq2Ppm ?? 0) }
      ]
    })
  }
}, { deep: true })

function handleResize() {
  barChart?.resize()
  lineChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initCharts()
  loadThresholds()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  barChart?.dispose()
  lineChart?.dispose()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px;
}

.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.threshold-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.threshold-row {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}

.threshold-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.threshold-label { font-size: 12px; color: var(--text-secondary); }
.threshold-tip { font-size: 11px; color: var(--text-secondary); max-width: 220px; line-height: 1.5; }

.gas-grid.two-col {
  grid-template-columns: repeat(2, 1fr);
}

.gas-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.gas-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  position: relative;
  overflow: hidden;
}

.gas-card.critical::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent-red), transparent);
}

.gas-card:has(.danger) {
  border-color: var(--accent-red);
  animation: dangerPulse 2s infinite;
}

@keyframes dangerPulse {
  0%, 100% { box-shadow: 0 0 10px rgba(255, 71, 87, 0.2); }
  50% { box-shadow: 0 0 25px rgba(255, 71, 87, 0.4); }
}

.gas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.gas-type {
  font-weight: 600;
  font-size: 15px;
}

.gas-level {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;
}

.gas-level.normal { background: rgba(0, 255, 136, 0.15); color: var(--accent-green); }
.gas-level.warning { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }
.gas-level.danger { background: rgba(255, 71, 87, 0.15); color: var(--accent-red); }

.gas-gauge {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.gauge-ring {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  padding: 8px;
}

.gauge-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.gauge-value {
  font-size: 24px;
  font-weight: 700;
}

.gauge-unit {
  font-size: 11px;
  color: var(--text-secondary);
}

.gauge-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.gas-bar {
  margin-bottom: 12px;
}

.bar-bg {
  height: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s;
}

.bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.gas-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}

.chart-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.chart-header h3 {
  font-size: 15px;
  margin: 0 0 12px;
}

.chart-container {
  height: 250px;
}

.device-status-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--accent-cyan);
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.dev-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.dev-icon.normal { background: rgba(0, 255, 136, 0.2); color: var(--accent-green); }
.dev-icon.warning { background: rgba(255, 215, 0, 0.2); color: var(--accent-yellow); }
.dev-icon.danger { background: rgba(255, 71, 87, 0.2); color: var(--accent-red); }
.dev-icon.offline { background: rgba(136, 153, 176, 0.2); color: var(--text-secondary); }

.dev-info {
  flex: 1;
}

.dev-name { font-size: 14px; }
.dev-meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

.dev-status {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 10px;
}

.dev-status.normal { background: rgba(0, 255, 136, 0.15); color: var(--accent-green); }
.dev-status.warning { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }
.dev-status.danger { background: rgba(255, 71, 87, 0.15); color: var(--accent-red); }
.dev-status.offline { background: rgba(136, 153, 176, 0.15); color: var(--text-secondary); }

.dev-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-cyan);
  min-width: 100px;
  text-align: right;
}
</style>
