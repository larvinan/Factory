<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">数据报表</h2>
      <div class="page-desc">统计分析工厂安全监测数据，生成可视化报表</div>
    </div>

    <div class="report-toolbar">
      <div class="report-range">
        <span>报表周期:</span>
        <el-date-picker v-model="reportDate" type="month" placeholder="选择月份" />
      </div>
      <div class="report-actions">
        <el-radio-group v-model="reportType">
          <el-radio value="overview">总览</el-radio>
          <el-radio value="temperature">温湿度</el-radio>
          <el-radio value="gas">气体</el-radio>
          <el-radio value="device">设备</el-radio>
        </el-radio-group>
        <el-button type="primary" :icon="Download">导出报表</el-button>
      </div>
    </div>

    <div class="report-content">
      <div class="summary-section">
        <div class="summary-card" v-for="item in summaryData" :key="item.label">
          <div class="summary-icon" :style="{ background: item.bg }" v-html="item.icon"></div>
          <div class="summary-info">
            <div class="summary-value" :style="{ color: item.color }">{{ item.value }}</div>
            <div class="summary-label">{{ item.label }}</div>
            <div v-if="item.delta !== 0" class="summary-delta" :class="item.delta > 0 ? 'up' : 'down'">
              {{ item.delta > 0 ? '↑' : '↓' }} {{ Math.abs(item.delta) }}% 较上月
            </div>
          </div>
        </div>
      </div>

      <div class="chart-grid">
        <div class="chart-card wide">
          <div class="chart-header">
            <h3>今日告警趋势（按小时）</h3>
          </div>
          <div ref="trendChartRef" class="chart-container"></div>
        </div>
      </div>

      <div class="chart-grid two-col">
        <div class="chart-card">
          <div class="chart-header">
            <h3>告警类型分布</h3>
          </div>
          <div ref="pieChartRef" class="chart-container"></div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>今日每小时货物通过量</h3>
          </div>
          <div ref="areaChartRef" class="chart-container"></div>
        </div>
      </div>

      <div class="chart-grid two-col">
        <div class="chart-card">
          <div class="chart-header">
            <h3>今日温度变化</h3>
          </div>
          <div ref="deviceChartRef" class="chart-container"></div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>今日湿度变化</h3>
          </div>
          <div ref="responseChartRef" class="chart-container"></div>
        </div>
      </div>

      <div class="report-table-section">
        <div class="chart-header">
          <h3>详细告警记录</h3>
          <el-button type="primary" link>查看全部 →</el-button>
        </div>
        <el-table :data="reportAlarms" style="width: 100%" :header-cell-style="{ background: 'rgba(0, 212, 255, 0.1)', color: '#8899b0', borderBottom: '1px solid rgba(0, 200, 255, 0.2)' }">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="level" label="级别" width="100">
            <template #default="{ row }">
              <el-tag :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'" size="small">
                {{ getLevelText(row.level) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">{{ getTypeText(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="message" label="告警信息" />
          <el-table-column prop="location" label="位置" width="120" />
          <el-table-column prop="time" label="发生时间" width="180" />
          <el-table-column prop="resolved" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.resolved ? 'success' : 'warning'" size="small">
                {{ row.resolved ? '已处理' : '待处理' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { useDeviceStore } from '../stores/device'
import api from '../utils/request'
import { useHistorySensor, fmtTime } from '../utils/useSensorData'

const deviceStore = useDeviceStore()

const reportDate = ref(new Date())
const reportType = ref('overview')
const Download = { name: 'Download' }

const trendChartRef = ref(null)
const pieChartRef = ref(null)
const areaChartRef = ref(null)
const deviceChartRef = ref(null)
const responseChartRef = ref(null)

let trendChart = null, pieChart = null, areaChart = null, deviceChart = null, responseChart = null

// ===== 真实数据源 =====
const backendAlarms = ref([])
const { history } = useHistorySensor(2000)

async function loadAlarms() {
  try {
    const res = await api.get('/alerts?limit=500')
    if (res.status === 'ok' && Array.isArray(res.data)) backendAlarms.value = res.data
  } catch (e) { /* 后端未启动 */ }
}

const todayAlarms = computed(() => {
  const todayStr = new Date().toDateString()
  return backendAlarms.value.filter(a => new Date(a.timestamp).toDateString() === todayStr)
})

const summaryData = computed(() => {
  const total = todayAlarms.value.length
  const handled = todayAlarms.value.filter(a => a.handled === 1).length
  const rate = total ? Math.round(handled / total * 100) : 100
  const typeText = { gas_leak: '可燃气', fire_smoke: '烟雾', temperature_high: '温度' }
  const topType = (() => {
    const counts = {}
    todayAlarms.value.forEach(a => { const k = typeText[a.alertType] || a.alertType; counts[k] = (counts[k] || 0) + 1 })
    const arr = Object.entries(counts).sort((x, y) => y[1] - x[1])
    return arr.length ? `${arr[0][0]} ${arr[0][1]}次` : '无'
  })()
  return [
    { label: '今日总告警数', value: String(total), color: '#ff4757', bg: 'linear-gradient(135deg, #ff4757, #cc0000)', icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>', delta: 0 },
    { label: '已处理', value: String(handled), color: '#00ff88', bg: 'linear-gradient(135deg, #00ff88, #009944)', icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>', delta: 0 },
    { label: '处理率', value: `${rate}%`, color: '#00d4ff', bg: 'linear-gradient(135deg, #00d4ff, #0066cc)', icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', delta: 0 },
    { label: '主要告警', value: topType, color: '#ffd700', bg: 'linear-gradient(135deg, #ffd700, #ff8c00)', icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', delta: 0 }
  ]
})

const reportAlarms = computed(() => deviceStore.alarms.slice(0, 10))

function getLevelText(level) {
  return { critical: '严重', warning: '警告', info: '信息' }[level] || level
}

function getTypeText(type) {
  return { temperature: '温度', humidity: '湿度', gas: '气体', smoke: '烟雾', agv: 'AGV', device: '设备', video: '视觉', other: '其他' }[type] || type
}

function initCharts() {
  if (!trendChartRef.value) return

  trendChart = echarts.init(trendChartRef.value)
  pieChart = echarts.init(pieChartRef.value)
  areaChart = echarts.init(areaChartRef.value)
  deviceChart = echarts.init(deviceChartRef.value)
  responseChart = echarts.init(responseChartRef.value)

  const empty24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['告警数', '已处理'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: empty24, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: '告警数', type: 'line', smooth: true, data: Array(24).fill(0), itemStyle: { color: '#ff4757' }, areaStyle: { color: 'rgba(255,71,87,0.15)' } },
      { name: '已处理', type: 'line', smooth: true, data: Array(24).fill(0), itemStyle: { color: '#00ff88' }, areaStyle: { color: 'rgba(0,255,136,0.15)' } }
    ]
  })

  pieChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { color: '#8899b0' } },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['35%', '50%'],
      itemStyle: { borderRadius: 6, borderColor: '#0a1628', borderWidth: 2 },
      label: { color: '#8899b0' },
      data: [{ value: 1, name: '暂无告警', itemStyle: { color: '#8899b0' } }]
    }]
  })

  areaChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: empty24, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [{
      type: 'bar',
      data: Array(24).fill(0),
      itemStyle: { color: '#00d4ff' },
      barWidth: '60%'
    }]
  })

  deviceChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', name: '°C', scale: true, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [{
      type: 'line', smooth: true, showSymbol: false, data: [],
      itemStyle: { color: '#ff9500' },
      areaStyle: { color: 'rgba(255,149,0,0.2)' }, lineStyle: { width: 2 }
    }]
  })

  responseChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', name: '%', scale: true, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [{
      type: 'line', smooth: true, showSymbol: false, data: [],
      itemStyle: { color: '#00d4ff' },
      areaStyle: { color: 'rgba(0,212,255,0.2)' }, lineStyle: { width: 2 }
    }]
  })
}

function refreshCharts() {
  const rows = history.value
  if (!rows.length) return

  // 今日告警按小时聚合
  const hours = Array.from({ length: 24 }, () => ({ total: 0, handled: 0 }))
  todayAlarms.value.forEach(a => {
    const h = new Date(a.timestamp).getHours()
    if (h >= 0 && h < 24) { hours[h].total++; if (a.handled === 1) hours[h].handled++ }
  })
  trendChart?.setOption({
    series: [
      { data: hours.map(h => h.total) },
      { data: hours.map(h => h.handled) }
    ]
  })

  // 告警类型分布
  const typeText = { gas_leak: '可燃气泄漏', fire_smoke: '烟雾超标', temperature_high: '温度过高', high_humidity: '湿度过高', device_offline: '设备离线' }
  const typeCounts = {}
  todayAlarms.value.forEach(a => {
    const k = typeText[a.alertType] || a.alertType
    typeCounts[k] = (typeCounts[k] || 0) + 1
  })
  const pieData = Object.entries(typeCounts).map(([name, value], i) => ({
    name, value,
    itemStyle: { color: ['#ff4757', '#ff9500', '#00d4ff', '#a855f7', '#00ff88'][i % 5] }
  }))
  pieChart?.setOption({
    series: [{ data: pieData.length ? pieData : [{ value: 1, name: '暂无告警', itemStyle: { color: '#8899b0' } }] }]
  })

  // 每小时通过量（count 差值）
  const buckets = new Map()
  rows.forEach(r => {
    const d = new Date(r.timestamp)
    if (isNaN(d.getTime())) return
    const key = d.getHours()
    if (!buckets.has(key)) buckets.set(key, { first: r.count ?? 0, last: r.count ?? 0 })
    const b = buckets.get(key)
    b.last = r.count ?? 0
  })
  const throughput = Array.from({ length: 24 }, (_, h) => {
    const b = buckets.get(h)
    return b ? Math.max(0, b.last - b.first) : 0
  })
  areaChart?.setOption({ series: [{ data: throughput }] })

  const labels = rows.map(r => fmtTime(r.timestamp))
  deviceChart?.setOption({ xAxis: { data: labels }, series: [{ data: rows.map(r => +(r.temp ?? 0).toFixed(1)) }] })
  responseChart?.setOption({ xAxis: { data: labels }, series: [{ data: rows.map(r => +(r.humi ?? 0).toFixed(1)) }] })
}

function exportCsv() {
  const rows = [['时间', '类型', '级别', '内容', '设备', '状态']]
  deviceStore.alarms.forEach(a => {
    rows.push([a.time, getTypeText(a.type), getLevelText(a.level), a.message, a.location, a.resolved ? '已处理' : '待处理'])
  })
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `factoryguard-report-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('报表已导出')
}

function handleResize() {
  trendChart?.resize()
  pieChart?.resize()
  areaChart?.resize()
  deviceChart?.resize()
  responseChart?.resize()
}

// 历史数据与告警均为异步加载，任一就绪后自动刷新图表
// （修复：原实现只在 onMounted 刷新一次，此时 history 尚未加载完成导致图表空白）
watch([history, backendAlarms], () => {
  refreshCharts()
}, { deep: true })

onMounted(async () => {
  await nextTick()
  initCharts()
  await loadAlarms()
  refreshCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  pieChart?.dispose()
  areaChart?.dispose()
  deviceChart?.dispose()
  responseChart?.dispose()
})
</script>

<style scoped>
.page-container {
  padding: 20px;
  min-height: 100%;
}

.page-header { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
.page-desc { font-size: 13px; color: var(--text-secondary); }

.report-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 20px;
  gap: 20px;
  flex-wrap: wrap;
}

.report-range { display: flex; align-items: center; gap: 10px; color: var(--text-secondary); }
.report-actions { display: flex; align-items: center; gap: 16px; }

.summary-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.summary-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.summary-delta {
  font-size: 12px;
  margin-top: 4px;
}

.summary-delta.up { color: var(--accent-green); }
.summary-delta.down { color: var(--accent-orange); }

.report-content { display: flex; flex-direction: column; gap: 20px; }

.chart-grid { display: grid; gap: 16px; }
.chart-grid.two-col { grid-template-columns: 1fr 1fr; }

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.chart-card.wide { min-height: 300px; }

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.chart-container { height: 250px; }

.report-table-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(0, 212, 255, 0.05);
  --el-table-border-color: rgba(0, 200, 255, 0.2);
  --el-table-text-color: #e0f0ff;
}
</style>
