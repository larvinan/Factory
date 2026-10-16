<template>
  <div class="dashboard-screen">
    <!-- 顶部标题栏 -->
    <header class="screen-header">
      <div class="header-left">
        <span class="header-tag">● LIVE</span>
        <span class="header-time">{{ currentTime }}</span>
      </div>
      <h1 class="screen-title">
        <span class="title-line"></span>
        智慧工厂安全监测控制平台
        <span class="title-sub">数据可视化大屏</span>
        <span class="title-line"></span>
      </h1>
      <div class="header-right">
        <span class="header-info">节点总数 {{ tempHumidNodes.length + gasNodes.length }}</span>
        <button class="refresh-btn" @click="refreshData">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: refreshing }"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          刷新
        </button>
      </div>
    </header>

    <!-- KPI 指标卡 -->
    <section class="kpi-row">
      <div class="kpi-card" v-for="k in kpiCards" :key="k.title">
        <div class="kpi-icon" :style="{ color: k.color }" v-html="k.icon"></div>
        <div class="kpi-body">
          <div class="kpi-value" :style="{ color: k.color }">{{ k.value }}</div>
          <div class="kpi-title">{{ k.title }}</div>
        </div>
        <div class="kpi-ring" :style="{ background: `conic-gradient(${k.color} ${k.percent * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }">
          <span>{{ k.percent }}%</span>
        </div>
      </div>
    </section>

    <!-- 三栏主体 -->
    <main class="screen-body">
      <!-- 左栏 -->
      <div class="col col-left">
        <!-- 温湿度传感器节点 -->
        <div class="panel">
          <div class="panel-title">
            <span class="panel-dot"></span>温湿度传感器节点
            <span class="panel-extra">共 {{ tempHumidNodes.length }} 个节点</span>
          </div>
          <div class="sensor-grid">
            <div class="sensor-node" v-for="n in tempHumidNodes" :key="n.id" :class="n.status">
              <div class="node-head">
                <span class="node-id">{{ n.id }}</span>
                <span class="node-status" :class="n.status">{{ statusText(n.status) }}</span>
              </div>
              <div class="node-name">{{ n.name }}</div>
              <div class="node-desc" :title="n.desc">{{ n.desc }}</div>
              <div class="node-vals">
                <div class="node-val temp">
                  <span class="nv-label">温度</span>
                  <span class="nv-num" :class="tempClass(n.temp)">{{ n.temp }}°C</span>
                </div>
                <div class="node-val humid">
                  <span class="nv-label">湿度</span>
                  <span class="nv-num" :class="humidClass(n.humid)">{{ n.humid }}%</span>
                </div>
              </div>
              <div class="node-loc">{{ n.location }}</div>
            </div>
          </div>
        </div>

        <!-- 温湿度趋势 -->
        <div class="panel flex-1">
          <div class="panel-title">
            <span class="panel-dot"></span>环境温湿度趋势
            <span class="panel-extra">24小时</span>
          </div>
          <div ref="trendChartRef" class="chart-box"></div>
        </div>
      </div>

      <!-- 中栏 -->
      <div class="col col-center">
        <!-- 综合环境趋势 -->
        <div class="panel flex-1">
          <div class="panel-title">
            <span class="panel-dot"></span>综合环境趋势分析
            <span class="panel-extra">温度 / 湿度 / CO 浓度</span>
          </div>
          <div ref="envChartRef" class="chart-box"></div>
        </div>

        <!-- 设备状态分布 -->
        <div class="panel">
          <div class="panel-title">
            <span class="panel-dot"></span>设备状态分布
            <span class="panel-extra">共 {{ realTotal }} 台设备</span>
          </div>
          <div class="device-dist">
            <div ref="deviceChartRef" class="device-chart"></div>
            <div class="device-legend">
              <div class="legend-item" v-for="d in deviceDist" :key="d.name">
                <span class="legend-dot" :style="{ background: d.color }"></span>
                <span class="legend-name">{{ d.name }}</span>
                <span class="legend-count">{{ d.value }} 台</span>
                <span class="legend-pct" :style="{ color: d.color }">{{ d.percent }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="col col-right">
        <!-- 气体浓度监测（雷达图，非柱状图） -->
        <div class="panel">
          <div class="panel-title">
            <span class="panel-dot"></span>气体浓度监测
            <span class="panel-extra">雷达图</span>
          </div>
          <div ref="gasRadarRef" class="chart-box gas-radar"></div>
          <div class="gas-rings">
            <div class="gas-ring-item" v-for="g in gasNodes" :key="g.id">
              <div class="gring" :style="{ background: `conic-gradient(${gasColor(g.type)} ${gasPercent(g) * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }">
                <div class="gring-inner">
                  <div class="gring-val" :style="{ color: gasColor(g.type) }">{{ g.value }}</div>
                  <div class="gring-unit">{{ g.unit }}</div>
                </div>
              </div>
              <div class="gring-info">
                <div class="gring-name">{{ g.id }} {{ g.name.split('-')[0] }}</div>
                <div class="gring-loc">{{ g.location }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- AGV 运行状态（示意数据：AGV 硬件暂未接入，接入后替换为真实数据源） -->
        <div class="panel">
          <div class="panel-title">
            <span class="panel-dot"></span>AGV 运行状态
            <span class="panel-extra">{{ agvStatus.active }}/{{ agvStatus.total }} 运行中</span>
          </div>
          <div class="agv-grid">
            <div class="agv-card" v-for="(b, i) in agvStatus.battery" :key="i" :class="agvClass(b)">
              <div class="agv-id">AGV-0{{ i + 1 }}</div>
              <div class="agv-battery">
                <div class="battery-fill" :style="{ width: b + '%', background: batteryColor(b) }"></div>
              </div>
              <div class="agv-percent" :style="{ color: batteryColor(b) }">{{ b }}%</div>
            </div>
          </div>
        </div>

        <!-- 实时告警 -->
        <div class="panel flex-1">
          <div class="panel-title">
            <span class="panel-dot"></span>实时告警
            <router-link to="/alarm" class="panel-extra view-all">全部 →</router-link>
          </div>
          <div class="alarm-list">
            <div class="alarm-item" v-for="a in recentAlarms" :key="a.id" :class="a.level">
              <div class="alarm-badge">{{ levelText(a.level) }}</div>
              <div class="alarm-body">
                <div class="alarm-msg">{{ a.message }}</div>
                <div class="alarm-meta">{{ a.location }} · {{ a.time }}</div>
              </div>
              <div class="alarm-state" v-if="a.resolved">已处理</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDeviceStore } from '../stores/device'
import { useHistorySensor, fmtTime } from '../utils/useSensorData'
import api from '../utils/request'

const deviceStore = useDeviceStore()
const { tempHumidNodes, gasNodes, agvStatus } = deviceStore

const trendChartRef = ref(null)
const envChartRef = ref(null)
const deviceChartRef = ref(null)
const gasRadarRef = ref(null)

let trendChart = null
let envChart = null
let deviceChart = null
let gasRadar = null

const currentTime = ref('')
const refreshing = ref(false)

const recentAlarms = computed(() => deviceStore.alarms.slice(0, 6))

const kpiCards = computed(() => [
  {
    title: '在线设备',
    value: `${realOnline.value}/${realTotal.value}`,
    percent: realTotal.value ? Math.round(realOnline.value / realTotal.value * 100) : 0,
    color: '#00d4ff',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
  },
  {
    title: '平均温度',
    value: `${deviceStore.temperature.toFixed(1)}°C`,
    percent: Math.min(100, Math.round(deviceStore.temperature / 40 * 100)),
    color: '#ff9500',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></svg>'
  },
  {
    title: '平均湿度',
    value: `${deviceStore.humidity}%`,
    percent: deviceStore.humidity,
    color: '#00ff88',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>'
  },
  {
    title: '活跃告警',
    value: deviceStore.alarmCount,
    percent: Math.min(100, deviceStore.alarmCount * 20),
    color: '#ff4757',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
  }
])

// ===== 真实设备统计（/api/devices 档案，10 台真实硬件）=====
const realDevices = ref([])
async function loadRealDevices() {
  try {
    const res = await api.get('/devices')
    if (res.status === 'ok' && Array.isArray(res.data)) realDevices.value = res.data
  } catch (e) { /* 后端未启动时保持空 */ }
}

const realOnline = computed(() => realDevices.value.filter(d => d.online === 1).length)
const realTotal = computed(() => realDevices.value.length)

const deviceDist = computed(() => {
  const total = realTotal.value
  const online = realOnline.value
  const offline = total - online
  const list = [
    { name: '在线', value: online, color: '#00ff88' },
    { name: '离线', value: offline, color: '#ff4757' }
  ].filter(d => d.value > 0)
  return list.map(d => ({ ...d, percent: total ? ((d.value / total) * 100).toFixed(1) : 0 }))
})

function statusText(s) { return { online: '正常', warning: '注意', danger: '告警' }[s] || s }
function tempClass(t) { return t > 30 ? 'danger' : t > 26 ? 'warning' : 'ok' }
function humidClass(h) { return h > 70 ? 'danger' : h > 60 ? 'warning' : 'ok' }
function levelText(l) { return { critical: '严重', warning: '警告', info: '信息' }[l] || l }

function gasColor(type) {
  return { CO: '#ff4757', smoke: '#ff9500', VOC: '#a855f7', CO2: '#00d4ff' }[type] || '#8899b0'
}
function gasPercent(g) { return Math.min(100, Math.round((g.value / g.threshold) * 100)) }

function agvClass(b) { return b < 30 ? 'low' : b < 60 ? 'mid' : 'high' }
function batteryColor(b) { return b < 30 ? '#ff4757' : b < 60 ? '#ff9500' : '#00ff88' }

function updateTime() {
  const n = new Date()
  const p = (x) => String(x).padStart(2, '0')
  currentTime.value = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`
}

function initCharts() {
  const axisCommon = {
    axisLine: { lineStyle: { color: 'rgba(136,153,176,0.4)' } },
    axisLabel: { color: '#8899b0', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(136,153,176,0.12)' } }
  }
  const tooltip = {
    backgroundColor: 'rgba(10,25,41,0.92)',
    borderColor: 'rgba(0,212,255,0.4)',
    textStyle: { color: '#e0f0ff', fontSize: 12 }
  }

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

  // 温湿度趋势
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value)
    trendChart.setOption({
      tooltip: { ...tooltip, trigger: 'axis' },
      legend: { data: ['温度(°C)', '湿度(%)'], top: 0, right: 10, textStyle: { color: '#8899b0', fontSize: 11 } },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '18%', containLabel: true },
      xAxis: { type: 'category', data: hours, ...axisCommon },
      yAxis: { type: 'value', ...axisCommon },
      series: [
        {
          name: '温度(°C)', type: 'line', smooth: true, symbol: 'none',
          data: [],
          itemStyle: { color: '#ff9500' },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,149,0,0.4)' }, { offset: 1, color: 'rgba(255,149,0,0.02)' }]) },
          lineStyle: { width: 2 }
        },
        {
          name: '湿度(%)', type: 'line', smooth: true, symbol: 'none',
          data: [],
          itemStyle: { color: '#00d4ff' },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0,212,255,0.4)' }, { offset: 1, color: 'rgba(0,212,255,0.02)' }]) },
          lineStyle: { width: 2 }
        }
      ]
    })
  }

  // 综合环境趋势
  if (envChartRef.value) {
    envChart = echarts.init(envChartRef.value)
    envChart.setOption({
      tooltip: { ...tooltip, trigger: 'axis' },
      legend: { data: ['温度', '湿度', 'CO浓度'], top: 0, right: 10, textStyle: { color: '#8899b0', fontSize: 11 } },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '18%', containLabel: true },
      xAxis: { type: 'category', data: hours, ...axisCommon },
      yAxis: { type: 'value', ...axisCommon },
      series: [
        { name: '温度', type: 'line', smooth: true, symbol: 'none', data: [], itemStyle: { color: '#ff9500' }, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(255,149,0,0.15)' } },
        { name: '湿度', type: 'line', smooth: true, symbol: 'none', data: [], itemStyle: { color: '#00d4ff' }, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(0,212,255,0.15)' } },
        { name: 'CO浓度', type: 'line', smooth: true, symbol: 'none', data: [], itemStyle: { color: '#ff4757' }, lineStyle: { width: 2, type: 'dashed' }, areaStyle: { color: 'rgba(255,71,87,0.1)' } }
      ]
    })
  }

  // 设备状态分布（环形饼图 + 百分比）
  if (deviceChartRef.value) {
    deviceChart = echarts.init(deviceChartRef.value)
    deviceChart.setOption({
      tooltip: { ...tooltip, trigger: 'item', formatter: '{b}: {c}台 ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#0a1929', borderWidth: 2 },
        label: {
          show: true,
          color: '#e0f0ff',
          fontSize: 12,
          formatter: '{b}\n{d}%'
        },
        labelLine: { lineStyle: { color: 'rgba(136,153,176,0.5)' } },
        data: deviceDist.value.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } }))
      }]
    })
  }

  // 气体浓度雷达图（非柱状图）
  if (gasRadarRef.value) {
    gasRadar = echarts.init(gasRadarRef.value)
    gasRadar.setOption({
      tooltip: { ...tooltip, trigger: 'item' },
      radar: {
        indicator: gasNodes.map(g => ({
          name: `${g.id}\n${g.type}`,
          max: Math.ceil(g.threshold * 1.2)
        })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: { color: '#8899b0', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(0,212,255,0.2)' } },
        splitArea: { areaStyle: { color: ['rgba(0,212,255,0.02)', 'rgba(0,212,255,0.05)'] } },
        axisLine: { lineStyle: { color: 'rgba(0,212,255,0.25)' } }
      },
      series: [{
        type: 'radar',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#00d4ff' },
        itemStyle: { color: '#00d4ff' },
        areaStyle: { color: 'rgba(0,212,255,0.25)' },
        data: [{
          value: gasNodes.map(g => g.value),
          name: '当前浓度'
        }]
      }]
    })
  }
}

function refreshData() {
  refreshing.value = true
  updateCharts()
  setTimeout(() => { refreshing.value = false }, 600)
}

// 图表数据源：真实历史数据（useHistorySensor 内部含 WS 实时追加）
const { history: sensorHistory } = useHistorySensor(500)

function updateCharts() {
  const rows = sensorHistory.value
  if (!rows.length) return
  const labels = rows.map(r => fmtTime(r.timestamp))

  if (trendChart) {
    trendChart.setOption({
      xAxis: { data: labels },
      series: [
        { data: rows.map(r => +(r.temp ?? 0).toFixed(1)) },
        { data: rows.map(r => Math.round(r.humi ?? 0)) }
      ]
    })
  }
  if (envChart) {
    envChart.setOption({
      xAxis: { data: labels },
      series: [
        { data: rows.map(r => +(r.temp ?? 0).toFixed(1)) },
        { data: rows.map(r => Math.round(r.humi ?? 0)) },
        { data: rows.map(r => r.mq5Ppm ?? 0) }
      ]
    })
  }
  if (deviceChart) {
    deviceChart.setOption({
      series: [{ data: deviceDist.value.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })) }]
    })
  }
  if (gasRadar) {
    gasRadar.setOption({
      radar: {
        indicator: gasNodes.map(g => ({ name: `${g.id}\n${g.type}`, max: Math.ceil(g.threshold * 1.2) }))
      },
      series: [{ data: [{ value: gasNodes.map(g => g.value) }] }]
    })
  }
}

function handleResize() {
  trendChart?.resize()
  envChart?.resize()
  deviceChart?.resize()
  gasRadar?.resize()
}

let timeTimer = null
let dataTimer = null

onMounted(async () => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
  await nextTick()
  initCharts()
  loadRealDevices()
  window.addEventListener('resize', handleResize)
  // 设备在线状态随上报变化，定期刷新真实统计
  dataTimer = setInterval(() => {
    loadRealDevices()
    updateCharts()
  }, 10000)
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
  if (dataTimer) clearInterval(dataTimer)
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  envChart?.dispose()
  deviceChart?.dispose()
  gasRadar?.dispose()
})
</script>

<style scoped>
.dashboard-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px 14px 14px;
  gap: 10px;
  background: transparent;
  color: var(--text-primary);
}

/* 顶部标题 */
.screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  flex-shrink: 0;
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 220px;
}
.header-right { justify-content: flex-end; }
.header-tag {
  font-size: 12px;
  color: #00ff88;
  font-weight: 700;
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(0,255,136,0.6);
}
.header-time {
  font-family: Consolas, monospace;
  font-size: 13px;
  color: var(--accent-cyan);
  text-shadow: 0 0 6px rgba(0,212,255,0.4);
}
.header-info {
  font-size: 12px;
  color: var(--text-secondary);
}
.screen-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 3px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  text-shadow: 0 0 12px rgba(0,212,255,0.5);
}
.title-sub {
  font-size: 14px;
  color: var(--accent-cyan);
  letter-spacing: 2px;
  font-weight: 500;
}
.title-line {
  display: inline-block;
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan));
}
.title-line:last-child { background: linear-gradient(90deg, var(--accent-cyan), transparent); }
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(0,212,255,0.1);
  border: 1px solid var(--border-color);
  color: var(--accent-cyan);
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.refresh-btn:hover { background: rgba(0,212,255,0.2); }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* KPI 行 */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  flex-shrink: 0;
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}
.kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
}
.kpi-icon { flex-shrink: 0; }
.kpi-body { flex: 1; min-width: 0; }
.kpi-value { font-size: 22px; font-weight: 700; line-height: 1.1; }
.kpi-title { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.kpi-ring {
  width: 42px; height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kpi-ring span {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: var(--bg-card-solid);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 600;
}

/* 主体三栏 */
.screen-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.3fr 1fr;
  gap: 10px;
  min-height: 0;
}
.col { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.flex-1 { flex: 1; min-height: 0; }

/* 面板 */
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  flex-shrink: 0;
}
.panel-dot {
  width: 4px; height: 14px;
  background: var(--accent-cyan);
  border-radius: 2px;
  box-shadow: 0 0 6px var(--accent-cyan);
}
.panel-extra {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: normal;
}
.view-all { color: var(--accent-cyan); text-decoration: none; }
.view-all:hover { text-decoration: underline; }

/* 传感器节点网格 */
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  overflow-y: auto;
  max-height: 320px;
}
.sensor-node {
  border: 1px solid rgba(64,158,255,0.2);
  border-radius: 4px;
  padding: 6px 8px;
  background: rgba(10,25,41,0.5);
  transition: all 0.2s;
}
.sensor-node:hover { border-color: var(--accent-cyan); box-shadow: 0 0 8px rgba(0,212,255,0.2); }
.sensor-node.warning { border-color: rgba(255,149,0,0.5); }
.sensor-node.danger { border-color: rgba(255,71,87,0.6); box-shadow: 0 0 8px rgba(255,71,87,0.2); }
.node-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.node-id {
  font-family: Consolas, monospace;
  font-size: 11px;
  color: var(--accent-cyan);
  font-weight: 600;
}
.node-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(0,255,136,0.15);
  color: #00ff88;
}
.node-status.warning { background: rgba(255,149,0,0.15); color: #ff9500; }
.node-status.danger { background: rgba(255,71,87,0.15); color: #ff4757; }
.node-name { font-size: 12px; color: var(--text-primary); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-desc { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-vals { display: flex; gap: 10px; margin-top: 4px; }
.node-val { display: flex; flex-direction: column; }
.nv-label { font-size: 9px; color: var(--text-muted); }
.nv-num { font-size: 13px; font-weight: 700; font-family: Consolas, monospace; }
.nv-num.ok { color: var(--accent-green); }
.nv-num.warning { color: var(--accent-orange); }
.nv-num.danger { color: var(--accent-red); }
.node-loc { font-size: 10px; color: var(--text-secondary); margin-top: 2px; }

/* 图表容器 */
.chart-box { flex: 1; min-height: 0; width: 100%; }

/* 设备状态分布 */
.device-dist { display: flex; align-items: center; gap: 10px; flex: 1; min-height: 0; }
.device-chart { width: 50%; height: 100%; min-height: 160px; }
.device-legend { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.legend-item {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.legend-name { color: var(--text-primary); }
.legend-count { color: var(--text-secondary); }
.legend-pct { font-weight: 700; font-family: Consolas, monospace; }

/* 气体 */
.gas-radar { height: 180px; min-height: 180px; }
.gas-rings {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 6px;
}
.gas-ring-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.gring {
  width: 52px; height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gring-inner {
  width: 42px; height: 42px;
  border-radius: 50%;
  background: var(--bg-card-solid);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.gring-val { font-size: 12px; font-weight: 700; font-family: Consolas, monospace; line-height: 1; }
.gring-unit { font-size: 9px; color: var(--text-muted); margin-top: 1px; }
.gring-info { text-align: center; }
.gring-name { font-size: 10px; color: var(--text-primary); font-family: Consolas, monospace; }
.gring-loc { font-size: 9px; color: var(--text-muted); }

/* AGV */
.agv-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.agv-card {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 4px;
  text-align: center;
  background: rgba(10,25,41,0.5);
}
.agv-id { font-size: 11px; color: var(--text-secondary); font-family: Consolas, monospace; margin-bottom: 4px; }
.agv-battery {
  height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 3px;
}
.battery-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.agv-percent { font-size: 11px; font-weight: 700; font-family: Consolas, monospace; }

/* 告警 */
.alarm-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.alarm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(10,25,41,0.5);
  border-left: 3px solid;
}
.alarm-item.critical { border-color: var(--accent-red); }
.alarm-item.warning { border-color: var(--accent-orange); }
.alarm-item.info { border-color: var(--accent-cyan); }
.alarm-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  color: #fff;
  flex-shrink: 0;
}
.alarm-item.critical .alarm-badge { background: var(--accent-red); }
.alarm-item.warning .alarm-badge { background: var(--accent-orange); }
.alarm-item.info .alarm-badge { background: var(--accent-cyan); }
.alarm-body { flex: 1; min-width: 0; }
.alarm-msg { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alarm-meta { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.alarm-state { font-size: 10px; color: var(--accent-green); flex-shrink: 0; }

/* 滚动条 */
.sensor-grid::-webkit-scrollbar,
.alarm-list::-webkit-scrollbar { width: 4px; }
</style>
