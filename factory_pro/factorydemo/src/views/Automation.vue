<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">智能联动</h2>
      <div class="page-desc">
        自定义「当传感器满足条件 → 自动执行设备命令」的联动规则（设计参考 Home Assistant 自动化），
        并支持一键场景模式。规则带状态翻转去抖，只在条件由「不满足→满足」的瞬间触发一次。
      </div>
    </div>

    <!-- 场景模式 -->
    <div class="scenario-section">
      <div class="panel-title">一键场景模式</div>
      <div class="scenario-grid">
        <div v-for="s in scenarios" :key="s.key" class="scenario-card" :class="{ active: applying === s.key }" @click="applyScenario(s)">
          <div class="scenario-icon" v-html="s.icon"></div>
          <div class="scenario-name">{{ s.label }}</div>
          <div class="scenario-desc">{{ s.desc }}</div>
          <div class="scenario-status">
            <span v-if="applying === s.key" class="applying">下发中…</span>
            <span v-else-if="lastApplied === s.key" class="applied">✓ 已下发</span>
            <span v-else>点击应用</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 规则列表 -->
    <div class="rules-section">
      <div class="rules-header">
        <div class="panel-title">联动规则（{{ rules.length }}）</div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建规则</el-button>
      </div>
      <el-table :data="rules" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="规则名称" min-width="140" />
        <el-table-column label="触发条件" min-width="180">
          <template #default="{ row }">
            <code class="rule-cond">当 {{ fieldLabel(row.field) }} {{ opSymbol(row.operator) }} {{ row.threshold }}</code>
          </template>
        </el-table-column>
        <el-table-column label="执行动作" min-width="160">
          <template #default="{ row }">
            <code class="rule-action">{{ actionLabel(row.action_method, row.action_params) }}</code>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled === 1" @change="toggleRule(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="last_fired_at" label="最近触发" width="170">
          <template #default="{ row }">
            {{ row.last_fired_at ? String(row.last_fired_at).replace('T', ' ').slice(0, 19) : '从未触发' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑规则' : '新建规则'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="规则名称">
          <el-input v-model="form.name" placeholder="例如：高温自动开灯" maxlength="64" />
        </el-form-item>
        <el-form-item label="触发条件">
          <div class="cond-row">
            <span>当</span>
            <el-select v-model="form.field" style="width: 150px">
              <el-option v-for="f in FIELD_OPTIONS" :key="f.value" :label="f.label" :value="f.value" />
            </el-select>
            <el-select v-model="form.operator" style="width: 80px">
              <el-option label=">" value="gt" />
              <el-option label="<" value="lt" />
              <el-option label="=" value="eq" />
            </el-select>
            <el-input-number v-model="form.threshold" :precision="1" style="width: 130px" />
          </div>
        </el-form-item>
        <el-form-item label="执行动作">
          <div class="cond-row">
            <el-select v-model="form.action_method" style="width: 150px" @change="onActionChange">
              <el-option label="照明灯 relay" value="relay" />
              <el-option label="RGB 指示灯 rgb" value="rgb" />
              <el-option label="蜂鸣器 beep" value="beep" />
            </el-select>
            <el-select v-model="form.action_preset" style="width: 200px" @change="syncParams">
              <el-option v-for="p in actionPresets" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="参数预览">
          <code class="param-preview">{{ form.action_params }}</code>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../utils/request'

const Plus = { name: 'Plus' }

// ===== 场景模式 =====
const SCENARIO_DEFS = [
  { key: 'production', label: '生产模式', desc: '开灯 · RGB绿 · 静音',
    icon: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
  { key: 'off_work', label: '下班模式', desc: '关灯 · RGB灭 · 静音',
    icon: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>' },
  { key: 'guard', label: '警戒模式', desc: '开灯 · RGB红 · 蜂鸣滴答',
    icon: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
]
const scenarios = ref(SCENARIO_DEFS)
const applying = ref('')
const lastApplied = ref('')

async function applyScenario(s) {
  applying.value = s.key
  try {
    const res = await api.post(`/scenarios/${s.key}/apply`)
    if (res.status === 'ok') {
      ElMessage.success(`「${s.label}」已下发 ${res.sent} 条命令`)
      lastApplied.value = s.key
      setTimeout(() => { if (lastApplied.value === s.key) lastApplied.value = '' }, 4000)
    } else {
      ElMessage.error(res.message || '下发失败')
    }
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  applying.value = ''
}

// ===== 规则 CRUD =====
const FIELD_OPTIONS = [
  { value: 'temp', label: '温度 temp (℃)' },
  { value: 'humi', label: '湿度 humi (%)' },
  { value: 'mq5_ppm', label: '可燃气 mq5_ppm' },
  { value: 'mq2_ppm', label: '烟雾 mq2_ppm' },
  { value: 'ldr_adc', label: '光照 ldr_adc (0~4095)' },
  { value: 'pir', label: '人员 pir (0/1)' },
  { value: 'light_on', label: '灯状态 light_on (0/1)' },
  { value: 'count', label: '计数 count' },
  { value: 'stock', label: '库存 stock' },
]

const PRESETS = {
  relay: [
    { value: 'on', label: '开灯', params: '{"val":1}' },
    { value: 'off', label: '关灯', params: '{"val":0}' },
  ],
  rgb: [
    { value: 'red', label: '红色(报警)', params: '{"val":1}' },
    { value: 'green', label: '绿色(正常)', params: '{"val":2}' },
    { value: 'yellow', label: '黄色(注意)', params: '{"val":3}' },
    { value: 'blue', label: '蓝色', params: '{"val":4}' },
    { value: 'off', label: '关闭', params: '{"val":0}' },
  ],
  beep: [
    { value: 'tick', label: '滴答节奏', params: '{"on_ms":200,"off_ms":200}' },
    { value: 'slow', label: '慢速提示', params: '{"on_ms":100,"off_ms":500}' },
    { value: 'mute', label: '静音', params: '{"on_ms":0,"off_ms":0}' },
  ],
}
const actionPresets = computed(() => PRESETS[form.value.action_method] || [])

const rules = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)

const blankForm = () => ({
  name: '',
  field: 'temp',
  operator: 'gt',
  threshold: 30,
  action_method: 'relay',
  action_preset: 'on',
  action_params: '{"val":1}',
})
const form = ref(blankForm())

function onActionChange() {
  const presets = PRESETS[form.value.action_method]
  form.value.action_preset = presets[0].value
  form.value.action_params = presets[0].params
}
function syncParams(v) {
  const p = actionPresets.value.find(x => x.value === v)
  if (p) form.value.action_params = p.params
}

async function loadRules() {
  loading.value = true
  try {
    const res = await api.get('/rules')
    if (res.status === 'ok') rules.value = res.data || []
  } catch (e) { /* 静默 */ }
  loading.value = false
}

function openCreate() {
  editingId.value = null
  form.value = blankForm()
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  // 编辑时反推动作预设（按 params 匹配，匹配不到用自定义第一项）
  const presets = PRESETS[row.action_method] || []
  const hit = presets.find(p => p.params === row.action_params)
  form.value = {
    name: row.name,
    field: row.field,
    operator: row.operator,
    threshold: row.threshold,
    action_method: row.action_method,
    action_preset: hit ? hit.value : (presets[0]?.value || ''),
    action_params: row.action_params,
  }
  dialogVisible.value = true
}

async function saveRule() {
  if (!form.value.name.trim()) { ElMessage.warning('请填写规则名称'); return }
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      field: form.value.field,
      operator: form.value.operator,
      threshold: form.value.threshold,
      action_method: form.value.action_method,
      action_params: form.value.action_params,
    }
    const res = editingId.value
      ? await api.put(`/rules/${editingId.value}`, payload)
      : await api.post('/rules', payload)
    if (res.status === 'ok') {
      ElMessage.success(editingId.value ? '规则已更新' : '规则已创建')
      dialogVisible.value = false
      loadRules()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('无法连接服务器')
  }
  saving.value = false
}

async function toggleRule(row) {
  try {
    const res = await api.put(`/rules/${row.id}/toggle`)
    if (res.status === 'ok') {
      row.enabled = res.enabled
      ElMessage.success(res.enabled === 1 ? '规则已启用' : '规则已禁用')
    }
  } catch (e) { ElMessage.error('操作失败') }
}

function deleteRule(row) {
  ElMessageBox.confirm(`确定删除规则「${row.name}」吗？`, '删除规则', {
    confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
  }).then(async () => {
    const res = await api.delete(`/rules/${row.id}`)
    if (res.status === 'ok') {
      ElMessage.success('已删除')
      loadRules()
    }
  }).catch(() => {})
}

function fieldLabel(f) { return FIELD_OPTIONS.find(x => x.value === f)?.label || f }
function opSymbol(op) { return { gt: '>', lt: '<', eq: '=' }[op] || op }
function actionLabel(method, params) {
  const name = { relay: '照明灯', rgb: 'RGB', beep: '蜂鸣器' }[method] || method
  try {
    const p = JSON.parse(params || '{}')
    if (method === 'relay') return `${name} → ${p.val === 1 ? '开灯' : '关灯'}`
    if (method === 'rgb') return `${name} → 颜色${p.val}`
    if (method === 'beep') return `${name} → 响${p.on_ms}ms/停${p.off_ms}ms`
  } catch (e) {}
  return `${name} ${params}`
}

onMounted(() => { loadRules() })
</script>

<style scoped>
.page-container { padding: 20px; min-height: 100%; }
.page-header { margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
.page-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.7; max-width: 900px; }

.scenario-section, .rules-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.panel-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.rules-header { display: flex; justify-content: space-between; align-items: center; }

.scenario-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

.scenario-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
  color: #00d4ff;
}
.scenario-card:hover { border-color: #00d4ff; transform: translateY(-3px); box-shadow: 0 6px 18px rgba(0, 212, 255, 0.12); }
.scenario-card.active { border-color: #00d4ff; background: rgba(0, 212, 255, 0.06); }

.scenario-icon { margin-bottom: 10px; }
.scenario-name { font-size: 15px; font-weight: 600; color: var(--text-primary, #e0f0ff); }
.scenario-desc { font-size: 12px; color: var(--text-secondary); margin: 6px 0 10px; }
.scenario-status { font-size: 12px; color: var(--text-secondary); }
.scenario-status .applying { color: #ffd700; }
.scenario-status .applied { color: #00ff88; }

.rule-cond { color: #ffd700; font-size: 12px; }
.rule-action { color: #00ff88; font-size: 12px; }
.param-preview { color: #00d4ff; font-size: 12px; background: rgba(0,212,255,0.06); padding: 4px 10px; border-radius: 6px; }
.cond-row { display: flex; align-items: center; gap: 10px; }
</style>
