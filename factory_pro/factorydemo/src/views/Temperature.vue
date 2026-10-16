<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">温湿度智能监控</h2>
      <div class="page-desc">
        实时监测生产环境温湿度（DHT11，精度±2℃/±5%RH）
        <el-tag v-if="!connected" type="info" size="small" style="margin-left:8px">等待硬件数据…</el-tag>
        <el-tag v-else type="success" size="small" style="margin-left:8px">实时连接中</el-tag>
      </div>
    </div>

    <div class="monitor-grid">
      <div class="monitor-card" :class="{ alert: currentTemp > 30 }">
        <div class="card-header">
          <h3>车间A · 实时温度</h3>
          <el-tag :type="getZoneStatus(currentTemp, currentHumi)" effect="dark">{{ getZoneStatusText(currentTemp, currentHumi) }}</el-tag>
        </div>
        <div class="sensor-display">
          <div class="sensor-item temp">
            <div class="sensor-ring" :style="getTempRingStyle(currentTemp)">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
                <circle cx="50" cy="50" r="45" fill="none" :stroke="getTempColor(currentTemp)" stroke-width="4"
                  :stroke-dasharray="`${getTempPercent(currentTemp) * 283} 283`" stroke-linecap="round" transform="rotate(-90 50 50)"/>
              </svg>
              <div class="sensor-value">{{ currentTemp.toFixed(1) }}°C</div>
              <div class="sensor-label">温度</div>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <span>设备: DHT11</span>
          <span>更新: {{ fmtTime(latest?.timestamp) }}</span>
        </div>
      </div>

      <div class="monitor-card" :class="{ alert: currentHumi > 70 }">
        <div class="card-header">
          <h3>车间A · 实时湿度</h3>
          <el-tag :type="currentHumi > 70 ? 'danger' : 'success'" effect="dark">{{ currentHumi > 70 ? '潮湿' : '适宜' }}</el-tag>
        </div>
        <div class="sensor-display">
          <div class="sensor-item humid">
            <div class="sensor-ring" :style="getHumidRingStyle(currentHumi)">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
                <circle cx="50" cy="50" r="45" fill="none" :stroke="getHumidColor(currentHumi)" stroke-width="4"
                  :stroke-dasharray="`${currentHumi * 2.83} 283`" stroke-linecap="round" transform="rotate(-90 50 50)"/>
              </svg>
              <div class="sensor-value">{{ currentHumi.toFixed(1) }}%</div>
              <div class="sensor-label">湿度</div>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <span>设备: DHT11</span>
          <span>更新: {{ fmtTime(latest?.timestamp) }}</span>
        </div>
      </div>

      <div class="monitor-card">
        <div class="card-header">
          <h3>今日最高温</h3>
          <el-tag type="warning" effect="plain">统计</el-tag>
        </div>
        <div class="stat-value warm">{{ todayMaxTemp.toFixed(1) }}°C</div>
        <div class="stat-sub">出现在 {{ todayMaxTime }}</div>
        <div class="card-footer">
          <span>基于今日全部读数</span>
        </div>
      </div>

      <div class="monitor-card">
        <div class="card-header">
          <h3>今日最低湿</h3>
          <el-tag type="info" effect="plain">统计</el-tag>
        </div>
        <div class="stat-value cool">{{ todayMinHumi.toFixed(1) }}%</div>
        <div class="stat-sub">出现在 {{ todayMinTime }}</div>
        <div class="card-footer">
          <span>基于今日全部读数</span>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>24小时温湿度趋势</h3>
        </div>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>近1小时 vs 前1小时均值对比</h3>
        </div>
        <div ref="compareChartRef" class="chart-container"></div>
      </div>
    </div>

    <div class="control-section">
      <h3>实时数据流（最近 8 帧，2 秒/帧）</h3>
      <el-table :data="recentRows" size="small" style="width: 100%" max-height="280">
        <el-table-column prop="time" label="时间" width="110" />
        <el-table-column prop="temp" label="温度(°C)" width="100" />
        <el-table-column prop="humi" label="湿度(%)" width="100" />
        <el-table-column prop="ldr" label="光照ADC" width="100" />
        <el-table-column prop="pir" label="人体红外" width="100" />
        <el-table-column prop="gas" label="MQ-5(ppm)" width="110" />
        <el-table-column prop="smoke" label="MQ-2(ppm)" width="110" />
        <el-table-column prop="light" label="照明" min-width="80" />
      </el-table>
      <div class="threshold-tips">
        后端告警阈值：温度 &gt; 45℃ 触发 warning；数据每 2 秒经 MQTT 网关上报，图表随真实数据实时滚动。
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useLatestSensor, useHistorySensor, fmtTime } from '../utils/useSensorData'

const trendChartRef = ref(null)
const compareChartRef = ref(null)
let trendChart = null
let compareChart = null

// ===== 真实数据源 =====
const { latest, connected } = useLatestSensor()
const { history } = useHistorySensor(500)

const currentTemp = computed(() => latest.value?.temp ?? 0)
const currentHumi = computed(() => latest.value?.humi ?? 0)

// 今日统计（基于已缓冲的历史帧；若需全天统计可调大 limit）
const todayMaxTemp = computed(() => history.value.length ? Math.max(...history.value.map(r => r.temp || 0)) : 0)
const todayMaxTime = computed(() => {
  if (!history.value.length) return '--'
  const row = history.value.reduce((a, b) => ((b.temp || 0) > (a.temp || 0) ? b : a))
  return fmtTime(row.timestamp)
})
const todayMinHumi = computed(() => history.value.length ? Math.min(...history.value.map(r => r.humi ?? 100)) : 0)
const todayMinTime = computed(() => {
  if (!history.value.length) return '--'
  const row = history.value.reduce((a, b) => ((b.humi ?? 100) < (a.humi ?? 100) ? b : a))
  return fmtTime(row.timestamp)
})

// 实时数据流（最近 8 帧）
const recentRows = computed(() => history.value.slice(-8).reverse().map(r => ({
  time: fmtTime(r.timestamp),
  temp: (r.temp ?? 0).toFixed(1),
  humi: (r.humi ?? 0).toFixed(1),
  ldr: r.ldrAdc ?? '--',
  pir: r.pir === 1 ? '有人' : '无人',
  gas: r.mq5Ppm ?? '--',
  smoke: r.mq2Ppm ?? '--',
  light: r.lightOn === 1 ? '开' : '关',
})))

function getTempPercent(t) {
  return Math.min(t / 50, 1)
}

function getTempRingStyle(t) {
  return {
    background: `conic-gradient(${getTempColor(t)} ${getTempPercent(t) * 360}deg, rgba(255,255,255,0.05) 0deg)`
  }
}

function getHumidRingStyle(h) {
  return {
    background: `conic-gradient(${getHumidColor(h)} ${h * 3.6}deg, rgba(255,255,255,0.05) 0deg)`
  }
}

function getTempColor(t) {
  if (t > 30) return '#ff4757'
  if (t > 25) return '#ff9500'
  return '#00d4ff'
}

function getHumidColor(h) {
  if (h > 70) return '#ff4757'
  if (h > 55) return '#ff9500'
  return '#00ff88'
}

function getZoneStatus(t, h) {
  if (t > 30 || h > 70) return 'danger'
  if (t > 28 || h > 60) return 'warning'
  return 'success'
}

function getZoneStatusText(t, h) {
  const s = getZoneStatus(t, h)
  return { danger: '报警', warning: '注意', success: '正常' }[s]
}

function initCharts() {
  if (!trendChartRef.value || !compareChartRef.value) return
  trendChart = echarts.init(trendChartRef.value)
  compareChart = echarts.init(compareChartRef.value)

  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['温度', '湿度'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: [
      { type: 'value', name: '温度(°C)', min: (v) => Math.floor(v.min - 2), max: (v) => Math.ceil(v.max + 2), axisLine: { lineStyle: { color: '#ff9500' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
      { type: 'value', name: '湿度(%)', min: (v) => Math.floor(v.min - 5), max: (v) => Math.ceil(v.max + 5), axisLine: { lineStyle: { color: '#00d4ff' } }, axisLabel: { color: '#8899b0' }, splitLine: { show: false } }
    ],
    series: [
      { name: '温度', type: 'line', smooth: true, showSymbol: false, data: [], itemStyle: { color: '#ff9500' }, areaStyle: { color: 'rgba(255,149,0,0.2)' } },
      { name: '湿度', type: 'line', smooth: true, yAxisIndex: 1, showSymbol: false, data: [], itemStyle: { color: '#00d4ff' }, areaStyle: { color: 'rgba(0,212,255,0.2)' } }
    ]
  })

  compareChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['近1小时均值', '前1小时均值'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: ['温度(°C)', '湿度(%)'], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: '近1小时均值', type: 'bar', data: [0, 0], itemStyle: { color: '#00d4ff' }, barWidth: '30%' },
      { name: '前1小时均值', type: 'bar', data: [0, 0], itemStyle: { color: '#8899b0' }, barWidth: '30%' }
    ]
  })
}

// 历史数据变化 → 刷新图表（真实数据驱动）
watch(history, (rows) => {
  if (!trendChart || !compareChart || !rows.length) return

  trendChart.setOption({
    xAxis: { data: rows.map(r => fmtTime(r.timestamp)) },
    series: [
      { name: '温度', data: rows.map(r => +(r.temp ?? 0).toFixed(1)) },
      { name: '湿度', data: rows.map(r => +(r.humi ?? 0).toFixed(1)) }
    ]
  })

  // 近1小时 vs 前1小时均值
  const now = Date.now()
  const split = rows.filter(r => {
    const t = new Date(r.timestamp).getTime()
    return !isNaN(t)
  })
  const recent = split.filter(r => now - new Date(r.timestamp).getTime() <= 3600_000)
  const prev = split.filter(r => now - new Date(r.timestamp).getTime() > 3600_000)
  const avg = (arr, key) => arr.length ? +(arr.reduce((s, r) => s + (r[key] ?? 0), 0) / arr.length).toFixed(1) : 0
  compareChart.setOption({
    series: [
      { name: '近1小时均值', data: [avg(recent, 'temp'), avg(recent, 'humi')] },
      { name: '前1小时均值', data: [avg(prev, 'temp'), avg(prev, 'humi')] }
    ]
  })
}, { deep: true })

function handleResize() {
  trendChart?.resize()
  compareChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  compareChart?.dispose()
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

.monitor-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.monitor-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s;
}

.monitor-card.alert {
  border-color: var(--accent-red);
  box-shadow: 0 0 20px rgba(255, 71, 87, 0.2);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h3 {
  font-size: 15px;
  margin: 0;
}

.sensor-display {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 12px;
}

.sensor-ring {
  position: relative;
  width: 100px;
  height: 100px;
}

.sensor-ring svg {
  width: 100%;
  height: 100%;
}

.sensor-value {
  position: absolute;
  top: 38px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.sensor-label {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 40px;
  font-weight: 700;
  text-align: center;
  padding: 18px 0 6px;
}

.stat-value.warm { color: #ff9500; }
.stat-value.cool { color: #00d4ff; }

.stat-sub {
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.threshold-tips {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.control-section h3 {
  font-size: 15px;
  margin: 0 0 12px;
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

.control-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.control-card h3 {
  font-size: 15px;
  margin: 0 0 16px;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.unit {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 8px;
}
</style>
