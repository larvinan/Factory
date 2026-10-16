<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">货物感应计数</h2>
      <div class="page-desc">
        光电门自动计数（RAM 实时）+ Flash 持久化库存，每累计 100 件自动落盘
        <el-tag v-if="!connected" type="info" size="small" style="margin-left:8px">等待硬件数据…</el-tag>
        <el-tag v-else type="success" size="small" style="margin-left:8px">实时连接中</el-tag>
      </div>
    </div>

    <div class="counter-hero">
      <div class="hero-card main-counter">
        <div class="counter-display">
          <div class="counter-digits">
            <span v-for="(digit, i) in displayDigits" :key="i" class="digit" :class="{ highlight: i === displayDigits.length - 1 }">{{ digit }}</span>
          </div>
          <div class="counter-label">当前总计数（实时 RAM）</div>
        </div>
        <div class="counter-sub">
          <div class="sub-item">
            <span class="sub-value">{{ todayCount }}</span>
            <span class="sub-label">今日通过量</span>
          </div>
          <div class="sub-item">
            <span class="sub-value">{{ hourCount }}</span>
            <span class="sub-label">近1小时</span>
          </div>
          <div class="sub-item">
            <span class="sub-value">{{ avgRate }}/h</span>
            <span class="sub-label">平均速率</span>
          </div>
        </div>
      </div>

      <div class="hero-card production-line">
        <div class="panel-title">Flash 库存管理</div>
        <div class="stock-panel">
          <div class="stock-main">
            <span class="stock-num">{{ stock.toLocaleString() }}</span>
            <span class="stock-unit">件（Flash 持久化）</span>
          </div>
          <div class="stock-meta">
            <div>RAM 未落盘增量: <b>{{ pendingCount }}</b> 件（满 100 自动写入 Flash）</div>
            <div>掉电保护: 已落盘部分不丢失，未落盘最多丢 99 件</div>
          </div>
          <div class="stock-actions">
            <el-button type="warning" size="small" :disabled="!isAdmin" @click="openStockDialog">改写库存</el-button>
            <el-button type="danger" size="small" plain :disabled="!isAdmin" @click="resetStock">清零库存</el-button>
          </div>
          <div class="stock-tip" v-if="!isAdmin">库存改写为管理员操作（Flash 擦写寿命约 1 万次，请勿频繁调用）</div>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>实时计数曲线（真实数据）</h3>
        </div>
        <div ref="realTimeChartRef" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>每小时通过量统计</h3>
        </div>
        <div ref="compareChartRef" class="chart-container"></div>
      </div>
    </div>

    <div class="inventory-section">
      <div class="panel-title">当前库存状态</div>
      <div class="inventory-grid">
        <div class="inv-card">
          <div class="inv-header">
            <span class="inv-name">车间A · 传送带库存</span>
            <span class="inv-status" :class="stockStatus.cls">{{ stockStatus.text }}</span>
          </div>
          <div class="inv-value">{{ stock.toLocaleString() }} <span class="inv-unit">件</span></div>
          <div class="inv-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: stockPercent + '%', background: stockStatus.color }"></div>
            </div>
            <span class="inv-percent">{{ stockPercent }}%</span>
          </div>
          <div class="inv-meta">
            <span>容量上限: {{ stockMax.toLocaleString() }} 件</span>
            <span>更新: {{ fmtTime(latest?.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../utils/request'
import { useLatestSensor, useHistorySensor, fmtTime, DEVICE_ID } from '../utils/useSensorData'
import { useUserStore } from '../stores/user'

const realTimeChartRef = ref(null)
const compareChartRef = ref(null)
let realTimeChart = null
let compareChart = null

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

// ===== 真实数据源 =====
const { latest, connected } = useLatestSensor()
const { history } = useHistorySensor(2000)   // 拉多一点用于小时聚合

const count = computed(() => latest.value?.count ?? 0)
const stock = computed(() => latest.value?.stock ?? 0)
const pendingCount = computed(() => Math.max(0, count.value - stock.value))

const displayDigits = computed(() => String(count.value).padStart(6, '0').split(''))

// 今日通过量：今日首帧到最新帧的 count 差
const todayCount = computed(() => {
  if (history.value.length < 2) return 0
  const todayStr = new Date().toDateString()
  const todayRows = history.value.filter(r => new Date(r.timestamp).toDateString() === todayStr)
  if (!todayRows.length) return 0
  return Math.max(0, (todayRows[todayRows.length - 1].count ?? 0) - (todayRows[0].count ?? 0))
})

// 近1小时增量
const hourCount = computed(() => {
  if (!history.value.length) return 0
  const now = Date.now()
  const hourRows = history.value.filter(r => now - new Date(r.timestamp).getTime() <= 3600_000)
  if (hourRows.length < 2) return 0
  return Math.max(0, (hourRows[hourRows.length - 1].count ?? 0) - (hourRows[0].count ?? 0))
})

// 平均速率：近1小时增量即 /h
const avgRate = computed(() => hourCount.value)

// 库存状态（按 1000 件容量展示）
const stockMax = 1000
const stockPercent = computed(() => Math.min(100, Math.round(stock.value / stockMax * 100)))
const stockStatus = computed(() => {
  if (stockPercent.value >= 80) return { cls: 'warning', text: '偏高', color: '#ffd700' }
  if (stock.value <= 10) return { cls: 'low', text: '库存低', color: '#ff4757' }
  return { cls: 'normal', text: '正常', color: '#00ff88' }
})

// ===== 库存管理操作（下行 stock / stock_reset，Flash 擦写需谨慎）=====
function openStockDialog() {
  ElMessageBox.prompt('将把硬件 Flash 中的库存改写为该值（同时 RAM 计数同步设置）。Flash 擦写寿命约 1 万次，仅限管理员确认操作。', '改写库存', {
    confirmButtonText: '确认改写',
    cancelButtonText: '取消',
    inputPattern: /^\d+$/,
    inputErrorMessage: '请输入 0~65535 的整数',
    inputPlaceholder: '例如 500',
  }).then(async ({ value }) => {
    const val = parseInt(value, 10)
    if (val < 0 || val > 65535) { ElMessage.error('取值范围 0~65535'); return }
    const res = await api.post(`/control/${DEVICE_ID}/stock`, { val, reason: '管理员改写库存' })
    if (res.status === 'ok') ElMessage.success(`库存改写命令已下发（${res.request_id}）`)
    else ElMessage.error(res.message || '下发失败')
  }).catch(() => {})
}

function resetStock() {
  ElMessageBox.confirm('确定将 Flash 库存清零吗？该操作会整页擦写 Flash（寿命约 1 万次）。', '清零库存', {
    confirmButtonText: '确认清零',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    const res = await api.post(`/control/${DEVICE_ID}/stock_reset`, { reason: '管理员清零库存' })
    if (res.status === 'ok') ElMessage.success(`清零命令已下发（${res.request_id}）`)
    else ElMessage.error(res.message || '下发失败')
  }).catch(() => {})
}

function initCharts() {
  if (!realTimeChartRef.value || !compareChartRef.value) return

  realTimeChart = echarts.init(realTimeChartRef.value)
  compareChart = echarts.init(compareChartRef.value)

  realTimeChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', name: '累计计数', axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [{
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: [],
      itemStyle: { color: '#a855f7' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(168,85,247,0.4)' }, { offset: 1, color: 'rgba(168,85,247,0)' }]) },
      lineStyle: { width: 2 },
      markPoint: { data: [{ type: 'max', name: '峰值' }] }
    }]
  })

  compareChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', name: '通过量(件)', axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [{
      type: 'bar',
      data: [],
      itemStyle: { color: '#00d4ff' },
      barWidth: '50%'
    }]
  })
}

// 每小时通过量聚合（真实 history 计算：每小时内 count 差）
function hourlyThroughput(rows) {
  const buckets = new Map()
  for (const r of rows) {
    const d = new Date(r.timestamp)
    if (isNaN(d.getTime())) continue
    const key = `${String(d.getHours()).padStart(2, '0')}:00`
    if (!buckets.has(key)) buckets.set(key, { first: r.count ?? 0, last: r.count ?? 0 })
    const b = buckets.get(key)
    b.last = r.count ?? 0
  }
  const keys = [...buckets.keys()].sort()
  return { keys, values: keys.map(k => Math.max(0, buckets.get(k).last - buckets.get(k).first)) }
}

watch(history, (rows) => {
  if (!realTimeChart || !compareChart || !rows.length) return

  realTimeChart.setOption({
    xAxis: { data: rows.map(r => fmtTime(r.timestamp)) },
    series: [{ data: rows.map(r => r.count ?? 0) }]
  })

  const { keys, values } = hourlyThroughput(rows)
  compareChart.setOption({ xAxis: { data: keys }, series: [{ data: values }] })
}, { deep: true })

function handleResize() {
  realTimeChart?.resize()
  compareChart?.resize()
}

onMounted(async () => {
  await nextTick()
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  realTimeChart?.dispose()
  compareChart?.dispose()
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

.stock-panel { display:flex; flex-direction:column; gap:12px; height:100%%; }
.stock-main { display:flex; align-items:baseline; gap:10px; }
.stock-num { font-size:42px; font-weight:700; color:#00d4ff; }
.stock-unit { font-size:13px; color:var(--text-secondary); }
.stock-meta { font-size:12px; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px; }
.stock-actions { display:flex; gap:10px; margin-top:auto; }
.stock-tip { font-size:11px; color:var(--text-secondary); }

.counter-hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.hero-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
}

.main-counter {
  text-align: center;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(0, 212, 255, 0.1));
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.counter-display { margin-bottom: 24px; }

.counter-digits {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 8px;
}

.digit {
  width: 48px;
  height: 64px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--accent-cyan);
  font-family: 'Consolas', monospace;
  transition: all 0.3s;
}

.digit.highlight {
  color: var(--accent-green);
  border-color: var(--accent-green);
  box-shadow: 0 0 15px rgba(0, 255, 136, 0.3);
}

.counter-label {
  font-size: 14px;
  color: var(--text-secondary);
  letter-spacing: 2px;
}

.counter-sub {
  display: flex;
  justify-content: center;
  gap: 30px;
}

.sub-item { text-align: center; }

.sub-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.sub-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.production-line .panel-title { color: var(--accent-cyan); }

.lines { display: flex; flex-direction: column; gap: 10px; }

.line-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border-left: 3px solid var(--text-secondary);
  transition: all 0.3s;
}

.line-item.running {
  border-left-color: var(--accent-green);
  background: rgba(0, 255, 136, 0.05);
}

.line-visual {
  width: 80px;
  position: relative;
}

.line-belt {
  height: 24px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  overflow: hidden;
}

.belt-marker {
  width: 4px;
  height: 12px;
  background: var(--accent-cyan);
  border-radius: 1px;
}

.line-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.2), transparent);
  animation: beltGlow 2s linear infinite;
}

@keyframes beltGlow {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.line-info { flex: 1; }
.line-name { font-size: 13px; }
.line-count { font-size: 16px; font-weight: 600; color: var(--accent-cyan); }
.line-status { font-size: 11px; color: var(--text-secondary); }
.line-status.running { color: var(--accent-green); }
.line-rate { font-size: 14px; font-weight: 600; color: var(--accent-orange); }

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

.chart-header h3 { font-size: 15px; margin: 0 0 12px; }
.chart-container { height: 250px; }

.inventory-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.inv-card {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  padding: 14px;
}

.inv-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.inv-name { font-size: 14px; font-weight: 500; }

.inv-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.inv-status.normal { background: rgba(0, 255, 136, 0.15); color: var(--accent-green); }
.inv-status.warning { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }
.inv-status.low { background: rgba(255, 71, 87, 0.15); color: var(--accent-red); }

.inv-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.inv-unit { font-size: 14px; color: var(--text-secondary); font-weight: 400; }

.inv-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s;
}

.inv-percent { font-size: 13px; min-width: 40px; text-align: right; }

.inv-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
