<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">AGV避障系统</h2>
      <div class="page-desc">基于超声波雷达的实时障碍物检测与自动规避，保障厂区物料运输安全</div>
    </div>

    <div class="agv-main">
      <div class="fleet-panel">
        <div class="panel-title-row">
          <div class="panel-title">AGV车队状态</div>
          <button class="fleet-toggle" :class="{ off: !allRunning }" @click="toggleAll">
            {{ allRunning ? '⏸ 全部暂停' : '▶ 全部启动' }}
          </button>
        </div>
        <div class="agv-stats">
          <div class="stat-item">
            <div class="stat-icon online">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div class="stat-data">
              <div class="stat-value">{{ agvs.filter(a => a.status === 'working' && a.running !== false).length }}</div>
              <div class="stat-label">运行中</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon idle">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div class="stat-data">
              <div class="stat-value">{{ agvs.filter(a => a.status === 'idle').length }}</div>
              <div class="stat-label">待机</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon charging">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div class="stat-data">
              <div class="stat-value">{{ agvs.filter(a => a.status === 'charging').length }}</div>
              <div class="stat-label">充电中</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon warning">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            </div>
            <div class="stat-data">
              <div class="stat-value">{{ agvs.filter(a => a.obstacle).length }}</div>
              <div class="stat-label">避障中</div>
            </div>
          </div>
        </div>

        <div class="agv-list">
          <div v-for="agv in agvs" :key="agv.id" class="agv-card" :class="agv.status">
            <div class="agv-header">
              <div class="agv-id">{{ agv.id }}</div>
              <div class="agv-head-right">
                <span class="agv-status-tag" :class="agv.running === false ? 'paused' : agv.status">
                  {{ agv.running === false ? '已暂停' : getStatusText(agv.status) }}
                </span>
                <el-switch
                  v-if="agv.status === 'working'"
                  v-model="agv.running"
                  size="small"
                  :title="agv.running === false ? '启动：从暂停处继续行驶' : '暂停：原地停止'"
                />
              </div>
            </div>
            <div class="agv-body">
              <div class="agv-visual">
                <div class="agv-battery">
                  <div class="battery-shell">
                    <div class="battery-fill" :style="{ width: agv.battery + '%', background: getBatteryColor(agv.battery) }"></div>
                  </div>
                  <span class="battery-text">{{ agv.battery }}%</span>
                </div>
                <div class="agv-obstacle" v-if="agv.obstacle">
                  <div class="obstacle-warning">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>障碍距 {{ agv.obstacleDist }}m · {{ agv.avoidAction }}</span>
                  </div>
                </div>
                <div class="agv-path" v-else>
                  <div class="path-indicator"></div>
                  <span>前方无障碍 · 全速通行</span>
                </div>
              </div>
              <div class="agv-info">
                <div>位置: {{ agv.location }}</div>
                <div>速度: {{ agv.speed }} m/s</div>
                <div>任务: {{ agv.task }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="map-panel">
        <div class="panel-title">避障雷达监测</div>
        <div class="map-container">
          <div class="map-grid">
            <div class="grid-cell" v-for="n in 64" :key="n" :class="{ obstacle: obstacleCells.includes(n) }"></div>
          </div>
          <!-- 行驶轨迹（手绘黑线 1:1 还原）：AGV 自底部起点向上直行，
               前方出现障碍物时拐弯绕行（托盘→右绕 / 货架→左绕），抵达顶部终点 -->
          <svg class="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              :points="routePoints"
              fill="none"
              stroke="#00e676"
              stroke-width="0.7"
              stroke-dasharray="2.2 1.4"
              stroke-linejoin="round"
              opacity="0.85"
            />
            <!-- 起点（底部） / 终点（顶部） -->
            <circle :cx="routePath[0].x" :cy="routePath[0].y" r="1.1" fill="#00e676" />
            <text :x="routePath[0].x + 2.2" :y="routePath[0].y + 1" fill="#7de8b8" font-size="3">起</text>
            <circle :cx="routePath[routePath.length - 1].x" :cy="routePath[routePath.length - 1].y" r="1.1" fill="#4be1ff" />
            <text :x="routePath[routePath.length - 1].x + 2.2" :y="routePath[routePath.length - 1].y + 1" fill="#4be1ff" font-size="3">终</text>
            <!-- 行进方向箭头（自下而上） -->
            <polygon v-for="(a, i) in routeArrows" :key="'arr-' + i"
              points="0,-1.3 2.4,0 0,1.3" fill="#00e676" opacity="0.9"
              :transform="`translate(${a.x},${a.y}) rotate(${a.rot})`" />
            <!-- 遇障拐弯标注 -->
            <text v-for="(w, i) in turnWarnings" :key="'warn-' + i"
              :x="w.x" :y="w.y" fill="#ff8ba0" font-size="3.2">⚠ {{ w.text }}</text>
          </svg>
          <div class="zone-label zone-a">A厂</div>
          <div class="zone-label zone-b">B厂</div>
          <div class="zone-label zone-c">C厂</div>
          <div v-for="agv in agvs" :key="'marker-' + agv.id" class="agv-marker" :style="getMarkerStyle(agv)">
            <div class="radar-ring" :class="{ danger: agv.obstacle }" :style="{ width: detectDistance * 22 + 'px', height: detectDistance * 22 + 'px' }"></div>
            <!-- AGV 本体：顶视小车图标，车头随行驶方向旋转 -->
            <svg class="marker-car" :class="agv.status" :style="{ transform: `rotate(${agv.heading ?? 0}deg)` }" viewBox="0 0 24 24">
              <rect x="3.5" y="5" width="3" height="4.5" rx="1.2" fill="#0d1b2a"/>
              <rect x="17.5" y="5" width="3" height="4.5" rx="1.2" fill="#0d1b2a"/>
              <rect x="3.5" y="14.5" width="3" height="4.5" rx="1.2" fill="#0d1b2a"/>
              <rect x="17.5" y="14.5" width="3" height="4.5" rx="1.2" fill="#0d1b2a"/>
              <rect x="5" y="2" width="14" height="20" rx="4" class="car-body"/>
              <rect x="7" y="6.5" width="10" height="5" rx="1.5" fill="rgba(6,20,14,0.75)"/>
              <rect x="9" y="13.5" width="6" height="4" rx="1" fill="rgba(6,20,14,0.5)"/>
              <circle cx="8.5" cy="3.4" r="1" fill="#fffbe6"/>
              <circle cx="15.5" cy="3.4" r="1" fill="#fffbe6"/>
            </svg>
            <span class="marker-label">{{ agv.id }}</span>
          </div>
          <div v-for="obs in obstacles" :key="'obs-' + obs.id" class="obstacle-marker" :style="{ left: obs.x + '%', top: obs.y + '%' }">
            <div class="obs-icon">!</div>
            <span class="obs-label">{{ obs.label }}</span>
          </div>
        </div>
        <div class="legend-row">
          <div class="legend-item"><span class="legend-dot agv"></span>AGV本体</div>
          <div class="legend-item"><span class="legend-ring"></span>超声波探测范围</div>
          <div class="legend-item"><span class="legend-dot obstacle"></span>障碍物</div>
          <div class="legend-item"><span class="legend-dot charge"></span>充电站</div>
          <div class="legend-item"><span class="legend-path"></span>导航路径</div>
        </div>
      </div>
    </div>

    <div class="bottom-section">
      <div class="chart-card">
        <div class="chart-header">
          <h3>避障检测统计</h3>
        </div>
        <div ref="obstacleChartRef" class="chart-container"></div>
      </div>
      <div class="control-card">
        <div class="panel-title">避障参数配置</div>
        <div class="control-grid">
          <div class="control-item">
            <span class="control-label">超声波检测距离</span>
            <el-slider v-model="detectDistance" :min="0.5" :max="5" :step="0.5" />
            <span class="control-val">{{ detectDistance }} m</span>
          </div>
          <div class="control-item">
            <span class="control-label">制动响应时间</span>
            <el-slider v-model="responseSpeed" :min="1" :max="10" :step="1" />
            <span class="control-val">{{ responseSpeed }} ms</span>
          </div>
          <div class="control-item">
            <span class="control-label">自动避障</span>
            <el-switch v-model="autoAvoid" />
          </div>
          <div class="control-item">
            <span class="control-label">紧急制动</span>
            <el-switch v-model="emergencyBrake" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

const obstacleChartRef = ref(null)
let obstacleChart = null

const detectDistance = ref(2.5)
const responseSpeed = ref(5)
const autoAvoid = ref(true)
const emergencyBrake = ref(true)
const systemRunning = ref(true)   // 行驶总开关：关闭冻结车队位置，开启后沿原轨迹继续

// ===== 行驶轨迹（按手绘黑线 1:1 还原，坐标为地图百分比）=====
// 语义：AGV 自底部起点向上直行，前方出现障碍物（托盘/货架）时拐弯绕行，最终抵达顶部终点
const routePath = [
  { x: 27, y: 95 },  // 起点：底部
  { x: 28, y: 68 },  // ↑ 直行段1 —— 前方托盘(30,40)挡路 → 拐弯
  { x: 65, y: 65 },  // → 避障绕行段（向右绕过托盘）
  { x: 67, y: 33 },  // ↑ 直行段2 —— 前方货架(68,35)挡路 → 拐弯
  { x: 28, y: 36 },  // ← 避障绕行段（向左绕过货架）
  { x: 29, y: 5 },   // 终点：顶部
]
const routePoints = routePath.map(p => `${p.x},${p.y}`).join(' ')
// 各段中点的方向箭头（自下而上：↑90*3? rotate 角度：↑=-90 →0 ←180）
const routeArrows = [
  { x: 27.5, y: 81, rot: -90 },
  { x: 46.5, y: 66.5, rot: -4 },
  { x: 66, y: 49, rot: -92 },
  { x: 47.5, y: 34.5, rot: 184 },
  { x: 28.5, y: 20, rot: -90 },
]
// 遇障拐弯标注（拐点旁）
const turnWarnings = [
  { x: 13, y: 66, text: '遇障右绕' },
  { x: 49, y: 28.5, text: '遇障左绕' },
]
// 各段车头朝向（车头朝上为 0°：段2 右行 90°、段4 左行 270°）
const SEG_HEADING = [0, 90, 0, 270, 0]

// 折线长度表（用于按里程插值）
const segLens = []
let routeTotal = 0
for (let i = 0; i < routePath.length - 1; i++) {
  const len = Math.hypot(routePath[i + 1].x - routePath[i].x, routePath[i + 1].y - routePath[i].y)
  segLens.push(len)
  routeTotal += len
}
// 绕行段索引（0-based）：段2/段4 是因障碍物而拐弯的绕行段
const AVOID_SEGS = new Set([1, 3])
// 距拐点该距离(百分比)时开始「发现障碍物 · 减速」
const AHEAD_WARN_DIST = 8
function segInfoAt(dist) {
  let d = ((dist % routeTotal) + routeTotal) % routeTotal
  for (let i = 0; i < segLens.length; i++) {
    if (d <= segLens[i]) {
      return { seg: i, remain: segLens[i] - d }
    }
    d -= segLens[i]
  }
  return { seg: 0, remain: 0 }
}
function pointOnRoute(dist) {
  let d = ((dist % routeTotal) + routeTotal) % routeTotal
  for (let i = 0; i < segLens.length; i++) {
    if (d <= segLens[i]) {
      const t = d / segLens[i]
      return {
        x: routePath[i].x + (routePath[i + 1].x - routePath[i].x) * t,
        y: routePath[i].y + (routePath[i + 1].y - routePath[i].y) * t,
      }
    }
    d -= segLens[i]
  }
  return { ...routePath[routePath.length - 1] }
}

const agvs = ref([
  { id: 'AGV-01', status: 'working', running: true, battery: 85, location: 'C厂-仓储区', speed: 0.8, task: 'C厂 → A厂 上行运输', obstacle: false, obstacleDist: 0, avoidAction: '', routeDist: 0, cruiseSpeed: 0.8, driveRate: 5.5, heading: 0 },
  { id: 'AGV-02', status: 'working', running: true, battery: 72, location: 'C厂-仓储区', speed: 0.7, task: 'C厂 → A厂 上行运输', obstacle: false, obstacleDist: 0, avoidAction: '', routeDist: routeTotal * 0.18, cruiseSpeed: 0.7, driveRate: 4.5, heading: 0 },
  { id: 'AGV-03', status: 'charging', running: true, battery: 15, location: 'A厂-充电站', speed: 0, task: '充电中', obstacle: false, obstacleDist: 0, avoidAction: '', routeDist: null, cruiseSpeed: 0, driveRate: 0, posX: 8, posY: 88, heading: 0 },
  { id: 'AGV-04', status: 'idle', running: true, battery: 65, location: 'C厂-待命区', speed: 0, task: '等待任务', obstacle: false, obstacleDist: 0, avoidAction: '', routeDist: null, cruiseSpeed: 0, driveRate: 0, posX: 82, posY: 22, heading: 0 },
  { id: 'AGV-05', status: 'working', running: true, battery: 90, location: 'C厂-仓储区', speed: 1.0, task: 'C厂 → A厂 上行运输', obstacle: false, obstacleDist: 0, avoidAction: '', routeDist: routeTotal * 0.36, cruiseSpeed: 1.0, driveRate: 6.5, heading: 0 }
])

// ===== 启停控制：暂停后原地停止，重新开启后从暂停处继续沿轨迹行驶 =====
const allRunning = computed(() =>
  agvs.value.filter(a => a.status === 'working').every(a => a.running !== false)
)
function toggleAll() {
  const target = !allRunning.value
  agvs.value.forEach(a => { if (a.status === 'working') a.running = target })
}

// 红色禁行区：中央 2×2 货堆（格 28/29/36/37），路径沿其上下两侧绕行，不与导航线重叠
const obstacleCells = [28, 29, 36, 37]

const obstacles = [
  { id: 1, x: 30, y: 40, label: '托盘' },
  { id: 2, x: 52, y: 72, label: '人员' },
  { id: 3, x: 68, y: 35, label: '货架' },
  { id: 4, x: 40, y: 76, label: '料箱' }
]

// 地图 100% 宽 ≈ 40m：由百分比距离换算米数
const pctToMeter = (pct) => (pct * 0.4).toFixed(1)
// 按纵向位置显示所在厂区（自下而上：C → B → A）
function zoneOf(y) {
  if (y < 33) return 'A厂-总装区'
  if (y < 66) return 'B厂-测试区'
  return 'C厂-仓储区'
}

function getStatusText(status) {
  return { working: '运行中', idle: '待机', charging: '充电中', error: '故障' }[status] || status
}

function getBatteryColor(v) {
  if (v < 20) return '#ff4757'
  if (v < 50) return '#ffd700'
  return '#00ff88'
}

function getMarkerStyle(agv) {
  return {
    left: agv.posX + '%',
    top: agv.posY + '%'
  }
}

function initChart() {
  if (!obstacleChartRef.value) return
  obstacleChart = echarts.init(obstacleChartRef.value)

  obstacleChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,31,53,0.9)', borderColor: '#00d4ff', textStyle: { color: '#e0f0ff' } },
    legend: { data: ['避障触发', '成功规避'], textStyle: { color: '#8899b0' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#8899b0' } }, axisLabel: { color: '#8899b0' }, splitLine: { lineStyle: { color: 'rgba(136,153,176,0.2)' } } },
    series: [
      { name: '避障触发', type: 'line', smooth: true, data: [23, 31, 28, 35, 42, 28, 19], itemStyle: { color: '#ff9500' }, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(255,149,0,0.15)' }, symbolSize: 6 },
      { name: '成功规避', type: 'line', smooth: true, data: [22, 30, 27, 34, 41, 27, 18], itemStyle: { color: '#00ff88' }, lineStyle: { width: 2 }, areaStyle: { color: 'rgba(0,255,136,0.15)' }, symbolSize: 6 }
    ]
  })
}

function handleResize() {
  obstacleChart?.resize()
}

// ===== AGV 行驶动画（自下而上 · 遇障绕行状态机）=====
// 直行（全速）→ 前方拐点处有障碍物（减速预警）→ 拐弯绕行 → 恢复直行 → 抵达终点循环发车
let routeRaf = null
let lastTs = null
function tickRoute(ts) {
  routeRaf = requestAnimationFrame(tickRoute)
  if (lastTs == null) { lastTs = ts; return }
  const dt = Math.min((ts - lastTs) / 1000, 0.1)
  lastTs = ts
  // 检测半径（百分比空间）：detectDistance 米 → 地图百分比（用于障碍距离读数）
  const detectPct = (detectDistance.value / 40) * 100

  agvs.value.forEach(agv => {
    if (agv.status !== 'working' || agv.routeDist == null) return
    // 暂停：原地停止（保留 routeDist，重新开启后从暂停处继续）
    if (agv.running === false) {
      agv.speed = 0
      agv.obstacle = false
      return
    }
    agv.routeDist += agv.driveRate * dt
    const p = pointOnRoute(agv.routeDist)
    agv.posX = p.x
    agv.posY = p.y
    agv.location = zoneOf(agv.posY)

    // 三态状态机：直行 / 发现障碍减速 / 避障绕行
    const info = segInfoAt(agv.routeDist)
    agv.heading = SEG_HEADING[info.seg] ?? 0
    if (AVOID_SEGS.has(info.seg)) {
      // 正在绕行段：减速通过
      agv.obstacle = true
      agv.avoidAction = '避障绕行中'
      agv.speed = 0.3
    } else if (info.remain < AHEAD_WARN_DIST && AVOID_SEGS.has(info.seg + 1)) {
      // 直行段末端、下一拐弯因障碍物引起：预警减速
      agv.obstacle = true
      agv.avoidAction = '发现障碍 · 减速'
      agv.speed = 0.4
    } else {
      agv.obstacle = false
      agv.speed = agv.cruiseSpeed
    }
    // 障碍距离读数：几何最近障碍物
    let nearest = Infinity
    obstacles.forEach(o => {
      const d = Math.hypot(agv.posX - o.x, agv.posY - o.y)
      if (d < nearest) nearest = d
    })
    agv.obstacleDist = Math.min(pctToMeter(nearest), detectDistance.value)
  })
}

onMounted(async () => {
  await nextTick()
  initChart()
  window.addEventListener('resize', handleResize)
  routeRaf = requestAnimationFrame(tickRoute)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  obstacleChart?.dispose()
  if (routeRaf) cancelAnimationFrame(routeRaf)
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

.agv-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.fleet-panel, .map-panel {
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

/* 标题行（车队状态 + 全部启停总控） */
.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title-row .panel-title {
  margin-bottom: 0;
}

.fleet-toggle {
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px solid rgba(0, 255, 136, 0.45);
  background: rgba(0, 255, 136, 0.1);
  color: var(--accent-green);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
}

.fleet-toggle:hover { background: rgba(0, 255, 136, 0.2); }

.fleet-toggle.off {
  border-color: rgba(255, 149, 0, 0.5);
  background: rgba(255, 149, 0, 0.12);
  color: var(--accent-orange, #ff9500);
}

/* 卡片头部右侧：状态标签 + 独立启停开关 */
.agv-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agv-status-tag.paused {
  background: rgba(136, 153, 176, 0.18);
  color: #a9b8cc;
}

.agv-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-icon.online { background: rgba(0, 255, 136, 0.3); color: var(--accent-green); }
.stat-icon.idle { background: rgba(0, 212, 255, 0.3); color: var(--accent-cyan); }
.stat-icon.charging { background: rgba(255, 215, 0, 0.3); color: var(--accent-yellow); }
.stat-icon.warning { background: rgba(255, 149, 0, 0.3); color: var(--accent-orange); }

.stat-value {
  font-size: 20px;
  font-weight: 700;
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.agv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 340px;
  overflow-y: auto;
}

.agv-card {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  padding: 12px;
  border-left: 3px solid var(--accent-cyan);
  transition: all 0.3s;
}

.agv-card.charging { border-left-color: var(--accent-yellow); }
.agv-card.idle { border-left-color: var(--accent-cyan); }

.agv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.agv-id {
  font-weight: 600;
  font-size: 14px;
}

.agv-status-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

.agv-status-tag.working { background: rgba(0, 255, 136, 0.15); color: var(--accent-green); }
.agv-status-tag.idle { background: rgba(0, 212, 255, 0.15); color: var(--accent-cyan); }
.agv-status-tag.charging { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }

.agv-body {
  display: flex;
  gap: 14px;
}

.agv-visual {
  flex: 1;
}

.agv-battery {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.battery-shell {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.battery-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s;
}

.battery-text {
  font-size: 12px;
  min-width: 36px;
  text-align: right;
}

.obstacle-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-orange);
  padding: 4px 8px;
  background: rgba(255, 149, 0, 0.1);
  border-radius: 6px;
}

.agv-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-green);
}

.path-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}

.agv-info {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.map-container {
  position: relative;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  aspect-ratio: 1;
}

.grid-cell {
  background: rgba(0, 212, 255, 0.06);
  border-radius: 2px;
}

.grid-cell.obstacle {
  background: rgba(255, 71, 87, 0.35);
}

.zone-label {
  position: absolute;
  font-size: 11px;
  color: rgba(0, 212, 255, 0.5);
  font-weight: 600;
  letter-spacing: 1px;
  pointer-events: none;
}

.zone-a { top: 12px; left: 16px; }
.zone-b { top: 12px; right: 16px; }
.zone-c { bottom: 12px; right: 16px; }

.agv-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radar-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed rgba(0, 212, 255, 0.4);
  background: rgba(0, 212, 255, 0.05);
  pointer-events: none;
  animation: radarPulse 2s infinite;
}

.radar-ring.danger {
  border-color: rgba(255, 71, 87, 0.6);
  background: rgba(255, 71, 87, 0.1);
  animation: radarDanger 0.8s infinite;
}

@keyframes radarPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.08); }
}

@keyframes radarDanger {
  0%, 100% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.12); }
}

/* AGV 小车图标（顶视，车头朝上，随行驶方向旋转） */
.marker-car {
  width: 26px;
  height: 26px;
  z-index: 2;
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 0 5px rgba(0, 230, 118, 0.55));
}

.marker-car .car-body { fill: var(--accent-green); }
.marker-car.charging { filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.55)); }
.marker-car.charging .car-body { fill: var(--accent-yellow); }
.marker-car.idle { filter: drop-shadow(0 0 5px rgba(0, 212, 255, 0.55)); }
.marker-car.idle .car-body { fill: var(--accent-cyan); }

.marker-label {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  white-space: nowrap;
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 5px;
  border-radius: 3px;
}

.obstacle-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.obs-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-red);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 8px var(--accent-red);
  animation: obsBlink 1s infinite;
}

@keyframes obsBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.obs-label {
  position: absolute;
  top: 18px;
  font-size: 9px;
  color: var(--accent-red);
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 4px;
  border-radius: 3px;
}

.legend-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px dashed rgba(0, 212, 255, 0.6);
}

.legend-dot.agv { background: var(--accent-green); }
.legend-dot.obstacle { background: var(--accent-red); }
.legend-dot.charge { background: var(--accent-yellow); }
.legend-path {
  width: 18px;
  height: 0;
  border-top: 2px dashed var(--accent-green);
}

/* 巡检导航路径层（SVG 铺满地图，DOM 顺序位于 AGV 标记之下） */
.route-layer {
  position: absolute;
  inset: 10px;
  width: calc(100% - 20px);
  height: calc(100% - 20px);
  pointer-events: none;
}

.bottom-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-card, .control-card {
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
  height: 220px;
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.control-val {
  font-size: 12px;
  color: var(--accent-cyan);
  font-weight: 600;
}
</style>
