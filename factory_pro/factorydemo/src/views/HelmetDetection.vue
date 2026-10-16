<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">AI 安全帽检测</h2>
      <div class="page-desc">YOLOv8 实时识别安全帽佩戴情况 —— 支持图片上传、本机摄像头与 RK3568 视频流三种检测源，未佩戴自动告警</div>
    </div>

    <!-- 今日统计 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon cyan">🤖</div>
        <div class="stat-meta">
          <div class="stat-value">{{ stats.totalDetections }}</div>
          <div class="stat-label">今日检测次数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">👥</div>
        <div class="stat-meta">
          <div class="stat-value">{{ stats.totalPersons }}</div>
          <div class="stat-label">检测人数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">🪖</div>
        <div class="stat-meta">
          <div class="stat-value">{{ stats.compliant }}</div>
          <div class="stat-label">合规人次</div>
        </div>
      </div>
      <div class="stat-card" :class="{ danger: stats.noHelmet > 0 }">
        <div class="stat-icon red">🚫</div>
        <div class="stat-meta">
          <div class="stat-value" :class="{ 'danger-text': stats.noHelmet > 0 }">{{ stats.noHelmet }}</div>
          <div class="stat-label">未戴安全帽</div>
        </div>
      </div>
    </div>

    <div class="main-grid">
      <!-- 左：检测源与画面 -->
      <div class="panel">
        <div class="panel-title">检测画面</div>

        <!-- 源切换 -->
        <div class="source-tabs">
          <button
            v-for="s in sources"
            :key="s.key"
            class="source-tab"
            :class="{ active: activeSource === s.key }"
            @click="switchSource(s.key)"
          >{{ s.label }}</button>
        </div>

        <!-- 画面区 -->
        <div class="viewport" :class="{ 'alert-pulse': alertVisible, scanning: detecting }">
          <!-- 图片上传模式 -->
          <template v-if="activeSource === 'upload'">
            <img v-if="uploadPreview" :src="uploadPreview" class="frame" alt="待检测图片" />
            <div v-else class="placeholder" @click="fileInput?.click()">
              <div class="placeholder-icon">📸</div>
              <div class="placeholder-text">点击选择工厂工作场景照片</div>
              <div class="placeholder-hint">支持 JPG / PNG，AI 自动标注 绿框=已戴 红框=未戴</div>
            </div>
          </template>

          <!-- 本机摄像头 -->
          <template v-else-if="activeSource === 'local'">
            <video v-show="localReady" ref="videoRef" class="frame" autoplay playsinline muted></video>
            <canvas ref="canvasRef" style="display: none"></canvas>
            <div v-if="!localReady" class="placeholder">
              <div class="placeholder-icon">🎥</div>
              <div class="placeholder-text">正在开启电脑摄像头…</div>
            </div>
          </template>

          <!-- RK3568 视频流 -->
          <template v-else>
            <img
              v-if="streamView === 'mjpeg' && streamUrl"
              :src="streamUrl"
              class="frame"
              alt="RK3568 实时流"
              @error="streamView = 'snapshot'"
            />
            <img
              v-else-if="snapshotUrl"
              :src="snapshotUrl"
              class="frame"
              alt="RK3568 最新帧"
            />
            <div v-else class="placeholder">
              <div class="placeholder-icon">📡</div>
              <div class="placeholder-text">
                {{ streamInfo && !streamInfo.available ? '等待 RK3568 上传画面…' : '正在连接视频流…' }}
              </div>
            </div>
            <div v-if="streamInfo && streamInfo.available" class="stream-meta">
              {{ streamInfo.deviceId || 'RK3568' }} · 帧 {{ formatTime(streamInfo.timestamp) }}
              <template v-if="(streamInfo.frameAgeSeconds ?? 0) > 15">
                · ⚠ 已停更 {{ humanAge(streamInfo.frameAgeSeconds) }}（非实时）
              </template>
            </div>
          </template>

          <!-- 检测中遮罩 -->
          <div v-if="detecting" class="detecting-mask">
            <span class="scanline"></span>
            <span class="detecting-text">🔍 AI 识别中…</span>
          </div>

          <!-- 告警横幅 -->
          <div v-if="alertVisible" class="alert-banner">
            🚨 检测到 {{ lastAlertCount }} 人未佩戴安全帽！
          </div>

          <!-- 告警计数徽标 -->
          <div v-if="liveMode && liveAlertCount > 0" class="alert-badge">
            已告警 {{ liveAlertCount }} 次
          </div>
        </div>

        <!-- 控制行 -->
        <div class="control-row">
          <template v-if="activeSource === 'upload'">
            <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onFileChange" />
            <button class="btn ghost" @click="fileInput?.click()">选择图片</button>
            <button class="btn primary" :disabled="!uploadFile || detecting" @click="runUploadDetect">
              {{ detecting ? 'AI 检测中…' : '🤖 开始 AI 检测' }}
            </button>
          </template>

          <template v-else-if="activeSource === 'local'">
            <button class="btn primary" :disabled="detecting" @click="detectOnce">📷 立即检测一次</button>
          </template>

          <template v-else>
            <button class="btn ghost" :disabled="detecting" @click="detectOnce">📷 立即检测一次</button>
          </template>

          <!-- 定时检测开关（摄像头/视频流模式） -->
          <label v-if="liveMode" class="auto-switch">
            <input v-model="autoDetect" type="checkbox" @change="onAutoDetectChange" />
            <span>⏱ 定时检测（每 4 秒）</span>
          </label>
        </div>
        <div class="source-desc">{{ currentSourceDesc }}</div>
      </div>

      <!-- 右：检测结果 -->
      <div class="panel">
        <div class="panel-title">检测结果</div>

        <template v-if="lastResult">
          <img
            v-if="lastResult.annotated_image"
            :src="`data:image/jpeg;base64,${lastResult.annotated_image}`"
            class="annotated"
            alt="AI 标注结果"
          />

          <div v-if="lastResult.error" class="error-box">
            ⚠️ {{ lastResult.error }}
            <div class="error-hint">请确认 YOLO 推理服务(8001)与后端(8000)已启动</div>
          </div>

          <template v-else>
            <div class="result-summary">
              <div class="result-item">
                <div class="result-value">{{ lastResult.summary?.total_persons ?? 0 }}</div>
                <div class="result-label">总人数</div>
              </div>
              <div class="result-item ok">
                <div class="result-value">{{ lastResult.summary?.compliant ?? 0 }}</div>
                <div class="result-label">合规</div>
              </div>
              <div class="result-item bad">
                <div class="result-value">{{ lastResult.summary?.no_helmet ?? 0 }}</div>
                <div class="result-label">未戴</div>
              </div>
            </div>

            <!-- 人员列表 -->
            <div v-if="lastResult.persons?.length" class="person-list">
              <div
                v-for="(p, i) in lastResult.persons"
                :key="i"
                class="person-item"
                :class="{ 'no-helmet': p.status === 'no_helmet' }"
              >
                <span class="person-idx">#{{ i + 1 }}</span>
                <span class="person-status">{{ p.status === 'compliant' ? '✅ 已戴安全帽' : '❌ 未戴安全帽' }}</span>
                <span class="person-conf">{{ (p.confidence * 100).toFixed(1) }}%</span>
              </div>
            </div>
            <div v-else-if="!lastResult.error" class="no-person">🔍 未检测到人员</div>

            <!-- AI 处置建议 -->
            <div v-if="lastResult.suggestions?.length" class="suggestion-box">
              <div class="suggestion-title">📋 AI 处置建议（{{ lastResult.suggestions.length }} 项）</div>
              <div
                v-for="(s, i) in lastResult.suggestions"
                :key="i"
                class="suggestion-item"
                :class="{ high: s.priority === 'high' }"
              >
                <span class="suggestion-priority" :data-p="s.priority">{{ priorityLabel(s.priority) }}</span>
                <span class="suggestion-text">{{ s.text }}</span>
              </div>
            </div>
          </template>
        </template>

        <div v-else class="empty-result">
          <div class="placeholder-icon">🪖</div>
          <div class="placeholder-text">选择检测源并开始检测</div>
          <div class="placeholder-hint">检测结果与 AI 标注图将显示在这里</div>
        </div>
      </div>
    </div>

    <!-- 历史记录 -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">最近检测记录</div>
        <button class="btn ghost small" @click="loadHistory">刷新</button>
      </div>
      <div class="history-table" v-if="history.length">
        <div class="history-head">
          <span>时间</span><span>设备</span><span>来源</span><span>人数</span><span>合规</span><span>未戴</span>
        </div>
        <div v-for="r in history" :key="r.id" class="history-row" :class="{ 'has-danger': r.noHelmet > 0 }">
          <span>{{ formatTime(r.timestamp) }}</span>
          <span>{{ r.deviceId || '-' }}</span>
          <span><span class="camera-tag">{{ cameraLabel(r.camera) }}</span></span>
          <span>{{ r.total ?? 0 }}</span>
          <span class="ok-text">{{ r.compliant ?? 0 }}</span>
          <span :class="r.noHelmet > 0 ? 'danger-text' : ''">{{ r.noHelmet ?? 0 }}</span>
        </div>
      </div>
      <div v-else class="empty-result compact">
        <div class="placeholder-text">暂无检测记录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import api, { BASE_URL } from '../utils/request'

// API origin（不带 /api），供 img 标签直连 MJPEG 流与快照
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '')

// ===== 统计与历史 =====
const stats = ref({ totalDetections: 0, totalPersons: 0, compliant: 0, noHelmet: 0 })
const history = ref([])

async function loadStats() {
  try {
    const res = await api.get('/detections/stats')
    if (res.status === 'ok') stats.value = res.data
  } catch { /* 后端未启动时静默 */ }
}

async function loadHistory() {
  try {
    const res = await api.get('/detections?page=1&limit=10')
    if (res.status === 'ok') history.value = res.data || []
  } catch { /* 静默 */ }
}

// ===== 检测源 =====
const sources = [
  { key: 'upload', label: '🖼 图片上传' },
  { key: 'local', label: '🎥 本机摄像头' },
  { key: 'stream', label: '📡 RK3568 视频流' }
]
const activeSource = ref('upload')

const sourceDescMap = {
  upload: '上传一张现场照片，AI 将识别其中所有人员的安全帽佩戴情况',
  local: '开启电脑摄像头，每 4 秒截取一帧送 AI 识别，发现未戴立即告警',
  stream: '接入 RK3568 上传的视频流画面，开启「定时检测」后每 4 秒送检最新帧'
}
const currentSourceDesc = computed(() => sourceDescMap[activeSource.value])

// ===== 通用检测调用 =====
const detecting = ref(false)
const lastResult = ref(null)
const lastAlertCount = ref(0)
const alertVisible = ref(false)
let alertTimer = null

async function detectByBlob(blob, camera) {
  const fd = new FormData()
  fd.append('image', blob, 'frame.jpg')
  fd.append('deviceId', 'web_user')
  fd.append('camera', camera)
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}/detections/detect`, {
    method: 'POST',
    body: fd,
    headers: token ? { Authorization: 'Bearer ' + token } : undefined
  })
  const json = await res.json()
  if (json.status !== 'ok') throw new Error(json.message || `HTTP ${res.status}`)
  return json.data
}

// 统一处理检测结果：更新右栏 / 统计 / 告警
function applyResult(det) {
  if (!det) return
  lastResult.value = det
  loadStats()
  loadHistory()
  if ((det.summary?.no_helmet ?? 0) > 0) {
    liveAlertCount.value++
    lastAlertCount.value = det.summary.no_helmet
    alertVisible.value = true
    clearTimeout(alertTimer)
    alertTimer = setTimeout(() => { alertVisible.value = false }, 4000)
    ElMessage.error(`警告：${det.summary.no_helmet} 人未戴安全帽！`)
  }
}

async function runDetect(blob, camera) {
  if (detecting.value) return
  detecting.value = true
  try {
    const det = await detectByBlob(blob, camera)
    applyResult(det)
  } catch (e) {
    lastResult.value = {
      error: e?.message || '检测服务不可用',
      summary: { total_persons: 0, compliant: 0, no_helmet: 0 }
    }
  } finally {
    detecting.value = false
  }
}

// ===== 图片上传检测 =====
const fileInput = ref(null)
const uploadFile = ref(null)
const uploadPreview = ref('')

function onFileChange(e) {
  const f = e.target.files?.[0]
  if (!f) return
  uploadFile.value = f
  const reader = new FileReader()
  reader.onload = () => { uploadPreview.value = reader.result }
  reader.readAsDataURL(f)
  lastResult.value = null
}

async function runUploadDetect() {
  if (!uploadFile.value) return
  await runDetect(uploadFile.value, 'web_upload')
  // 保留上传图预览，标注图在右栏展示
}

// ===== 本机摄像头实时检测 =====
const videoRef = ref(null)
const canvasRef = ref(null)
const localReady = ref(false)
let localStream = null
let detectTimer = null
let stopFlag = false
const liveMode = computed(() => activeSource.value === 'local' || activeSource.value === 'stream')
const autoDetect = ref(true)
const liveAlertCount = ref(0)

async function startLocal() {
  stopFlag = false
  liveAlertCount.value = 0
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('浏览器不支持摄像头访问')
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    })
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = localStream
      await videoRef.value.play().catch(() => {})
    }
    localReady.value = true
    if (autoDetect.value) scheduleTick(2500)
  } catch (e) {
    ElMessage.error(`无法打开摄像头：${e?.message || e}`)
    activeSource.value = 'upload'
  }
}

function grabLocalBlob() {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || video.readyState < 2) return null
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
}

async function detectOnce() {
  if (detecting.value) return
  if (activeSource.value === 'local') {
    const blob = grabLocalBlob()
    if (blob) await runDetect(blob, 'live_usb')
  } else if (activeSource.value === 'stream') {
    await detectStreamFrame()
  }
}

// ===== RK3568 视频流 =====
const streamUrl = ref('')
const snapshotUrl = ref('')
const streamView = ref('mjpeg') // mjpeg 失败自动回退 snapshot
const streamInfo = ref(null)
let snapshotTimer = null
let infoTimer = null
let streamDetecting = false
let frameAge = Infinity
let staleNotified = false

async function detectStreamFrame() {
  if (streamDetecting) return
  if (frameAge > 15) {
    // 帧停更超过 15s 说明硬件没在推帧，latest 是旧图，跳过送检避免脏数据入库
    if (!staleNotified) {
      staleNotified = true
      ElMessage.warning('后端未收到硬件新帧，已暂停检测（画面为旧帧）')
    }
    return
  }
  streamDetecting = true
  detecting.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${BASE_URL}/stream/latest?t=${Date.now()}`, {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    await runDetect(blob, 'rk3568_stream')
  } catch { /* 拉帧失败本轮跳过 */ }
  finally {
    streamDetecting = false
    detecting.value = false
  }
}

async function pollStreamInfo() {
  try {
    const res = await api.get('/stream/info')
    if (res.status === 'ok') {
      streamInfo.value = res.data
      if (typeof res.data?.frameAgeSeconds === 'number') {
        frameAge = res.data.frameAgeSeconds
        if (frameAge <= 15) staleNotified = false
      }
    }
  } catch { /* 静默 */ }
}

function startStream() {
  stopFlag = false
  liveAlertCount.value = 0
  staleNotified = false
  frameAge = Infinity
  streamView.value = 'mjpeg'
  streamUrl.value = `${API_ORIGIN}/api/stream/live`
  snapshotUrl.value = ''
  pollStreamInfo()
  infoTimer = setInterval(pollStreamInfo, 3000)
  // 快照回退源：每秒强制刷新最新帧
  snapshotTimer = setInterval(() => {
    if (streamView.value === 'snapshot') {
      snapshotUrl.value = `${BASE_URL}/stream/latest?t=${Date.now()}`
    }
  }, 1000)
  if (autoDetect.value) scheduleTick(2000)
}

// ===== 定时检测调度（检测完再排下一轮，推理慢于 4s 时不堆积） =====
function tick() {
  if (stopFlag) return
  const work = activeSource.value === 'local'
    ? (async () => {
        const blob = grabLocalBlob()
        if (blob) await runDetect(blob, 'live_usb')
      })()
    : detectStreamFrame()
  Promise.resolve(work).catch(() => {}).finally(() => {
    if (!stopFlag && autoDetect.value) scheduleTick(4000)
  })
}

function scheduleTick(delay) {
  clearTimeout(detectTimer)
  detectTimer = setTimeout(tick, delay)
}

function onAutoDetectChange() {
  if (autoDetect.value) {
    scheduleTick(500)
  } else {
    clearTimeout(detectTimer)
    detectTimer = null
  }
}

// ===== 源切换 =====
function stopLive() {
  stopFlag = true
  clearTimeout(detectTimer)
  detectTimer = null
  clearInterval(snapshotTimer)
  clearInterval(infoTimer)
  snapshotTimer = infoTimer = null
  streamDetecting = false
  detecting.value = false
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
  localReady.value = false
  streamUrl.value = ''
  snapshotUrl.value = ''
  streamInfo.value = null
  frameAge = Infinity
}

function switchSource(key) {
  if (activeSource.value === key) return
  stopLive()
  lastResult.value = null
  alertVisible.value = false
  activeSource.value = key
  if (key === 'local') startLocal()
  else if (key === 'stream') startStream()
}

// ===== 工具 =====
function formatTime(ts) {
  if (!ts) return '--'
  return String(ts).replace('T', ' ').slice(5, 16)
}

function humanAge(sec) {
  if (sec > 3600) return `${Math.floor(sec / 3600)} 小时`
  if (sec > 60) return `${Math.floor(sec / 60)} 分钟`
  return `${sec} 秒`
}

const cameraLabelMap = {
  web_upload: 'Web 上传',
  live_usb: '本机摄像头',
  rk3568_stream: 'RK3568 流',
  rk3568_usb: 'RK3568 USB',
  mobile: '手机上传',
  mp_user: '小程序'
}
function cameraLabel(c) {
  return cameraLabelMap[c] || c || '-'
}

function priorityLabel(p) {
  return { high: '紧急', medium: '建议', low: '记录' }[p] || '记录'
}

onMounted(() => {
  loadStats()
  loadHistory()
})

onUnmounted(() => {
  stopLive()
  clearTimeout(alertTimer)
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

/* ===== 统计行 ===== */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  transition: border-color 0.3s;
}

.stat-card.danger {
  border-color: rgba(245, 108, 108, 0.5);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-icon.cyan { background: rgba(0, 212, 255, 0.12); }
.stat-icon.blue { background: rgba(64, 158, 255, 0.12); }
.stat-icon.green { background: rgba(103, 194, 58, 0.12); }
.stat-icon.red { background: rgba(245, 108, 108, 0.12); }

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-value.danger-text { color: var(--accent-red); }

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ===== 主区 ===== */
.main-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 0;
}

.page-container > .panel:last-child {
  margin-bottom: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.panel-head .panel-title {
  margin-bottom: 0;
}

/* 源切换 */
.source-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.source-tab {
  flex: 1;
  padding: 8px 0;
  background: rgba(15, 36, 64, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s;
}

.source-tab:hover {
  border-color: rgba(0, 212, 255, 0.4);
  color: var(--text-primary);
}

.source-tab.active {
  background: rgba(0, 212, 255, 0.1);
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  font-weight: 600;
}

/* 画面区 */
.viewport {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #060d18;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
}

.viewport.alert-pulse {
  border-color: var(--accent-red);
  animation: pulse-border 1s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0); }
  50% { box-shadow: 0 0 18px 2px rgba(245, 108, 108, 0.45); }
}

.frame {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}

.placeholder-icon { font-size: 34px; }

.placeholder-text {
  font-size: 14px;
  color: var(--text-primary);
}

.placeholder-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.stream-meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4px 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
}

/* 检测中遮罩 + 扫描线 */
.detecting-mask {
  position: absolute;
  inset: 0;
  background: rgba(4, 12, 24, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scanline {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
  box-shadow: 0 0 12px var(--accent-cyan);
  animation: scan 1.6s ease-in-out infinite;
}

@keyframes scan {
  0% { top: 6%; }
  50% { top: 92%; }
  100% { top: 6%; }
}

.detecting-text {
  font-size: 13px;
  color: var(--accent-cyan);
  background: rgba(4, 12, 24, 0.75);
  padding: 6px 14px;
  border-radius: 14px;
  border: 1px solid rgba(0, 212, 255, 0.35);
}

/* 告警横幅 / 徽标 */
.alert-banner {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 16px;
  border-radius: 16px;
  background: rgba(245, 63, 63, 0.92);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(245, 63, 63, 0.45);
  white-space: nowrap;
}

.alert-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(230, 162, 60, 0.9);
  color: #1a1a1a;
  font-size: 12px;
  font-weight: 600;
}

/* 控制行 */
.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.source-desc {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.btn {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s;
}

.btn.primary {
  background: linear-gradient(135deg, #0ea5c9, #2563eb);
  color: #fff;
  border: none;
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.ghost {
  background: rgba(15, 36, 64, 0.6);
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.btn.ghost:hover {
  border-color: rgba(0, 212, 255, 0.4);
  color: var(--text-primary);
}

.btn.small {
  padding: 5px 12px;
  font-size: 12px;
}

.auto-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  margin-left: auto;
}

.auto-switch input {
  accent-color: #0ea5c9;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

/* ===== 右栏结果 ===== */
.annotated {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.error-box {
  padding: 12px;
  border-radius: 8px;
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid rgba(245, 108, 108, 0.35);
  color: var(--accent-red);
  font-size: 13px;
}

.error-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.result-item {
  text-align: center;
  padding: 12px 0;
  border-radius: 8px;
  background: rgba(15, 36, 64, 0.6);
  border: 1px solid var(--border-color);
}

.result-item .result-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.result-item.ok .result-value { color: var(--accent-green); }
.result-item.bad .result-value { color: var(--accent-red); }

.result-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.person-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.person-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  background: rgba(15, 36, 64, 0.6);
  border: 1px solid rgba(103, 194, 58, 0.25);
}

.person-item.no-helmet {
  border-color: rgba(245, 108, 108, 0.4);
  background: rgba(245, 108, 108, 0.08);
}

.person-idx {
  color: var(--text-secondary);
  font-size: 12px;
  width: 24px;
}

.person-status {
  flex: 1;
  color: var(--text-primary);
}

.person-conf {
  font-size: 12px;
  color: var(--text-secondary);
}

.no-person {
  text-align: center;
  padding: 16px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.suggestion-box {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}

.suggestion-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.suggestion-item.high .suggestion-text {
  color: var(--text-primary);
}

.suggestion-priority {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(134, 144, 156, 0.15);
  color: var(--text-secondary);
}

.suggestion-priority[data-p='high'] {
  background: rgba(245, 108, 108, 0.15);
  color: var(--accent-red);
}

.suggestion-priority[data-p='medium'] {
  background: rgba(230, 162, 60, 0.15);
  color: var(--accent-orange);
}

.empty-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 60px 0;
  text-align: center;
}

.empty-result.compact {
  padding: 24px 0;
}

/* ===== 历史 ===== */
.page-container > .panel {
  margin-bottom: 16px;
}

.history-table {
  display: flex;
  flex-direction: column;
}

.history-head, .history-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 0.6fr 0.6fr 0.6fr;
  gap: 8px;
  padding: 9px 8px;
  font-size: 13px;
  align-items: center;
}

.history-head {
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.history-row {
  color: var(--text-primary);
  border-bottom: 1px solid rgba(64, 158, 255, 0.1);
}

.history-row:hover {
  background: rgba(0, 212, 255, 0.05);
}

.history-row.has-danger .danger-text {
  font-weight: 700;
}

.camera-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(64, 158, 255, 0.12);
  color: var(--accent-cyan);
}

.ok-text { color: var(--accent-green); }
.danger-text { color: var(--accent-red); }

/* 响应式 */
@media (max-width: 1100px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
