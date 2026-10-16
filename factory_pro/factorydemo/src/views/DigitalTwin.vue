<template>
  <div class="dt-container">
    <!-- 全屏 3D 画布 -->
    <div ref="canvasContainer" class="dt-canvas"></div>

    <!-- ========== 全局纯净模式按钮 ========== -->
    <div class="hud-pure-toggle" @click="togglePureMode" :title="pureMode ? '显示面板' : '纯净模式'">
      <span v-if="!pureMode">⊟ 纯净模式</span>
      <span v-else>⊞ 显示面板</span>
    </div>

    <!-- ========== 顶部 HUD（可折叠） ========== -->
    <transition name="hud-slide-down">
      <div class="hud hud-top" v-show="hudTopOpen && !pureMode">
        <div class="hud-collapse-btn hud-collapse-top" @click="hudTopOpen = false" title="收起">
          <span>▲</span>
        </div>
        <div class="hud-title">
          <div class="ht-ico">🏭</div>
          <div>
            <div class="ht-main">数字孪生 · {{ currentFactory.name }} 3D 监控中心</div>
            <div class="ht-sub">DIGITAL TWIN · {{ updateTime }} · 3D 布景为产线示意，温湿度/气体/告警/控制均来自真实硬件</div>
          </div>
        </div>
        <!-- 工厂切换（真实工厂列表 + 演示厂区） -->
        <div class="factory-switcher">
          <div
            v-for="f in factoryList"
            :key="f.id"
            class="fs-btn"
            :class="{ active: currentFactoryId === f.id, demo: f.demo }"
            @click="switchFactory(f.id)"
            :title="f.name"
          >{{ f.short }}</div>
        </div>
        <div class="hud-stats">
          <div class="hs hs-total">
            <div class="hs-num">{{ stats.total }}</div>
            <div class="hs-label">设备总数</div>
          </div>
          <div class="hs hs-normal">
            <span class="hs-dot"></span>
            <div class="hs-num">{{ stats.normal }}</div>
            <div class="hs-label">正常运行</div>
          </div>
          <div class="hs hs-warning">
            <span class="hs-dot"></span>
            <div class="hs-num">{{ stats.warning }}</div>
            <div class="hs-label">预警设备</div>
          </div>
          <div class="hs hs-alarm" :class="{ pulse: stats.alarm > 0 }">
            <span class="hs-dot"></span>
            <div class="hs-num">{{ stats.alarm }}</div>
            <div class="hs-label">告警设备</div>
          </div>
          <div class="hs hs-detect">
            <div class="hs-num">{{ detectStats.totalPersons }}</div>
            <div class="hs-label">今日检测人数</div>
          </div>
        </div>
        <!-- 数据源标识 + 实时告警滚动条 -->
        <div class="hud-datastrip">
          <span class="src-badge real" title="数值来自真实硬件/后端数据库">● 实时数据 {{ stats.realCount }}</span>
          <span class="src-badge demo" title="产线演示设备，数值随真实环境动态推演">○ 演示数据 {{ stats.demoCount }}</span>
          <div class="alarm-ticker" v-if="activeAlarms.length">
            <span class="ticker-icon">🚨</span>
            <div class="ticker-wrap">
              <span class="ticker-text" @click="flyToAlarm(activeAlarms[0])" title="点击定位到告警设备">
                {{ activeAlarms[0].message || activeAlarms[0].type }} · {{ activeAlarms[0].location }} · {{ activeAlarms[0].time }}
              </span>
            </div>
            <span class="ticker-count" v-if="activeAlarms.length > 1">{{ activeAlarms.length }} 条待处理</span>
          </div>
          <div class="alarm-ticker ok" v-else>
            <span class="ticker-icon">✅</span>
            <span class="ticker-text">暂无未处理告警，运行状态良好</span>
          </div>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div class="hud-mini-btn hud-mini-btn-top" v-show="!hudTopOpen && !pureMode" @click="hudTopOpen = true">
        <span>▼</span> 展开顶部面板
      </div>
    </transition>

    <!-- ========== 左侧 HUD（可折叠） ========== -->
    <transition name="hud-slide-left">
      <div class="hud hud-left" v-show="hudLeftOpen && !pureMode">
        <div class="hud-collapse-btn hud-collapse-left" @click="hudLeftOpen = false" title="收起">
          <span>◀</span>
        </div>
        <div class="hud-panel-title">
          <el-icon><Tools /></el-icon> 设备总览
        </div>
        <div class="search-wrap">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索设备名称 / ID..."
            clearable
            size="small"
            :prefix-icon="Search"
          />
        </div>
        <div class="dev-list">
          <div
            v-for="d in filteredDevices"
            :key="d.id"
            class="dev-card"
            :class="{ active: selectedId === d.id, alarm: d.status === 'alarm', warn: d.status === 'warning' }"
            @click="handleDeviceClick(d)"
          >
            <span class="dc-dot" :class="d.status"></span>
            <div class="dc-main">
              <div class="dc-name">
                {{ d.name }}
                <span class="dc-src" :class="d.source" :title="d.source === 'real' ? '真实设备（后端）' : '演示设备'">{{ d.source === 'real' ? '实时' : '演示' }}</span>
              </div>
              <div class="dc-meta">
                <template v-if="d.type === 'tempHumid'">
                  <span :class="tempCls(d.temp)">🌡 {{ d.temp }}°C</span>
                  <span :class="d.humid > 75 ? 't-alarm' : d.humid > 65 ? 't-warn' : ''">💧 {{ d.humid }}%</span>
                </template>
                <template v-else-if="d.type === 'gas'">
                  <span :class="d.value > d.threshold ? 't-alarm' : d.value > d.threshold * 0.8 ? 't-warn' : ''">{{ d.gasType }} {{ d.value }}{{ d.unit }}</span>
                </template>
                <template v-else-if="d.source === 'real'">
                  <span>{{ d.statusLabel }}</span>
                  <span class="t-dim">{{ typeLabel(d.type) }}</span>
                </template>
                <template v-else>
                  <span :class="tempCls(d.sensors.temperature)">🌡 {{ d.sensors.temperature }}°C</span>
                  <span :class="vibCls(d.sensors.vibration)">📳 {{ d.sensors.vibration }}</span>
                </template>
              </div>
            </div>
          </div>
          <div v-if="filteredDevices.length === 0" class="empty">无匹配设备</div>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div class="hud-mini-btn hud-mini-btn-left" v-show="!hudLeftOpen && !pureMode" @click="hudLeftOpen = true">
        <span>▶</span>
      </div>
    </transition>

    <!-- ========== 右侧 HUD（可折叠） ========== -->
    <transition name="hud-slide-right">
      <div class="hud hud-right" v-if="selectedId && hudRightOpen && !pureMode">
        <div class="hud-collapse-btn hud-collapse-right" @click="hudRightOpen = false" title="收起">
          <span>▶</span>
        </div>
        <div class="hud-panel-title hud-panel-title-active">
          <span class="active-tag" :class="selectedDevice.status">
            {{ selectedDevice.statusLabel }}
          </span>
          <span style="margin-left:8px;">{{ selectedDevice.name }}</span>
          <span class="hud-close" @click="selectedId = null">✕</span>
        </div>

        <!-- 温湿度传感器 -->
        <div class="sensor-grid" v-if="selectedDevice.type === 'tempHumid'">
          <div class="sensor-card" :class="{ danger: selectedDevice.temp > 35, warn: selectedDevice.temp > 30 && selectedDevice.temp <= 35 }">
            <div class="sc-ico">🌡️</div>
            <div>
              <div class="sc-label">环境温度</div>
              <div class="sc-val">{{ selectedDevice.temp }} <span class="sc-unit">°C</span></div>
            </div>
          </div>
          <div class="sensor-card" :class="{ danger: selectedDevice.humid > 75, warn: selectedDevice.humid > 65 && selectedDevice.humid <= 75 }">
            <div class="sc-ico">💧</div>
            <div>
              <div class="sc-label">相对湿度</div>
              <div class="sc-val">{{ selectedDevice.humid }} <span class="sc-unit">%RH</span></div>
            </div>
          </div>
        </div>

        <!-- 气体传感器 -->
        <div class="sensor-grid" v-else-if="selectedDevice.type === 'gas'">
          <div class="sensor-card" :class="{ danger: selectedDevice.value > selectedDevice.threshold, warn: selectedDevice.value > selectedDevice.threshold * 0.8 && selectedDevice.value <= selectedDevice.threshold }">
            <div class="sc-ico">☁️</div>
            <div>
              <div class="sc-label">{{ selectedDevice.gasType }} 浓度</div>
              <div class="sc-val">{{ selectedDevice.value }} <span class="sc-unit">{{ selectedDevice.unit }}</span></div>
            </div>
          </div>
          <div class="sensor-card">
            <div class="sc-ico">⚠️</div>
            <div>
              <div class="sc-label">告警阈值</div>
              <div class="sc-val">{{ selectedDevice.threshold }} <span class="sc-unit">{{ selectedDevice.unit }}</span></div>
            </div>
          </div>
        </div>

        <!-- 生产设备（演示数值 · 随真实环境动态推演） -->
        <div class="sensor-grid" v-else-if="selectedDevice.source !== 'real'">
          <div class="sim-tag" title="硬件未配备温度/振动/功率传感器，数值以真实环境温度为基线动态推演">◈ 仿真推演数据</div>
          <div class="sensor-card" :class="{ danger: selectedDevice.sensors.temperature > 70, warn: selectedDevice.sensors.temperature > 55 && selectedDevice.sensors.temperature <= 70 }">
            <div class="sc-ico">🌡️</div>
            <div>
              <div class="sc-label">温度</div>
              <div class="sc-val">{{ selectedDevice.sensors.temperature }} <span class="sc-unit">°C</span></div>
            </div>
          </div>
          <div class="sensor-card" :class="{ danger: selectedDevice.sensors.vibration > 0.4, warn: selectedDevice.sensors.vibration > 0.2 && selectedDevice.sensors.vibration <= 0.4 }">
            <div class="sc-ico">📳</div>
            <div>
              <div class="sc-label">振动</div>
              <div class="sc-val">{{ selectedDevice.sensors.vibration }} <span class="sc-unit">mm/s</span></div>
            </div>
          </div>
          <div class="sensor-card">
            <div class="sc-ico">⚡</div>
            <div>
              <div class="sc-label">功率</div>
              <div class="sc-val">{{ selectedDevice.sensors.power }} <span class="sc-unit">kW</span></div>
            </div>
          </div>
        </div>

        <!-- 真实硬件设备（网关/传感器/执行器） -->
        <div class="sensor-grid" v-else>
          <div class="sensor-card" :class="{ danger: selectedDevice.realStatus === 0 }">
            <div class="sc-ico">{{ realIcon(selectedDevice.type) }}</div>
            <div>
              <div class="sc-label">在线状态</div>
              <div class="sc-val" style="font-size:18px;">{{ selectedDevice.realStatus === 1 ? '在线' : '离线' }}</div>
            </div>
          </div>
          <div class="sensor-card">
            <div class="sc-ico">📍</div>
            <div>
              <div class="sc-label">安装位置</div>
              <div class="sc-val" style="font-size:14px; padding-top:8px;">{{ selectedDevice.real?.location || '-' }}</div>
            </div>
          </div>
        </div>

        <!-- 真实执行器控制面板（3D 直控真实硬件） -->
        <div class="info-block ctrl-block" v-if="selectedDevice.source === 'real' && isActuator(selectedDevice.type)">
          <div class="ib-title">🎛 真实硬件控制</div>
          <!-- 照明继电器 -->
          <template v-if="selectedDevice.type === 'lightRelay'">
            <div class="ctrl-row">
              <span>车间照明开关</span>
              <el-switch :model-value="lightingStatus" :loading="cmdLoading" @change="sendRelayCmd" />
            </div>
            <div class="ctrl-hint">经 MQTT 下发至网关 {{ gatewayId }}，真实点亮/熄灭 3D 厂房灯</div>
          </template>
          <!-- RGB 指示灯 -->
          <template v-else-if="selectedDevice.type === 'rgbLamp'">
            <div class="ctrl-row"><span>RGB 状态灯</span><span class="ctrl-val" :style="{ color: rgbHex }">{{ rgbColorName }}</span></div>
            <div class="rgb-row">
              <span
                v-for="(c, i) in RGB_COLORS"
                :key="i"
                class="rgb-dot"
                :style="{ background: c.hex, boxShadow: rgbVal === i ? `0 0 8px ${c.hex}` : 'none' }"
                :title="c.name"
                @click="sendRgbCmd(i)"
              ></span>
            </div>
            <div class="ctrl-hint">点击颜色下发 rgb val={{ rgbVal }} 指令（0=熄灭）</div>
          </template>
          <!-- 蜂鸣器 -->
          <template v-else-if="selectedDevice.type === 'buzzer'">
            <div class="ctrl-row"><span>报警蜂鸣测试</span></div>
            <button class="ctrl-btn" :disabled="cmdLoading" @click="sendBeepCmd">📢 蜂鸣 1 秒</button>
            <div class="ctrl-hint">下发 beep on_ms=300 off_ms=100 报警节奏</div>
          </template>
        </div>

        <div class="info-block">
          <div class="ib-title">设备信息</div>
          <div class="ib-row"><span>设备 ID</span><b>{{ selectedDevice.id }}</b></div>
          <div class="ib-row"><span>设备类型</span><b>{{ typeLabel(selectedDevice.type) }}</b></div>
          <div class="ib-row" v-if="selectedDevice.source === 'real'"><span>数据来源</span><b style="color:#00e676;">真实硬件</b></div>
          <div class="ib-row" v-if="selectedDevice.source === 'real' && selectedDevice.real?.model"><span>型号</span><b>{{ selectedDevice.real.model }}</b></div>
          <div class="ib-row" v-if="selectedDevice.source !== 'real'"><span>位置坐标</span><b>X{{ selectedDevice.position.x }} · Z{{ selectedDevice.position.z }}</b></div>
        </div>

        <div class="info-block" v-if="selectedDevice.status !== 'normal'">
          <div class="ib-title ib-warn">⚠️ 处理建议</div>
          <ul class="advice">
            <li v-if="selectedDevice.type === 'tempHumid' && selectedDevice.temp > 35">环境温度过高：检查空调/通风系统是否正常运行</li>
            <li v-if="selectedDevice.type === 'tempHumid' && selectedDevice.humid > 75">湿度过高：开启除湿设备，防止设备受潮</li>
            <li v-if="selectedDevice.type === 'gas' && selectedDevice.value > selectedDevice.threshold">气体浓度超标：立即启动排风，疏散现场人员</li>
            <li v-if="selectedDevice.type === 'gas' && selectedDevice.value > selectedDevice.threshold * 0.8">气体浓度接近阈值：加强监测，检查气源泄漏点</li>
            <li v-if="selectedDevice.type !== 'tempHumid' && selectedDevice.type !== 'gas' && selectedDevice.status === 'alarm'">设备运行异常，建议立即停机检查</li>
            <li v-if="selectedDevice.type !== 'tempHumid' && selectedDevice.type !== 'gas' && selectedDevice.sensors.temperature > 55">温度过高：检查散热系统 / 冷却装置是否正常</li>
            <li v-if="selectedDevice.type !== 'tempHumid' && selectedDevice.type !== 'gas' && selectedDevice.sensors.vibration > 0.2">振动异常：检查设备固定螺栓和轴承状态</li>
            <li v-if="selectedDevice.type !== 'tempHumid' && selectedDevice.type !== 'gas' && selectedDevice.sensors.power > 25">功率偏高：检查负载是否过载</li>
            <li>联系运维人员进行现场排查</li>
          </ul>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div class="hud-mini-btn hud-mini-btn-right" v-show="selectedId && !hudRightOpen && !pureMode" @click="hudRightOpen = true">
        <span>◀</span>
      </div>
    </transition>

    <!-- ========== 底部操作提示 ========== -->
    <transition name="hud-slide-up">
      <div class="hud hud-tips" v-show="hudTipsOpen && !pureMode">
        <span class="hud-tips-close" @click="hudTipsOpen = false">✕</span>
        <span>🖱️ 滚轮缩放</span>
        <span class="divider"></span>
        <span>✋ 左键旋转</span>
        <span class="divider"></span>
        <span>🖐️ 右键平移</span>
        <span class="divider"></span>
        <span>👆 点击设备查看详情</span>
        <span class="divider"></span>
        <span>⊟ 纯净模式(角落按钮)</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, reactive, computed, nextTick } from 'vue'
import { Search, Tools } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import request, { BASE_URL } from '../utils/request'
import { useDeviceStore } from '../stores/device'
import { on as wsOn } from '../utils/ws'

const deviceStore = useDeviceStore()

const canvasContainer = ref(null)
const devices = ref([])
const selectedId = ref(null)
const selectedDevice = reactive({
  name: '', id: '', status: 'normal', statusLabel: '正常', type: '', source: 'demo',
  position: { x: 0, y: 0, z: 0 },
  sensors: { temperature: 0, vibration: 0, power: 0 },
  // 传感器专属字段（type 为 tempHumid / gas 时使用）
  temp: 0, humid: 0, value: 0, unit: '', threshold: 0, gasType: '', sensorId: '',
  // 真实硬件设备字段（source 为 real 时使用）
  real: null, realStatus: 0,
})
const searchKeyword = ref('')
const stats = reactive({ total: 0, normal: 0, warning: 0, alarm: 0, realCount: 0, demoCount: 0 })
const updateTime = ref('--:--:--')

// ===== 真实数据联动状态 =====
const detectStats = ref({ totalDetections: 0, totalPersons: 0, compliant: 0, noHelmet: 0 })
const lightingStatus = computed(() => deviceStore.lightingStatus)
const pirStatus = ref(0)      // 人体红外：1=有人在场
const ldrAdc = ref(0)         // 光照 ADC（越大环境越暗）
const goodsCount = computed(() => deviceStore.goodsCount)
const activeAlarms = computed(() => deviceStore.alarms.filter(a => !a.resolved))
const cmdLoading = ref(false)
const rgbVal = ref(0)         // 当前 RGB 灯色值 0~7
const gatewayId = ref('rk3568_factory_001')
const RGB_COLORS = [
  { name: '熄灭', hex: '#374151' }, { name: '红', hex: '#ef4444' }, { name: '绿', hex: '#22c55e' },
  { name: '蓝', hex: '#3b82f6' }, { name: '黄', hex: '#eab308' }, { name: '紫', hex: '#a855f7' },
  { name: '青', hex: '#06b6d4' }, { name: '白', hex: '#f8fafc' },
]
const rgbColorName = computed(() => RGB_COLORS[rgbVal.value]?.name || '-')
const rgbHex = computed(() => RGB_COLORS[rgbVal.value]?.hex || '#fff')

// 3D 场景环境联动引用（构建时填充）
let ceilingPointLights = []   // 厂房顶灯点光源（随真实照明开关）
let lampEmitterMat = null    // 工矿灯发光面材质
let cameraLeds = []          // 监控摄像头红色工作灯（安全帽告警时闪烁）
let personMesh = null        // PIR 人员小人
let counterSprite = null     // 货物计数牌
let counterCanvas = null
let alarmMarkers = {}        // 告警浮标 { 设备id: sprite }

// HUD 折叠状态
const hudTopOpen = ref(true)
const hudLeftOpen = ref(true)
const hudRightOpen = ref(true)
const hudTipsOpen = ref(true)
const pureMode = ref(false)
const togglePureMode = () => { pureMode.value = !pureMode.value }

let scene, camera, renderer, controls, animationId
let deviceMeshes = {}
let raycaster, mouse
let refreshTimer
let containerResizeObserver = null
let crane, agvMeshes = [], workboxes = [], conveyorItems = []
let robotArmGroups = []

const STATUS_COLORS = { normal: 0x00e676, warning: 0xffb300, alarm: 0xff1744 }

const filteredDevices = computed(() => {
  if (!searchKeyword.value) return devices.value
  const kw = searchKeyword.value.toLowerCase()
  return devices.value.filter(d =>
    d.name.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw)
  )
})
const typeLabel = (t) => ({
  conveyor: '轻型皮带流水线',
  press: 'CPU散热器压合工装', test: '老化架',
  assemblyLine: '倍速链组装流水线', workstation: '防静电工作台',
  screenPress: '笔记本屏幕压合机', barcodePrinter: '条码打印机',
  testStation: '整机综合测试工装', burnInRoom: '老化房',
  printerTest: '打印测试平台', cartonSealer: '自动封箱机',
  wrappingMachine: '打包缠绕机', warehouseTerminal: '成品扫码入库终端',
  tempHumid: '温湿度传感器', gas: '气体传感器',
}[t] || t)
const tempCls = (v) => v > 70 ? 't-alarm' : v > 55 ? 't-warn' : ''
const vibCls = (v) => v > 0.4 ? 't-alarm' : v > 0.2 ? 't-warn' : ''

// ========== Three.js 初始化 ==========
const initThree = () => {
  const container = canvasContainer.value
  const width = container.clientWidth
  const height = container.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1f36)
  scene.fog = new THREE.Fog(0x1a1f36, 95, 260) // 放大雾范围：近 95 远 260，保证完整厂房可见

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000)
  // 初始视角：置于厂房上空东南方向，略微倾斜俯瞰，能越过玻璃屋顶看到内部全貌
  camera.position.set(26, 28, 24)
  camera.lookAt(0, 2, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // PCFSoft 成本高，改用 PCF（视觉差异极小 + 快 ~30%）
  renderer.toneMapping = THREE.ReinhardToneMapping // 比 ACESFilmic 计算成本低
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 8
  controls.maxDistance = 90
  controls.maxPolarAngle = Math.PI / 2.02
  controls.target.set(0, 0, 0)
  controls.screenSpacePanning = true

  // 灯光：极简主光策略（只保留 1 方向光投影 + 半球 + 环境光，节省 GPU）
  scene.add(new THREE.AmbientLight(0xffffff, 0.68))
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.82)
  dirLight.position.set(22, 40, 18)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(1024, 1024) // 2048 → 1024：4x 省显存+带宽
  dirLight.shadow.camera.left = -32
  dirLight.shadow.camera.right = 32
  dirLight.shadow.camera.top = 32
  dirLight.shadow.camera.bottom = -32
  dirLight.shadow.camera.near = 1
  dirLight.shadow.camera.far = 120
  dirLight.shadow.bias = -0.0005
  scene.add(dirLight)
  scene.add(new THREE.HemisphereLight(0x9ecbff, 0x27304e, 0.55))

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  buildFactory()
  animate()

  window.addEventListener('resize', onWindowResize)
  // 监听容器尺寸变化（侧边栏折叠/展开时窗口不触发 resize，需用 ResizeObserver）
  if (typeof ResizeObserver !== 'undefined') {
    containerResizeObserver = new ResizeObserver(() => onWindowResize())
    containerResizeObserver.observe(container)
  }
  renderer.domElement.addEventListener('click', onCanvasClick)
  renderer.domElement.addEventListener('mousemove', onCanvasMouseMove)
}

const FACTORY = { W: 60, D: 38, H: 11 } // 厂房尺寸：宽×深×高（米）
const HALF_W = FACTORY.W / 2 - 0.5
const HALF_D = FACTORY.D / 2 - 0.5

const buildFactory = () => {
  // === 1) 环氧地坪（深色工业地面，带磨损纹理感） ===
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FACTORY.W, FACTORY.D),
    new THREE.MeshStandardMaterial({ color: 0x2d3561, roughness: 0.85, metalness: 0.15 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // 车道/地面网格
  const gridHelper = new THREE.GridHelper(FACTORY.W, 30, 0x4a5a9e, 0x3a4578)
  gridHelper.position.y = 0.01
  scene.add(gridHelper)

  // === 2) 地面功能分区划线（黄/绿/红白条纹） ===
  buildFloorMarkings()

  // === 3) 厂房四周外墙 + 窗户 + 大门 ===
  buildFactoryWalls()

  // === 4) 钢立柱（H 型钢） ===
  const pillarPos = [
    [-HALF_W + 0.5, -HALF_D + 2], [-HALF_W + 0.5, -HALF_D / 2], [-HALF_W + 0.5, 0], [-HALF_W + 0.5, HALF_D / 2], [-HALF_W + 0.5, HALF_D - 2],
    [HALF_W - 0.5, -HALF_D + 2], [HALF_W - 0.5, -HALF_D / 2], [HALF_W - 0.5, 0], [HALF_W - 0.5, HALF_D / 2], [HALF_W - 0.5, HALF_D - 2],
    [-HALF_W / 2, -HALF_D + 1.2], [-HALF_W / 2, HALF_D - 1.2],
    [HALF_W / 2, -HALF_D + 1.2], [HALF_W / 2, HALF_D - 1.2],
    [0, -HALF_D + 1.2], [0, HALF_D - 1.2],
  ]
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5f6b9e, metalness: 0.7, roughness: 0.35 })
  pillarPos.forEach(([x, z]) => {
    // H 型钢柱：2 片翼缘 + 腹板
    const flange1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, FACTORY.H, 0.12), pillarMat)
    flange1.position.set(x, FACTORY.H / 2, z - 0.18); flange1.castShadow = true; scene.add(flange1)
    const flange2 = flange1.clone(); flange2.position.z = z + 0.18; scene.add(flange2)
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.12, FACTORY.H, 0.36), pillarMat)
    web.position.set(x, FACTORY.H / 2, z); web.castShadow = true; scene.add(web)
  })

  // === 5) 屋顶桁架 + 彩钢板 + 悬挂 LED 工矿灯 ===
  buildRoofAndLighting()

  // === 6) 墙上监控摄像头（4 角） ===
  buildSurveillanceCameras()

  // === 7) 顶部消防管道/通风管 ===
  buildPipingSystem()

  // === 8) 重型货架（仓储区） ===
  buildStorageRacks()

  // === 9) 桥式起重机（龙门吊，沿车间长向跨线移动） ===
  buildBridgeCrane()

  // === 10) AGV 自动导引车（在地面路径上移动） ===
  buildAGVs()

  // === 11) 灭火器/配电柜/安全出口 ===
  buildSafetyFacilities()

  // === 12) 车间环境设施（防静电地坪标识 / 粉尘排风 / 温湿度控制 / 防静电周转箱）===
  buildEnvironmentFacilities()

  // === 13) 真实环境联动设施（PIR 人员小人 / 货物计数牌）===
  buildRealtimeFacilities()
}

// === 真实环境联动设施：PIR 人员小人 + 货物计数牌（数值来自真实硬件）===
function buildRealtimeFacilities() {
  personMesh = buildPersonFigure()
  personMesh.position.set(-6, 0, -14)
  scene.add(personMesh)

  counterCanvas = document.createElement('canvas'); counterCanvas.width = 512; counterCanvas.height = 160
  const tex = new THREE.CanvasTexture(counterCanvas); tex.needsUpdate = true
  counterSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  counterSprite.position.set(-9, 3.4, -8.5)
  counterSprite.scale.set(5, 1.55, 1)
  counterSprite.renderOrder = 999
  scene.add(counterSprite)
}

// === 地面功能分区划线（加工区 / 装配区 / 仓储区 / 通道） ===
function buildFloorMarkings() {
  const lineMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })
  const mkLine = (x, z, w, h, mat, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    m.rotation.x = -Math.PI / 2; m.rotation.y = rotY
    m.position.set(x, 0.018, z); scene.add(m)
  }

  // 车间外轮廓（黄黑警示边界）
  const yellow = lineMat(0xffcc00)
  mkLine(0, -HALF_D + 0.2, FACTORY.W - 1, 0.15, yellow)
  mkLine(0, HALF_D - 0.2, FACTORY.W - 1, 0.15, yellow)
  mkLine(-HALF_W + 0.2, 0, 0.15, FACTORY.D - 1, yellow)
  mkLine(HALF_W - 0.2, 0, 0.15, FACTORY.D - 1, yellow)

  // 人行通道（绿色）- 右侧纵向
  const green = lineMat(0x16a34a)
  for (let i = 0; i < 5; i++) {
    mkLine(HALF_W - 3.5, -HALF_D + 4 + i * 7, 1.2, 3, green)
  }
  mkLine(HALF_W - 3.5, 0, 1.2, FACTORY.D - 4, lineMat(0x16a34a), Math.PI / 2)
  // 虚线
  const dash = lineMat(0x86efac)
  for (let z = -HALF_D + 2; z < HALF_D - 2; z += 1.4) {
    mkLine(HALF_W - 3.5, z, 0.06, 0.7, dash)
  }

  // 叉车主干道（黄色虚线）- 中间 X 轴方向
  const roadEdge = lineMat(0xeab308)
  mkLine(0, -2.2, FACTORY.W - 4, 0.08, roadEdge)
  mkLine(0, 2.2, FACTORY.W - 4, 0.08, roadEdge)
  for (let x = -HALF_W + 3; x < HALF_W - 3; x += 1.6) {
    mkLine(x, 0, 1, 0.08, yellow)
  }

  // 分区方框：加工区（蓝）、装配区（青）、仓储区（橙）、检验区（紫）
  const regions = [
    { x: -18, z: -9, w: 16, h: 10, c: 0x3b82f6, name: '加工区' },
    { x: -5, z: -9, w: 14, h: 10, c: 0x06b6d4, name: '装配区' },
    { x: 14, z: -9, w: 14, h: 10, c: 0xf97316, name: '检测区' },
    { x: -18, z: 10, w: 16, h: 10, c: 0x8b5cf6, name: '冲压/激光区' },
    { x: 14, z: 10, w: 14, h: 10, c: 0x10b981, name: '仓储/物流区' },
  ]
  regions.forEach(r => {
    const rm = lineMat(r.c)
    mkLine(r.x, r.z - r.h / 2, r.w, 0.1, rm)
    mkLine(r.x, r.z + r.h / 2, r.w, 0.1, rm)
    mkLine(r.x - r.w / 2, r.z, 0.1, r.h, rm)
    mkLine(r.x + r.w / 2, r.z, 0.1, r.h, rm)
    // 区域名 Sprite
    const cvs = document.createElement('canvas'); cvs.width = 512; cvs.height = 160
    const cx = cvs.getContext('2d')
    cx.fillStyle = `rgba(${hexToRgb(r.c)},0.12)`
    cx.strokeStyle = `#${r.c.toString(16).padStart(6, '0')}`; cx.lineWidth = 4
    roundRect(cx, 0, 0, 512, 160, 24); cx.fill(); cx.stroke()
    cx.fillStyle = `#${r.c.toString(16).padStart(6, '0')}`
    cx.font = 'bold 58px "Microsoft YaHei"'
    cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText(r.name, 256, 80)
    const tex = new THREE.CanvasTexture(cvs); tex.needsUpdate = true
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
    sp.position.set(r.x, 0.08, r.z); sp.scale.set(6, 1.9, 1)
    sp.renderOrder = 1000; scene.add(sp)
  })
}
function hexToRgb(hex) {
  const h = hex.toString(16).padStart(6, '0')
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

// === 厂房墙体 + 大面积玻璃窗 + 大门 ===
function buildFactoryWalls() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b4474, roughness: 0.75, metalness: 0.1 })
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4b568a, metalness: 0.55, roughness: 0.4 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa9d4ff, metalness: 0, roughness: 0.05,
    transmission: 0.82, transparent: true, opacity: 0.4, thickness: 0.1, ior: 1.2,
  })

  // 4 面墙仅保留"上下两截墙身"（腰墙 + 女儿墙下部），中间全部让出给大面积玻璃幕墙
  const wallTopY = FACTORY.H - 0.2,  wallTopH = 1.8   // 上部矮墙（梁下）
  const wallBotY = 0.9,             wallBotH = 1.8   // 下部腰墙
  // 北
  addStrip(-HALF_D, 0, 'z')
  addStrip(HALF_D, 0, 'z')
  addStrip(-HALF_W, 0, 'x')
  addStrip(HALF_W, 0, 'x')
  function addStrip(pos, _o, axis) {
    const isX = axis === 'x'
    // 下部矮墙
    const botGeom = isX
      ? new THREE.BoxGeometry(0.4, wallBotH, FACTORY.D)
      : new THREE.BoxGeometry(FACTORY.W, wallBotH, 0.4)
    const bot = new THREE.Mesh(botGeom, wallMat)
    bot.receiveShadow = true
    if (isX) bot.position.set(pos, wallBotY / 2 + 0.05, 0)
    else bot.position.set(0, wallBotY / 2 + 0.05, pos)
    scene.add(bot)
    // 上部矮墙（屋架下方）
    const topGeom = isX
      ? new THREE.BoxGeometry(0.4, wallTopH, FACTORY.D)
      : new THREE.BoxGeometry(FACTORY.W, wallTopH, 0.4)
    const top = new THREE.Mesh(topGeom, wallMat)
    top.receiveShadow = true
    if (isX) top.position.set(pos, FACTORY.H - wallTopH / 2, 0)
    else top.position.set(0, FACTORY.H - wallTopH / 2, pos)
    scene.add(top)
  }

  // === 中间段：大面积通长玻璃幕墙（高侧窗）===
  // 玻璃高度： wallBotY + 0.05  → FACTORY.H - wallTopH
  const glTop = FACTORY.H - wallTopH
  const glBot = wallBotY + 0.05
  const glH = glTop - glBot
  const mkWindow = (x, z, w, h, d = 0.12, rotY = 0) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1), frameMat)
    f.rotation.y = rotY; f.position.set(x, glBot + h / 2, z); scene.add(f)
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat)
    g.rotation.y = rotY; g.position.set(x, glBot + h / 2, z); scene.add(g)
    // 横竖分格
    for (let k = 1; k < 3; k++) {
      const sub1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.1), frameMat)
      sub1.rotation.y = rotY; sub1.position.set(x, glBot + (h * k) / 3, z); scene.add(sub1)
      const sub2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.1), frameMat)
      sub2.rotation.y = rotY; sub2.position.set(x, glBot + h / 2, z); scene.add(sub2)
    }
  }

  // 北墙：大门 + 两侧通长玻璃
  for (let i = -5; i <= 5; i++) {
    const wx = i * 5
    if (Math.abs(wx) < 8) continue
    mkWindow(wx, -HALF_D + 0.3, 4.2, glH, 0.12, 0)
  }

  // 南墙：整面通长玻璃幕墙（9 块大窗，几乎全透明）
  for (let i = -5; i <= 5; i++) {
    mkWindow(i * 5, HALF_D - 0.3, 4.4, glH, 0.12, 0)
  }
  // 东西墙：通长玻璃 + 大门 + 消防
  ;[-1, 1].forEach(side => {
    const x0 = side * HALF_W
    for (let z = -14; z <= 14; z += 5) {
      if (Math.abs(z - 10) < 3) continue
      mkWindow(x0 + (side > 0 ? -0.3 : 0.3), z, 0.12, glH, 4.2, Math.PI / 2)
    }
    // 侧大门（卷帘门，绿色）
    const sd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.8, 5), new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.6, roughness: 0.35 }))
    sd.position.set(x0 + (side > 0 ? -0.25 : 0.25), 2, 10); scene.add(sd)
    // 门上窗户
    const sdg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 4.6), glassMat)
    sdg.position.set(x0 + (side > 0 ? -0.12 : 0.12), 3.3, 10); scene.add(sdg)
    // 消防箱（红色）
    const fb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: 0xb91c1c }))
    fb.position.set(x0 + (side > 0 ? -0.25 : 0.25), 1.8, -4); scene.add(fb)
    const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 128
    const cx = cvs.getContext('2d')
    cx.fillStyle = '#fecaca'; cx.font = 'bold 40px "Microsoft YaHei"'
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('消火栓', 128, 64)
    const tex = new THREE.CanvasTexture(cvs)
    const fbLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
    fbLabel.position.set(x0 + (side > 0 ? -0.15 : 0.15), 2.1, -4); fbLabel.rotation.y = side * Math.PI / 2; scene.add(fbLabel)
  })

  // 北墙中央：厂房主大门（蓝色卷帘门 9m×5.5m + 坡道 + 安全出口指示）
  const doorWidth = 9, doorHeight = 5.5
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.6, doorHeight + 0.6, 0.55), frameMat)
  doorFrame.position.set(0, doorHeight / 2 + 0.4, -HALF_D + 0.1); scene.add(doorFrame)
  const rollDoor = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth, doorHeight, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1e40af, metalness: 0.6, roughness: 0.35 })
  )
  rollDoor.position.set(0, doorHeight / 2 + 0.4, -HALF_D + 0.32); scene.add(rollDoor)
  for (let i = 0; i < 14; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.2, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }))
    slat.position.set(0, 0.8 + i * 0.37, -HALF_D + 0.44); scene.add(slat)
  }
  // 门顶气窗（透明玻璃，门上部）
  const topGlass = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 1.1, 0.15), glassMat)
  topGlass.position.set(0, doorHeight + 0.35, -HALF_D + 0.35); scene.add(topGlass)
  // 坡道
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.4, 0.2, 3.5), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }))
  ramp.position.set(0, -0.1, -HALF_D - 1.8); ramp.rotation.x = 0.08; ramp.receiveShadow = true; scene.add(ramp)
  // 门口两侧「安全出口」发光指示牌（绿光 + 点光源）
  ;[-1, 1].forEach(sign => {
    const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 128
    const cx = cvs.getContext('2d')
    cx.fillStyle = 'rgba(20,83,45,0.95)'; cx.fillRect(0, 0, 256, 128)
    cx.strokeStyle = '#22c55e'; cx.lineWidth = 5; cx.strokeRect(0, 0, 256, 128)
    cx.fillStyle = '#86efac'; cx.font = 'bold 52px "Microsoft YaHei"'
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('安全出口', 128, 64)
    const tex = new THREE.CanvasTexture(cvs)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
    pl.position.set(sign * (doorWidth / 2 + 1), 3, -HALF_D + 0.35); scene.add(pl)
    const exitLight = new THREE.PointLight(0x22c55e, 0.3, 4); exitLight.position.set(sign * (doorWidth / 2 + 1), 3, -HALF_D + 0.8); scene.add(exitLight)
  })
}

// === 屋顶桁架 + 玻璃采光顶（车间高空透视）+ LED 工矿灯 ===
function buildRoofAndLighting() {
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a5588, metalness: 0.65, roughness: 0.38 })

  // 主承重桁架（纵向主梁）
  for (let i = -HALF_W + 3; i <= HALF_W - 3; i += 5) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, FACTORY.D - 1), beamMat)
    b.position.set(i, FACTORY.H - 0.5, 0); b.castShadow = true; scene.add(b)
  }
  // 横向次梁
  for (let j = -HALF_D + 3; j <= HALF_D - 3; j += 5) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(FACTORY.W - 1, 0.45, 0.4), beamMat)
    b.position.set(0, FACTORY.H - 0.5, j); b.castShadow = true; scene.add(b)
  }
  // 交叉斜撑（菱形桁架，更有工业感）
  for (let x = -HALF_W + 3; x < HALF_W - 3; x += 5) {
    for (let z = -HALF_D + 3; z < HALF_D - 3; z += 5) {
      const len = Math.SQRT2 * 5
      const dia1 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), beamMat)
      dia1.rotation.y = Math.PI / 4; dia1.position.set(x + 2.5, FACTORY.H - 0.55, z + 2.5); scene.add(dia1)
      const dia2 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), beamMat)
      dia2.rotation.y = -Math.PI / 4; dia2.position.set(x + 2.5, FACTORY.H - 0.55, z + 2.5); scene.add(dia2)
    }
  }

  // === 玻璃采光顶：高空相机可完全看穿到车间内部 ===
  const skylightMat = new THREE.MeshPhysicalMaterial({
    color: 0xc5e0ff, metalness: 0, roughness: 0.05,
    transmission: 0.92, transparent: true, opacity: 0.22,
    thickness: 0.15, ior: 1.15, clearcoat: 0.3,
  })
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(FACTORY.W - 1.5, 0.18, FACTORY.D - 1.5), skylightMat)
  skylight.position.set(0, FACTORY.H - 0.2, 0); scene.add(skylight)
  // 玻璃分格压条（黑色横纵格）
  const mullMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.5 })
  for (let x = -HALF_W + 3; x <= HALF_W - 3; x += 2.5) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, FACTORY.D - 1.5), mullMat)
    l.position.set(x, FACTORY.H - 0.1, 0); scene.add(l)
  }
  for (let z = -HALF_D + 3; z <= HALF_D - 3; z += 2.5) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(FACTORY.W - 1.5, 0.04, 0.08), mullMat)
    l.position.set(0, FACTORY.H - 0.1, z); scene.add(l)
  }

  // 女儿墙（屋顶四周一圈矮墙）
  const parapet = new THREE.MeshStandardMaterial({ color: 0x3b4474, metalness: 0.3, roughness: 0.75 })
  const walls = [
    [-HALF_W + 0.2, 0, 0, 0.4, 0.9, FACTORY.D],
    [ HALF_W - 0.2, 0, 0, 0.4, 0.9, FACTORY.D],
    [0, 0, -HALF_D + 0.2, FACTORY.W, 0.9, 0.4],
    [0, 0,  HALF_D - 0.2, FACTORY.W, 0.9, 0.4],
  ]
  walls.forEach(([x, y, z, w, h, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), parapet)
    m.position.set(x, FACTORY.H + 0.45, z); scene.add(m)
  })

  // 悬挂 LED 长条形工矿灯（外观保留 + 只用 4 个大强度 PointLight 补光，不再用昂贵 RectAreaLight）
  // 发光面材质与点光源收集到模块级引用：随真实照明继电器状态亮灭（applyEnvironment）
  const lampHousing = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
  lampEmitterMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc })
  const lampPositions = []
  for (let z = -HALF_D + 5; z <= HALF_D - 5; z += 9) {
    for (let x = -HALF_W + 7; x <= HALF_W - 7; x += 12) {
      lampPositions.push([x, z])
    }
  }
  lampPositions.forEach(([x, z]) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), beamMat)
    rod.position.set(x, FACTORY.H - 1.2, z); scene.add(rod)
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.7), lampHousing)
    h1.position.set(x, FACTORY.H - 2.0, z); scene.add(h1)
    const em = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 0.55), lampEmitterMat)
    em.position.set(x, FACTORY.H - 2.06, z); scene.add(em)
  })
  // 仅 4 个点光源做区域补光（角落 + 中心），成本 = 4 × 极便宜的 PointLight
  const ceilingLights = [
    [0, 0, 2.4],
    [-HALF_W * 0.55, HALF_D * 0.55, 1.4],
    [ HALF_W * 0.55, HALF_D * 0.55, 1.4],
    [-HALF_W * 0.55, -HALF_D * 0.55, 1.4],
    [ HALF_W * 0.55, -HALF_D * 0.55, 1.4],
  ]
  ceilingPointLights = []
  ceilingLights.forEach(([x, z, inten]) => {
    const pl = new THREE.PointLight(0xffe8b2, inten, 40, 1.8)
    pl.position.set(x, FACTORY.H - 3.5, z)
    pl.userData.baseIntensity = inten
    scene.add(pl)
    ceilingPointLights.push(pl)
  })
}

// === 监控摄像头（4 角 + 立柱高点） ===
function buildSurveillanceCameras() {
  const camPositions = [
    [-HALF_W + 0.7, FACTORY.H - 1.2, -HALF_D + 0.7, 0.8, -0.8],
    [HALF_W - 0.7, FACTORY.H - 1.2, -HALF_D + 0.7, -0.8, -0.8],
    [-HALF_W + 0.7, FACTORY.H - 1.2, HALF_D - 0.7, 0.8, 0.8],
    [HALF_W - 0.7, FACTORY.H - 1.2, HALF_D - 0.7, -0.8, 0.8],
  ]
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.55 })
  camPositions.forEach(([x, y, z, lookX, lookZ]) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.15, 12), bodyMat)
    base.position.set(x, y, z); scene.add(base)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), bodyMat)
    arm.position.set(x + lookX * 0.2, y - 0.15, z + lookZ * 0.2)
    arm.rotation.y = Math.atan2(lookX, lookZ); scene.add(arm)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), bodyMat)
    head.position.set(x + lookX * 0.4, y - 0.25, z + lookZ * 0.4); scene.add(head)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.5), domeMat)
    dome.position.set(x + lookX * 0.42, y - 0.28, z + lookZ * 0.42); scene.add(dome)
    // 红色工作灯（安全帽告警时闪烁，led 连同点光源收集到 cameraLeds）
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: 0xff1744 }))
    led.position.set(x, y + 0.08, z); scene.add(led)
    const ledPl = new THREE.PointLight(0xff1744, 0.1, 1.5); ledPl.position.set(x, y + 0.1, z); scene.add(ledPl)
    led.userData.pl = ledPl
    cameraLeds.push(led)
  })
}

// === 消防/通风管道（空中架设） ===
function buildPipingSystem() {
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.5 })
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.5 }) // 红色消防管
  // 主通风管（方管，沿整个车间纵向）
  const vent = new THREE.Mesh(new THREE.BoxGeometry(FACTORY.W - 2, 0.8, 1), ventMat)
  vent.position.set(0, FACTORY.H - 3.2, -HALF_D + 4); vent.castShadow = true; scene.add(vent)
  const vent2 = vent.clone(); vent2.position.z = HALF_D - 4; scene.add(vent2)
  // 支管
  for (let i = -HALF_W + 6; i <= HALF_W - 6; i += 8) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, HALF_D * 2 - 8), ventMat)
    br.position.set(i, FACTORY.H - 3.2, 0); scene.add(br)
  }
  // 消防喷淋管道（圆管，红）
  const fire1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, FACTORY.W - 2, 12), pipeMat)
  fire1.rotation.z = Math.PI / 2; fire1.position.set(0, FACTORY.H - 4, 0); scene.add(fire1)
  for (let z = -HALF_D + 3; z <= HALF_D - 3; z += 6) {
    const fire2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FACTORY.D - 6, 12), pipeMat)
    fire2.position.set(0, FACTORY.H - 4.1, z); scene.add(fire2)
    // 喷淋头
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8 }))
    sp.rotation.x = Math.PI; sp.position.set(0, FACTORY.H - 4.4, z); scene.add(sp)
  }
}

// === 重型仓储货架（立体货架 × 多排） ===
function buildStorageRacks() {
  const areaX = 14, areaZ = 10
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 })
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.4, roughness: 0.55 })
  // 信创整机产品包装色系：牛皮纸箱 + 深色机箱盒 + 银灰 + 品牌标签色
  const boxColors = [0x92400e, 0x78350f, 0x1f2937, 0x4b5563, 0x6b7280, 0x1e3a8a, 0x166534, 0xb45309]
  // 产品类型（按包装比例）：台式机塔箱/笔记本扁盒/服务器大箱/打印机中箱/云终端小盒
  const productTypes = [
    { w: 0.45, h: 0.95, d: 0.45 }, // P1 台式机塔箱（高窄）
    { w: 0.55, h: 0.20, d: 0.40 }, // N1 笔记本扁盒（扁平）
    { w: 0.90, h: 0.78, d: 0.80 }, // S1 服务器大箱（方箱）
    { w: 0.70, h: 0.62, d: 0.70 }, // L1 打印机中箱
    { w: 0.32, h: 0.28, d: 0.32 }, // 云终端小盒
  ]
  const boxGeo = new THREE.BoxGeometry(1, 1, 1) // 1×1×1，通过矩阵缩放改尺寸
  const dummy = new THREE.Object3D()

  const mkRack = (cx, cz, cols = 5, levels = 3, rotY = 0) => {
    const g = new THREE.Group()
    const bayW = 2.2, bayD = 1.4, levelH = 2
    const totalW = cols * bayW

    // ====== 结构体全部用 mergeGeometries 合并为 1 个 mesh（frame+deck 两种材质 → 两个 merged）======
    const frameGeos = [], deckGeos = []
    const pushBox = (arr, w, h, d, px, py, pz, rotY = 0, rotZ = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d)
      const m4 = new THREE.Matrix4().makeTranslation(px, py, pz)
      if (rotY) m4.multiply(new THREE.Matrix4().makeRotationY(rotY))
      if (rotZ) m4.multiply(new THREE.Matrix4().makeRotationZ(rotZ))
      geo.applyMatrix4(m4); arr.push(geo)
    }
    // 立柱
    for (let c = 0; c <= cols; c++) {
      for (let s = -1; s <= 1; s += 2) {
        pushBox(frameGeos, 0.1, levels * levelH + 0.2, 0.1,
          -totalW / 2 + c * bayW, (levels * levelH + 0.2) / 2, s * bayD / 2)
      }
    }
    // 横梁 + 层板
    for (let lv = 0; lv <= levels; lv++) {
      const y = lv * levelH
      for (let c = 0; c < cols; c++) {
        const cx2 = -totalW / 2 + (c + 0.5) * bayW
        pushBox(frameGeos, bayW, 0.1, 0.08, cx2, y, bayD / 2)
        pushBox(frameGeos, bayW, 0.1, 0.08, cx2, y, -bayD / 2)
        if (lv < levels) pushBox(deckGeos, bayW * 0.96, 0.08, bayD * 0.92, cx2, y + 0.08, 0)
      }
    }
    const frameMerged = new THREE.Mesh(mergeGeometries(frameGeos), frameMat)
    frameMerged.castShadow = true; frameMerged.receiveShadow = true; g.add(frameMerged)
    const deckMerged = new THREE.Mesh(mergeGeometries(deckGeos), deckMat)
    deckMerged.castShadow = true; deckMerged.receiveShadow = true; g.add(deckMerged)

    // ====== 每层箱子统一用 InstancedMesh（1 个 drawcall 渲染 ~72 个箱子 × 4 排货架 = 1 个 IM / 每排）======
    const boxMats = boxColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 }))
    const MAX = cols * levels * 2
    const instBoxes = boxMats.map(m => new THREE.InstancedMesh(boxGeo, m, MAX))
    instBoxes.forEach(im => { im.count = 0; im.castShadow = true; im.receiveShadow = true; g.add(im) })
    let counters = new Array(boxMats.length).fill(0)

    for (let lv = 0; lv < levels; lv++) {
      for (let c = 0; c < cols; c++) {
        const cx2 = -totalW / 2 + (c + 0.5) * bayW
        const y = lv * levelH + 0.3
        if (Math.random() > 0.4) {
          // 按产品类型选取包装尺寸，加入轻微随机抖动
          const pt = productTypes[Math.floor(Math.random() * productTypes.length)]
          const bw = pt.w * (0.95 + Math.random() * 0.1)
          const bd = pt.d * (0.95 + Math.random() * 0.1)
          const bh = pt.h * (0.95 + Math.random() * 0.1)
          const ci = Math.floor(Math.random() * boxColors.length)
          // 横向居中 + 纵向贴层板
          dummy.position.set(cx2 + (Math.random() - 0.5) * 0.25, y + bh / 2, (Math.random() - 0.5) * 0.3)
          dummy.scale.set(bw, bh, bd)
          dummy.rotation.set(0, Math.random() * 0.2 - 0.1, 0)
          dummy.updateMatrix()
          instBoxes[ci].setMatrixAt(counters[ci], dummy.matrix)
          instBoxes[ci].count = Math.max(instBoxes[ci].count, counters[ci] + 1)
          counters[ci]++
        }
      }
    }
    // 未使用任何实例的 InstancedMesh 移除（不占 draw call）
    instBoxes.forEach(im => { if (im.count === 0) g.remove(im) })

    g.position.set(cx, 0, cz); g.rotation.y = rotY
    scene.add(g)
  }

  // 仓储区：4 排货架
  mkRack(areaX - 4, areaZ - 1.5, 4, 3)
  mkRack(areaX + 2, areaZ - 1.5, 4, 3)
  mkRack(areaX - 4, areaZ + 4, 4, 3)
  mkRack(areaX + 2, areaZ + 4, 4, 3)
  // 空托盘堆
  const palletMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.95 })
  for (let p = 0; p < 6; p++) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1), palletMat)
    pallet.position.set(areaX + 7, 0.1 + p * 0.17, areaZ - 6 + p * 0.4)
    scene.add(pallet)
  }
}

// === 桥式起重机（龙门吊）===
function buildBridgeCrane() {
  crane = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.35 })
  const girdMat = new THREE.MeshStandardMaterial({ color: 0x78350f, metalness: 0.7, roughness: 0.3 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.25 })

  // 横梁（横跨车间，大车在其上左右跑）
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, FACTORY.D - 7), girdMat)
  bridge.position.set(0, FACTORY.H - 1, 0); crane.add(bridge)

  // 横梁两端支撑小车 + 端梁（大车轨道沿厂房纵向 z 轴？这里让它沿 X 轴跑动）
  const endRail1 = new THREE.Mesh(new THREE.BoxGeometry(FACTORY.W - 2, 0.3, 0.5), frameMat)
  endRail1.position.set(0, FACTORY.H - 1.35, -(HALF_D - 3)); scene.add(endRail1) // 作为世界场景的一部分（固定轨道）
  const endRail2 = endRail1.clone(); endRail2.position.z = HALF_D - 3; scene.add(endRail2)

  ;[-1, 1].forEach(s => {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.2), frameMat)
    truck.position.set(0, FACTORY.H - 1.15, s * (HALF_D - 3.5)); crane.add(truck)
    // 4 车轮（每端 2 个，跨在端轨上）
    for (let w = -1; w <= 1; w += 2) {
      const wheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 18), wheelMat)
      wheel1.rotation.z = Math.PI / 2
      wheel1.position.set(w * 0.6, FACTORY.H - 1.5, s * (HALF_D - 3.3))
      crane.add(wheel1)
      const wheel2 = wheel1.clone()
      wheel2.position.z = s * (HALF_D - 3.7)
      crane.add(wheel2)
    }
  })

  // 电动葫芦（沿横梁 z 向移动）
  const hoistGrp = new THREE.Group()
  const hoist = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 1.6), frameMat)
  hoist.position.y = FACTORY.H - 2.2; hoistGrp.add(hoist)
  const hoistCab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x1f2937 }))
  hoistCab.position.set(-0.9, FACTORY.H - 1.9, 0); hoistGrp.add(hoistCab)
  const hoistLabel = makeTextSprite('10T 桥式起重机', '#f59e0b', 300, 70, 20)
  hoistLabel.position.set(0, FACTORY.H - 0.4, 0); hoistLabel.scale.set(4, 0.95, 1); hoistGrp.add(hoistLabel)

  // 钢缆 + 吊钩（可上下）
  const hookGrp = new THREE.Group()
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.9, roughness: 0.2 })
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 10), cableMat)
  cable.position.y = FACTORY.H - 4.2; hookGrp.add(cable)
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.15, 18), wheelMat)
  pulley.rotation.x = Math.PI / 2; pulley.position.y = FACTORY.H - 3.1; hookGrp.add(pulley)
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.25), frameMat)
  spreader.position.y = FACTORY.H - 5.3; hookGrp.add(spreader)
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 10, 20, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.8 }))
  hook.rotation.z = Math.PI * 0.9; hook.position.y = FACTORY.H - 5.7; hookGrp.add(hook)
  hoistGrp.add(hookGrp)
  crane.add(hoistGrp)

  // 警示条纹（横梁）
  for (let i = -(HALF_D - 5); i <= HALF_D - 5; i += 3) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x1f2937 }))
    stripe.position.set(0, FACTORY.H - 0.6, i); crane.add(stripe)
    const stripe2 = stripe.clone(); stripe2.material = new THREE.MeshStandardMaterial({ color: 0xffcc00 })
    stripe2.position.z = i + 1.5; crane.add(stripe2)
  }

  crane.userData = { hoistGrp, hookGrp, baseX: 0, t: 0 }
  scene.add(crane)
}
function makeTextSprite(txt, colorHex = '#fff', cw = 300, ch = 80, fs = 28) {
  const cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = ch
  const cx = cvs.getContext('2d')
  cx.fillStyle = 'rgba(12,20,45,0.85)'; cx.strokeStyle = colorHex; cx.lineWidth = 3
  roundRect(cx, 0, 0, cw, ch, 10); cx.fill(); cx.stroke()
  cx.fillStyle = colorHex; cx.font = `bold ${fs}px "Microsoft YaHei"`
  cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(txt, cw / 2, ch / 2)
  const tex = new THREE.CanvasTexture(cvs); tex.needsUpdate = true
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
}

// ========== 真实硬件设备 3D 模型（与后端 devices 表一一对应） ==========

// RK3568 网关机柜（MQTT 数据枢纽）
const buildGatewayCabinet = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 })
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1), m); cab.position.y = 1.2; g.add(cab)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.03), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.5 }))
  door.position.set(0, 1.2, 0.52); g.add(door)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 }))
  handle.position.set(0.45, 1.2, 0.56); g.add(handle)
  // 顶部双天线
  for (const sx of [-0.4, 0.4]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x1f2937 }))
    ant.position.set(sx, 2.8, 0); g.add(ant)
  }
  // 前面板状态灯（末位蓝色网络灯由 animate 闪烁）
  const netLeds = []
  ;[0x22c55e, 0xeab308, 0xef4444, 0x3b82f6].forEach((c, i) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: c }))
    led.position.set(-0.42 + i * 0.2, 2.1, 0.54); g.add(led); netLeds.push(led)
  })
  // 散热栅格
  for (let i = 0; i < 6; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x0a0f1e }))
    vent.position.set(0, 0.6 + i * 0.18, 0.53); g.add(vent)
  }
  g.userData = { netLeds }
  return g
}
// 光照传感器（LDR+ADC）
const buildLightSensor = (color) => {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10), new THREE.MeshStandardMaterial({ color, metalness: 0.7 }))
  pole.position.y = 0.5; g.add(pole)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0x92400e, emissiveIntensity: 0.25 }))
  head.position.y = 1.05; g.add(head)
  return g
}
// 人体红外传感器（PIR，白色菲涅尔罩）
const buildPirSensor = (color) => {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), new THREE.MeshStandardMaterial({ color, metalness: 0.6 }))
  pole.position.y = 0.35; g.add(pole)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, transparent: true, opacity: 0.85 }))
  dome.position.y = 0.72; g.add(dome)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
  led.position.set(0.12, 0.78, 0.14); g.add(led)
  g.userData = { pirLed: led }
  return g
}
// 照明继电器（执行器：3D 点击可真实开关车间灯）
const buildLightRelay = (color) => {
  const g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.6), new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 }))
  box.position.y = 0.65; g.add(box)
  // 继电器模块 ×2（蓝色小块 + 状态灯）
  const relays = []
  for (let i = 0; i < 2; i++) {
    const rly = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }))
    rly.position.set(-0.22 + i * 0.44, 0.9, 0.33); g.add(rly)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
    led.position.set(-0.22 + i * 0.44, 0.55, 0.33); g.add(led); relays.push(led)
  }
  // 接线端子
  for (let i = 0; i < 4; i++) {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
    port.position.set(-0.3 + i * 0.2, 0.15, 0.33); g.add(port)
  }
  g.userData = { relayLeds: relays }
  return g
}
// RGB 状态指示灯柱（执行器：点击选色下发真实 rgb 指令）
const buildRgbLamp = (color) => {
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6 }))
  base.position.y = 0.12; g.add(base)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }))
  pole.position.y = 0.75; g.add(pole)
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x374151 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), lampMat)
  lamp.position.y = 1.45; g.add(lamp)
  const pl = new THREE.PointLight(0x000000, 0, 5); pl.position.y = 1.45; g.add(pl)
  g.userData = { rgbLampMat: lampMat, rgbLight: pl }
  return g
}
// 有源蜂鸣器（执行器：点击下发真实 beep 指令）
const buildBuzzer = (color) => {
  const g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 }))
  box.position.y = 0.45; g.add(box)
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0x111827 }))
  horn.position.y = 0.98; g.add(horn)
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshBasicMaterial({ color: 0x000000 }))
  hole.rotation.x = -Math.PI / 2; hole.position.y = 1.07; g.add(hole)
  return g
}
// 红外对射货物计数器（真实 count 显示在计数牌）
const buildCounterGate = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  for (const sx of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), m)
    post.position.set(sx, 0.6, 0); g.add(post)
    const emit = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), new THREE.MeshStandardMaterial({ color: sx < 0 ? 0xef4444 : 0x22c55e }))
    emit.rotation.z = Math.PI / 2; emit.position.set(sx * 0.82, 1.0, 0); g.add(emit)
  }
  // 对射光束（发射端 → 接收端）
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.55, 6), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35 }))
  beam.rotation.z = Math.PI / 2; beam.position.y = 1.0; g.add(beam)
  return g
}
// 用户自建设备（后端新增、暂无专属模型）的通用形象
const buildRealBox = (color) => {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 1.0), new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 }))
  body.position.y = 0.75; g.add(body)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
  scr.position.set(0, 1.0, 0.51); g.add(scr)
  return g
}

// PIR 在场人员小人（真实人体红外驱动显示/隐藏）
const buildPersonFigure = () => {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.85, 10), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }))
  body.position.y = 0.75; g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfcd34d }))
  head.position.y = 1.36; g.add(head)
  // 红色安全帽（呼应安全帽检测主题）
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdc2626 }))
  helmet.position.y = 1.4; g.add(helmet)
  for (const sx of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x1e293b }))
    leg.position.set(sx, 0.18, 0); g.add(leg)
  }
  g.visible = false
  return g
}

// === AGV 自动导引车（地面循迹移动） ===
function buildAGVs() {
  const colors = [0x2563eb, 0x059669, 0x7c3aed]
  const paths = [
    // 路径1：沿叉车主干道 X 向（z=-2 中间道路）
    (t, out) => out.set(Math.sin(t * 0.35) * (HALF_W - 5), 0, -2),
    // 路径2：环绕仓储/物流区（x 在 8~22，z 在 4~16 椭圆）
    (t, out) => out.set(15 + Math.cos(t * 0.32) * 7, 0, 10 + Math.sin(t * 0.32) * 5),
    // 路径3：检测区(+x) ↔ 装配区(-x) 走中间通道
    (t, out) => out.set(5 + Math.sin(t * 0.4) * 13, 0, 2 + Math.cos(t * 0.4) * 3),
  ]
  colors.forEach((c, idx) => {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1), new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.4 }))
    body.position.y = 0.35; g.add(body)
    // 4 轮
    const wm = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 })
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 14), wm)
      wh.rotation.z = Math.PI / 2; wh.position.set(i * 0.6, 0.14, j * 0.45); g.add(wh)
    }
    // 货台（放一个料箱）
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.9), new THREE.MeshStandardMaterial({ color: 0x374151 }))
    top.position.y = 0.57; g.add(top)
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 }))
    box.position.y = 0.9; g.add(box)
    // 顶部状态灯（蓝闪）
    const pl = new THREE.PointLight(c, 0.4, 4); pl.position.y = 1.5; g.add(pl)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshBasicMaterial({ color: c }))
    led.position.y = 1.5; g.add(led)
    g.userData = { path: paths[idx], t: idx * 2, col: c }
    // 初始位置（给 path 传一个临时向量接收）
    const tmp = new THREE.Vector3()
    paths[idx](idx * 2, tmp)
    g.position.copy(tmp)
    agvMeshes.push(g); scene.add(g)
  })
}

// === 安全/配电设施 ===
function buildSafetyFacilities() {
  // 配电柜（左侧靠墙，一排）
  const cabColors = [0x1e3a8a, 0x1e40af, 0x1e3a8a, 0x1d4ed8]
  for (let i = 0; i < 4; i++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: cabColors[i], metalness: 0.5, roughness: 0.45 }))
    cab.position.set(-HALF_W + 0.9, 1.1, -HALF_D + 4 + i * 2.4)
    cab.castShadow = true; cab.receiveShadow = true; scene.add(cab)
    // 指示灯（3 色）
    const lcs = [0x22c55e, 0xeab308, 0xef4444]
    lcs.forEach((lc, li) => {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: lc }))
      dot.position.set(-HALF_W + 0.65, 1.8, -HALF_D + 3.7 + i * 2.4 + li * 0.15)
      dot.rotation.y = Math.PI / 2; scene.add(dot)
    })
  }
  // 地上工具箱（靠近加工区）
  for (let i = 0; i < 3; i++) {
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.3, roughness: 0.55 }))
    toolbox.position.set(-18, 0.45, -4 + i * 1.8); scene.add(toolbox)
  }
  // 气罐（空压机附近）
  for (let i = 0; i < 2; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.5, 18), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.5, roughness: 0.35 }))
    tank.position.set(-13 + i * 1.3, 1.25, 8); tank.castShadow = true; scene.add(tank)
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf59e0b }))
    top.position.set(-13 + i * 1.3, 2.5, 8); scene.add(top)
  }
}

// === 车间环境设施：防静电地坪标识 / 粉尘排风装置 / 温湿度控制系统 / 防静电周转箱 ===
function buildEnvironmentFacilities() {
  // 1) 防静电地坪标识（ESD 警示地贴，黄黑三角 + "ESD" 文字）
  const esdZones = [
    { x: -15, z: 5 }, { x: 15, z: 5 }, { x: -15, z: 9 }, { x: 6, z: 5 }, { x: -6, z: 5 },
  ]
  esdZones.forEach(({ x, z }) => {
    // 黄黑三角警示带（环绕工位）
    const triMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5 })
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.0, 6), triMat)
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.015, z); scene.add(ring)
    // ESD 文字地贴
    const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 64
    const cx = cvs.getContext('2d')
    cx.fillStyle = 'rgba(251,191,36,0.15)'; cx.fillRect(0, 0, 256, 64)
    cx.strokeStyle = '#fbbf24'; cx.lineWidth = 3; cx.strokeRect(2, 2, 252, 60)
    cx.fillStyle = '#fde68a'; cx.font = 'bold 28px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText('⚡ ESD 防静电区', 128, 32)
    const tex = new THREE.CanvasTexture(cvs); tex.needsUpdate = true
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
    sp.position.set(x, 0.06, z); sp.scale.set(3, 0.75, 1); sp.renderOrder = 999; scene.add(sp)
  })

  // 2) 粉尘排风装置（悬挂式排风罩 + 软管 + 排气管道，沿墙布置）
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.6, roughness: 0.35 })
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.7 })
  const ventPositions = [
    { x: -10, z: -HALF_D + 1 }, { x: 0, z: -HALF_D + 1 }, { x: 10, z: -HALF_D + 1 },
    { x: -10, z: HALF_D - 1 }, { x: 0, z: HALF_D - 1 }, { x: 10, z: HALF_D - 1 },
  ]
  ventPositions.forEach(({ x, z }) => {
    const sign = z < 0 ? 1 : -1
    // 排风罩（喇叭形）
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.4, 20), ventMat)
    hood.position.set(x, 3.5, z + sign * 0.3); hood.castShadow = true; scene.add(hood)
    // 软管（下垂弯管）
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 12), hoseMat)
    hose.position.set(x, 4.1, z + sign * 0.3); scene.add(hose)
    // 排气主管（沿墙水平管）
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4, 14), ventMat)
    pipe.rotation.z = Math.PI / 2; pipe.position.set(x, 4.7, z + sign * 0.5); scene.add(pipe)
    // 风扇叶片（可旋转）
    const fanGrp = new THREE.Group()
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.01, 0.08), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }))
      blade.rotation.y = b * Math.PI * 2 / 3; fanGrp.add(blade)
    }
    fanGrp.position.set(x, 3.5, z + sign * 0.3); scene.add(fanGrp)
    if (!window._envFans) window._envFans = []
    window._envFans.push(fanGrp)
  })

  // 3) 车间温湿度控制系统（墙上温湿度控制器 + 传感器节点）
  const ctrlMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4 })
  const thControllers = [
    { x: -HALF_W + 0.3, z: -8 }, { x: -HALF_W + 0.3, z: 4 },
    { x: HALF_W - 0.3, z: -8 }, { x: HALF_W - 0.3, z: 4 },
  ]
  thControllers.forEach(({ x, z }) => {
    const sign = x < 0 ? 1 : -1
    // 控制器箱体
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.15), ctrlMat)
    box.position.set(x, 2.2, z); box.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(box)
    // 温湿度显示屏
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
    scr.position.set(x + sign * 0.08, 2.25, z); scr.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(scr)
    // 温度传感器探头
    const probe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 }))
    probe.position.set(x + sign * 0.1, 2.0, z); scene.add(probe)
    // 状态指示灯
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
    led.position.set(x + sign * 0.08, 2.42, z); scene.add(led)
  })

  // 4) 防静电周转箱（黑色 ESD 料箱，堆叠在各工位旁）
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.6 })
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.3, roughness: 0.5 })
  const esdBoxPositions = [
    { x: -12, z: 3, stack: 2 }, { x: -18, z: 7, stack: 1 },
    { x: 12, z: 3, stack: 2 }, { x: 18, z: 7, stack: 1 },
    { x: -8, z: 7, stack: 2 }, { x: 8, z: 7, stack: 1 },
    { x: 0, z: 12, stack: 2 }, { x: -20, z: 7, stack: 1 },
  ]
  esdBoxPositions.forEach(({ x, z, stack }) => {
    for (let s = 0; s < stack; s++) {
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.45), boxMat)
      bx.position.set(x, 0.18 + s * 0.38, z); bx.castShadow = true; scene.add(bx)
      // 周转箱盖
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 0.49), lidMat)
      lid.position.set(x, 0.37 + s * 0.38, z); scene.add(lid)
      // ESD 标识（橙色警示条）
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.49), new THREE.MeshBasicMaterial({ color: 0xf97316 }))
      stripe.position.set(x, 0.28 + s * 0.38, z); scene.add(stripe)
      // 把手槽
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.6 }))
      handle.position.set(x, 0.39 + s * 0.38, z + 0.23); scene.add(handle)
    }
  })
}

// 设备标签副标题：传感器显示温湿度/气体值，真实硬件显示状态与位置，生产设备显示推演值
const sensorLabelText = (device) => {
  if (device.type === 'tempHumid') return `🌡 ${device.temp}°C   💧 ${device.humid}%`
  if (device.type === 'gas') return `${device.gasType}  ${device.value} ${device.unit}`
  if (device.source === 'real') return `${device.statusLabel || '在线'} · ${device.real?.location || ''}`
  const s = device.sensors || { temperature: 0, vibration: 0, power: 0 }
  return `🌡 ${s.temperature}°C   📳 ${s.vibration}   ⚡ ${s.power} kW`
}

// ========== 设备模型构建 ==========
const createDeviceMesh = (device) => {
  const group = new THREE.Group()
  group.userData.deviceId = device.id
  const { x, z } = device.position
  group.position.set(x, 0, z)

  let mesh, height = 2, color = 0x5a6498
  switch (device.type) {
    case 'smt': color = 0x455a8c; height = 2.2; mesh = buildSMT(color); break
    case 'robot': color = 0xf57c00; height = 2.8; mesh = buildRobot(color); break
    case 'conveyor': color = 0x37474f; height = 1; mesh = buildConveyor(color); break
    case 'press': color = 0x3949ab; height = 3; mesh = buildPress(color); break
    case 'laser': color = 0xc62828; height = 1.5; mesh = buildLaser(color); break
    case 'test': color = 0x00838f; height = 2.5; mesh = buildTestChamber(color); break
    case 'assemblyLine': color = 0x1e3a8a; height = 1.2; mesh = buildAssemblyLine(color); break
    case 'workstation': color = 0x0f766e; height = 1.8; mesh = buildWorkstation(color); break
    case 'screenPress': color = 0x6d28d9; height = 2.6; mesh = buildScreenPress(color); break
    case 'barcodePrinter': color = 0x374151; height = 1.4; mesh = buildBarcodePrinter(color); break
    case 'testStation': color = 0x0c4a6e; height = 1.9; mesh = buildTestStation(color); break
    case 'burnInRoom': color = 0x7c2d12; height = 6.5; mesh = buildBurnInRoom(color); break
    case 'printerTest': color = 0x155e75; height = 1.8; mesh = buildPrinterTest(color); break
    case 'cartonSealer': color = 0x9a3412; height = 1.8; mesh = buildCartonSealer(color); break
    case 'wrappingMachine': color = 0x831843; height = 2.2; mesh = buildWrappingMachine(color); break
    case 'warehouseTerminal': color = 0x1e40af; height = 1.6; mesh = buildWarehouseTerminal(color); break
    case 'tempHumid': color = 0x2c3e6b; height = 1.4; mesh = buildTempHumidSensor(color); break
    case 'gas': color = 0x3a2c5a; height = 1.6; mesh = buildGasSensor(color); break
    // 真实硬件设备（后端 devices 表）
    case 'gateway': color = 0x1f2937; height = 2.4; mesh = buildGatewayCabinet(color); break
    case 'lightSensor': color = 0x4b5563; height = 1.0; mesh = buildLightSensor(color); break
    case 'pir': color = 0x0f766e; height = 0.9; mesh = buildPirSensor(color); break
    case 'lightRelay': color = 0xb45309; height = 1.3; mesh = buildLightRelay(color); break
    case 'rgbLamp': color = 0x312e81; height = 1.7; mesh = buildRgbLamp(color); break
    case 'buzzer': color = 0x1f2937; height = 1.1; mesh = buildBuzzer(color); break
    case 'counter': color = 0x065f46; height = 1.2; mesh = buildCounterGate(color); break
    case 'realBox': color = 0x475569; height = 1.5; mesh = buildRealBox(color); break
    default: mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color }))
  }
  mesh.traverse(c => {
    if (!c.isMesh) return
    // 透明件/自发光件不投影，小零件（边长远小于 0.3）也不投影，显著省 shadow 渲染
    const isTransparent = !!c.material?.transparent || (c.material?.transmission ?? 0) > 0
    const isEmissive = c.material?.emissive?.isColor && c.material.emissive.getHex() > 0
    if (c.geometry && !c.geometry.boundingBox) c.geometry.computeBoundingBox()
    const bb = c.geometry?.boundingBox
    let tiny = false
    if (bb) {
      const dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z
      tiny = Math.max(dx, dy, dz) < 0.25 || dx * dy * dz < 0.01
    }
    c.castShadow = !isTransparent && !isEmissive && !tiny
    c.receiveShadow = !isTransparent
  })
  mesh.position.y = height / 2
  group.add(mesh)
  // 模型内部动画引用（netLeds/rgbLampMat/relayLeds 等）提升到 group.userData，供 animate 直达
  Object.assign(group.userData, mesh.userData)

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.5, 0.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x303a5e, metalness: 0.7, roughness: 0.3 })
  )
  base.position.y = 0.1
  base.receiveShadow = true
  group.add(base)

  const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS[device.status], side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  const statusRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 32), ringMat)
  statusRing.rotation.x = -Math.PI / 2
  statusRing.position.y = 0.03
  group.add(statusRing)

  const statusLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: STATUS_COLORS[device.status] })
  )
  statusLamp.position.y = height + 0.6
  group.add(statusLamp)

  const pointLight = new THREE.PointLight(STATUS_COLORS[device.status], 0.5, 5)
  pointLight.position.y = height + 0.6
  group.add(pointLight)

  // 设备名称 + 传感器标签（Sprite，HUD 风）
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 600; labelCanvas.height = 160
  const ctx = labelCanvas.getContext('2d')
  const col = `#${STATUS_COLORS[device.status].toString(16).padStart(6, '0')}`
  ctx.fillStyle = 'rgba(12, 20, 45, 0.9)'
  roundRect(ctx, 0, 0, 600, 160, 22); ctx.fill()
  ctx.strokeStyle = col; ctx.lineWidth = 5; roundRect(ctx, 0, 0, 600, 160, 22); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px "Microsoft YaHei", Arial'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(device.name, 300, 60)
  ctx.font = '22px "Microsoft YaHei", Arial'
  ctx.fillStyle = '#b9e8ff'
  ctx.fillText(sensorLabelText(device), 300, 118)
  const labelTexture = new THREE.CanvasTexture(labelCanvas)
  labelTexture.needsUpdate = true
  const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false })
  const label = new THREE.Sprite(labelMat)
  label.position.y = height + 2.0
  label.scale.set(4.5, 1.2, 1)
  label.renderOrder = 999
  group.add(label)

  scene.add(group)

  deviceMeshes[device.id] = {
    group, statusRing, statusLamp, pointLight, label, labelCanvas,
    height, status: device.status, originalColor: color,
  }
  return group
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const buildSMT = (color) => {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.32 })
  // 机身底座（长方形流水线机箱）
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.1, 2.2), mat)
  body.position.y = 0.55; g.add(body)
  // 内部 PCB 传送窄带
  const pcbBelt = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95 }))
  pcbBelt.position.set(0, 1.15, 0); g.add(pcbBelt)
  // 待贴片 PCB 板（绿色矩形板）
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.45), new THREE.MeshStandardMaterial({ color: 0x0d7c3a, metalness: 0.3, roughness: 0.6 }))
  pcb.position.set(-0.5, 1.19, 0); g.add(pcb)
  // PCB 上已贴元件（小方块模拟 0402/0603 电阻电容）
  const chipMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })
  for (let i = 0; i < 6; i++) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.03), chipMat)
    chip.position.set(-0.7 + i * 0.12, 1.22, (i % 2 === 0 ? -0.1 : 0.1)); g.add(chip)
  }
  // 龙门横梁（贴片头在 X 方向滑动）
  const colMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.85, roughness: 0.2 })
  const col1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.5), colMat); col1.position.set(-1.6, 1.9, 0); g.add(col1)
  const col2 = col1.clone(); col2.position.x = 1.6; g.add(col2)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.35, 0.4), colMat); beam.position.set(0, 2.5, 0); g.add(beam)
  // 贴片头（滑动座 + Z 轴 + 吸嘴）
  const carriageGroup = new THREE.Group()
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.4), colMat)
  carriage.position.set(0.3, 2.2, 0); carriageGroup.add(carriage)
  const zAxis = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9 }))
  zAxis.position.set(0.3, 1.75, 0); carriageGroup.add(zAxis)
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.15, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8 }))
  nozzle.position.set(0.3, 1.4, 0); carriageGroup.add(nozzle)
  // 贴片指示灯
  const pickLight = new THREE.PointLight(0x00e676, 0.8, 2); pickLight.position.set(0.3, 1.35, 0); carriageGroup.add(pickLight)
  g.add(carriageGroup)
  // 料带供料器（侧面多排料架 + 料盘卷）
  const feederMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 })
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 4; i++) {
      const feeder = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.25), feederMat)
      feeder.position.set(-1.2 + i * 0.8, 0.55, s * 1.15); g.add(feeder)
      // 料盘卷（圆盘）
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.3 }))
      reel.rotation.x = Math.PI / 2; reel.position.set(-1.2 + i * 0.8, 0.8, s * 1.28); g.add(reel)
    }
  }
  // AOI 检测相机（顶部安装，镜头朝下）
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), colMat)
  camBox.position.set(1.2, 2.3, 0); g.add(camBox)
  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 16), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9 }))
  camLens.rotation.x = Math.PI / 2; camLens.position.set(1.2, 2.1, 0); g.add(camLens)
  // 操作面板 + 屏幕
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.5 }))
  panel.position.set(1.55, 1.8, 0.5); panel.rotation.y = -Math.PI / 5; g.add(panel)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
  screen.position.set(1.6, 2.0, 0.55); screen.rotation.y = -Math.PI / 5; g.add(screen)
  // 状态指示灯（3 色）
  const ledColors = [0x22c55e, 0xeab308, 0xef4444]
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), new THREE.MeshBasicMaterial({ color: ledColors[i] }))
    led.position.set(-1.6, 1.15, 0.7 + i * 0.12); g.add(led)
  }
  g.userData = { carriageGroup, sparkLight: pickLight }
  return g
}
const buildRobot = (color) => {
  // 6 轴工业机器人（扇形底座 → 大臂 → 小臂 → 腕 → 焊枪）
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.28 })
  const black = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.85, roughness: 0.2 })
  // 底座（矮圆柱）
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.35, 28), mat)
  base.position.y = 0.175; g.add(base)
  const mountHoles = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 28), new THREE.MeshStandardMaterial({ color: 0x374151 }))
  mountHoles.rotation.x = Math.PI / 2; mountHoles.position.y = 0.02; g.add(mountHoles)

  // 第 1 关节回转 + 腰部（带控制箱）
  const armGroup = new THREE.Group(); armGroup.position.y = 0.35; g.add(armGroup)
  robotArmGroups.push(armGroup) // 加入动画队列
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.5, 24), mat); waist.position.y = 0.25; armGroup.add(waist)
  const ctrlBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6 }))
  ctrlBox.position.set(0, 0.3, -0.4); armGroup.add(ctrlBox)
  // 第 2 关节大臂
  const j1 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 20), mat); j1.position.y = 0.65; armGroup.add(j1)
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), mat)
  arm1.position.set(0.15, 1.45, 0); arm1.rotation.z = -0.35; armGroup.add(arm1)
  // 第 3 关节 + 小臂
  const j2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 20), mat); j2.position.set(0.35, 2.1, 0); armGroup.add(j2)
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), mat)
  arm2.position.set(-0.05, 2.65, 0); arm2.rotation.z = 0.7; armGroup.add(arm2)
  // 第 4-6 关节腕部
  const wrist1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), black); wrist1.position.set(-0.28, 3, 0); armGroup.add(wrist1)
  const wrist2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), black); wrist2.position.set(-0.48, 3.05, 0); armGroup.add(wrist2)
  // 末端执行器：电动螺丝刀 + 真空吸嘴（装配机械臂，用于主板/机箱螺丝锁付与贴片抓取）
  const toolFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), black)
  toolFlange.position.set(-0.55, 3.0, 0); toolFlange.rotation.z = -0.5; armGroup.add(toolFlange)
  // 电动螺丝刀本体（黄色枪身）
  const screwBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5, roughness: 0.35 }))
  screwBody.position.set(-0.78, 3.08, 0); screwBody.rotation.z = -0.5; armGroup.add(screwBody)
  // 螺丝刀卡头
  const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9 }))
  chuck.position.set(-0.99, 3.18, 0); chuck.rotation.z = -0.5; armGroup.add(chuck)
  // 螺丝批头（可旋转 — animate 中旋转）
  const screwBit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.1 }))
  screwBit.position.set(-1.08, 3.22, 0); screwBit.rotation.z = -0.5; armGroup.add(screwBit)
  // 真空吸嘴（贴片头，旁边小吸盘）
  const vacTube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6 }))
  vacTube.position.set(-0.95, 3.0, 0.12); vacTube.rotation.z = -0.5; armGroup.add(vacTube)
  const sucker = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }))
  sucker.position.set(-1.07, 3.1, 0.12); sucker.rotation.z = -0.5; armGroup.add(sucker)
  // 装配中的工件（小型主板 — 被吸盘吸取）
  const wp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.18), new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.3, roughness: 0.6 }))
  wp.position.set(-1.12, 3.13, 0.12); armGroup.add(wp)
  // 作业指示灯（绿色，正常工作中）
  const toolLED = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
  toolLED.position.set(-0.7, 3.22, 0); armGroup.add(toolLED)
  // 工作照明灯（白光，照亮装配点）
  const toolLight = new THREE.PointLight(0xfff7e0, 0.4, 2); toolLight.position.set(-1.05, 3.15, 0); armGroup.add(toolLight)
  // 待装配的机箱底座（机器人前方的工作台）
  const workTable = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.5 }))
  workTable.position.set(-1.6, 0.65, 0.6); g.add(workTable)
  // 工作台上的主机机箱（黑色塔式）
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.4, roughness: 0.4 }))
  chassis.position.set(-1.6, 1.0, 0.6); g.add(chassis)
  const chPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
  chPanel.position.set(-1.6, 1.1, 0.81); g.add(chPanel)
  // 散落的螺丝（小银色圆柱，台面上）
  for (let i = 0; i < 5; i++) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 }))
    screw.position.set(-1.85 + i * 0.12, 0.72, 0.55); g.add(screw)
  }
  // 示教器（挂在底座侧面）
  const teach = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x0f766e }))
  teach.position.set(0.9, 1, 0.2); teach.rotation.y = -0.3; g.add(teach)
  const teachScr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshBasicMaterial({ color: 0x86efac }))
  teachScr.position.set(0.99, 1.08, 0.2); teachScr.rotation.y = -0.3 + Math.PI / 2; g.add(teachScr)
  // 数据管线（螺旋软管）
  const hosePts = []
  for (let i = 0; i < 20; i++) {
    const t = i / 19
    hosePts.push(new THREE.Vector3(0.3 + Math.sin(t * 8) * 0.06, 0.4 + t * 2.5, Math.cos(t * 8) * 0.06))
  }
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 40, 0.04, 8, false), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 }))
  armGroup.add(hose)
  armGroup.userData = { toolLED, toolLight, screwBit }
  return g
}
const buildConveyor = (color) => {
  const g = new THREE.Group()
  const fm = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.4 })
  // 4 条铝型材支腿
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fm)
    leg.position.set(i * 1.9, 0.45, j * 0.9); g.add(leg)
    // 脚轮 / 脚垫
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x111827 }))
    foot.position.set(i * 1.9, 0.03, j * 0.9); g.add(foot)
  }
  // 中间斜拉杆
  for (let s = -1; s <= 1; s += 2) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.06), fm)
    brace.position.set(s * 1.9, 0.45, 0); brace.rotation.z = s * 0.5; g.add(brace)
  }
  // 侧边梁
  const side1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.15), fm)
  side1.position.set(0, 0.95, 0.9); g.add(side1)
  const side2 = side1.clone(); side2.position.z = -0.9; g.add(side2)
  // 主动/从动滚筒
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.85, roughness: 0.2 })
  for (let i = -1; i <= 1; i += 2) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 20), rollerMat)
    drum.rotation.z = Math.PI / 2; drum.position.set(i * 2.1, 1, 0); g.add(drum)
  }
  // 托辊（中间，每隔一定间距）
  for (let x = -1.6; x <= 1.6; x += 0.4) {
    const idler = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 12), rollerMat)
    idler.rotation.z = Math.PI / 2; idler.position.set(x, 0.98, 0); g.add(idler)
  }
  // 皮带（绿色橡胶带）
  const belt = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 1.7), new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95 }))
  belt.position.y = 1.09; g.add(belt)
  // 皮带花纹
  for (let x = -2; x <= 2; x += 0.2) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 1.6), new THREE.MeshStandardMaterial({ color: 0x052e16 }))
    slat.position.set(x, 1.14, 0); g.add(slat)
  }
  // 减速电机（头部）
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.8 }))
  motor.position.set(-2.3, 1.1, 0.3); g.add(motor)
  const gearbox = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x525252, metalness: 0.85 }))
  gearbox.rotation.x = Math.PI / 2; gearbox.position.set(-2.15, 1.1, 0.7); g.add(gearbox)
  // 两侧黄色防护栏
  const guardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.4 })
  for (let s = -1; s <= 1; s += 2) {
    for (let h = 0; h < 2; h++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.05, 0.05), guardMat)
      rail.position.set(0, 1.25 + h * 0.3, s * 1.15); g.add(rail)
    }
    for (let x = -1.8; x <= 1.8; x += 0.9) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), guardMat)
      post.position.set(x, 1.4, s * 1.15); g.add(post)
    }
  }
  // 传送带上的产品（P1 台式机主机 + N1 笔记本 + S1 服务器机箱）
  // P1 台式机主机（立式塔形机箱）
  const p1 = new THREE.Group()
  const p1Body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.3 }))
  p1Body.position.y = 0.275; p1.add(p1Body)
  const p1Panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
  p1Panel.position.set(0, 0.35, 0.21); p1.add(p1Panel)
  p1.position.set(-1.2, 1.14, 0); g.add(p1); conveyorItems.push({ mesh: p1, type: 'box', baseOffset: -1.2, baseY: 1.14 })
  // N1 笔记本（扁平翻盖）
  const n1 = new THREE.Group()
  const n1Base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.35), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.5, roughness: 0.4 }))
  n1.add(n1Base)
  const n1Lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.35), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4 }))
  n1Lid.position.set(0, 0.02, -0.17); n1Lid.rotation.x = -0.3; n1.add(n1Lid)
  const n1Screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ color: 0x60a5fa }))
  n1Screen.position.set(0, 0.04, -0.17); n1Screen.rotation.x = -0.3 + Math.PI; n1.add(n1Screen)
  n1.position.set(0, 1.17, 0); g.add(n1); conveyorItems.push({ mesh: n1, type: 'box', baseOffset: 0, baseY: 1.17 })
  // S1 服务器机箱（1U 扁平宽体）
  const s1 = new THREE.Group()
  const s1Body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.35 }))
  s1.add(s1Body)
  // 前面板指示灯
  for (let i = 0; i < 4; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: i < 2 ? 0x22c55e : 0x3b82f6 }))
    led.position.set(-0.15 + i * 0.1, 0.05, 0.2); s1.add(led)
  }
  // 通风孔（条纹）
  for (let i = 0; i < 8; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x333333 }))
    vent.position.set(0.1, 0.05 - i * 0.012, 0.2); s1.add(vent)
  }
  s1.position.set(1.3, 1.21, 0); g.add(s1); conveyorItems.push({ mesh: s1, type: 'box', baseOffset: 1.3, baseY: 1.21 })
  return g
}
// 精密伺服压装机（四柱式框架，用于 CPU+散热器压装/PCB 贴装压合）
const buildPress = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.85, roughness: 0.18 })
  const alum = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.15 })
  // 底座（厚实铸铁基座 + 减振垫）
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 2), m); base.position.y = 0.28; g.add(base)
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }))
    pad.position.set(s * 1.0, 0.06, t * 0.82); g.add(pad)
  }
  // 工作台（大理石/铸铁平面，定位销孔）
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.6), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 }))
  table.position.y = 0.69; g.add(table)
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), alum)
    pin.position.set(s * 0.7, 0.82, t * 0.55); g.add(pin)
  }
  // 工作台上的主板（绿色 PCB）+ CPU（黑色方块）+ 待压散热器
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.9), new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.3, roughness: 0.6 }))
  pcb.position.set(0, 0.79, 0); g.add(pcb)
  // PCB 上的元件（贴片电阻/电容）
  const compMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 })
  for (let i = 0; i < 8; i++) {
    const comp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.03), compMat)
    comp.position.set(-0.35 + i * 0.1, 0.815, -0.3); g.add(comp)
  }
  // CPU 插槽（黑色方形）
  const socket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.32), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }))
  socket.position.set(0, 0.815, 0); g.add(socket)
  const cpu = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.4 }))
  cpu.position.set(0, 0.84, 0); g.add(cpu)
  // IHS 金属盖（铜色，CPU 顶部）
  const ihs = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.012, 0.27), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.95, roughness: 0.2 }))
  ihs.position.set(0, 0.86, 0); g.add(ihs)
  // 四根镀铬光柱（精密导柱）
  const colMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.95, roughness: 0.08 })
  const cols = []
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 24), colMat)
    col.position.set(s * 0.95, 2.1, t * 0.78); g.add(col); cols.push(col)
  }
  // 顶板（横跨四柱）
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2), m); top.position.y = 3.9; g.add(top)
  // 伺服电机（顶板上方）
  const servo = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.55, 24), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.8, roughness: 0.25 }))
  servo.rotation.x = Math.PI / 2; servo.position.set(0, 4.25, 0); g.add(servo)
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.7 }))
  fan.rotation.x = Math.PI / 2; fan.position.set(0, 4.5, 0); g.add(fan)
  // 滚珠丝杠 + 滑块（压头下压）
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 16), alum)
  screw.position.set(0, 2.6, 0); g.add(screw)
  // 滑块（可上下移动）
  const slide = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.0), steel)
  slide.position.set(0, 2.7, 0); g.add(slide)
  // 滑块四角铜套（沿导柱滑动）
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.45, 16), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.7 }))
    bush.position.set(s * 0.95, 2.7, t * 0.78); g.add(bush)
  }
  // 压头（铜质压块，下端面贴硅胶垫）
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.28, 20), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.15 }))
  head.position.set(0, 2.43, 0); g.add(head)
  const pad2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.85 }))
  pad2.position.set(0, 2.27, 0); g.add(pad2)
  // 力传感器显示（数字屏，前侧）
  const dbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x0f172a }))
  dbox.position.set(0, 3.05, 1.04); g.add(dbox)
  const dscr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
  dscr.position.set(0, 3.05, 1.085); g.add(dscr)
  // 安全光栅（两侧黄色细立柱）
  const lcMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.18 })
  for (let s = -1; s <= 1; s += 2) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 0.05), lcMat)
    post.position.set(s * 1.05, 1.5, 0.85); g.add(post)
  }
  // 急停按钮（红色蘑菇头）
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.25 }))
  estop.position.set(0.8, 0.7, 0.95); g.add(estop)
  // 顺序阀/液压站（侧面小油箱）
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c4a6e, metalness: 0.5 }))
  tank.position.set(-1.3, 1.2, 0); g.add(tank)
  g.userData = { slide, head }
  return g
}
// 光纤激光打标机（立柱式扫描头，用于机箱铭牌/序列号打标）
const buildLaser = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.32 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.5, roughness: 0.4 })
  // 机床底座（铸铁机柜，前开门）
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.0), m); base.position.y = 0.7; g.add(base)
  // 前面板（黑色，铰链门）
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.04), dark)
  door.position.set(0, 0.7, 1.0); g.add(door)
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.06), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 }))
  handle.position.set(0.8, 0.7, 1.03); g.add(handle)
  // 红色腰线（机型识别色带）
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.02), red)
  stripe.position.set(0, 1.45, 1.0); g.add(stripe)
  // 控制面板（触摸屏 + 启停按钮）
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04), dark)
  panel.position.set(-0.8, 1.4, 1.01); g.add(panel)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
  scr.position.set(-0.8, 1.4, 1.035); g.add(scr)
  const btnCol = [0x22c55e, 0xef4444, 0xeab308]
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), new THREE.MeshStandardMaterial({ color: btnCol[i], emissive: btnCol[i], emissiveIntensity: 0.25 }))
    b.rotation.x = Math.PI / 2; b.position.set(-0.3 + i * 0.18, 1.4, 1.03); g.add(b)
  }
  // 急停按钮（左前角，红色蘑菇头）
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.3 }))
  estop.rotation.x = Math.PI / 2; estop.position.set(-1.15, 0.45, 1.03); g.add(estop)
  // 打标工作台（带钢尺刻度 + 升降调节）
  const tblMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.45 })
  const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.3), tblMat)
  tbl.position.set(0, 1.5, 0); g.add(tbl)
  // 钢尺刻线（合并）
  const scaleGeos = []
  const scaleMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 })
  for (let i = -7; i <= 7; i++) {
    const geo = new THREE.BoxGeometry(0.02, 0.012, 0.05)
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(i * 0.1, 0, 0.6)); scaleGeos.push(geo)
  }
  const scale = new THREE.Mesh(mergeGeometries(scaleGeos), scaleMat); scale.position.y = 1.566; g.add(scale)
  // 待打标工件（铝合金铭牌 + 已有部分刻痕）
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.55), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.25 }))
  tag.position.set(0, 1.585, 0); g.add(tag)
  // 已打标内容（暗色字符线 — 模拟序列号 / LOGO）
  const markMat = new THREE.MeshBasicMaterial({ color: 0x1f2937 })
  for (let i = 0; i < 6; i++) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.04), markMat)
    ch.position.set(-0.3 + i * 0.1, 1.606, -0.1); g.add(ch)
  }
  // Z 轴升降立柱（带刻度的圆柱导轨 + 升降座）
  const zCol = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.85, roughness: 0.2 }))
  zCol.position.set(0, 2.3, -0.85); g.add(zCol)
  // 升降臂（手轮调节座）
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.3), dark)
  arm.position.set(0, 2.6, -0.85); g.add(arm)
  const handwheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 18), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6 }))
  handwheel.rotation.z = Math.PI / 2; handwheel.position.set(0.18, 2.6, -0.85); g.add(handwheel)
  // 横臂（连接立柱到振镜头）
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 1.0), dark)
  cross.position.set(0, 2.6, -0.35); g.add(cross)
  // 振镜扫描头（圆柱形 + 振镜窗口）
  const headGroup = new THREE.Group()
  const headBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.18 }))
  headBody.rotation.x = Math.PI; headBody.position.set(0, 2.6, 0.1); headGroup.add(headBody)
  // F-theta 场镜（下端凸透镜）
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.3, transparent: true, opacity: 0.6, roughness: 0.1 }))
  lens.position.set(0, 2.36, 0.1); headGroup.add(lens)
  // 红光指示器（同轴红光定位点）
  const pointer = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), new THREE.MeshBasicMaterial({ color: 0xef4444 }))
  pointer.position.set(0, 1.6, 0); headGroup.add(pointer)
  // 打标光斑（绿色激光作用点，由 animate 在工件表面移动）
  const markSpot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
  markSpot.position.set(0, 1.6, 0); headGroup.add(markSpot)
  // 打标点伴随点光源
  const sparkLight = new THREE.PointLight(0x22c55e, 0.6, 1.5); sparkLight.position.set(0, 1.6, 0); headGroup.add(sparkLight)
  g.add(headGroup)
  // 激光器机柜内嵌（侧面散热栅格）
  for (let i = 0; i < 12; i++) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.7, 0.01), new THREE.MeshStandardMaterial({ color: 0x0f172a }))
    vent.position.set(-1.31, 0.7, -0.5 + i * 0.09); g.add(vent)
  }
  // 工业电脑（外部一体机，右后侧）
  const monArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6 }))
  monArm.rotation.x = Math.PI / 2; monArm.position.set(1.0, 1.9, -0.9); g.add(monArm)
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.04), dark)
  monitor.position.set(1.0, 2.0, -0.7); monitor.rotation.y = -0.4; g.add(monitor)
  const monScr = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.28), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
  monScr.position.set(1.0, 2.0, -0.68); monScr.rotation.y = -0.4; g.add(monScr)
  // 激光光纤（红色波纹管，从机柜到扫描头）
  const tubePts = []
  for (let i = 0; i < 14; i++) {
    const t = i / 13
    tubePts.push(new THREE.Vector3(-0.5 + t * 0.5, 1.4 + t * 1.0, -0.7 + Math.sin(t * 8) * 0.04))
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tubePts), 30, 0.025, 8, false), new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4, roughness: 0.5 }))
  g.add(tube)
  g.userData = { carriageGroup: markSpot, sparkLight }
  return g
}
// 老化测试柜（多层立式老化架，用于整机/服务器长时间烤机）
const buildTestChamber = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.65, roughness: 0.35 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.18 })
  // 4 根立柱（型材框架）
  const cols = 4, levels = 4
  const bayW = 0.85, bayD = 1.2, levelH = 0.62, frameH = levels * levelH
  const frameMat = m
  const frameGeos = []
  const pushBox = (w, h, d, px, py, pz) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(px, py, pz)); frameGeos.push(geo)
  }
  // 立柱
  for (let c = 0; c <= cols; c++) for (let s = -1; s <= 1; s += 2) {
    pushBox(0.06, frameH + 0.2, 0.06, -cols / 2 * bayW + c * bayW, (frameH + 0.2) / 2, s * bayD / 2)
  }
  // 横梁 + 层板
  for (let lv = 0; lv <= levels; lv++) {
    const y = lv * levelH
    for (let c = 0; c < cols; c++) {
      const cx = -cols / 2 * bayW + (c + 0.5) * bayW
      pushBox(bayW, 0.06, 0.05, cx, y, bayD / 2)
      pushBox(bayW, 0.06, 0.05, cx, y, -bayD / 2)
      if (lv < levels) pushBox(bayW * 0.94, 0.05, bayD * 0.94, cx, y + 0.04, 0)
    }
  }
  const frame = new THREE.Mesh(mergeGeometries(frameGeos), frameMat)
  frame.castShadow = true; frame.receiveShadow = true; g.add(frame)
  // 玻璃前门（可观察老化进程）
  const glass = new THREE.Mesh(new THREE.BoxGeometry(cols * bayW - 0.1, frameH - 0.1, 0.02), glassMat)
  glass.position.set(0, frameH / 2, bayD / 2 + 0.01); g.add(glass)
  // 门把手
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.06), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 }))
  handle.position.set(cols / 2 * bayW - 0.1, frameH / 2, bayD / 2 + 0.05); g.add(handle)
  // 每层老化托盘 + 被测设备（4 列 × 4 层 = 16 个测试位）
  const fans = []
  const ledMat = [0x22c55e, 0x22c55e, 0xeab308, 0xef4444] // 多数正常，少量黄/红模拟异常
  for (let lv = 0; lv < levels; lv++) {
    for (let c = 0; c < cols; c++) {
      const cx = -cols / 2 * bayW + (c + 0.5) * bayW
      const cy = lv * levelH + 0.2
      // 被测设备（黑色机箱 — 模拟台式机/服务器/云终端）
      const dev = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.5, roughness: 0.35 }))
      dev.position.set(cx, cy + 0.09, 0); g.add(dev)
      // 前面板（蓝色 LED 屏，模拟测试界面）
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ color: lv % 2 === 0 ? 0x10b981 : 0x3b82f6 }))
      scr.position.set(cx, cy + 0.12, 0.41); g.add(scr)
      // 状态指示灯（按层级模拟少数异常）
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), new THREE.MeshBasicMaterial({ color: ledMat[lv] }))
      led.position.set(cx + 0.25, cy + 0.16, 0.41); g.add(led)
      // 信号线缆（从设备后部到层板后端）
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.25), new THREE.MeshStandardMaterial({ color: 0x374151 }))
      cable.position.set(cx, cy + 0.02, -0.55); g.add(cable)
    }
  }
  // 顶部排风扇（4 台，强制风冷散热，水平圆盘绕 Y 轴旋转）
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.25 })
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7 })
  for (let i = 0; i < 4; i++) {
    const fx = -1.2 + (i % 2) * 1.2, fz = -0.4 + Math.floor(i / 2) * 0.8
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 24), fanMat)
    housing.position.set(fx, frameH + 0.18, fz); g.add(housing)
    // 风扇叶片（水平十字叶片，绕 Y 轴旋转）
    const blades = new THREE.Group()
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.06), bladeMat)
      blade.rotation.y = b * Math.PI / 2; blades.add(blade)
    }
    blades.position.set(fx, frameH + 0.19, fz); g.add(blades); fans.push(blades)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), bladeMat)
    hub.position.set(fx, frameH + 0.19, fz); g.add(hub)
  }
  // 顶部控制面板（触摸屏显示老化曲线）
  const cpanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), dark)
  cpanel.position.set(0, frameH + 0.18, bayD / 2); g.add(cpanel)
  const cpscr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }))
  cpscr.position.set(0, frameH + 0.18, bayD / 2 + 0.025); g.add(cpscr)
  // 加热模块（底部红色加热管，模拟高温老化）
  const heatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, cols * bayW - 0.2, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.6 }))
  heatTube.rotation.z = Math.PI / 2; heatTube.position.set(0, 0.08, 0); g.add(heatTube)
  // 温度传感器（壁挂式）
  const sens = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.05), new THREE.MeshStandardMaterial({ color: 0x0f172a }))
  sens.position.set(cols / 2 * bayW - 0.05, frameH - 0.3, bayD / 2 - 0.05); g.add(sens)
  const sensLed = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
  sensLed.position.set(cols / 2 * bayW - 0.05, frameH - 0.27, bayD / 2 - 0.02); g.add(sensLed)
  // 接线盒（后侧）
  const jbox = new THREE.Mesh(new THREE.BoxGeometry(cols * bayW - 0.1, 0.3, 0.15), dark)
  jbox.position.set(0, frameH + 0.05, -bayD / 2 - 0.1); g.add(jbox)
  g.userData = { fans }
  return g
}

// 倍速链组装流水线（铝合金型材框架 + 双排倍速链 + 工装托盘 + 阻挡气缸）
const buildAssemblyLine = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  const LEN = 5.6, W = 1.5
  // 铝型材支腿（4 条 + 中间加强）
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), alum)
    leg.position.set(i * LEN / 2, 0.425, j * W / 2); g.add(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), dark)
    foot.position.set(i * LEN / 2, 0.02, j * W / 2); g.add(foot)
  }
  // 侧梁（铝型材）
  for (let s = -1; s <= 1; s += 2) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.12, 0.12), alum)
    beam.position.set(0, 0.85, s * W / 2); g.add(beam)
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.08, 0.08), alum)
    beam2.position.set(0, 0.7, s * W / 2); g.add(beam2)
  }
  // 端梁
  for (let i = -1; i <= 1; i += 2) {
    const eb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, W), alum)
    eb.position.set(i * LEN / 2, 0.85, 0); g.add(eb)
  }
  // 双排倍速链轨道（黑色链条槽 + 顶部滚轮）
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.4 })
  for (let s = -1; s <= 1; s += 2) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.06, 0.08), chainMat)
    track.position.set(0, 0.88, s * (W / 2 - 0.25)); g.add(track)
    // 顶部支撑滚轮（合并）
    const rollerGeos = []
    for (let x = -LEN / 2 + 0.15; x <= LEN / 2 - 0.15; x += 0.18) {
      const rg = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10)
      rg.rotateX(Math.PI / 2)
      rg.translate(x, 0.93, s * (W / 2 - 0.25))
      rollerGeos.push(rg)
    }
    const rollers = new THREE.Mesh(mergeGeometries(rollerGeos), alum); g.add(rollers)
  }
  // 链条（中间可见的滚子链）
  const chainLink = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.025, 0.04), chainMat)
  chainLink.position.set(0, 0.9, 0); g.add(chainLink)
  // 电机减速机（一端）
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.35), dark)
  motor.position.set(-LEN / 2 - 0.2, 0.85, 0.3); g.add(motor)
  // 阻挡气缸（工位停止器，黄色）
  const stopMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.4 })
  for (let sx of [-1.4, 1.4]) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), stopMat)
    cyl.position.set(sx, 0.95, 0); g.add(cyl)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xef4444 }))
    tip.position.set(sx, 1.12, 0); g.add(tip)
  }
  // 工装托盘（带定位治具，上面放待组装台式机主机）
  const pallets = []
  const palletMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.3, roughness: 0.5 })
  const palletPositions = [-1.6, 0, 1.6]
  palletPositions.forEach(px => {
    const pal = new THREE.Group()
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.7), palletMat)
    plate.position.y = 0.02; pal.add(plate)
    // 定位销（4 角）
    for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8), alum)
      pin.position.set(s * 0.28, 0.07, t * 0.28); pal.add(pin)
    }
    // 待组装主机机箱（黑色塔式）
    const cpu = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.42), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.4, roughness: 0.4 }))
    cpu.position.y = 0.31; pal.add(cpu)
    const cpuScr = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }))
    cpuScr.position.set(0, 0.4, 0.22); pal.add(cpuScr)
    pal.position.set(px, 1.0, 0); g.add(pal)
    pallets.push({ mesh: pal, baseOffset: px })
  })
  // 电气控制盒 + 急停
  const ebox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.15), dark)
  ebox.position.set(LEN / 2 + 0.2, 0.95, 0); g.add(ebox)
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.3 }))
  estop.position.set(LEN / 2 + 0.35, 0.95, 0); g.add(estop)
  g.userData = { pallets }
  return g
}

// 防静电工作台（ESD 台面 + 工具挂架：螺丝供料机/热风枪/电烙铁/万用表/示波器/扫码枪/离子风机 + 防静电手环）
const buildWorkstation = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.35 })
  const W = 2.4, D = 1.1
  // 防静电台面（深绿色 ESD 垫）
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8, metalness: 0.1 }))
  top.position.y = 0.9; g.add(top)
  // ESD 垫（黑色橡胶垫，铺在台面上）
  const esdMat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.015, D - 0.2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 }))
  esdMat.position.y = 0.932; g.add(esdMat)
  // 框架（4 立柱 + 横梁，铝型材）
  const cols = []
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), alum)
    col.position.set(s * W / 2, 0.45, t * D / 2); g.add(col); cols.push([s, t])
  }
  // 下层搁板
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.04, D - 0.1), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7 }))
  shelf.position.y = 0.25; g.add(shelf)
  // 后方工具挂架（洞洞板 + 工具）
  const pegboard = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, 0.03), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 }))
  pegboard.position.set(0, 1.25, -D / 2 + 0.02); g.add(pegboard)
  // 工具挂架横杆
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, W - 0.2, 10), alum)
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.45, -D / 2 + 0.06); g.add(rail)
  // === 工具集（从左到右挂在挂架上）===
  // 1) 螺丝供料机（小型台式，含螺丝仓 + 输料管）
  const feeder = new THREE.Group()
  const feedBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), dark); feeder.add(feedBody)
  const feedHopper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5 })); feedHopper.position.y = 0.28; feeder.add(feedHopper)
  const feedTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 })); feedTube.position.y = -0.28; feeder.add(feedTube)
  feeder.position.set(-W / 2 + 0.25, 1.1, -D / 2 + 0.2); g.add(feeder)
  // 2) 可调扭矩电动螺丝批（黄色枪身，挂在挂架）
  const screw = new THREE.Group()
  const screwBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.5 })); screw.add(screwBody)
  const screwBit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), alum); screwBit.position.y = -0.19; screw.add(screwBit)
  screw.position.set(-W / 2 + 0.65, 1.42, -D / 2 + 0.12); g.add(screw)
  // 3) 热风枪（红色枪身）
  const heatGun = new THREE.Group()
  const hgBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4 })); heatGun.add(hgBody)
  const hgNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.8 })); hgNozzle.position.y = -0.17; heatGun.add(hgNozzle)
  heatGun.position.set(-W / 2 + 1.0, 1.42, -D / 2 + 0.12); g.add(heatGun)
  // 4) 电烙铁（黑色笔形）
  const iron = new THREE.Group()
  const ironBody = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 10), dark); iron.add(ironBody)
  const ironTip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.9 })); ironTip.position.y = -0.15; iron.add(ironTip)
  iron.position.set(-W / 2 + 1.3, 1.42, -D / 2 + 0.12); g.add(iron)
  // 5) 扫码枪（手持式，带线缆）
  const scanner = new THREE.Group()
  const scBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.04), dark); scanner.add(scBody)
  const scHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x0f172a })); scHead.position.y = 0.09; scanner.add(scHead)
  const scLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e })); scLed.position.y = 0.11; scanner.add(scLed)
  scanner.position.set(W / 2 - 0.25, 1.4, -D / 2 + 0.12); g.add(scanner)
  // 6) 万用表（台式数字表）
  const dmm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.15), dark); dmm.position.set(-W / 2 + 0.3, 0.985, D / 2 - 0.2); g.add(dmm)
  const dmmScr = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0x22c55e })); dmmScr.position.set(-W / 2 + 0.3, 1.012, D / 2 - 0.12); g.add(dmmScr)
  // 7) 示波器（台式，带波形屏）
  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.18), dark); scope.position.set(-W / 2 + 0.65, 0.99, D / 2 - 0.2); g.add(scope)
  const scopeScr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1), new THREE.MeshBasicMaterial({ color: 0x60a5fa })); scopeScr.position.set(-W / 2 + 0.65, 1.022, D / 2 - 0.105); g.add(scopeScr)
  // 离子风机（立柱顶端，吹除静电）
  const ionFan = new THREE.Group()
  const ionPole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), alum); ionPole.position.y = 0.6; ionFan.add(ionPole)
  const ionHead = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.5 })); ionHead.position.y = 1.25; ionFan.add(ionHead)
  const ionBlades = new THREE.Group()
  for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.04), dark); bl.rotation.y = b * Math.PI / 2; ionBlades.add(bl) }
  ionBlades.position.y = 1.25; ionFan.add(ionBlades)
  ionFan.position.set(W / 2 + 0.2, 0, 0); g.add(ionFan)
  // 防静电手环（线圈 + 手环，挂在台边）
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 18), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.4 })); coil.position.set(W / 2 - 0.5, 0.95, D / 2 - 0.15); coil.rotation.x = Math.PI / 2; g.add(coil)
  // 台面上的待测/待装主板
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.4), new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.3, roughness: 0.6 })); pcb.position.set(0.3, 0.945, 0.1); g.add(pcb)
  g.userData = { ionBlades }
  return g
}

// 笔记本屏幕压合机（龙门式，压合屏幕与机身铰链）
const buildScreenPress = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.3 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.2 })
  const alum = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.12 })
  // 底座
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.8), m); base.position.y = 0.25; g.add(base)
  // 工作台（带定位槽）
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 1.5), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.5 })); table.position.y = 0.6; g.add(table)
  // 待压合笔记本（底座 + 翻开屏幕）
  const nbBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.5), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.5, roughness: 0.4 })); nbBase.position.set(0, 0.69, 0.05); g.add(nbBase)
  const nbScr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.02), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3 })); nbScr.position.set(0, 0.93, -0.2); nbScr.rotation.x = -0.15; g.add(nbScr)
  const nbLcd = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshBasicMaterial({ color: 0x60a5fa })); nbLcd.position.set(0, 0.93, -0.19); nbLcd.rotation.x = -0.15 + Math.PI; g.add(nbLcd)
  // 两根立柱
  for (let s = -1; s <= 1; s += 2) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.3), m); col.position.set(s * 0.9, 1.55, -0.7); g.add(col)
  }
  // 顶横梁
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 0.3), m); beam.position.set(0, 2.7, -0.7); g.add(beam)
  // 气缸 + 压板（下压）
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.7, 20), dark); cyl.position.set(0, 2.45, -0.4); g.add(cyl)
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), alum); piston.position.set(0, 2.0, -0.4); g.add(piston)
  const pressPlate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.85, roughness: 0.2 })); pressPlate.position.set(0, 1.7, -0.2); g.add(pressPlate)
  // 软胶压头（防止压碎屏幕）
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.9 })); pad.position.set(0, 1.64, -0.2); g.add(pad)
  // 触摸屏控制面板
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.04), dark); panel.position.set(0.85, 0.7, 0.5); g.add(panel)
  const pscr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.18), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); pscr.position.set(0.85, 0.7, 0.525); g.add(pscr)
  // 双手启动按钮（安全）
  for (let s = -1; s <= 1; s += 2) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.25 })); b.position.set(s * 0.55, 0.65, 0.75); g.add(b)
  }
  // 安全光幕（两侧细立柱）
  for (let s = -1; s <= 1; s += 2) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.04), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.15 })); post.position.set(s * 1.0, 1.4, 0.6); g.add(post)
  }
  g.userData = { pressPlate, pad }
  return g
}

// 条码打印机（桌面式，含标签输出口 + 撕纸齿）
const buildBarcodePrinter = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.4, roughness: 0.5 })
  // 机身
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), m); body.position.y = 0.5; g.add(body)
  // 上盖（铰链式，灰色）
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.5, roughness: 0.4 })); lid.position.set(0, 0.71, 0); g.add(lid)
  // 标签卷（后部，圆柱形纸卷）
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.95 })); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.5, -0.3); g.add(roll)
  // 标签输出口（前方缝隙 + 撕纸齿）
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.05), dark); slot.position.set(0, 0.34, 0.21); g.add(slot)
  for (let i = -3; i <= 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.03), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.7 })); t.position.set(i * 0.06, 0.34, 0.225); g.add(t) }
  // 已打印标签（白色小条）
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.01, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })); label.position.set(0, 0.345, 0.25); g.add(label)
  for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.008, 0.06), dark); bar.position.set(-0.08 + i * 0.04, 0.351, 0.25); g.add(bar) }
  // 状态指示灯
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), new THREE.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(0.2, 0.69, 0.18); g.add(led)
  // 按键
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 10), new THREE.MeshStandardMaterial({ color: 0x374151 })); btn.position.set(-0.18, 0.692, 0.18); g.add(btn)
  // 底座支脚
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 8), dark); f.position.set(s * 0.2, 0.02, t * 0.15); g.add(f) }
  return g
}

// 整机综合测试工装（测试台 + 多台仪器：屏幕测试仪/网络测试仪/电源负载/USB接口测试仪）
const buildTestStation = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.35 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  const W = 2.2, D = 1.0
  // 测试台台面（防静电）
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 })); top.position.y = 0.9; g.add(top)
  // 框架 4 立柱
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), alum); col.position.set(s * W / 2, 0.45, t * D / 2); g.add(col) }
  // 被测整机（台式机主机，接好测试线缆）
  const dut = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.4, roughness: 0.4 })); dut.position.set(0, 1.18, -0.1); g.add(dut)
  const dutScr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.12), new THREE.MeshBasicMaterial({ color: 0x10b981 })); dutScr.position.set(0, 1.28, 0.13); g.add(dutScr)
  // 测试连接线缆（从主机到各仪器）
  for (let i = 0; i < 4; i++) { const cab = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.3), new THREE.MeshStandardMaterial({ color: 0x1e3a8a })); cab.position.set(-0.15 + i * 0.1, 0.93, 0.15); g.add(cab) }
  // 仪器架（后方双层，放测试仪器）
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 })
  const rack = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.3), rackMat); rack.position.set(0, 1.2, -D / 2 + 0.15); g.add(rack)
  const rack2 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.3), rackMat); rack2.position.set(0, 1.5, -D / 2 + 0.15); g.add(rack2)
  // 仪器立柱
  for (let s = -1; s <= 1; s += 2) { const rp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), alum); rp.position.set(s * W / 2, 1.35, -D / 2 + 0.15); g.add(rp) }
  // 4 台测试仪器（从左到右）
  const instr = (x, y, name, scrColor) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.22), dark); b.position.set(x, y, -D / 2 + 0.15); g.add(b)
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.07), new THREE.MeshBasicMaterial({ color: scrColor })); s.position.set(x, y + 0.005, -D / 2 + 0.265); g.add(s)
  }
  instr(-0.75, 1.5, '屏幕测试仪', 0x60a5fa)
  instr(-0.25, 1.5, '网络测试仪', 0x22c55e)
  instr(0.25, 1.5, '电源负载', 0xfbbf24)
  instr(0.75, 1.5, 'USB测试仪', 0x22d3ee)
  instr(-0.75, 1.2, '示波器', 0x60a5fa)
  instr(0.25, 1.2, '万用表', 0x22c55e)
  // 工控机显示器（上方，显示测试界面）
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), dark); mon.position.set(0, 1.75, -D / 2 + 0.2); g.add(mon)
  const monScr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), new THREE.MeshBasicMaterial({ color: 0x10b981 })); monScr.position.set(0, 1.75, -D / 2 + 0.225); g.add(monScr)
  // 急停 + 电源
  const estop = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.25 })); estop.position.set(W / 2 - 0.1, 0.95, D / 2 - 0.1); g.add(estop)
  return g
}

// 老化房（步入式高温老化房，内含老化架 + 温度监控 + 加热/风循环）
const buildBurnInRoom = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
  const insul = new THREE.MeshStandardMaterial({ color: 0xc7c9d1, metalness: 0.2, roughness: 0.7 }) // 保温板
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xfb923c, metalness: 0, transmission: 0.5, transparent: true, opacity: 0.35, roughness: 0.1 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.35 })
  const W = 5.5, D = 4, H = 6
  // 房体外壳（保温板，4 面 + 顶，留正面观察窗 + 门）
  const mkPanel = (w, h, px, py, pz, ry = 0) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), insul); p.position.set(px, py, pz); p.rotation.y = ry; g.add(p) }
  // 后墙
  mkPanel(W, H, 0, H / 2, -D / 2)
  // 左右侧墙
  mkPanel(D, H, -W / 2, H / 2, 0, Math.PI / 2); mkPanel(D, H, W / 2, H / 2, 0, Math.PI / 2)
  // 顶
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, D), insul); roof.position.set(0, H, 0); g.add(roof)
  // 前墙（分两段，中间留门洞）
  mkPanel(W / 2 - 0.5, H, -W / 4 - 0.25, H / 2, D / 2)
  mkPanel(W / 2 - 0.5, H, W / 4 + 0.25, H / 2, D / 2)
  // 门（保温门，橙色）
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, H - 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.3, roughness: 0.5 })); door.position.set(0, (H - 0.3) / 2, D / 2); g.add(door)
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 })); handle.position.set(0.35, H / 2, D / 2 + 0.07); g.add(handle)
  // 观察窗（橙色耐高温玻璃）
  const obs = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.06), glassMat); obs.position.set(-1.8, 2.2, D / 2); g.add(obs)
  // 内部老化架（2 排，简化）
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.45 })
  const mkRack = (rx) => {
    const cols = 3, levels = 4, bayW = 0.7, bayD = 0.8, levelH = 0.6, fH = levels * levelH
    const frameGeos = []
    const push = (w, h, d, px, py, pz) => { const geo = new THREE.BoxGeometry(w, h, d); geo.applyMatrix4(new THREE.Matrix4().makeTranslation(px, py, pz)); frameGeos.push(geo) }
    for (let c = 0; c <= cols; c++) for (let s = -1; s <= 1; s += 2) push(0.05, fH + 0.1, 0.05, -cols / 2 * bayW + c * bayW, (fH + 0.1) / 2 + 0.1, s * bayD / 2)
    for (let lv = 0; lv <= levels; lv++) for (let c = 0; c < cols; c++) { const cx = -cols / 2 * bayW + (c + 0.5) * bayW; push(bayW, 0.05, 0.04, cx, lv * levelH + 0.1, bayD / 2); push(bayW, 0.05, 0.04, cx, lv * levelH + 0.1, -bayD / 2); if (lv < levels) push(bayW * 0.92, 0.03, bayD * 0.9, cx, lv * levelH + 0.13, 0) }
    const fr = new THREE.Mesh(mergeGeometries(frameGeos), rackMat); fr.position.set(rx, 0, 0); g.add(fr)
    // 被测设备（每层黑色机箱）
    for (let lv = 0; lv < levels; lv++) for (let c = 0; c < cols; c++) {
      const cx = rx - cols / 2 * bayW + (c + 0.5) * bayW
      const dev = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.4 })); dev.position.set(cx, lv * levelH + 0.32, 0); g.add(dev)
      const dl = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: lv === 2 ? 0xef4444 : 0x22c55e })); dl.position.set(cx + 0.18, lv * levelH + 0.35, 0.31); g.add(dl)
    }
  }
  mkRack(-1.2); mkRack(1.2)
  // 加热风循环机组（顶部，红色加热管 + 风扇）
  const heatMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5 })
  const heatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, W - 1, 12), heatMat); heatTube.rotation.z = Math.PI / 2; heatTube.position.set(0, H - 0.5, 0); g.add(heatTube)
  const fans = []
  for (let i = -1; i <= 1; i += 2) {
    const fh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 })); fh.position.set(i * 1.5, H - 0.3, 0); g.add(fh)
    const bl = new THREE.Group(); for (let b = 0; b < 4; b++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.05), dark); blade.rotation.y = b * Math.PI / 2; bl.add(blade) } bl.position.set(i * 1.5, H - 0.3, 0); g.add(bl); fans.push(bl)
  }
  // 温度监控模块（门口外侧，带显示屏）
  const tbox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.12), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5 })); tbox.position.set(1.0, 1.5, D / 2 + 0.1); g.add(tbox)
  const tscr = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ color: 0xfb923c })); tscr.position.set(1.0, 1.5, D / 2 + 0.165); g.add(tscr)
  // 控制柜（侧面，老化房主控）
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5 })); cab.position.set(-W / 2 - 0.35, 0.8, 0); g.add(cab)
  const cscr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); cscr.position.set(-W / 2 - 0.35, 1.3, 0.26); g.add(cscr)
  // 警示标牌（高温注意）
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshBasicMaterial({ color: 0xfbbf24 })); warn.position.set(0, 3.5, D / 2 + 0.1); g.add(warn)
  g.userData = { fans }
  return g
}

// 打印机测试平台（含待测 L1 激光打印机 + 测试纸张输出）
const buildPrinterTest = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.4 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  const W = 2.0, D = 1.0
  // 防静电测试台
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 })); top.position.y = 0.9; g.add(top)
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), alum); col.position.set(s * W / 2, 0.45, t * D / 2); g.add(col) }
  // 待测 L1 激光一体打印机
  const ptr = new THREE.Group()
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.4, roughness: 0.4 })); ptr.add(pBody)
  const pTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.35), dark); pTop.position.set(0, 0.24, 0.05); ptr.add(pTop)
  // 扫描台（顶部玻璃平板）
  const scanGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.28), new THREE.MeshPhysicalMaterial({ color: 0x60a5fa, transmission: 0.5, transparent: true, opacity: 0.4, roughness: 0.05 })); scanGlass.rotation.x = -Math.PI / 2; scanGlass.position.set(0, 0.285, 0.05); ptr.add(scanGlass)
  // 出纸口 + 已打印纸张
  const outSlot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), dark); outSlot.position.set(0, 0.12, 0.26); ptr.add(outSlot)
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide })); paper.rotation.x = -Math.PI / 2; paper.position.set(0, 0.13, 0.4); ptr.add(paper)
  // 控制面板
  const pp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.04), dark); pp.position.set(0.28, 0.15, 0.24); ptr.add(pp)
  const pscr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); pscr.position.set(0.28, 0.15, 0.265); ptr.add(pscr)
  ptr.position.set(0, 1.15, -0.1); g.add(ptr)
  // 工装夹具（定位治具，固定打印机）
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) { const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), m); clamp.position.set(s * 0.4, 0.975, t * 0.28); g.add(clamp) }
  // 测试仪器（网络测试仪 + 电源负载，旁边）
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), dark); t1.position.set(-0.7, 0.985, 0.25); g.add(t1)
  const t1s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), new THREE.MeshBasicMaterial({ color: 0x22c55e })); t1s.position.set(-0.7, 0.99, 0.36); g.add(t1s)
  // 废粉收集瓶（侧面）
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.3 })); bottle.position.set(0.5, 1.0, 0.3); g.add(bottle)
  return g
}

// 自动封箱机（上下胶带封箱，含传送辊道）
const buildCartonSealer = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  // 4 立柱 + 顶板
  for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), alum); col.position.set(s * 0.9, 0.8, t * 0.6); g.add(col)
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 0.25), m); topBeam.position.set(0, 1.55, 0); g.add(topBeam)
  // 顶部胶带机构（胶带卷 + 导轮 + 压贴头）
  const tapeRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.8, transparent: true, opacity: 0.7 })); tapeRoll.rotation.z = Math.PI / 2; tapeRoll.position.set(0, 1.4, 0); g.add(tapeRoll)
  const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), alum); guide.rotation.z = Math.PI / 2; guide.position.set(0, 1.25, 0); g.add(guide)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), dark); head.position.set(0, 1.05, 0); g.add(head)
  // 底部胶带机构（对称，封底）
  const botHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.1), dark); botHead.position.set(0, 0.2, 0); g.add(botHead)
  // 传送辊道（穿过机器）
  for (let x = -1.4; x <= 1.4; x += 0.25) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12), alum); r.rotation.z = Math.PI / 2; r.position.set(x, 0.45, 0); g.add(r)
  }
  // 侧导轨（可调宽，黄色）
  for (let s = -1; s <= 1; s += 2) { const guide2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4 })); guide2.position.set(0, 0.5, s * 0.4); g.add(guide2) }
  // 待封纸箱（通过机器）
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 })); box.position.set(0.5, 0.7, 0); g.add(box)
  // 已封胶带线（顶部 + 底部）
  const tapeTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.04), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 })); tapeTop.position.set(0.5, 0.925, 0); g.add(tapeTop)
  const tapeBot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.04), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 })); tapeBot.position.set(0.5, 0.475, 0); g.add(tapeBot)
  // 控制面板
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.04), dark); panel.position.set(0.95, 1.2, 0.4); g.add(panel)
  const pscr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.09), new THREE.MeshBasicMaterial({ color: 0x22c55e })); pscr.position.set(0.95, 1.2, 0.425); g.add(pscr)
  g.userData = { box }
  return g
}

// 打包缠绕机（托盘旋转 + 缠绕膜架升降）
const buildWrappingMachine = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.3 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  // 转盘基座
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.3, 32), m); base.position.y = 0.15; g.add(base)
  // 旋转转盘（可旋转）
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 32), new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.8, roughness: 0.2 })); turntable.position.y = 0.32; g.add(turntable)
  // 转盘防滑纹
  for (let i = 0; i < 12; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.01, 0.04), dark); t.rotation.y = i * Math.PI / 6; t.position.set(0, 0.345, 0); g.add(t) }
  // 待缠绕托盘货物（栈板 + 纸箱堆）
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.95 })); pallet.position.y = 0.4; g.add(pallet)
  // 纸箱堆（3 层）
  for (let lv = 0; lv < 3; lv++) for (let s = -1; s <= 1; s += 2) for (let t = -1; t <= 1; t += 2) {
    const cx = s * 0.18, cz = t * 0.18
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 })); box.position.set(cx, 0.6 + lv * 0.32, cz); g.add(box)
  }
  // 缠绕膜立柱（后方）
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), alum); pole.position.set(0, 1.3, -1.0); g.add(pole)
  // 膜架（可升降）
  const filmCarriage = new THREE.Group()
  const fbody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), dark); filmCarriage.add(fbody)
  const filmRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 16), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.5, roughness: 0.6 })); filmRoll.rotation.z = Math.PI / 2; filmRoll.position.y = 0.05; filmCarriage.add(filmRoll)
  // 缠绕膜（从膜架到货物，透明薄膜）
  const film = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.005), new THREE.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.18 })); film.position.set(0, 0.4 + 0.8, -0.5); g.add(film)
  filmCarriage.position.set(0, 1.2, -0.6); g.add(filmCarriage)
  // 顶部限位
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), alum); cap.position.set(0, 2.4, -1.0); g.add(cap)
  // 控制面板（侧面立柱）
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.1), dark); ctrl.position.set(0.8, 1.0, -0.6); g.add(ctrl)
  const cscr = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); cscr.position.set(0.8, 1.0, -0.545); g.add(cscr)
  g.userData = { turntable, filmCarriage }
  return g
}

// 成品扫码入库终端（立式扫码工位 + 工控机 + 扫码枪 + 传送辊）
const buildWarehouseTerminal = (color) => {
  const g = new THREE.Group()
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.35 })
  const alum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.35 })
  // 传送辊道（短段）
  for (let x = -0.9; x <= 0.9; x += 0.22) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 12), alum); r.rotation.z = Math.PI / 2; r.position.set(x, 0.45, 0); g.add(r) }
  // 辊道支架
  for (let s = -1; s <= 1; s += 2) { const leg = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.05), dark); leg.position.set(0, 0.42, s * 0.35); g.add(leg) }
  // 立柱（扫码龙门）
  for (let s = -1; s <= 1; s += 2) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), alum); col.position.set(s * 0.8, 0.8 + 0.4, 0); g.add(col) }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), alum); beam.position.set(0, 1.85, 0); g.add(beam)
  // 扫码枪（固定式工业扫码器，悬挂在横梁）
  const scanner = new THREE.Group()
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), dark); scanner.add(sh)
  const slens = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12), new THREE.MeshBasicMaterial({ color: 0x22c55e })); slens.rotation.x = Math.PI / 2; slens.position.y = -0.05; scanner.add(slens)
  // 扫码激光线（绿色扇形，投到下方纸箱）
  const scanLine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.02, 0.9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.12, side: THREE.DoubleSide })); scanLine.position.y = -0.5; scanner.add(scanLine)
  scanner.position.set(0, 1.75, 0); g.add(scanner)
  // 待入库成品纸箱（带条码标签）
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 })); box.position.set(0, 0.65, 0); g.add(box)
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); label.position.set(0, 0.7, 0.2); g.add(label)
  for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.001), dark); bar.position.set(-0.05 + i * 0.025, 0.7, 0.201); g.add(bar) }
  // 工控机 + 显示器（侧方，扫码入库登记）
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.35), dark); cab.position.set(1.1, 0.9, 0); g.add(cab)
  const mon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.04), dark); mon.position.set(1.1, 1.3, 0.2); g.add(mon)
  const mscr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ color: 0x10b981 })); mscr.position.set(1.1, 1.3, 0.225); g.add(mscr)
  // 状态灯（绿灯=已扫码）
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(0.15, 1.65, 0.1); g.add(led)
  g.userData = { scanner, scanLine }
  return g
}

// 温湿度传感器（壁挂式小盒 + 数显屏 + 温/湿指示灯）
const buildTempHumidSensor = (color) => {
  const g = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2c3e6b, metalness: 0.4, roughness: 0.5 })
  )
  shell.position.y = 0.65; g.add(shell)
  // 数显屏（显示温度/湿度，绿色背光）
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x0a2a1a })
  )
  screen.position.set(0, 0.85, 0.18); g.add(screen)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.42),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.35 })
  )
  glow.position.set(0, 0.85, 0.181); g.add(glow)
  // 顶部进风格栅
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.8 })
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.04), ventMat)
    v.position.set(0, 1.35 - i * 0.06, 0.18); g.add(v)
  }
  // 温度指示（蓝色）+ 湿度指示（青色）LED
  const tLed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }))
  tLed.position.set(-0.25, 0.4, 0.18); g.add(tLed)
  const hLed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0x22d3ee }))
  hLed.position.set(0.25, 0.4, 0.18); g.add(hLed)
  g.userData = { screen, glow, tLed, hLed }
  return g
}

// 气体传感器（探测器外壳 + 顶部气体感应罩 + 状态灯）
const buildGasSensor = (color) => {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a2c5a, metalness: 0.5, roughness: 0.45 })
  )
  body.position.y = 0.6; g.add(body)
  // 顶部气体感应罩（多孔半球）
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5b4a8a, metalness: 0.6, roughness: 0.35, wireframe: false })
  )
  cap.position.y = 1.2; g.add(cap)
  // 感应罩多孔纹理（小圆柱模拟透气孔）
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.9 })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), holeMat)
    hole.position.set(Math.cos(a) * 0.22, 1.25, Math.sin(a) * 0.22); g.add(hole)
  }
  // 数显屏
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.32),
    new THREE.MeshBasicMaterial({ color: 0x2a0a1a })
  )
  screen.position.set(0, 0.75, 0.36); g.add(screen)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.26),
    new THREE.MeshBasicMaterial({ color: 0xff3b6b, transparent: true, opacity: 0.4 })
  )
  glow.position.set(0, 0.75, 0.361); g.add(glow)
  // 状态指示灯
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0x00e676 }))
  led.position.set(0, 0.3, 0.36); g.add(led)
  g.userData = { screen, glow, led }
  return g
}

// ========== 状态更新 ==========
const updateDeviceStatus = (deviceId, status, sensors) => {
  const dm = deviceMeshes[deviceId]
  if (!dm) return
  dm.status = status
  const color = STATUS_COLORS[status]

  if (dm.statusRing) dm.statusRing.material.color.setHex(color)
  if (dm.statusLamp) dm.statusLamp.material.color.setHex(color)
  if (dm.pointLight) {
    dm.pointLight.color.setHex(color)
    dm.pointLight.intensity = status === 'normal' ? 0.5 : 1.0
  }

  // 更新 Sprite 标签（重新绘制名称+实时传感器）
  if (dm.labelCanvas) {
    const ctx = dm.labelCanvas.getContext('2d')
    ctx.clearRect(0, 0, 600, 160)
    const col = `#${color.toString(16).padStart(6, '0')}`
    ctx.fillStyle = 'rgba(12, 20, 45, 0.9)'
    roundRect(ctx, 0, 0, 600, 160, 22); ctx.fill()
    ctx.strokeStyle = col; ctx.lineWidth = 5; roundRect(ctx, 0, 0, 600, 160, 22); ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 36px "Microsoft YaHei", Arial'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const dev = devices.value.find(d => d.id === deviceId)
    ctx.fillText(dev?.name || deviceId, 300, 60)
    ctx.font = '22px "Microsoft YaHei", Arial'
    ctx.fillStyle = '#b9e8ff'
    ctx.fillText(sensorLabelText(dev || { type: '', sensors: sensors }), 300, 118)
    dm.label.material.map.needsUpdate = true
  }

  if (selectedId.value === deviceId) {
    selectedDevice.status = status
    selectedDevice.statusLabel = { normal: '正常', warning: '预警', alarm: '告警' }[status]
    const dev = devices.value.find(d => d.id === deviceId)
    if (dev) {
      if (dev.type === 'tempHumid') {
        selectedDevice.temp = dev.temp
        selectedDevice.humid = dev.humid
      } else if (dev.type === 'gas') {
        selectedDevice.value = dev.value
        selectedDevice.unit = dev.unit
        selectedDevice.threshold = dev.threshold
        selectedDevice.gasType = dev.gasType
      } else if (sensors) {
        Object.assign(selectedDevice.sensors, sensors)
      }
    }
  }
}

let blinkTimer = 0
// === 动画循环 + 交互 ===
// 复用 scratch 向量，避免 animate() 每帧 new Vector3 → 减少 GC 卡顿
const SV = {
  A: new THREE.Vector3(),
  B: new THREE.Vector3(),
  DIR: new THREE.Vector3(),
}
const animate = () => {
  animationId = requestAnimationFrame(animate)
  blinkTimer += 0.05
  const t = blinkTimer
  const blinkOn = Math.sin(blinkTimer * 6) > 0

  // ===== 设备状态动画（告警呼吸，只在告警/警告触发时更新）=====
  Object.values(deviceMeshes).forEach(dm => {
    if (dm.status === 'alarm') {
      if (dm.statusRing) {
        dm.statusRing.material.opacity = blinkOn ? 0.9 : 0.2
        dm.statusRing.scale.setScalar(blinkOn ? 1.18 : 1.0)
      }
      if (dm.statusLamp) { dm.statusLamp.material.opacity = blinkOn ? 1 : 0.3 }
      if (dm.pointLight) dm.pointLight.intensity = blinkOn ? 2.8 : 0.3
      if (selectedId.value === dm?.group?.userData?.deviceId && dm.group) {
        const s = blinkOn ? 1.08 : 1.0; dm.group.scale.set(s, s, s)
      }
    } else if (dm.status === 'warning') {
      if (dm.statusRing) dm.statusRing.material.opacity = blinkOn ? 0.85 : 0.5
    } else {
      if (dm.statusRing) { dm.statusRing.material.opacity = 0.8; dm.statusRing.scale.setScalar(1.0) }
      if (dm.group && selectedId.value !== dm.group.userData.deviceId) dm.group.scale.set(1, 1, 1)
    }
  })

  // ===== 1) 桥式起重机（大车 X 向移动 + 葫芦 z 向 + 吊钩上下）=====
  if (crane && crane.userData) {
    crane.userData.t += 0.006
    const cT = crane.userData.t
    crane.position.x = Math.sin(cT * 1.1) * (HALF_W - 6)
    const { hoistGrp, hookGrp } = crane.userData
    if (hoistGrp) hoistGrp.position.z = Math.sin(cT * 1.7 + 0.6) * (HALF_D - 8)
    if (hookGrp) hookGrp.position.y = -1.2 + Math.sin(cT * 2.3) * 1.1
  }

  // ===== 3) AGV 自动导引车 路径巡航（无 clone / 无 new Vector3，全部复用）=====
  agvMeshes.forEach(agv => {
    agv.userData.t += 0.01
    // 记录旧位置（copy 避免 clone）
    SV.A.copy(agv.position)
    // 通过 out 参数写入 SV.B，零新分配
    agv.userData.path(agv.userData.t, SV.B)
    agv.position.copy(SV.B)
    // 计算朝向
    SV.DIR.subVectors(SV.B, SV.A)
    if (SV.DIR.lengthSq() > 1e-6) {
      SV.DIR.normalize()
      agv.rotation.y = Math.atan2(SV.DIR.x, SV.DIR.z)
    }
    // 顶灯光同步（避免 .forEach → children[0..N] 直接扫）
    const ch = agv.children
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]
      if (c.isPointLight) {
        c.intensity = 0.25 + Math.abs(Math.sin(t * 6 + agv.userData.t)) * 0.7
      }
    }
  })

  // ===== 4) 传送带上的工件循环移动（沿皮带 X 向循环 + 轻微颠簸）=====
  const convItems = conveyorItems
  for (let i = 0; i < convItems.length; i++) {
    const item = convItems[i]
    item.mesh.position.x = item.baseOffset + ((t * 0.6) % 8.4) - 4.2
    item.mesh.position.y = (item.baseY || 1.14) + Math.abs(Math.sin(t * 10 + item.baseOffset)) * 0.02
  }

  // ===== 5) 精密压装机：伺服滑块下压 → 接触 → 回程（slide + head 联动）=====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.slide) return
    const { slide, head } = g.userData
    const pressT = (t + dm.height) % 4
    let stroke = 0
    if (pressT < 0.7) stroke = pressT / 0.7            // 下压
    else if (pressT < 1.1) stroke = 1.0                // 保压（接触）
    else if (pressT < 1.8) stroke = 1.0 - (pressT - 1.1) / 0.7 // 回程
    // 滑块从 2.7 下压至 1.3（接近 CPU 顶部 0.86），压头随之
    slide.position.y = 2.7 - stroke * 1.4
    if (head) head.position.y = 2.43 - stroke * 1.4
  })

  // ===== 6) 老化测试柜：顶部散热风扇旋转 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.fans) return
    const fans = g.userData.fans
    for (let i = 0; i < fans.length; i++) fans[i].rotation.y += 0.35
  })

  // ===== 7) 倍速链组装线：工装托盘沿链条循环移动 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.pallets) return
    const pallets = g.userData.pallets
    for (let i = 0; i < pallets.length; i++) {
      const p = pallets[i]
      // 沿 X 方向循环移动（±2.5 范围），到达端点后回弹
      p.mesh.position.x = p.baseOffset + Math.sin(t * 0.5 + i * 1.8) * 2.5
    }
  })

  // ===== 9) 防静电工作台：离子风机叶片旋转 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.ionBlades) return
    g.userData.ionBlades.rotation.y += 0.25
  })

  // ===== 10) 屏幕压合机：压板下压 → 保压 → 回程 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.pressPlate) return
    const { pressPlate, pad } = g.userData
    const sp = (t + dm.height) % 5
    let stroke = 0
    if (sp < 0.6) stroke = sp / 0.6           // 下压
    else if (sp < 1.0) stroke = 1.0           // 保压
    else if (sp < 1.6) stroke = 1.0 - (sp - 1.0) / 0.6 // 回程
    pressPlate.position.y = 1.7 - stroke * 0.8
    if (pad) pad.position.y = 1.64 - stroke * 0.8
  })

  // ===== 11) 自动封箱机：纸箱穿过机器 + 顶部胶带头贴胶 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.box) return
    const box = g.userData.box
    box.position.x = -1.2 + ((t * 0.3) % 2.8)
  })

  // ===== 12) 打包缠绕机：转盘旋转 + 膜架升降 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.turntable) return
    const { turntable, filmCarriage } = g.userData
    turntable.rotation.y += 0.04
    if (filmCarriage) filmCarriage.position.y = 0.6 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 1.2
  })

  // ===== 13) 成品扫码入库终端：扫码激光闪烁 =====
  Object.values(deviceMeshes).forEach(dm => {
    const g = dm.group
    if (!g || !g.userData || !g.userData.scanLine) return
    const sl = g.userData.scanLine
    sl.material.opacity = 0.06 + Math.abs(Math.sin(t * 8)) * 0.15
  })

  // ===== 14) 粉尘排风装置风扇旋转 =====
  if (window._envFans) {
    for (let i = 0; i < window._envFans.length; i++) {
      window._envFans[i].rotation.y += 0.3
    }
  }

  // ===== 15) 真实数据联动动画 =====
  // 告警浮标 🚨 呼吸缩放
  for (const devId in alarmMarkers) {
    const sp = alarmMarkers[devId]
    const s = 1.4 + Math.sin(blinkTimer * 4) * 0.25
    sp.scale.set(s, s, 1)
  }
  // 安全帽视觉告警 → 四角监控摄像头红灯闪烁
  for (let i = 0; i < cameraLeds.length; i++) {
    const led = cameraLeds[i]
    const on = helmetAlarmActive && blinkOn
    led.material.color.setHex(on ? 0xff1744 : 0x4a1010)
    if (led.userData.pl) led.userData.pl.intensity = on ? 0.9 : 0.05
  }
  // PIR 检测到人员 → 小人在入口区域缓步走动
  if (personMesh && personMesh.visible) {
    const pt = blinkTimer * 0.25
    personMesh.position.x = -6 + Math.sin(pt) * 5
    personMesh.position.z = -14 + Math.cos(pt * 0.7) * 4
    personMesh.rotation.y = pt % (Math.PI * 2)
  }
  // 网关机柜蓝色网络灯快闪（MQTT 在线心跳感）
  Object.values(deviceMeshes).forEach(dm => {
    const leds = dm.group?.userData?.netLeds
    if (leds) leds[3].material.color.setHex(blinkOn ? 0x3b82f6 : 0x172554)
  })

  controls.update()
  renderer.render(scene, camera)
}

const onWindowResize = () => {
  const c = canvasContainer.value; if (!c) return
  const w = c.clientWidth, h = c.clientHeight
  camera.aspect = w / h; camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
const onCanvasClick = (e) => {
  const c = canvasContainer.value; if (!c) return
  const rect = c.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const groups = Object.values(deviceMeshes).map(d => d.group)
  const its = raycaster.intersectObjects(groups, true)
  if (its.length > 0) {
    let obj = its[0].object
    while (obj.parent && !obj.userData.deviceId) obj = obj.parent
    if (obj.userData.deviceId) {
      handleDeviceClick(devices.value.find(d => d.id === obj.userData.deviceId))
    }
  }
}
const onCanvasMouseMove = (e) => {
  const c = canvasContainer.value; if (!c) return
  const rect = c.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const groups = Object.values(deviceMeshes).map(d => d.group)
  c.style.cursor = raycaster.intersectObjects(groups, true).length > 0 ? 'pointer' : 'default'
}

const handleDeviceClick = (device) => {
  if (!device) return
  selectedId.value = device.id
  Object.assign(selectedDevice, JSON.parse(JSON.stringify(device)))
  const dm = deviceMeshes[device.id]
  if (dm) animateCameraTo(new THREE.Vector3(device.position.x, dm.height / 2, device.position.z), 20 + dm.height)
  Object.keys(deviceMeshes).forEach(id => {
    if (id !== device.id) deviceMeshes[id].group.scale.set(1, 1, 1)
  })
}

const animateCameraTo = (target, distance) => {
  const startTarget = controls.target.clone()
  const startCam = camera.position.clone()
  const endCam = target.clone().add(new THREE.Vector3(1, 0.85, 1).normalize().multiplyScalar(distance))
  let t = 0
  const step = () => {
    t += 0.05
    const u = Math.min(t, 1)
    const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
    controls.target.lerpVectors(startTarget, target, ease)
    camera.position.lerpVectors(startCam, endCam, ease)
    if (u < 1) requestAnimationFrame(step)
  }
  step()
}

// ========== 数据加载 ==========
// 数据分两类（顶部 HUD 有数据源徽标）：
//   real —— 后端 /api/factories + /api/devices + device store 真实硬件数据（温湿度/气体/网关/执行器/用户自建设备）
//   demo —— 本地产线演示设备（标注「仿真推演」，数值随真实环境温度动态计算，不再写死）

// 传感器状态映射（与 device store 保持一致）
const TH_STATUS_MAP = { online: 'normal', warning: 'warning', danger: 'alarm' }
const LABEL_OF = { normal: '正常', warning: '预警', alarm: '告警' }
const gasStatusOf = (value, threshold) => value > threshold ? 'alarm' : value > threshold * 0.8 ? 'warning' : 'normal'

// 真实硬件位置锚点：按后端 location 关键字映射到 3D 坐标（真实硬件只有一套，物理位置固定）
const REAL_ANCHORS = {
  '控制柜': { x: -26, z: -14 },
  '环境区': { x: -27, z: -11 },
  '燃气区': { x: -27, z: 8 },
  '烟雾区': { x: -27, z: 4 },
  '顶部': { x: -26, z: -6 },
  '入口': { x: -6, z: -17 },
  '报警面板': { x: -25, z: -17 },
  '传送带': { x: -9, z: -8.5 },
}
// 按 location 找锚点（关键字包含匹配，取第一个命中）
const anchorOf = (location) => {
  for (const [kw, pos] of Object.entries(REAL_ANCHORS)) {
    if ((location || '').includes(kw)) return { ...pos }
  }
  return null
}
// 同锚点多设备时按序错开
const anchorOffset = (pos, idx) => pos ? { x: pos.x + (idx % 3) * 1.6, z: pos.z + Math.floor(idx / 3) * 1.6 } : null

// 从 device store 读取温湿度传感器节点，构建 3D 设备对象（真实数据）
const mkTH = (id, position) => {
  const n = deviceStore.tempHumidNodes.find(x => x.id === id) || { temp: 0, humid: 0, status: 'offline', name: id, desc: '', location: '' }
  const status = TH_STATUS_MAP[n.status] || 'normal'
  const online = n.status === 'online'
  return { id, name: `温湿度传感器 ${id}`, type: 'tempHumid', position, status, statusLabel: online ? LABEL_OF[status] : '离线', sensorId: id, temp: n.temp, humid: n.humid, desc: n.desc, location: n.location, source: 'real', realStatus: online ? 1 : 0, real: { location: n.location, model: 'DHT11' } }
}
// 从 device store 读取气体传感器节点，构建 3D 设备对象（真实数据）
const mkGAS = (id, position) => {
  const g = deviceStore.gasNodes.find(x => x.id === id) || { value: 0, unit: 'ppm', threshold: 5, type: 'CO', name: id, desc: '', location: '' }
  const status = gasStatusOf(g.value, g.threshold)
  return { id, name: `气体传感器 ${id}`, type: 'gas', position, status, statusLabel: LABEL_OF[status], sensorId: id, value: g.value, unit: g.unit, threshold: g.threshold, gasType: g.type, desc: g.desc, location: g.location, source: 'real', realStatus: g.value > 0 || g.threshold < 9999 ? 1 : 0, real: { location: g.location, model: g.type } }
}

// 后端设备（/api/devices）→ 3D 设备对象映射。
// 温湿度/气体传感器已有 TH/GAS 锚点（store 共用），跳过避免重复建模；
// 其余真实硬件（网关/光照/PIR/照明/RGB/蜂鸣/计数）+ 用户自建设备 → 新增 3D 对象
const REAL_TYPE_MAP = {
  gateway: 'gateway',
  light_sensor: 'lightSensor',
  pir: 'pir',
  light: 'lightRelay',
  rgb: 'rgbLamp',
  buzzer: 'buzzer',
  counter: 'counter',
}
const DEMO_TYPES = ['assemblyLine', 'conveyor', 'workstation', 'screenPress', 'press', 'test', 'testStation', 'burnInRoom', 'barcodePrinter', 'cartonSealer', 'wrappingMachine', 'warehouseTerminal', 'printerTest']
const mkRealDevice = (d, idx) => {
  const type = REAL_TYPE_MAP[d.type] || (DEMO_TYPES.includes(d.type) ? d.type : 'realBox')
  let pos = anchorOf(d.location)
  if (pos) pos = anchorOffset(pos, idx)
  else pos = { x: -20 + (idx % 8) * 3.2, z: 16 }  // 未识别位置 → 北墙备用区排开
  const online = d.online === 1 || d.online === true || (d.via_gateway && d.online !== 0)
  return {
    id: d.device_id,
    name: d.name || d.device_id,
    type,
    position: pos,
    // 离线不标预警（硬件未接入是常态）：用状态文案区分，黄色预警仅由真实告警驱动
    status: 'normal',
    statusLabel: online ? '在线' : '离线',
    source: 'real',
    realStatus: online ? 1 : 0,
    real: { location: d.location, model: d.model, manufacturer: d.manufacturer, description: d.description, category: d.category },
  }
}

// ===== 演示设备动态数值引擎（方案甲）=====
// 硬件没有产线设备的温度/振动/功率传感器：以真实环境温度为基线、按设备类型设定偏移，
// 叠加慢波动 + 微噪声随时间推演，不再使用写死的静态数值
const DEMO_TEMP_OFFSET = {
  assemblyLine: 14, conveyor: 12, workstation: 8, screenPress: 16, press: 20,
  test: 22, testStation: 10, burnInRoom: 38, barcodePrinter: 5, cartonSealer: 8,
  wrappingMachine: 9, warehouseTerminal: 4, printerTest: 7,
}
const DEMO_VIB_BASE = {
  assemblyLine: 0.08, conveyor: 0.07, workstation: 0.02, screenPress: 0.12, press: 0.16,
  test: 0.1, testStation: 0.04, burnInRoom: 0.06, barcodePrinter: 0.01, cartonSealer: 0.05,
  wrappingMachine: 0.06, warehouseTerminal: 0.01, printerTest: 0.03,
}
// 设备 id 哈希 → 固定伪随机相位（保证同一设备每次刷新曲线连续可复现）
const hashPhase = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return h / 997 * Math.PI * 2
}
const evolveDemoSensors = (dev, envTemp, tick) => {
  const phase = hashPhase(dev.id)
  const base = dev.sensors
  // 温度：真实环境温度 + 类型偏移 + 慢波动 + 微噪声
  const off = DEMO_TEMP_OFFSET[dev.type] ?? 10
  base.temperature = Math.round((envTemp + off + Math.sin(tick * 0.25 + phase) * 1.6 + (Math.random() - 0.5) * 0.6) * 10) / 10
  // 振动：类型基线 + 呼吸波动
  const vb = DEMO_VIB_BASE[dev.type] ?? 0.08
  base.vibration = Math.round((vb + Math.abs(Math.sin(tick * 0.4 + phase)) * vb * 0.5) * 100) / 100
  // 功率：额定值 ±12% 慢波动（额定值从初始定义中保留）
  if (base.ratedPower == null) base.ratedPower = base.power || 5
  base.power = Math.round(base.ratedPower * (1 + Math.sin(tick * 0.18 + phase) * 0.12) * 10) / 10
}

const FACTORIES = {
  A: {
    code: 'A', name: 'A 厂 · 台式机总装基地', short: 'A 厂',
    devices: () => ([
      // 总装区
      { id: 'ASSY_LINE_A1', name: '倍速链组装线 A-1', type: 'assemblyLine', position: { x: -22, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 38, vibration: 0.07, power: 9.5 } },
      { id: 'ASSY_A1', name: '轻型皮带流水线 A-1', type: 'conveyor', position: { x: -12, y: 0, z: -11 }, status: 'alarm', statusLabel: '告警', sensors: { temperature: 78, vibration: 0.55, power: 22.4 } },
      { id: 'WORKSTATION_A1', name: '防静电工作台 A-1', type: 'workstation', position: { x: -3, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 32, vibration: 0.03, power: 1.2 } },
      { id: 'WORKSTATION_A2', name: '防静电工作台 A-2', type: 'workstation', position: { x: 5, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 33, vibration: 0.04, power: 1.3 } },
      { id: 'SCREEN_PRESS_A1', name: '屏幕压合机 A-1', type: 'screenPress', position: { x: 14, y: 0, z: -11 }, status: 'warning', statusLabel: '预警', sensors: { temperature: 56, vibration: 0.18, power: 5.8 } },
      { id: 'PRESS_A1', name: 'CPU散热器压合工装 A-1', type: 'press', position: { x: 23, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 45, vibration: 0.18, power: 35.6 } },
      // 测试区
      { id: 'TEST_STATION_A1', name: '整机综合测试工装 A-1', type: 'testStation', position: { x: -22, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 36, vibration: 0.05, power: 4.2 } },
      { id: 'BURN_IN_A1', name: '老化房 A-1', type: 'burnInRoom', position: { x: -10, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 65, vibration: 0.08, power: 28.5 } },
      { id: 'TEST_A1', name: '老化架 A-1', type: 'test', position: { x: 4, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 50, vibration: 0.15, power: 18.2 } },
      // 包装入库区
      { id: 'BARCODE_A1', name: '条码打印机 A-1', type: 'barcodePrinter', position: { x: -22, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 30, vibration: 0.01, power: 0.3 } },
      { id: 'ASSY_A2', name: '轻型皮带流水线 A-2', type: 'conveyor', position: { x: -12, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 40, vibration: 0.1, power: 11 } },
      { id: 'CARTON_A1', name: '自动封箱机 A-1', type: 'cartonSealer', position: { x: 0, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 33, vibration: 0.06, power: 2.8 } },
      { id: 'WRAP_A1', name: '打包缠绕机 A-1', type: 'wrappingMachine', position: { x: 12, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 31, vibration: 0.04, power: 3.5 } },
      { id: 'WAREHOUSE_A1', name: '成品扫码入库终端 A-1', type: 'warehouseTerminal', position: { x: 23, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 28, vibration: 0.01, power: 0.5 } },
      // ===== 环境传感器（A 厂厂区 + 公共区域）=====
      mkTH('TH-01', { x: -27, y: 0, z: -11 }),   // A厂-总装区
      mkTH('TH-02', { x: -27, y: 0, z: 0 }),     // A厂-测试区
      mkTH('TH-03', { x: 27, y: 0, z: 11 }),     // A厂-仓储区
      mkTH('TH-09', { x: -27, y: 0, z: 16 }),    // 动力车间-锅炉房
      mkTH('TH-10', { x: 27, y: 0, z: 16 }),     // 办公楼-机房
      mkTH('TH-11', { x: 27, y: 0, z: -16 }),    // 原料仓库
      mkTH('TH-12', { x: -27, y: 0, z: -16 }),   // 配电房
      mkGAS('GAS-04', { x: -27, y: 0, z: 11 }),  // A厂-包装区 VOC
      mkGAS('GAS-06', { x: 27, y: 0, z: -11 }),  // A厂-总装区 CO2
      mkGAS('GAS-03', { x: -23, y: 0, z: 16 }),  // 锅炉房 CO
      mkGAS('GAS-05', { x: 23, y: 0, z: -16 }),  // 原料仓 烟雾
    ]),
  },
  B: {
    code: 'B', name: 'B 厂 · 笔记本生产基地', short: 'B 厂',
    devices: () => ([
      // 总装区
      { id: 'ASSY_LINE_B1', name: '倍速链组装线 B-1', type: 'assemblyLine', position: { x: 22, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 39, vibration: 0.08, power: 9.8 } },
      { id: 'ASSY_B1', name: '轻型皮带流水线 B-1', type: 'conveyor', position: { x: 12, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 41, vibration: 0.12, power: 10.8 } },
      { id: 'WORKSTATION_B1', name: '防静电工作台 B-1', type: 'workstation', position: { x: 3, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 33, vibration: 0.04, power: 1.4 } },
      { id: 'WORKSTATION_B2', name: '防静电工作台 B-2', type: 'workstation', position: { x: -5, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 34, vibration: 0.05, power: 1.5 } },
      { id: 'SCREEN_PRESS_B1', name: '屏幕压合机 B-1', type: 'screenPress', position: { x: -14, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 52, vibration: 0.12, power: 5.5 } },
      { id: 'PRESS_B1', name: 'CPU散热器压合工装 B-1', type: 'press', position: { x: -23, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 47, vibration: 0.2, power: 36.2 } },
      // 测试区
      { id: 'TEST_STATION_B1', name: '整机综合测试工装 B-1', type: 'testStation', position: { x: 22, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 37, vibration: 0.06, power: 4.5 } },
      { id: 'BURN_IN_B1', name: '老化房 B-1', type: 'burnInRoom', position: { x: 10, y: 0, z: 0 }, status: 'warning', statusLabel: '预警', sensors: { temperature: 72, vibration: 0.1, power: 30.2 } },
      { id: 'TEST_B1', name: '老化架 B-1', type: 'test', position: { x: -4, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 52, vibration: 0.16, power: 18.8 } },
      // 包装入库区
      { id: 'BARCODE_B1', name: '条码打印机 B-1', type: 'barcodePrinter', position: { x: 22, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 31, vibration: 0.01, power: 0.3 } },
      { id: 'ASSY_B2', name: '轻型皮带流水线 B-2', type: 'conveyor', position: { x: 12, y: 0, z: 11 }, status: 'alarm', statusLabel: '告警', sensors: { temperature: 76, vibration: 0.5, power: 21.6 } },
      { id: 'CARTON_B1', name: '自动封箱机 B-1', type: 'cartonSealer', position: { x: 0, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 34, vibration: 0.07, power: 3.0 } },
      { id: 'WRAP_B1', name: '打包缠绕机 B-1', type: 'wrappingMachine', position: { x: -12, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 32, vibration: 0.05, power: 3.6 } },
      { id: 'WAREHOUSE_B1', name: '成品扫码入库终端 B-1', type: 'warehouseTerminal', position: { x: -23, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 29, vibration: 0.01, power: 0.5 } },
      // ===== 环境传感器（B 厂厂区）=====
      mkTH('TH-04', { x: 27, y: 0, z: -11 }),   // B厂-总装区
      mkTH('TH-05', { x: 27, y: 0, z: 0 }),     // B厂-测试区
      mkTH('TH-06', { x: -27, y: 0, z: 11 }),   // B厂-包装区
      mkGAS('GAS-01', { x: -27, y: 0, z: -11 }),// B厂-总装区 CO
    ]),
  },
  C: {
    code: 'C', name: 'C 厂 · 服务器生产基地', short: 'C 厂',
    devices: () => ([
      // 总装区
      { id: 'ASSY_LINE_C1', name: '倍速链组装线 C-1', type: 'assemblyLine', position: { x: -22, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 40, vibration: 0.09, power: 10.2 } },
      { id: 'ASSY_C1', name: '轻型皮带流水线 C-1', type: 'conveyor', position: { x: -12, y: 0, z: -11 }, status: 'alarm', statusLabel: '告警', sensors: { temperature: 79, vibration: 0.52, power: 23.1 } },
      { id: 'WORKSTATION_C1', name: '防静电工作台 C-1', type: 'workstation', position: { x: -3, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 34, vibration: 0.05, power: 1.5 } },
      { id: 'WORKSTATION_C2', name: '防静电工作台 C-2', type: 'workstation', position: { x: 5, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 35, vibration: 0.06, power: 1.6 } },
      { id: 'SCREEN_PRESS_C1', name: '屏幕压合机 C-1', type: 'screenPress', position: { x: 14, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 54, vibration: 0.14, power: 5.6 } },
      { id: 'PRESS_C1', name: 'CPU散热器压合工装 C-1', type: 'press', position: { x: 23, y: 0, z: -11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 46, vibration: 0.19, power: 35.9 } },
      // 测试区
      { id: 'TEST_STATION_C1', name: '整机综合测试工装 C-1', type: 'testStation', position: { x: -22, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 38, vibration: 0.07, power: 4.8 } },
      { id: 'BURN_IN_C1', name: '老化房 C-1', type: 'burnInRoom', position: { x: -10, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 68, vibration: 0.09, power: 29.5 } },
      { id: 'TEST_C1', name: '老化架 C-1', type: 'test', position: { x: 4, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 51, vibration: 0.17, power: 18.5 } },
      { id: 'PRINTER_TEST_C1', name: '打印机测试平台 C-1', type: 'printerTest', position: { x: 14, y: 0, z: 0 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 35, vibration: 0.04, power: 2.2 } },
      // 包装入库区
      { id: 'BARCODE_C1', name: '条码打印机 C-1', type: 'barcodePrinter', position: { x: -22, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 32, vibration: 0.02, power: 0.3 } },
      { id: 'ASSY_C2', name: '轻型皮带流水线 C-2', type: 'conveyor', position: { x: -12, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 42, vibration: 0.11, power: 10.5 } },
      { id: 'CARTON_C1', name: '自动封箱机 C-1', type: 'cartonSealer', position: { x: 0, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 35, vibration: 0.08, power: 3.2 } },
      { id: 'WRAP_C1', name: '打包缠绕机 C-1', type: 'wrappingMachine', position: { x: 12, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 33, vibration: 0.06, power: 3.8 } },
      { id: 'WAREHOUSE_C1', name: '成品扫码入库终端 C-1', type: 'warehouseTerminal', position: { x: 23, y: 0, z: 11 }, status: 'normal', statusLabel: '正常', sensors: { temperature: 30, vibration: 0.01, power: 0.5 } },
      // ===== 环境传感器（C 厂厂区）=====
      mkTH('TH-07', { x: -27, y: 0, z: -11 }),   // C厂-总装区
      mkTH('TH-08', { x: -27, y: 0, z: 0 }),     // C厂-测试区
      mkGAS('GAS-02', { x: 27, y: 0, z: 0 }),    // C厂-测试区 烟雾
    ]),
  },
}
const applyStats = () => {
  stats.total = devices.value.length
  stats.normal = devices.value.filter(d => d.status === 'normal').length
  stats.warning = devices.value.filter(d => d.status === 'warning').length
  stats.alarm = devices.value.filter(d => d.status === 'alarm').length
  stats.realCount = devices.value.filter(d => d.source === 'real').length
  stats.demoCount = devices.value.filter(d => d.source !== 'real').length
}
const mountMeshesIfAny = () => {
  if (scene) devices.value.forEach(d => { if (!deviceMeshes[d.id]) createDeviceMesh(d) })
  updateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

// 当前厂区：优先后端真实工厂（/api/factories），演示厂区 A/B/C 兜底
const DEMO_FACTORIES = [
  { id: 'A', short: 'A厂·演示', name: 'A 厂 · 台式机总装基地（演示产线）', demo: true },
  { id: 'B', short: 'B厂·演示', name: 'B 厂 · 笔记本生产基地（演示产线）', demo: true },
  { id: 'C', short: 'C厂·演示', name: 'C 厂 · 服务器生产基地（演示产线）', demo: true },
]
const factoryList = ref([...DEMO_FACTORIES])
const currentFactoryId = ref('A')
const currentFactory = computed(() =>
  factoryList.value.find(f => f.id === currentFactoryId.value) || { name: '数字孪生厂区', code: '' }
)

// 清空所有设备 mesh（切换工厂前调用）
const clearDeviceMeshes = () => {
  Object.values(deviceMeshes).forEach(dm => {
    if (dm.group) {
      dm.group.traverse(o => {
        if (o.geometry) o.geometry.dispose?.()
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.())
          else o.material.dispose?.()
        }
      })
      scene.remove(dm.group)
    }
  })
  deviceMeshes = {}
  selectedId.value = null
}

const switchFactory = (id) => {
  if (id === currentFactoryId.value) return
  clearDeviceMeshes()
  currentFactoryId.value = id
  loadDevices()
  // 重置相机到初始视角
  if (camera && controls) {
    camera.position.set(26, 28, 24)
    controls.target.set(0, 0, 0)
    controls.update()
  }
  updateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

// 从 device store 同步环境传感器（温湿度/气体）的实时数值到 3D 设备列表
const syncSensorsFromStore = () => {
  devices.value.forEach(dev => {
    if (dev.type === 'tempHumid') {
      const n = deviceStore.tempHumidNodes.find(x => x.id === dev.sensorId)
      if (n) {
        dev.temp = n.temp
        dev.humid = n.humid
        const st = TH_STATUS_MAP[n.status] || 'normal'
        dev.status = st
        dev.statusLabel = n.status === 'offline' ? '离线' : LABEL_OF[st]
        dev.realStatus = n.status === 'offline' ? 0 : 1
        updateDeviceStatus(dev.id, st)
      }
    } else if (dev.type === 'gas') {
      const g = deviceStore.gasNodes.find(x => x.id === dev.sensorId)
      if (g) {
        dev.value = g.value
        dev.unit = g.unit
        dev.threshold = g.threshold
        dev.gasType = g.type
        const st = gasStatusOf(g.value, g.threshold)
        if (dev.status !== st) { dev.status = st; dev.statusLabel = LABEL_OF[st] }
        updateDeviceStatus(dev.id, st)
      }
    }
  })
}

// ===== 真实数据加载 =====
// 真实厂区 tab 的温湿度/气体锚点（对应真实硬件 DHT11/MQ-5/MQ-2 + 预留点位）
const REAL_SENSORS_LAYOUT = () => ([
  mkTH('TH-01', { x: -27, z: -11 }),
  mkTH('TH-02', { x: -27, z: 0 }),
  mkTH('TH-03', { x: 27, z: 11 }),
  mkGAS('GAS-01', { x: -27, z: 8 }),
  mkGAS('GAS-02', { x: 27, z: 0 }),
])

// 后端设备 → 3D 设备（排除已有 TH/GAS 锚点的传感器，避免重复建模）
const mergeBackendDevices = (list) => {
  let idx = 0
  list.forEach(d => {
    if (d.type === 'temperature' || d.type === 'gas' || d.type === 'smoke') return
    if (devices.value.some(x => x.id === d.device_id)) return
    devices.value.push(mkRealDevice(d, idx++))
  })
  // 网关 device_id（控制指令下发目标）
  const gw = list.find(d => d.category === 'gateway')
  if (gw) gatewayId.value = gw.device_id
}

const loadDevices = () => {
  const fid = currentFactoryId.value
  const isDemo = !!FACTORIES[fid]

  // 重建设备清单前清空旧 3D 模型与选中面板（任何厂区切换路径都走这里）
  clearDeviceMeshes()

  if (isDemo) {
    // 演示厂区：本地产线示意（标记 source=demo，数值动态推演）+ 真实硬件
    devices.value = FACTORIES[fid].devices()
    devices.value.forEach(d => {
      if (d.source !== 'real') {
        d.source = 'demo'
        // 演示设备不再写死告警/预警状态：状态由真实告警联动驱动（applyRealAlarms）
        d.status = 'normal'
        d.statusLabel = '正常'
      }
    })
  } else {
    // 真实工厂：真实传感器锚点 + 后端设备清单
    devices.value = REAL_SENSORS_LAYOUT()
  }
  mergeBackendDevices(backendDevices.value)
  applyStats()
  syncSensorsFromStore()
  applyRealAlarms()
  mountMeshesIfAny()
}

// 后端设备清单缓存（工厂/车间自建设备 + 真实硬件）
const backendDevices = ref([])
const loadBackendData = async () => {
  try {
    const [fRes, dRes] = await Promise.all([
      request.get('/factories'),
      request.get('/devices'),
    ])
    if (dRes.status === 'ok' && Array.isArray(dRes.data)) {
      backendDevices.value = dRes.data
    }
    if (fRes.status === 'ok' && Array.isArray(fRes.data) && fRes.data.length) {
      // 真实工厂前置，演示厂区保留（答辩/演示时可对比）
      const realFs = fRes.data.map(f => ({
        id: 'F' + f.id,
        short: (f.code || f.name || '厂').toString().slice(0, 6),
        name: f.name || ('工厂 #' + f.id),
        demo: false,
        backendId: f.id,
      }))
      // 首次加载到真实工厂后默认切过去（当前停在演示厂区时）
      if (!realLoadedOnce && realFs.length && FACTORIES[currentFactoryId.value]) {
        currentFactoryId.value = realFs[0].id
      }
      realLoadedOnce = true
      factoryList.value = [...realFs, ...DEMO_FACTORIES]
    }
    loadDevices()
  } catch { /* 后端未启动时保持演示数据 */ }
}

// ===== 真实告警 → 3D 联动 =====
// 后端告警 location 存的是 device_id（dht11_01 等），映射到 3D 设备 id
const ALARM_DEV_MAP = { dht11_01: 'TH-01', mq5_01: 'GAS-01', mq2_01: 'GAS-02' }
let helmetAlarmActive = false

const alarmTargetIdOf = (alarm) => {
  if (alarm.type === 'video' || alarm.type === 'no_helmet') return null  // 视觉告警 → 摄像头闪烁
  const loc = alarm.location
  const mapped = ALARM_DEV_MAP[loc] || loc
  return devices.value.some(d => d.id === mapped) ? mapped : null
}

const applyRealAlarms = () => {
  const alarms = activeAlarms.value
  helmetAlarmActive = alarms.some(a => a.type === 'video' || a.type === 'no_helmet')

  // 恢复上一轮被标记告警的设备状态（真实传感器状态由 store 同步，演示设备回到 normal）
  Object.keys(alarmMarkers).forEach(devId => {
    const dev = devices.value.find(d => d.id === devId)
    if (dev) {
      const st = dev.type === 'tempHumid' || dev.type === 'gas'
        ? (TH_STATUS_MAP[deviceStore.tempHumidNodes.find(n => n.id === dev.sensorId)?.status] || gasStatusOf(dev.value, dev.threshold) || 'normal')
        : (dev.source === 'real' ? (dev.realStatus === 1 ? 'normal' : 'warning') : 'normal')
      dev.status = st
      dev.statusLabel = LABEL_OF[st]
      updateDeviceStatus(dev.id, st)
    }
  })
  alarmMarkers = {}

  // 未处理告警 → 设备标红 + 🚨 浮标
  alarms.forEach(a => {
    const devId = alarmTargetIdOf(a)
    if (helmetAlarmActive && !devId) return  // 视觉告警走摄像头闪烁，不标设备
    if (!devId) return
    const dev = devices.value.find(d => d.id === devId)
    if (dev) {
      dev.status = 'alarm'
      dev.statusLabel = LABEL_OF.alarm
      updateDeviceStatus(devId, 'alarm')
    }
    if (scene && deviceMeshes[devId] && !alarmMarkers[devId]) {
      const sp = makeAlarmMarker()
      sp.position.set(
        deviceMeshes[devId].group.position.x,
        deviceMeshes[devId].height + 3.4,
        deviceMeshes[devId].group.position.z
      )
      scene.add(sp)
      alarmMarkers[devId] = sp
    }
  })
  applyStats()
}

const makeAlarmMarker = () => {
  const cvs = document.createElement('canvas'); cvs.width = 128; cvs.height = 128
  const cx = cvs.getContext('2d')
  cx.font = '96px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
  cx.fillText('🚨', 64, 70)
  const tex = new THREE.CanvasTexture(cvs); tex.needsUpdate = true
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  sp.scale.set(1.6, 1.6, 1)
  sp.renderOrder = 1001
  return sp
}

// 告警滚动条点击 → 相机飞到告警设备
const flyToAlarm = (alarm) => {
  const devId = alarmTargetIdOf(alarm)
  if (devId) {
    const dev = devices.value.find(d => d.id === devId)
    if (dev) { handleDeviceClick(dev); return }
  }
  // 视觉告警/无法定位 → 相机回到厂房全景并闪烁提示
  if (camera && controls) {
    animateCameraTo(new THREE.Vector3(0, 2, 0), 34)
  }
}

// ===== 真实环境联动（灯光/人员/计数）=====
const applyEnvironment = () => {
  // 1) 厂房 LED 工矿灯随真实照明继电器状态亮灭
  const on = deviceStore.lightingStatus
  if (lampEmitterMat) lampEmitterMat.color.setHex(on ? 0xfff2cc : 0x2c3348)
  ceilingPointLights.forEach(pl => { pl.intensity = on ? (pl.userData.baseIntensity ?? 2) : 0.05 })
  // 照明继电器模块上的状态灯同步
  devices.value.filter(d => d.type === 'lightRelay').forEach(d => {
    const leds = deviceMeshes[d.id]?.group?.userData?.relayLeds
    if (leds) leds.forEach(led => led.material.color.setHex(on ? 0x22c55e : 0x4b5563))
  })
  // 2) PIR 人员在场 → 入口出现人员小人
  if (personMesh) {
    personMesh.visible = pirStatus.value === 1
  }
  // 3) 货物计数牌（真实 count）
  if (counterSprite && counterCanvas) {
    const cx = counterCanvas.getContext('2d')
    cx.clearRect(0, 0, 512, 160)
    cx.fillStyle = 'rgba(12, 20, 45, 0.9)'
    roundRect(cx, 0, 0, 512, 160, 20); cx.fill()
    cx.strokeStyle = '#00e676'; cx.lineWidth = 5; roundRect(cx, 0, 0, 512, 160, 20); cx.stroke()
    cx.fillStyle = '#00e676'; cx.font = 'bold 44px "Microsoft YaHei"'
    cx.textAlign = 'center'; cx.textBaseline = 'middle'
    cx.fillText(`📦 累计计数 ${goodsCount.value}`, 256, 60)
    cx.fillStyle = '#b9e8ff'; cx.font = '26px "Microsoft YaHei"'
    cx.fillText('红外对射 · 真实计数', 256, 116)
    counterSprite.material.map.needsUpdate = true
  }
}

const refreshStatus = () => {
  demoTick++
  syncSensorsFromStore()
  // 演示设备数值随真实环境温度动态推演（方案甲）
  const envTemp = deviceStore.temperature > 0 ? deviceStore.temperature : 26
  devices.value.forEach(dev => {
    if (dev.source !== 'real' && dev.sensors) evolveDemoSensors(dev, envTemp, demoTick)
  })
  applyRealAlarms()
  applyEnvironment()
  updateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

// ===== 真实硬件控制（3D 直控，经 MQTT 下发）=====
const sendRelayCmd = async (val) => {
  cmdLoading.value = true
  try {
    const res = await request.post(`/control/${gatewayId.value}/relay`, { val: val ? 1 : 0, reason: '3D数字孪生场景控制' })
    if (res.status !== 'ok') ElMessage.error(res.message || '指令下发失败')
    else ElMessage.success(val ? '已下发开灯指令，硬件执行后 3D 灯光同步' : '已下发关灯指令')
  } catch { ElMessage.error('控制指令下发失败，请确认后端与 MQTT 已连接') }
  cmdLoading.value = false
}
const sendRgbCmd = async (i) => {
  rgbVal.value = i
  syncRgbLampVisual()
  try {
    const res = await request.post(`/control/${gatewayId.value}/rgb`, { val: i, reason: '3D数字孪生场景控制' })
    if (res.status !== 'ok') ElMessage.error(res.message || '指令下发失败')
  } catch { ElMessage.error('控制指令下发失败，请确认后端与 MQTT 已连接') }
}
// RGB 灯柱 3D 视觉随所选颜色同步
const syncRgbLampVisual = () => {
  devices.value.filter(d => d.type === 'rgbLamp').forEach(d => {
    const ud = deviceMeshes[d.id]?.group?.userData
    if (!ud?.rgbLampMat) return
    const hex = parseInt(RGB_COLORS[rgbVal.value].hex.slice(1), 16)
    ud.rgbLampMat.color.setHex(hex)
    if (ud.rgbLight) {
      ud.rgbLight.color.setHex(hex)
      ud.rgbLight.intensity = rgbVal.value === 0 ? 0 : 1.4
    }
  })
}
const sendBeepCmd = async () => {
  cmdLoading.value = true
  try {
    const res = await request.post(`/control/${gatewayId.value}/beep`, { on_ms: 300, off_ms: 100, reason: '3D数字孪生蜂鸣测试' })
    if (res.status !== 'ok') ElMessage.error(res.message || '指令下发失败')
    else ElMessage.success('蜂鸣指令已下发')
  } catch { ElMessage.error('控制指令下发失败，请确认后端与 MQTT 已连接') }
  cmdLoading.value = false
}

const isActuator = (type) => ['lightRelay', 'rgbLamp', 'buzzer'].includes(type)
const realIcon = (type) => ({
  gateway: '🖧', lightSensor: '💡', pir: '🙋', light: '🔆',
  rgbLamp: '🌈', buzzer: '📢', counter: '📦', tempHumid: '🌡', gas: '☁️',
}[type] || '🔌')

let demoTick = 0
let realLoadedOnce = false

onMounted(async () => {
  await nextTick()
  initThree()
  loadDevices()
  const alarmDev = devices.value.find(d => d.status === 'alarm')
  if (alarmDev) handleDeviceClick(alarmDev)
  refreshTimer = setInterval(refreshStatus, 2000)
  loadBackendData()

  // 真实数据订阅：今日检测统计 + 硬件原始帧中的 PIR/光照（store 未存，组件内消化）
  try {
    const res = await request.get('/detections/stats')
    if (res.status === 'ok') detectStats.value = res.data
  } catch { /* 静默 */ }
  const offDetection = wsOn('detection', () => {
    request.get('/detections/stats').then(r => { if (r.status === 'ok') detectStats.value = r.data }).catch(() => {})
  })
  const offSensors = wsOn('sensors', (d) => {
    pirStatus.value = Number(d?.pir ?? d?.pir_status ?? 0)
    ldrAdc.value = Number(d?.ldr_adc ?? d?.ldr ?? 0)
  })
  const offAlert = wsOn('alert', () => { applyRealAlarms() })
  offHandlers.push(offDetection, offSensors, offAlert)
})

const offHandlers = []

onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  offHandlers.forEach(off => off && off())
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onWindowResize)
  if (containerResizeObserver) {
    containerResizeObserver.disconnect()
    containerResizeObserver = null
  }
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('click', onCanvasClick)
    renderer.domElement.removeEventListener('mousemove', onCanvasMouseMove)
    renderer.dispose()
  }
})
</script>

<style scoped>
/* ========== 内容区容器（融入前端布局，非全屏覆盖） ========== */
.dt-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1f36;
}

.dt-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.dt-canvas canvas { display: block; width: 100%; height: 100%; }

/* ========== 通用 HUD 风格 ========== */
.hud {
  position: absolute;
  pointer-events: auto;
  z-index: 10;
  color: #e6f1ff;
  background: linear-gradient(135deg, rgba(14, 24, 55, 0.82) 0%, rgba(8, 16, 40, 0.78) 100%);
  border: 1px solid rgba(79, 154, 255, 0.32);
  border-radius: 10px;
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow:
    0 4px 18px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* ========== 顶部 HUD：标题 + 统计 ========== */
.hud-top {
  top: 10px;
  left: 226px;   /* 避开 210px 侧边栏 */
  right: 12px;
  transform: none;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 20px;
  min-width: 0;
}
/* 数据源徽标 + 告警滚动条独占第二行 */
.hud-datastrip {
  flex-basis: 100%;
}
.hud-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 24px;
  border-right: 1px solid rgba(79, 154, 255, 0.25);
}
.ht-ico {
  font-size: 26px;
  filter: drop-shadow(0 0 10px rgba(79, 154, 255, 0.5));
}
.ht-main {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(90deg, #6fb9ff 0%, #ffffff 50%, #6fb9ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 1px;
  line-height: 1.2;
}
/* 工厂切换按钮组 */
.factory-switcher {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: rgba(12, 20, 45, 0.6);
  border: 1px solid rgba(79, 154, 255, 0.3);
  border-radius: 8px;
}
.fs-btn {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #a9d1ff;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}
.fs-btn:hover {
  background: rgba(79, 154, 255, 0.15);
  color: #fff;
}
.fs-btn.active {
  background: linear-gradient(135deg, rgba(79, 154, 255, 0.85), rgba(54, 120, 220, 0.7));
  color: #fff;
  border-color: rgba(120, 180, 255, 0.6);
  box-shadow: 0 0 14px rgba(79, 154, 255, 0.45);
}
.fs-btn.demo {
  color: #9fb6d9;
  border-style: dashed;
}
.fs-btn.demo.active {
  background: linear-gradient(135deg, rgba(148, 130, 255, 0.75), rgba(110, 90, 220, 0.65));
  border-color: rgba(180, 160, 255, 0.6);
  box-shadow: 0 0 14px rgba(148, 130, 255, 0.4);
}

/* ===== 数据源徽标 + 实时告警滚动条 ===== */
.hud-datastrip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 2px;
}
.src-badge {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
}
.src-badge.real {
  color: #5dffa7;
  background: rgba(0, 230, 118, 0.1);
  border: 1px solid rgba(0, 230, 118, 0.35);
}
.src-badge.demo {
  color: #c3b5ff;
  background: rgba(148, 130, 255, 0.1);
  border: 1px solid rgba(148, 130, 255, 0.35);
}
.alarm-ticker {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 12px;
  border-radius: 14px;
  background: rgba(255, 58, 94, 0.1);
  border: 1px solid rgba(255, 58, 94, 0.4);
}
.alarm-ticker.ok {
  background: rgba(0, 230, 118, 0.06);
  border-color: rgba(0, 230, 118, 0.3);
}
.ticker-icon { font-size: 14px; flex-shrink: 0; }
.ticker-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.ticker-text {
  font-size: 12px;
  color: #ffb3c2;
  cursor: pointer;
  display: inline-block;
  padding-left: 100%;
  animation: tickerScroll 18s linear infinite;
}
.alarm-ticker.ok .ticker-text {
  color: #7de8b8;
  animation: none;
  padding-left: 0;
}
.ticker-text:hover { text-decoration: underline; }
@keyframes tickerScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}
.ticker-count {
  flex-shrink: 0;
  font-size: 11px;
  color: #ff6b87;
  font-weight: 700;
}
/* 今日检测统计卡 */
.hs-detect { border-color: rgba(0, 212, 255, 0.45); }
.hs-detect .hs-num { color: #4be1ff; font-size: 16px; }
.ht-sub {
  font-size: 10px;
  color: #79a7e0;
  margin-top: 2px;
  letter-spacing: 2px;
  font-family: Consolas, monospace;
}
.hud-stats {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.hs {
  padding: 5px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 80px;
  position: relative;
}
.hs-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 8px currentColor;
}
.hs-total { border-color: rgba(79, 154, 255, 0.5); }
.hs-total .hs-num { color: #6fb9ff; }
.hs-normal .hs-dot { background: #00e676; color: #00e676; }
.hs-normal .hs-num { color: #5dffa7; }
.hs-warning .hs-dot { background: #ffb300; color: #ffb300; animation: softBlink 1.4s infinite; }
.hs-warning .hs-num { color: #ffc94a; }
.hs-alarm .hs-dot { background: #ff3a5e; color: #ff3a5e; animation: fastBlink 0.6s infinite; }
.hs-alarm .hs-num { color: #ff6b87; }
.hs-alarm.pulse {
  animation: hsPulse 1.4s infinite;
  border-color: rgba(255, 58, 94, 0.7);
}
@keyframes hsPulse {
  0%, 100% { box-shadow: 0 6px 26px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 0 rgba(255, 58, 94, 0); }
  50%      { box-shadow: 0 6px 26px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 24px rgba(255, 58, 94, 0.45); }
}
.hs-num {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  font-family: 'DIN Alternate', Consolas, monospace;
}
.hs-label {
  font-size: 11px;
  color: #8fa8cc;
  margin-top: 2px;
}

/* ========== 左侧 HUD：设备列表 ========== */
.hud-left {
  top: 72px;
  left: 12px;
  bottom: 48px;
  width: 260px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}
.hud-panel-title {
  font-size: 14px;
  font-weight: 700;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(79, 154, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a9d1ff;
  letter-spacing: 1px;
}
.hud-panel-title .el-icon { color: #4fa5ff; }

.search-wrap :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.06) !important;
  box-shadow: 0 0 0 1px rgba(79, 154, 255, 0.25) inset !important;
  border-radius: 8px;
}
.search-wrap :deep(.el-input__inner) {
  color: #e6f1ff;
}
.search-wrap :deep(.el-input__inner::placeholder) {
  color: rgba(169, 209, 255, 0.4);
}
.search-wrap { margin-bottom: 8px; }

.dev-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}
.dev-list::-webkit-scrollbar { width: 5px; }
.dev-list::-webkit-scrollbar-thumb { background: rgba(79, 154, 255, 0.4); border-radius: 3px; }

.dev-card {
  padding: 7px 10px;
  border-radius: 8px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(79, 154, 255, 0.15);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dev-card:hover {
  background: rgba(79, 154, 255, 0.15);
  border-color: rgba(79, 154, 255, 0.5);
  transform: translateX(3px);
}
.dev-card.active {
  background: linear-gradient(135deg, rgba(79, 154, 255, 0.35) 0%, rgba(40, 90, 200, 0.28) 100%);
  border-color: #4fa5ff;
  box-shadow: 0 0 0 1px #4fa5ff, 0 8px 20px rgba(79, 154, 255, 0.3);
}
.dev-card.warn { border-color: rgba(255, 179, 0, 0.6); }
.dev-card.alarm {
  border-color: rgba(255, 58, 94, 0.8);
  animation: devAlarmPulse 1.3s infinite;
}
@keyframes devAlarmPulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 58, 94, 0); }
  50%      { box-shadow: 0 0 18px rgba(255, 58, 94, 0.45); }
}
.dc-dot {
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
}
.dc-dot.normal { background: #00e676; box-shadow: 0 0 8px #00e676; }
.dc-dot.warning { background: #ffb300; box-shadow: 0 0 8px #ffb300; animation: softBlink 1.2s infinite; }
.dc-dot.alarm { background: #ff3a5e; box-shadow: 0 0 10px #ff3a5e; animation: fastBlink 0.65s infinite; }

.dc-main { flex: 1; min-width: 0; }
.dc-name {
  font-size: 13px;
  font-weight: 600;
  color: #e6f1ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dc-src {
  display: inline-block;
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  vertical-align: 1px;
  letter-spacing: 1px;
}
.dc-src.real { color: #5dffa7; background: rgba(0, 230, 118, 0.12); }
.dc-src.demo { color: #c3b5ff; background: rgba(148, 130, 255, 0.12); }
.t-dim { color: #79a7e0 !important; }

/* 仿真推演标注 + 真实硬件控制面板 */
.sim-tag {
  width: 100%;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  letter-spacing: 1px;
  color: #c3b5ff;
  background: rgba(148, 130, 255, 0.1);
  border: 1px dashed rgba(148, 130, 255, 0.4);
  text-align: center;
}
.ctrl-block .ib-title { color: #4be1ff; }
.ctrl-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
  color: #cfe3ff;
}
.ctrl-val { font-weight: 700; }
.ctrl-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #79a7e0;
  line-height: 1.5;
}
.ctrl-btn {
  width: 100%;
  margin-top: 4px;
  padding: 7px 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 58, 94, 0.45);
  background: rgba(255, 58, 94, 0.12);
  color: #ff8ba0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.ctrl-btn:hover:not(:disabled) { background: rgba(255, 58, 94, 0.22); }
.ctrl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rgb-row {
  display: flex;
  gap: 8px;
  padding: 6px 0;
}
.rgb-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.25);
  transition: transform 0.15s;
}
.rgb-dot:hover { transform: scale(1.2); }
.dc-meta {
  margin-top: 3px;
  display: flex;
  gap: 8px;
  font-size: 11px;
  font-family: Consolas, monospace;
  color: #79a7e0;
}
.t-warn { color: #ffc94a; }
.t-alarm { color: #ff6b87; }

.empty {
  padding: 30px 10px;
  text-align: center;
  color: #5a78a0;
  font-size: 13px;
}

/* ========== 右侧 HUD：选中设备详情 ========== */
.hud-right {
  top: 72px;
  right: 12px;
  width: 300px;
  padding: 12px;
  max-height: calc(100% - 84px);
  overflow-y: auto;
}
.hud-right::-webkit-scrollbar { width: 5px; }
.hud-right::-webkit-scrollbar-thumb { background: rgba(79, 154, 255, 0.4); border-radius: 3px; }

.hud-panel-title-active {
  align-items: center;
  display: flex;
}
.active-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}
.active-tag.normal { background: #00e676; color: #003d00; }
.active-tag.warning { background: #ffb300; color: #4d3000; }
.active-tag.alarm { background: linear-gradient(135deg, #ff3a5e, #ff758c); color: #fff; animation: fastBlink 0.7s infinite; }

.sensor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.sensor-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(79, 154, 255, 0.2);
  border-radius: 8px;
  padding: 7px 6px;
  text-align: center;
}
.sensor-card.warn { border-color: rgba(255, 179, 0, 0.6); background: rgba(255, 179, 0, 0.1); }
.sensor-card.danger {
  border-color: rgba(255, 58, 94, 0.8);
  background: rgba(255, 58, 94, 0.14);
  animation: sensorDanger 0.9s infinite;
}
@keyframes sensorDanger {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 58, 94, 0); }
  50%      { box-shadow: 0 0 16px rgba(255, 58, 94, 0.5); }
}
.sc-ico { font-size: 18px; }
.sc-label {
  font-size: 11px;
  color: #8fa8cc;
  margin-top: 2px;
}
.sc-val {
  font-size: 16px;
  font-weight: 700;
  color: #e6f1ff;
  margin-top: 1px;
  font-family: 'DIN Alternate', Consolas, monospace;
}
.sensor-card.warn .sc-val { color: #ffc94a; }
.sensor-card.danger .sc-val { color: #ff6b87; }
.sc-unit { font-size: 11px; font-weight: 400; color: #8fa8cc; }

.info-block {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(79, 154, 255, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.ib-title {
  font-size: 12px;
  font-weight: 700;
  color: #a9d1ff;
  padding-bottom: 5px;
  margin-bottom: 4px;
  border-bottom: 1px dashed rgba(79, 154, 255, 0.2);
}
.ib-warn { color: #ff6b87; }
.ib-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 12px;
  color: #8fa8cc;
}
.ib-row b {
  color: #e6f1ff;
  font-weight: 600;
  font-family: Consolas, monospace;
}
.advice {
  margin: 0;
  padding-left: 16px;
  color: #c5d8f0;
  font-size: 11.5px;
  line-height: 1.7;
}

/* ========== 底部操作提示 ========== */
.hud-tips {
  left: 50%;
  transform: translateX(-50%);
  bottom: 10px;
  padding: 6px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #8fa8cc;
  letter-spacing: 0.5px;
  border-radius: 30px;
}
.hud-tips .divider {
  width: 1px;
  height: 10px;
  background: rgba(79, 154, 255, 0.3);
}

/* ========== 全局动画 ========== */
@keyframes softBlink { 0%,100% { opacity:1; } 50% { opacity: 0.5; } }
@keyframes fastBlink { 0%,100% { opacity:1; } 50% { opacity: 0.3; } }

/* ========== HUD 折叠按钮 ========== */
.hud-collapse-btn {
  position: absolute;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(79, 154, 255, 0.18);
  border: 1px solid rgba(79, 154, 255, 0.5);
  border-radius: 6px;
  color: #a9d1ff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 5;
  user-select: none;
}
.hud-collapse-btn:hover {
  background: rgba(79, 154, 255, 0.45);
  color: #fff;
  box-shadow: 0 0 10px rgba(79, 154, 255, 0.5);
}
.hud-collapse-top   { top: 6px; right: 8px; }
.hud-collapse-left  { top: 8px; right: 6px; }
.hud-collapse-right { top: 8px; left: 6px; }

.hud-close {
  margin-left: auto;
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  color: #8fa8cc;
  cursor: pointer;
  transition: all 0.2s;
}
.hud-close:hover { background: rgba(255, 58, 94, 0.3); color: #ff6b87; }

.hud-panel-title-active { position: relative; }

/* ========== HUD 折叠/展开 过渡动画 ========== */
.hud-slide-down-enter-active,  .hud-slide-down-leave-active  { transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; transform-origin: top; }
.hud-slide-down-enter-from,    .hud-slide-down-leave-to      { opacity: 0; transform: translate(-50%, -80px) scaleY(0.3); }

.hud-slide-left-enter-active,  .hud-slide-left-leave-active  { transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; transform-origin: left; }
.hud-slide-left-enter-from,    .hud-slide-left-leave-to      { opacity: 0; transform: translateX(-80%) scaleX(0.4); }

.hud-slide-right-enter-active, .hud-slide-right-leave-active { transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; transform-origin: right; }
.hud-slide-right-enter-from,   .hud-slide-right-leave-to     { opacity: 0; transform: translateX(80%) scaleX(0.4); }

.hud-slide-up-enter-active,    .hud-slide-up-leave-active    { transition: transform 0.3s ease, opacity 0.25s ease; }
.hud-slide-up-enter-from,      .hud-slide-up-leave-to        { opacity: 0; transform: translate(-50%, 40px); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from,   .fade-leave-to     { opacity: 0; }

/* ========== 收起时的迷你按钮（贴边悬浮） ========== */
.hud-mini-btn {
  position: absolute;
  z-index: 20;
  background: linear-gradient(135deg, rgba(14, 24, 55, 0.92) 0%, rgba(8, 16, 40, 0.88) 100%);
  border: 1px solid rgba(79, 154, 255, 0.45);
  color: #a9d1ff;
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(10px);
  transition: all 0.2s;
  user-select: none;
}
.hud-mini-btn:hover {
  background: rgba(79, 154, 255, 0.35);
  color: #fff;
  box-shadow: 0 0 14px rgba(79, 154, 255, 0.55);
}
.hud-mini-btn-top   { top: 6px; left: 50%; transform: translateX(-50%); }
.hud-mini-btn-left  { left: 6px; top: 72px; flex-direction: column; padding: 6px 4px; border-radius: 0 8px 8px 0; }
.hud-mini-btn-left  span { font-size: 14px; }
.hud-mini-btn-right { right: 6px; top: 72px; flex-direction: column; padding: 6px 4px; border-radius: 8px 0 0 8px; }
.hud-mini-btn-right span { font-size: 14px; }

/* ========== 纯净模式总开关（右上角角落浮标） ========== */
.hud-pure-toggle {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 50;
  background: linear-gradient(135deg, rgba(14, 24, 55, 0.92), rgba(40, 90, 200, 0.75));
  border: 1px solid rgba(79, 154, 255, 0.55);
  color: #dbeafe;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 30px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.2s;
  user-select: none;
  letter-spacing: 0.5px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.hud-pure-toggle:hover {
  transform: translateY(-1px);
  border-color: #4fa5ff;
  color: #fff;
  box-shadow: 0 6px 22px rgba(79, 154, 255, 0.55);
}

.hud-tips { position: relative; }
.hud-tips-close {
  cursor: pointer;
  color: #8fa8cc;
  padding: 0 4px 0 6px;
  margin-right: 4px;
  font-size: 13px;
  transition: color 0.2s;
}
.hud-tips-close:hover { color: #ff6b87; }
</style>