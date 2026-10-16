<template>
  <div class="factory-page">
    <!-- 页头 -->
    <div class="page-header">
      <div>
        <h2>工厂管理</h2>
        <p class="sub">维护公司下属工厂与车间层级（工厂 → 车间 → 设备）</p>
      </div>
      <el-button type="primary" @click="openCreate">＋ 新增工厂</el-button>
    </div>

    <!-- 工厂卡片 -->
    <el-row :gutter="16" v-loading="loading">
      <el-col :span="12" v-for="f in factories" :key="f.id">
        <div class="factory-card" :class="{ active: f.id === factoryStore.currentFactoryId }">
          <div class="card-top">
            <div class="factory-name">
              <span class="dot"></span>{{ f.name }}
              <el-tag size="small" type="info">{{ f.code }}</el-tag>
            </div>
            <div class="ops">
              <el-button size="small" text type="primary"
                :class="{ current: f.id === factoryStore.currentFactoryId }"
                @click="switchTo(f)">
                {{ f.id === factoryStore.currentFactoryId ? '✓ 当前工厂' : '设为当前' }}
              </el-button>
              <el-button size="small" text type="primary" @click="openEdit(f)">编辑</el-button>
              <el-button size="small" text type="danger" @click="removeFactory(f)">删除</el-button>
            </div>
          </div>
          <div class="factory-meta">{{ f.address || '未填写地址' }} · 负责人：{{ f.manager || '—' }}</div>
          <div class="stat-row">
            <div class="stat"><b>{{ f.workshopCount ?? 0 }}</b><span>车间</span></div>
            <div class="stat"><b>{{ f.deviceCount ?? 0 }}</b><span>设备</span></div>
            <div class="stat ok"><b>{{ f.onlineDevices ?? 0 }}</b><span>在线</span></div>
            <div class="stat" :class="{ warn: (f.pendingAlerts ?? 0) > 0 }">
              <b>{{ f.pendingAlerts ?? 0 }}</b><span>未处理告警</span>
            </div>
          </div>
          <!-- 车间管理 -->
          <div class="workshop-area">
            <div class="ws-header">
              <span>下属车间</span>
              <el-button size="small" text type="primary" @click="openCreateWorkshop(f)">＋ 添加车间</el-button>
            </div>
            <div class="ws-list">
              <div class="ws-item" v-for="w in workshopsOf(f.id)" :key="w.id">
                <span class="ws-name">{{ w.name }}</span>
                <span class="ws-loc">{{ w.location || '' }}</span>
                <el-button size="small" text @click="openEditWorkshop(w)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeWorkshop(w)">删除</el-button>
              </div>
              <div v-if="!workshopsOf(f.id).length" class="ws-empty">暂无车间</div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 工厂编辑对话框 -->
    <el-dialog v-model="factoryDialog" :title="editingId ? '编辑工厂' : '新增工厂'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="工厂编码">
          <el-input v-model="factoryForm.code" :disabled="!!editingId" placeholder="如 F-02（创建后不可修改）" maxlength="32" />
        </el-form-item>
        <el-form-item label="工厂名称" required>
          <el-input v-model="factoryForm.name" placeholder="如 第二工厂" maxlength="64" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="factoryForm.address" maxlength="255" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="factoryForm.manager" maxlength="64" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="factoryForm.phone" maxlength="32" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="factoryDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveFactory">保存</el-button>
      </template>
    </el-dialog>

    <!-- 车间编辑对话框 -->
    <el-dialog v-model="workshopDialog" :title="editingWsId ? '编辑车间' : '添加车间'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="车间名称" required>
          <el-input v-model="workshopForm.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="workshopForm.location" maxlength="128" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="workshopForm.description" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="workshopDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkshop">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../utils/request'
import { useFactoryStore } from '../stores/factory'

const factoryStore = useFactoryStore()
const factories = ref([])
const workshops = ref([])
const loading = ref(false)
const saving = ref(false)

const factoryDialog = ref(false)
const editingId = ref(null)
const factoryForm = ref({ code: '', name: '', address: '', manager: '', phone: '' })

const workshopDialog = ref(false)
const editingWsId = ref(null)
const editingWsFactory = ref(null)
const workshopForm = ref({ name: '', location: '', description: '' })

function workshopsOf(factoryId) {
  return workshops.value.filter(w => w.factory_id === factoryId || w.factoryId === factoryId)
}

async function loadAll() {
  loading.value = true
  try {
    const [f, w] = await Promise.all([api.get('/factories'), api.get('/workshops')])
    if (f.status === 'ok') factories.value = f.data
    if (w.status === 'ok') workshops.value = w.data
    factoryStore.factories = factories.value
  } catch (e) {
    ElMessage.error('加载工厂/车间失败')
  }
  loading.value = false
}

function switchTo(f) {
  factoryStore.setCurrentFactory(f.id)
  ElMessage.success(`已切换到「${f.name}」`)
}

function openCreate() {
  editingId.value = null
  factoryForm.value = { code: '', name: '', address: '', manager: '', phone: '' }
  factoryDialog.value = true
}

function openEdit(f) {
  editingId.value = f.id
  factoryForm.value = { code: f.code, name: f.name, address: f.address || '', manager: f.manager || '', phone: f.phone || '' }
  factoryDialog.value = true
}

async function saveFactory() {
  if (!factoryForm.value.name.trim()) return ElMessage.warning('请填写工厂名称')
  saving.value = true
  try {
    const res = editingId.value
      ? await api.put(`/factories/${editingId.value}`, factoryForm.value)
      : await api.post('/factories', factoryForm.value)
    if (res.status === 'ok') {
      ElMessage.success(res.message || '已保存')
      factoryDialog.value = false
      await loadAll()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  saving.value = false
}

async function removeFactory(f) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除工厂「${f.name}」吗？有车间的工厂需先处理车间归属。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).catch(() => false)
  if (!confirmed) return
  try {
    const res = await api.delete(`/factories/${f.id}`)
    if (res.status === 'ok') {
      if (factoryStore.currentFactoryId === f.id) factoryStore.setCurrentFactory(null)
      ElMessage.success('已删除')
      await loadAll()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

function openCreateWorkshop(f) {
  editingWsId.value = null
  editingWsFactory.value = f.id
  workshopForm.value = { name: '', location: '', description: '' }
  workshopDialog.value = true
}

function openEditWorkshop(w) {
  editingWsId.value = w.id
  editingWsFactory.value = w.factory_id ?? w.factoryId
  workshopForm.value = { name: w.name, location: w.location || '', description: w.description || '' }
  workshopDialog.value = true
}

async function saveWorkshop() {
  if (!workshopForm.value.name.trim()) return ElMessage.warning('请填写车间名称')
  saving.value = true
  try {
    const body = { ...workshopForm.value, factoryId: editingWsFactory.value }
    const res = editingWsId.value
      ? await api.put(`/workshops/${editingWsId.value}`, workshopForm.value)
      : await api.post('/workshops', body)
    if (res.status === 'ok') {
      ElMessage.success(res.message || '已保存')
      workshopDialog.value = false
      await loadAll()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
  saving.value = false
}

async function removeWorkshop(w) {
  const confirmed = await ElMessageBox.confirm(
    `确定删除车间「${w.name}」吗？车间下有设备档案时无法删除。`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  ).catch(() => false)
  if (!confirmed) return
  try {
    const res = await api.delete(`/workshops/${w.id}`)
    if (res.status === 'ok') {
      ElMessage.success('已删除')
      await loadAll()
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(loadAll)
</script>

<style scoped>
.factory-page { padding: 20px 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.sub { margin: 0; color: #86909c; font-size: 13px; }
.factory-card {
  background: #fff; border-radius: 12px; padding: 18px; margin-bottom: 16px;
  border: 2px solid transparent; box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.factory-card.active { border-color: #409eff; }
.card-top { display: flex; justify-content: space-between; align-items: center; }
.factory-name { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #00d97e; }
.ops .current { font-weight: 700; }
.factory-meta { color: #86909c; font-size: 13px; margin: 8px 0 12px; }
.stat-row { display: flex; gap: 12px; margin-bottom: 14px; }
.stat { flex: 1; background: #f5f7fa; border-radius: 10px; padding: 10px 0; text-align: center; }
.stat b { display: block; font-size: 20px; }
.stat span { font-size: 12px; color: #86909c; }
.stat.ok b { color: #00b42a; }
.stat.warn b { color: #f53f3f; }
.workshop-area { border-top: 1px dashed #e5e6eb; padding-top: 10px; }
.ws-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #4e5969; }
.ws-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }
.ws-name { font-weight: 500; }
.ws-loc { color: #86909c; flex: 1; }
.ws-empty { color: #c9cdd4; font-size: 12px; padding: 6px 0; }
</style>
