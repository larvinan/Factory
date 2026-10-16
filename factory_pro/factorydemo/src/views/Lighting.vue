<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">红外感应照明控制</h2>
      <div class="page-desc">
        人体红外（PIR）+ 光敏（LDR）感应控制继电器照明灯，支持远程开关与 RGB 状态指示
        <el-tag v-if="!connected" type="info" size="small" style="margin-left:8px">等待硬件数据…</el-tag>
        <el-tag v-else type="success" size="small" style="margin-left:8px">实时连接中</el-tag>
      </div>
    </div>

    <div class="lighting-main">
      <div class="realtime-panel">
        <div class="panel-title">实时感应状态</div>
        <div class="sensor-visual">
          <div class="radar-container">
            <div class="radar-ring" v-for="n in 4" :key="n" :style="{ animationDelay: n * 0.5 + 's' }"></div>
            <div class="radar-sweep"></div>
            <div class="sensor-center" :class="{ active: anyDetected }">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m6.96 6.96l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m6.96-6.96l4.24-4.24"/>
              </svg>
            </div>
            <div class="detection-points">
              <div v-for="(p, i) in detectionPoints" :key="i" class="detection-point" :style="{ left: p.x + '%', top: p.y + '%' }"></div>
            </div>
          </div>
          <div class="sensor-stats">
            <div class="stat-block">
              <div class="stat-num" :class="{ active: anyDetected }">{{ detectedCount }}</div>
              <div class="stat-label">人员在场 (PIR)</div>
            </div>
            <div class="stat-block">
              <div class="stat-num">{{ ldrAdc }}</div>
              <div class="stat-label">光照ADC</div>
            </div>
            <div class="stat-block">
              <div class="stat-num" :class="{ active: lightOn }">{{ lightOn ? 1 : 0 }}</div>
              <div class="stat-label">照明灯</div>
            </div>
            <div class="stat-block">
              <div class="stat-num">{{ rgbColorName }}</div>
              <div class="stat-label">RGB指示灯</div>
            </div>
          </div>
        </div>
        <div class="env-tip">
          自动照明逻辑（硬件内置）：pir=1 且 光照 ADC &gt; 2000（环境暗）→ 自动开灯。当前光照 ADC：{{ ldrAdc }} / 4095（{{ ldrDesc }}）
        </div>
      </div>

      <div class="control-panel">
        <div class="panel-title">照明与指示控制</div>
        <div class="control-list">
          <div class="control-item" :class="{ lit: lightOn }" key="relay-light">
            <div class="light-icon" :class="{ lit: lightOn }">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/>
              </svg>
            </div>
            <div class="light-info">
              <div class="light-name">车间A · 照明灯（继电器）</div>
              <div class="light-status">{{ lightOn ? '已点亮' : '已关闭' }}</div>
            </div>
            <el-switch :model-value="lightOn" :loading="cmdLoading" @change="sendRelay" />
          </div>
        </div>

        <div class="rgb-section">
          <div class="panel-title" style="margin-top:16px">RGB 状态指示灯</div>
          <div class="rgb-grid">
            <div v-for="c in rgbColors" :key="c.val" class="rgb-cell" :class="{ active: rgbColor === c.val }" @click="sendRgb(c.val)">
              <div class="rgb-dot" :style="{ background: c.css, boxShadow: rgbColor === c.val ? `0 0 12px ${c.css}` : 'none' }"></div>
              <span>{{ c.name }}</span>
            </div>
          </div>
        </div>

        <div class="beep-section">
          <div class="panel-title" style="margin-top:16px">蜂鸣器测试</div>
          <el-button size="small" type="warning" :loading="cmdLoading" @click="testBeep">蜂鸣 1 秒</el-button>
          <span class="beep-state">当前: {{ beepOn ? '响' : '静音' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../utils/request'
import { useLatestSensor, DEVICE_ID } from '../utils/useSensorData'

// ===== 真实数据源 =====
const { latest, connected } = useLatestSensor()

const lightOn = computed(() => latest.value?.lightOn === 1)
const pirOn = computed(() => latest.value?.pir === 1)
const ldrAdc = computed(() => latest.value?.ldrAdc ?? 0)
const rgbColor = computed(() => latest.value?.rgbColor ?? 0)
const beepOn = computed(() => latest.value?.beep === 1)

const detectedCount = computed(() => pirOn.value ? 1 : 0)
const anyDetected = computed(() => pirOn.value)
const ldrDesc = computed(() => ldrAdc.value > 2000 ? '环境较暗' : '光线充足')

// 雷达图上的感应点（真实 PIR 只有 0/1）
const detectionPoints = computed(() => {
  if (!pirOn.value) return []
  // 固定位置显示一个"检测到人员"标记，避免随机跳动感
  return [{ x: 48, y: 46 }]
})

const rgbColors = [
  { val: 0, name: '关', css: '#334' },
  { val: 1, name: '红', css: '#ff4757' },
  { val: 2, name: '绿', css: '#00ff88' },
  { val: 3, name: '黄', css: '#ffd700' },
  { val: 4, name: '蓝', css: '#00d4ff' },
  { val: 5, name: '品红', css: '#ff6bd6' },
  { val: 6, name: '青', css: '#00ffd0' },
  { val: 7, name: '白', css: '#ffffff' },
]
const rgbColorName = computed(() => rgbColors[rgbColor.value]?.name ?? '--')

const cmdLoading = ref(false)

async function sendRelay(val) {
  cmdLoading.value = true
  try {
    const res = await api.post(`/control/${DEVICE_ID}/relay`, { val: val ? 1 : 0, reason: '页面手动开关灯' })
    if (res.status === 'ok') ElMessage.success(val ? '开灯命令已下发' : '关灯命令已下发')
    else ElMessage.error(res.message || '下发失败')
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  cmdLoading.value = false
}

async function sendRgb(val) {
  try {
    const res = await api.post(`/control/${DEVICE_ID}/rgb`, { val, reason: '页面设置RGB颜色' })
    if (res.status === 'ok') ElMessage.success(`RGB 已设置为 ${rgbColors[val].name}`)
    else ElMessage.error(res.message || '下发失败')
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
}

async function testBeep() {
  // 协议限制 on_ms/off_ms ≤ 255
  cmdLoading.value = true
  try {
    const res = await api.post(`/control/${DEVICE_ID}/beep`, { on_ms: 200, off_ms: 100, reason: '页面蜂鸣测试' })
    if (res.status === 'ok') ElMessage.success('蜂鸣命令已下发')
    else ElMessage.error(res.message || '下发失败')
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  setTimeout(() => { cmdLoading.value = false }, 1200)
}
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

.lighting-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.realtime-panel, .control-panel {
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

.sensor-visual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.radar-container {
  position: relative;
  width: 220px;
  height: 220px;
  margin: 0 auto;
}

.radar-ring {
  position: absolute;
  border: 1px solid rgba(0, 212, 255, 0.4);
  border-radius: 50%;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  animation: radarPulse 3s infinite;
}

.radar-ring:nth-child(1) { width: 60px; height: 60px; }
.radar-ring:nth-child(2) { width: 110px; height: 110px; }
.radar-ring:nth-child(3) { width: 160px; height: 160px; }
.radar-ring:nth-child(4) { width: 210px; height: 210px; }

@keyframes radarPulse {
  0% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.8); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
}

.radar-sweep {
  position: absolute;
  width: 50%;
  height: 50%;
  left: 50%;
  top: 50%;
  transform-origin: 0% 100%;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(0, 212, 255, 0.3) 60deg, transparent 90deg);
  animation: radarSweep 4s linear infinite;
}

@keyframes radarSweep {
  100% { transform: rotate(360deg); }
}

.sensor-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  background: rgba(0, 212, 255, 0.2);
  border: 2px solid var(--accent-cyan);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-cyan);
  z-index: 10;
  transition: all 0.3s;
}

.sensor-center.active {
  background: rgba(0, 255, 136, 0.3);
  border-color: var(--accent-green);
  color: var(--accent-green);
  box-shadow: 0 0 30px rgba(0, 255, 136, 0.5);
}

.detection-points {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.detection-point {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--accent-green);
  border-radius: 50%;
  box-shadow: 0 0 15px var(--accent-green);
  animation: pointPulse 1.5s infinite;
}

@keyframes pointPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.6; }
}

.sensor-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-block {
  text-align: center;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-cyan);
}

.stat-num.active {
  color: var(--accent-green);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.control-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  transition: all 0.3s;
}

.control-item.lit {
  background: rgba(0, 212, 255, 0.1);
  border-left: 3px solid var(--accent-cyan);
}

.light-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(136, 153, 176, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.3s;
}

.light-icon.lit {
  background: rgba(255, 215, 0, 0.2);
  color: var(--accent-yellow);
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.light-info {
  flex: 1;
}

.light-name {
  font-size: 14px;
  color: var(--text-primary);
}

.light-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.control-item.lit .light-status {
  color: var(--accent-cyan);
}

.zones-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.zone-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.zone-card {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  transition: all 0.3s;
}

.zone-card.active {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.15);
}

.zone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.zone-name {
  font-weight: 600;
}

.zone-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(136, 153, 176, 0.2);
  color: var(--text-secondary);
}

.zone-status.lit {
  background: rgba(0, 255, 136, 0.15);
  color: var(--accent-green);
}

.zone-visual {
  margin-bottom: 12px;
}

.zone-light {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}

.light-bulb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(136, 153, 176, 0.3);
  transition: all 0.3s;
}

.light-bulb.lit {
  background: var(--accent-yellow);
  box-shadow: 0 0 10px var(--accent-yellow);
}

.zone-info {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.zone-info strong {
  color: var(--text-primary);
}

.zone-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.env-tip {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(0,212,255,0.05);
  border: 1px dashed rgba(0,212,255,0.25);
  border-radius: 8px;
  padding: 10px 14px;
}

.rgb-section .rgb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.rgb-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.rgb-cell:hover { border-color: #00d4ff; }
.rgb-cell.active { border-color: #00d4ff; background: rgba(0,212,255,0.08); }
.rgb-dot { width: 14px; height: 14px; border-radius: 50%; }

.beep-section { display: flex; align-items: center; gap: 12px; }
.beep-state { font-size: 12px; color: var(--text-secondary); }

</style>
