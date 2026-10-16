<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">告警中心</h2>
      <div class="page-desc">
        集中管理所有安全监测告警（实时推送 · 参考 Prometheus Alertmanager / Uptime Kuma 的告警中心设计）
        <el-tag type="success" size="small" effect="plain" style="margin-left:8px">
          <span class="live-dot"></span> 实时连接
        </el-tag>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="alarm-stats">
      <div class="stat-card critical" :class="{ active: filterLevel.length === 1 && filterLevel[0] === 'critical' }" @click="quickFilterLevel('critical')">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ criticalCount }}</div>
          <div class="stat-label">严重告警</div>
        </div>
      </div>
      <div class="stat-card warning" :class="{ active: filterLevel.length === 1 && filterLevel[0] === 'warning' }" @click="quickFilterLevel('warning')">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ warningCount }}</div>
          <div class="stat-label">警告</div>
        </div>
      </div>
      <div class="stat-card info" :class="{ active: filterLevel.length === 1 && filterLevel[0] === 'info' }" @click="quickFilterLevel('info')">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ infoCount }}</div>
          <div class="stat-label">信息提示</div>
        </div>
      </div>
      <div class="stat-card resolved">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ resolvedCount }}</div>
          <div class="stat-label">已处理</div>
        </div>
      </div>
    </div>

    <!-- 趋势与分布（真实数据聚合） -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">24 小时告警趋势（按小时）</div>
        <div ref="trendChartRef" class="chart-box"></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">告警类型分布</div>
        <div ref="pieChartRef" class="chart-box"></div>
      </div>
    </div>

    <div class="alarm-main">
      <div class="filter-panel">
        <div class="panel-title">筛选条件</div>
        <div class="filter-group">
          <span class="filter-label">告警级别</span>
          <el-select v-model="filterLevel" multiple placeholder="全部级别" @change="selectAll = false">
            <el-option label="严重" value="critical" />
            <el-option label="警告" value="warning" />
            <el-option label="信息" value="info" />
          </el-select>
        </div>
        <div class="filter-group">
          <span class="filter-label">告警类型</span>
          <el-select v-model="filterType" placeholder="全部类型">
            <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </div>
        <div class="filter-group">
          <span class="filter-label">状态</span>
          <el-radio-group v-model="filterStatus">
            <el-radio value="all">全部</el-radio>
            <el-radio value="pending">待处理</el-radio>
            <el-radio value="resolved">已处理</el-radio>
          </el-radio-group>
        </div>
        <div class="filter-group">
          <span class="filter-label">时间范围</span>
          <el-date-picker v-model="dateRange" type="datetimerange" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" teleported style="width: 100%;" />
        </div>
        <div class="filter-actions">
          <el-button @click="resetFilter">重置</el-button>
        </div>
        <div class="filter-tip">筛选条件实时生效，无需手动应用；数据经 WebSocket 实时推送更新</div>
      </div>

      <div class="alarm-list-panel">
        <div class="panel-header">
          <div class="panel-title">
            <el-radio-group v-model="viewMode" size="small" style="margin-right:12px">
              <el-radio-button value="list">列表</el-radio-button>
              <el-radio-button value="timeline">时间线</el-radio-button>
            </el-radio-group>
            <span v-if="viewMode === 'list'">告警列表 ({{ filteredAlarms.length }})</span>
            <span v-else>时间线 ({{ filteredAlarms.length }})</span>
          </div>
          <div class="panel-actions">
            <el-button type="success" :icon="CheckCircle" :disabled="selectedAlarms.length === 0" :loading="batchLoading" @click="batchResolve">
              批量处理{{ selectedAlarms.length ? `(${selectedAlarms.length})` : '' }}
            </el-button>
            <el-button :icon="Download" @click="exportCsv">导出报告</el-button>
          </div>
        </div>

        <!-- 列表视图 -->
        <div v-if="viewMode === 'list'" class="alarm-table">
          <div class="table-header">
            <el-checkbox v-model="selectAll" @change="toggleSelectAll" />
            <span class="col-level">级别</span>
            <span class="col-type">类型</span>
            <span class="col-message">告警信息</span>
            <span class="col-location">位置</span>
            <span class="col-time">时间</span>
            <span class="col-status">状态</span>
            <span class="col-action">操作</span>
          </div>
          <div class="table-body">
            <div v-for="alarm in filteredAlarms" :key="alarm.id" class="table-row" :class="[alarm.level, { resolved: alarm.resolved }]">
              <el-checkbox :model-value="selectedAlarms.includes(alarm.id)" @change="toggleSelect(alarm.id)" :disabled="alarm.resolved" />
              <span class="col-level">
                <span class="level-badge" :class="alarm.level">{{ getLevelText(alarm.level) }}</span>
              </span>
              <span class="col-type">{{ TYPE_LABELS[alarm.type] || alarm.type }}</span>
              <span class="col-message">{{ alarm.message }}</span>
              <span class="col-location">{{ alarm.location }}</span>
              <span class="col-time">{{ alarm.time }}</span>
              <span class="col-status" :class="{ resolved: alarm.resolved }">{{ alarm.resolved ? '已处理' : '待处理' }}</span>
              <span class="col-action">
                <el-button v-if="!alarm.resolved" size="small" type="primary" @click="resolveAlarm(alarm.id)">处理</el-button>
                <el-button size="small" @click="openDetail(alarm)">详情</el-button>
              </span>
            </div>
            <div v-if="filteredAlarms.length === 0" class="empty-state">
              <span>暂无符合条件的告警记录</span>
            </div>
          </div>
        </div>

        <!-- 时间线视图 -->
        <div v-else class="timeline-view">
          <div v-for="group in timelineGroups" :key="group.date" class="tl-group">
            <div class="tl-date">
              <span class="tl-date-badge">{{ group.date }}</span>
              <span class="tl-date-count">{{ group.items.length }} 条</span>
            </div>
            <div class="tl-items">
              <div v-for="alarm in group.items" :key="alarm.id" class="tl-item" :class="alarm.level" @click="openDetail(alarm)">
                <div class="tl-dot"></div>
                <div class="tl-time">{{ alarm.time.slice(11) }}</div>
                <span class="level-badge" :class="alarm.level">{{ getLevelText(alarm.level) }}</span>
                <div class="tl-msg">{{ alarm.message }}</div>
                <span class="tl-status" :class="{ resolved: alarm.resolved }">{{ alarm.resolved ? '已处理' : '待处理' }}</span>
              </div>
            </div>
          </div>
          <div v-if="filteredAlarms.length === 0" class="empty-state">
            <span>暂无符合条件的告警记录</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 告警详情抽屉 -->
    <el-drawer v-model="detailVisible" title="告警详情" size="420px">
      <template v-if="detailAlarm">
        <div class="detail-level">
          <span class="level-badge big" :class="detailAlarm.level">{{ getLevelText(detailAlarm.level) }}</span>
          <span class="detail-status" :class="{ resolved: detailAlarm.resolved }">{{ detailAlarm.resolved ? '已处理' : '待处理' }}</span>
        </div>
        <el-descriptions :column="1" border style="margin-top:16px">
          <el-descriptions-item label="告警信息">{{ detailAlarm.message }}</el-descriptions-item>
          <el-descriptions-item label="告警类型">{{ TYPE_LABELS[detailAlarm.type] || detailAlarm.type }}</el-descriptions-item>
          <el-descriptions-item label="来源设备">{{ detailAlarm.location }}</el-descriptions-item>
          <el-descriptions-item label="发生时间">{{ detailAlarm.time }}</el-descriptions-item>
          <el-descriptions-item label="告警编号">#{{ detailAlarm.id }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-actions" v-if="!detailAlarm.resolved">
          <el-button type="primary" @click="resolveAlarm(detailAlarm.id); detailVisible = false">标记为已处理</el-button>
        </div>
        <div class="detail-tip">
          处理动作会同步到后端数据库（handled 字段），所有连接的客户端实时可见。
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()

const filterLevel = ref([])
const filterType = ref('')
const filterStatus = ref('all')
const dateRange = ref(null)
const selectAll = ref(false)
const selectedAlarms = ref([])
const viewMode = ref('list')
const batchLoading = ref(false)
const detailVisible = ref(false)
const detailAlarm = ref(null)

const CheckCircle = { name: 'CheckCircle' }
const Download = { name: 'Download' }

const TYPE_LABELS = {
  temperature: '温度', humidity: '湿度', gas: '气体', smoke: '烟雾',
  agv: 'AGV', device: '设备', video: '视觉', other: '其他',
}

const criticalCount = computed(() => deviceStore.alarms.filter(a => a.level === 'critical' && !a.resolved).length)
const warningCount = computed(() => deviceStore.alarms.filter(a => a.level === 'warning' && !a.resolved).length)
const infoCount = computed(() => deviceStore.alarms.filter(a => a.level === 'info' && !a.resolved).length)
const resolvedCount = computed(() => deviceStore.alarms.filter(a => a.resolved).length)

const filteredAlarms = computed(() => {
  return deviceStore.alarms.filter(a => {
    if (filterLevel.value.length > 0 && !filterLevel.value.includes(a.level)) return false
    if (filterType.value && a.type !== filterType.value) return false
    if (filterStatus.value === 'pending' && a.resolved) return false
    if (filterStatus.value === 'resolved' && !a.resolved) return false
    if (dateRange.value && dateRange.value.length === 2) {
      const t = new Date(a.time.replace('-', '/')).getTime()
      const [from, to] = dateRange.value
      if (t < new Date(from).getTime() || t > new Date(to).getTime()) return false
    }
    return true
  })
})

// 时间线视图：按日期分组（组内按时间倒序）
const timelineGroups = computed(() => {
  const groups = new Map()
  for (const a of filteredAlarms.value) {
    const date = a.time.slice(0, 10)
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(a)
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }))
})

function quickFilterLevel(level) {
  filterLevel.value = filterLevel.value.length === 1 && filterLevel.value[0] === level ? [] : [level]
}

function getLevelText(level) {
  return { critical: '严重', warning: '警告', info: '信息' }[level] || level
}

function toggleSelectAll(val) {
  if (val) {
    selectedAlarms.value = filteredAlarms.value.filter(a => !a.resolved).map(a => a.id)
  } else {
    selectedAlarms.value = []
  }
}

function toggleSelect(id) {
  const idx = selectedAlarms.value.indexOf(id)
  if (idx > -1) selectedAlarms.value.splice(idx, 1)
  else selectedAlarms.value.push(id)
}

function resolveAlarm(id) {
  deviceStore.resolveAlarm(id)
  selectedAlarms.value = selectedAlarms.value.filter(aid => aid !== id)
  ElMessage.success('告警已标记为已处理')
}

function batchResolve() {
  const count = selectedAlarms.value.length
  if (!count) return
  ElMessageBox.confirm(`确定将选中的 ${count} 条告警批量标记为已处理吗？`, '批量处理', {
    confirmButtonText: '确认处理', cancelButtonText: '取消', type: 'warning',
  }).then(() => {
    batchLoading.value = true
    let ok = 0
    // store.resolveAlarm 内部会异步同步后端，这里只做触发与反馈
    selectedAlarms.value.forEach(id => { deviceStore.resolveAlarm(id); ok++ })
    selectedAlarms.value = []
    selectAll.value = false
    setTimeout(() => {
      batchLoading.value = false
      ElMessage.success(`已批量处理 ${ok} 条告警`)
    }, 400)
  }).catch(() => {})
}

function openDetail(alarm) {
  detailAlarm.value = alarm
  detailVisible.value = true
}

function resetFilter() {
  filterLevel.value = []
  filterType.value = ''
  filterStatus.value = 'all'
  dateRange.value = null
}

function exportCsv() {
  const rows = [['编号', '级别', '类型', '告警信息', '来源设备', '时间', '状态']]
  filteredAlarms.value.forEach(a => {
    rows.push([a.id, getLevelText(a.level), TYPE_LABELS[a.type] || a.type, a.message, a.location, a.time, a.resolved ? '已处理' : '待处理'])
  })
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `alarms-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${filteredAlarms.value.length} 条告警`)
}

// ===== 图表（真实告警聚合）=====
const trendChartRef = ref(null)
const pieChartRef = ref(null)
let trendChart = null
let pieChart = null

function initCharts() {
  if (!trendChartRef.value || !pieChartRef.value) return
  trendChart = echarts.init(trendChartRef.value)
  pieChart = echarts.init(pieChartRef.value)

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
    xAxis: { type: 'category', data: hours, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', minInterval: 1, axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.15)' } } },
    series: [{
      type: 'bar', data: Array(24).fill(0), itemStyle: { color: '#ff4757' }, barWidth: '55%',
    }]
  })

  pieChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { bottom: 0, textStyle: { color: '#8899b0', fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['42%', '66%'], center: ['50%', '44%'],
      itemStyle: { borderRadius: 6, borderColor: '#0a1628', borderWidth: 2 },
      label: { color: '#8899b0', fontSize: 11 },
      data: [{ value: 1, name: '暂无告警', itemStyle: { color: '#334' } }]
    }]
  })
}

function refreshCharts() {
  const alarms = deviceStore.alarms

  // 24 小时趋势（按小时聚合真实告警时间）
  if (trendChart) {
    const counts = Array(24).fill(0)
    for (const a of alarms) {
      const h = parseInt(a.time.slice(11, 13), 10)
      if (!isNaN(h) && h >= 0 && h < 24) counts[h]++
    }
    trendChart.setOption({ series: [{ data: counts }] })
  }

  // 类型分布
  if (pieChart) {
    const counts = {}
    for (const a of alarms) {
      const k = TYPE_LABELS[a.type] || a.type
      counts[k] = (counts[k] || 0) + 1
    }
    const palette = ['#ff4757', '#ff9500', '#00d4ff', '#a855f7', '#00ff88', '#ffd700', '#ff6bd6', '#8899b0']
    const data = Object.entries(counts).map(([name, value], i) => ({
      name, value, itemStyle: { color: palette[i % palette.length] }
    }))
    pieChart.setOption({
      series: [{ data: data.length ? data : [{ value: 1, name: '暂无告警', itemStyle: { color: '#334' } } ] }]
    })
  }
}

function handleResize() {
  trendChart?.resize()
  pieChart?.resize()
}

watch(() => deviceStore.alarms.length, () => {
  nextTick(refreshCharts)
})

onMounted(async () => {
  await nextTick()
  initCharts()
  refreshCharts()
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
  padding: 20px;
  min-height: 100%;
}

.page-header { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
.page-desc { font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; }

.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #00ff88;
  margin-right: 4px;
  animation: live-blink 1.6s ease-in-out infinite;
}
@keyframes live-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

.alarm-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.stat-card:hover { transform: translateY(-2px); border-color: rgba(0, 212, 255, 0.4); }
.stat-card.active { border-color: #00d4ff; box-shadow: 0 0 14px rgba(0, 212, 255, 0.15); }

.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
}

.stat-card.critical::before { background: var(--accent-red); }
.stat-card.warning::before { background: var(--accent-orange); }
.stat-card.info::before { background: var(--accent-cyan); }
.stat-card.resolved::before { background: var(--accent-green); }

.stat-icon {
  width: 50px; height: 50px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.stat-card.critical .stat-icon { background: rgba(255, 71, 87, 0.2); color: var(--accent-red); }
.stat-card.warning .stat-icon { background: rgba(255, 149, 0, 0.2); color: var(--accent-orange); }
.stat-card.info .stat-icon { background: rgba(0, 212, 255, 0.2); color: var(--accent-cyan); }
.stat-card.resolved .stat-icon { background: rgba(0, 255, 136, 0.2); color: var(--accent-green); }

.stat-value { font-size: 32px; font-weight: 700; }
.stat-label { font-size: 13px; color: var(--text-secondary); }

.charts-row {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.chart-title { font-size: 14px; font-weight: 600; color: var(--accent-cyan); margin-bottom: 8px; }
.chart-box { height: 190px; }

.alarm-main {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
}

.filter-panel, .alarm-list-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  overflow: visible;
}

.filter-panel { position: relative; z-index: 1; }

.panel-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--accent-cyan);
  display: flex;
  align-items: center;
}

.filter-group { margin-bottom: 16px; }

.filter-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.filter-actions { display: flex; gap: 10px; }
.filter-tip { font-size: 11px; color: var(--text-secondary); line-height: 1.6; margin-top: 12px; }

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}

.panel-header .panel-title { margin-bottom: 0; }
.panel-actions { display: flex; gap: 10px; }

.alarm-table { overflow-x: auto; }

.table-header, .table-row {
  display: grid;
  grid-template-columns: 40px 80px 80px 2fr 110px 160px 80px 140px;
  gap: 10px;
  padding: 12px 10px;
  align-items: center;
}

.table-header {
  background: rgba(0, 212, 255, 0.1);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  position: sticky;
  top: 0;
}

.table-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 460px;
  overflow-y: auto;
}

.table-row {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.table-row:hover { background: rgba(0, 0, 0, 0.35); }
.table-row.critical { border-left-color: var(--accent-red); }
.table-row.warning { border-left-color: var(--accent-orange); }
.table-row.info { border-left-color: var(--accent-cyan); }
.table-row.resolved { opacity: 0.6; }

.level-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  text-align: center;
}

.level-badge.big { font-size: 13px; padding: 5px 14px; }
.level-badge.critical { background: rgba(255, 71, 87, 0.2); color: var(--accent-red); }
.level-badge.warning { background: rgba(255, 149, 0, 0.2); color: var(--accent-orange); }
.level-badge.info { background: rgba(0, 212, 255, 0.2); color: var(--accent-cyan); }

.col-status { font-size: 12px; color: var(--accent-orange); }
.col-status.resolved { color: var(--accent-green); }
.col-action { display: flex; gap: 6px; }

/* 时间线视图 */
.timeline-view { max-height: 520px; overflow-y: auto; padding: 4px 2px; }

.tl-group { margin-bottom: 18px; }

.tl-date {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.tl-date-badge {
  background: rgba(0, 212, 255, 0.12);
  color: var(--accent-cyan);
  font-size: 12px;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 10px;
}

.tl-date-count { font-size: 12px; color: var(--text-secondary); }

.tl-items { display: flex; flex-direction: column; gap: 6px; }

.tl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.2s;
  border-left: 3px solid transparent;
}

.tl-item:hover { background: rgba(0, 0, 0, 0.35); }
.tl-item.critical { border-left-color: var(--accent-red); }
.tl-item.warning { border-left-color: var(--accent-orange); }
.tl-item.info { border-left-color: var(--accent-cyan); }

.tl-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.tl-item.critical .tl-dot { background: var(--accent-red); }
.tl-item.warning .tl-dot { background: var(--accent-orange); }
.tl-item.info .tl-dot { background: var(--accent-cyan); }

.tl-time { font-size: 12px; color: var(--text-secondary); font-family: monospace; }
.tl-msg { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-status { font-size: 12px; color: var(--accent-orange); flex-shrink: 0; }
.tl-status.resolved { color: var(--accent-green); }

.empty-state { text-align: center; padding: 40px; color: var(--text-secondary); }

/* 详情抽屉 */
.detail-level { display: flex; align-items: center; gap: 12px; }
.detail-status { font-size: 13px; color: var(--accent-orange); }
.detail-status.resolved { color: var(--accent-green); }
.detail-actions { margin-top: 18px; }
.detail-tip { margin-top: 14px; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
</style>
