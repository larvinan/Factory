<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">设备管理</h2>
      <div class="page-desc">统一管理工厂所有传感器和监测设备，掌握设备运行状态</div>
    </div>

    <div class="device-toolbar">
      <div class="toolbar-stats">
        <div class="toolbar-item">
          <span class="tb-value">{{ totalDevices }}</span>
          <span class="tb-label">总设备</span>
        </div>
        <div class="toolbar-item online">
          <span class="tb-value">{{ onlineDevices }}</span>
          <span class="tb-label">在线</span>
        </div>
        <div class="toolbar-item offline">
          <span class="tb-value">{{ offlineDevices }}</span>
          <span class="tb-label">离线</span>
        </div>
        <div class="toolbar-item alarm">
          <span class="tb-value">{{ alarmDevices }}</span>
          <span class="tb-label">告警</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <el-input v-model="searchText" placeholder="搜索设备名称/ID" :prefix-icon="Search" style="width: 240px" />
        <el-select v-model="filterFactory" placeholder="全部工厂" style="width: 150px" @change="onFactoryChange">
          <el-option label="全部工厂" :value="null" />
          <el-option v-for="f in factoryStore.factories" :key="f.id" :label="f.name" :value="f.id" />
        </el-select>
        <el-select v-model="filterWorkshop" placeholder="全部车间" style="width: 150px">
          <el-option label="全部车间" :value="null" />
          <el-option v-for="w in workshopOptions" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
        <el-select v-model="filterType" placeholder="设备类型" style="width: 160px">
          <el-option label="全部类型" value="" />
          <el-option v-for="(label, key) in typeTexts" :key="key" :label="label" :value="key" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openCreate">添加设备</el-button>
      </div>
    </div>

    <div class="device-grid">
      <div v-for="device in filteredDevices" :key="device.id" class="device-card" :class="device.status">
        <div class="card-header">
          <div class="device-icon" :class="device.type">
            <span>{{ getDeviceIcon(device.type) }}</span>
          </div>
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-id">{{ device.id }} · {{ device.location }}</div>
          </div>
          <div class="device-status-tag" :class="device.status">{{ getStatusText(device.status) }}</div>
        </div>
        <div class="card-body">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">类型</span>
              <span class="info-value">{{ getTypeText(device.type) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">位置</span>
              <span class="info-value">{{ device.location }}</span>
            </div>
            <!-- 温湿度传感器 -->
            <template v-if="device.type === 'tempHumid'">
              <div class="info-item">
                <span class="info-label">温度</span>
                <span class="info-value" :class="{ 'val-danger': device.temp > 35, 'val-warn': device.temp > 30 && device.temp <= 35 }">{{ device.temp }} °C</span>
              </div>
              <div class="info-item">
                <span class="info-label">湿度</span>
                <span class="info-value" :class="{ 'val-danger': device.humid > 75, 'val-warn': device.humid > 65 && device.humid <= 75 }">{{ device.humid }} %RH</span>
              </div>
            </template>
            <!-- 气体传感器 -->
            <template v-else-if="device.type === 'gas'">
              <div class="info-item">
                <span class="info-label">{{ device.gasType }} 浓度</span>
                <span class="info-value" :class="{ 'val-danger': device.value > device.threshold, 'val-warn': device.value > device.threshold * 0.8 && device.value <= device.threshold }">{{ device.value }} {{ device.unit }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">告警阈值</span>
                <span class="info-value">{{ device.threshold }} {{ device.unit }}</span>
              </div>
            </template>
            <!-- 生产设备 -->
            <template v-else>
              <div class="info-item">
                <span class="info-label">最后更新</span>
                <span class="info-value">{{ device.lastUpdate }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">设备型号</span>
                <span class="info-value">{{ device.model || '--' }}</span>
              </div>
            </template>
          </div>
        </div>
        <div class="card-footer">
          <el-button size="small" :icon="View" @click="openDetail(device)">查看详情</el-button>
          <el-button size="small" :icon="Edit" @click="openEdit(device)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="deleteDevice(device)">删除</el-button>
        </div>
      </div>
    </div>

    <div class="device-empty" v-if="filteredDevices.length === 0">
      <span>没有找到符合条件的设备</span>
    </div>

    <!-- 新增/编辑设备对话框 -->
    <el-dialog v-model="formDialogVisible" :title="editingId ? '编辑设备' : '添加设备'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="设备ID">
          <el-input v-model="form.device_id" :disabled="!!editingId" placeholder="如 temp_02（创建后不可修改）" maxlength="32" />
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input v-model="form.name" placeholder="例如：温度监测点2" maxlength="128" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="(label, key) in typeTexts" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备分类">
          <el-select v-model="form.category" style="width: 100%">
            <el-option label="网关" value="gateway" />
            <el-option label="传感器" value="sensor" />
            <el-option label="执行器" value="actuator" />
          </el-select>
        </el-form-item>
        <el-form-item label="安装位置">
          <el-input v-model="form.location" placeholder="例如：车间A-温度区" maxlength="128" />
        </el-form-item>
        <el-form-item label="设备型号">
          <el-input v-model="form.model" placeholder="例如：DHT11" maxlength="64" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDevice">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设备详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="设备详情" width="480px">
      <el-descriptions :column="1" border v-if="detailDevice">
        <el-descriptions-item label="设备ID">{{ detailDevice.id }}</el-descriptions-item>
        <el-descriptions-item label="名称">{{ detailDevice.name }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ getTypeText(detailDevice.type) }}（{{ detailDevice.type }}）</el-descriptions-item>
        <el-descriptions-item label="分类">{{ detailDevice.category }}</el-descriptions-item>
        <el-descriptions-item label="位置">{{ detailDevice.location }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ detailDevice.model || '--' }}</el-descriptions-item>
        <el-descriptions-item label="厂商">{{ detailDevice.manufacturer || '--' }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ detailDevice.description || '--' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ getStatusText(detailDevice.status) }}</el-descriptions-item>
        <el-descriptions-item label="最后上报">{{ detailDevice.lastUpdate }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../utils/request'
import { useLatestSensor } from '../utils/useSensorData'
import { useFactoryStore } from '../stores/factory'

const factoryStore = useFactoryStore()

// ===== 真实设备档案（后端 /api/devices，真实硬件清单）=====
const backendDevices = ref([])
const { latest } = useLatestSensor()

const typeIcons = {
  gateway: '🌐', temperature: '🌡️', humidity: '💧', gas: '💨', smoke: '🔥',
  light_sensor: '☀️', pir: '👤', light: '💡', rgb: '🎨', buzzer: '🔔', counter: '🔢'
}
const typeTexts = {
  gateway: '数据网关', temperature: '温湿度传感器', humidity: '湿度传感器',
  gas: '气体传感器', smoke: '烟雾传感器', light_sensor: '光照传感器',
  pir: '人体红外', light: '照明执行器', rgb: 'RGB指示灯', buzzer: '蜂鸣器', counter: '计数器'
}

async function loadDevices() {
  try {
    const params = new URLSearchParams()
    if (filterWorkshop.value) params.set('workshopId', filterWorkshop.value)
    else if (filterFactory.value) params.set('factoryId', filterFactory.value)
    const qs = params.toString()
    const res = await api.get('/devices' + (qs ? '?' + qs : ''))
    if (res.status === 'ok' && Array.isArray(res.data)) backendDevices.value = res.data
  } catch (e) { /* 后端未启动时保持空 */ }
}

// 工厂/车间筛选（车间列表按所选工厂联动）
const filterFactory = ref(null)
const filterWorkshop = ref(null)
const workshopOptions = ref([])

async function loadWorkshops() {
  try {
    const qs = filterFactory.value ? `?factoryId=${filterFactory.value}` : ''
    const res = await api.get('/workshops' + qs)
    if (res.status === 'ok') workshopOptions.value = res.data || []
  } catch (e) { workshopOptions.value = [] }
}

function onFactoryChange() {
  filterWorkshop.value = null
  loadWorkshops()
  loadDevices()
}

watch(filterWorkshop, () => loadDevices())

// 最新读数（用于传感器卡片的实时值）
const liveValues = computed(() => ({
  temperature: { temp: latest.value?.temp ?? 0, humid: latest.value?.humi ?? 0 },
  gas: { value: latest.value?.mq5Ppm ?? 0, unit: 'ppm', threshold: 900, gasType: 'MQ-5' },
  smoke: { value: latest.value?.mq2Ppm ?? 0, unit: 'ppm', threshold: 300, gasType: 'MQ-2' },
}))

const searchText = ref('')
const filterType = ref('')

const Search = { name: 'Search' }
const Plus = { name: 'Plus' }
const View = { name: 'View' }
const Edit = { name: 'Edit' }
const Delete = { name: 'Delete' }
const Refresh = { name: 'Refresh' }

// 统一卡片数据结构（映射后端档案 + 实时值）
const deviceCards = computed(() => backendDevices.value.map(d => {
  const online = d.online === 1
  const base = {
    dbId: d.id,               // 数据库自增主键，PUT/DELETE 用
    id: d.device_id,
    name: d.name,
    type: d.type,
    category: d.category,
    location: d.location,
    model: d.model,
    description: d.description,
    status: online ? 'online' : 'offline',
    lastUpdate: d.last_heartbeat ? String(d.last_heartbeat).replace('T', ' ').slice(5, 19) : '从未上线',
  }
  if (d.type === 'temperature') Object.assign(base, liveValues.value.temperature)
  if (d.type === 'gas') Object.assign(base, liveValues.value.gas)
  if (d.type === 'smoke') Object.assign(base, liveValues.value.smoke)
  return base
}))

const totalDevices = computed(() => deviceCards.value.length)
const onlineDevices = computed(() => deviceCards.value.filter(d => d.status === 'online').length)
const offlineDevices = computed(() => deviceCards.value.filter(d => d.status === 'offline').length)
const alarmDevices = computed(() => 0) // 告警统一走告警中心

const filteredDevices = computed(() => {
  return deviceCards.value.filter(d => {
    if (searchText.value) {
      const query = searchText.value.toLowerCase()
      if (!d.name.toLowerCase().includes(query) && !d.id.toLowerCase().includes(query)) return false
    }
    if (filterType.value && d.type !== filterType.value) return false
    return true
  })
})

function getDeviceIcon(type) {
  return typeIcons[type] || '📡'
}

function getTypeText(type) {
  return typeTexts[type] || type
}

function getStatusText(status) {
  return { online: '在线', offline: '离线', warning: '预警', danger: '告警', charging: '充电中', maintenance: '维护中' }[status] || status
}

function restartDevice(device) {
  ElMessage.info(`远程重启需要网关侧支持，当前协议未定义该方法（${device.id}）`)
}

// ===== 设备 CRUD =====
const formDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)
const detailDevice = ref(null)

const blankForm = () => ({
  device_id: '',
  name: '',
  type: 'temperature',
  category: 'sensor',
  location: '车间A',
  model: '',
  manufacturer: '',
  description: '',
})
const form = ref(blankForm())

function openCreate() {
  editingId.value = null
  form.value = blankForm()
  formDialogVisible.value = true
}

function openEdit(device) {
  editingId.value = device.dbId
  form.value = {
    device_id: device.id,
    name: device.name,
    type: device.type,
    category: device.category,
    location: device.location,
    model: device.model || '',
    manufacturer: device.manufacturer || '',
    description: device.description || '',
  }
  formDialogVisible.value = true
}

function openDetail(device) {
  detailDevice.value = device
  detailDialogVisible.value = true
}

async function saveDevice() {
  if (!form.value.device_id.trim() || !form.value.name.trim()) {
    ElMessage.warning('设备ID和名称不能为空')
    return
  }
  saving.value = true
  try {
    const res = editingId.value
      ? await api.put(`/devices/${editingId.value}`, { ...form.value })
      : await api.post('/devices', { ...form.value })
    if (res.status === 'ok') {
      ElMessage.success(editingId.value ? '设备已更新' : '设备已添加')
      formDialogVisible.value = false
      loadDevices()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  saving.value = false
}

function deleteDevice(device) {
  ElMessageBox.confirm(
    `确定删除设备「${device.name}」（${device.id}）吗？删除后不可恢复。`,
    '删除设备',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const res = await api.delete(`/devices/${device.dbId}`)
      if (res.status === 'ok') {
        ElMessage.success(res.message || '已删除')
        loadDevices()
      } else {
        ElMessage.error(res.message || '删除失败')
      }
    } catch (e) {
      ElMessage.error('无法连接服务器')
    }
  }).catch(() => {})
}

onMounted(async () => {
  await factoryStore.loadFactories()
  await loadWorkshops()
  await loadDevices()
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

.device-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 20px;
  flex-wrap: wrap;
}

.toolbar-stats {
  display: flex;
  gap: 20px;
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tb-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.tb-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.toolbar-item.online .tb-value { color: var(--accent-green); }
.toolbar-item.offline .tb-value { color: var(--accent-red); }
.toolbar-item.alarm .tb-value { color: var(--accent-yellow); }

.toolbar-actions { display: flex; gap: 10px; }

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.device-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s;
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 212, 255, 0.15);
}

.device-card.offline {
  border-color: var(--accent-red);
  opacity: 0.7;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.device-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.device-icon.temperature { background: linear-gradient(135deg, rgba(255, 149, 0, 0.3), rgba(255, 85, 0, 0.3)); }
.device-icon.humidity { background: linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 102, 204, 0.3)); }
.device-icon.tempHumid { background: linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 102, 204, 0.3)); }
.device-icon.gas { background: linear-gradient(135deg, rgba(255, 71, 87, 0.3), rgba(204, 0, 0, 0.3)); }
.device-icon.smoke { background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 140, 0, 0.3)); }
.device-icon.lighting { background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 255, 0, 0.2)); }
.device-icon.agv { background: linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 153, 68, 0.3)); }
.device-icon.counter { background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(99, 102, 241, 0.3)); }

.device-info { flex: 1; min-width: 0; }

.device-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.device-id {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.device-status-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;
  white-space: nowrap;
}

.device-status-tag.online { background: rgba(0, 255, 136, 0.15); color: var(--accent-green); }
.device-status-tag.offline { background: rgba(255, 71, 87, 0.15); color: var(--accent-red); }
.device-status-tag.warning { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }
.device-status-tag.danger { background: rgba(255, 71, 87, 0.25); color: var(--accent-red); font-weight: 600; }
.device-status-tag.charging { background: rgba(255, 215, 0, 0.15); color: var(--accent-yellow); }
.device-status-tag.maintenance { background: rgba(255, 149, 0, 0.15); color: var(--accent-orange); }

.device-card.warning { border-color: var(--accent-yellow); }
.device-card.danger { border-color: var(--accent-red); box-shadow: 0 0 18px rgba(255, 71, 87, 0.2); }

.val-warn { color: var(--accent-yellow); font-weight: 600; }
.val-danger { color: var(--accent-red); font-weight: 700; }

.card-body { padding: 16px; }

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label { font-size: 11px; color: var(--text-secondary); }
.info-value { font-size: 13px; color: var(--text-primary); }

.signal-bars { display: flex; gap: 2px; align-items: center; }

.signal-bars .bar {
  width: 4px;
  height: 10px;
  background: rgba(136, 153, 176, 0.3);
  border-radius: 1px;
}

.signal-bars .bar.active { background: var(--accent-green); }

.card-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
}

.device-empty {
  text-align: center;
  padding: 60px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
</style>
