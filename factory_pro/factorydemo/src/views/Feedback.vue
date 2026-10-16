<template>
  <div class="feedback-page">
    <!-- 页头 + 统计 -->
    <div class="page-header">
      <div>
        <h2>意见反馈</h2>
        <p class="sub">反馈平台使用中遇到的问题或改进建议，帮助我们确定后续调整方向</p>
      </div>
      <div class="stat-badges" v-if="isAdmin">
        <el-tag type="danger">待处理 {{ stats.pending || 0 }}</el-tag>
        <el-tag type="warning">处理中 {{ stats.processing || 0 }}</el-tag>
        <el-tag type="success">已解决 {{ stats.resolved || 0 }}</el-tag>
        <el-tag type="info">已关闭 {{ stats.closed || 0 }}</el-tag>
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 提交表单 -->
      <el-col :span="9">
        <div class="panel">
          <h3 class="panel-title">提交新反馈</h3>
          <el-form label-position="top">
            <el-form-item label="反馈类型" required>
              <el-radio-group v-model="form.type">
                <el-radio-button value="bug">🐛 功能缺陷</el-radio-button>
                <el-radio-button value="suggestion">💡 功能建议</el-radio-button>
                <el-radio-button value="experience">😐 体验问题</el-radio-button>
                <el-radio-button value="other">📝 其他</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="影响程度">
              <el-radio-group v-model="form.severity">
                <el-radio-button value="low">轻微</el-radio-button>
                <el-radio-button value="medium">一般</el-radio-button>
                <el-radio-button value="high">严重</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="标题" required>
              <el-input v-model="form.title" maxlength="128" show-word-limit placeholder="一句话概括问题" />
            </el-form-item>
            <el-form-item label="详细描述" required>
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="5"
                maxlength="2000"
                show-word-limit
                placeholder="发生在哪个页面？做了什么操作？期望的表现是什么？"
              />
            </el-form-item>
            <el-form-item label="联系方式（选填）">
              <el-input v-model="form.contact" maxlength="64" placeholder="微信群 / 手机号，便于回访" />
            </el-form-item>
            <el-form-item label="截图（选填，最多3张）">
              <el-upload
                :show-file-list="false"
                :http-request="uploadImage"
                accept="image/*"
                multiple
                :limit="3"
              >
                <el-button :icon="Upload" :loading="uploading">上传截图</el-button>
              </el-upload>
              <div class="img-preview" v-if="form.images.length">
                <div class="img-item" v-for="(img, i) in form.images" :key="i">
                  <el-image :src="img" fit="cover" style="width:64px;height:64px;border-radius:6px" />
                  <span class="img-remove" @click="form.images.splice(i, 1)">×</span>
                </div>
              </div>
            </el-form-item>
            <el-button type="primary" style="width:100%" :loading="submitting" @click="submit">
              提交反馈
            </el-button>
          </el-form>
        </div>
      </el-col>

      <!-- 反馈列表 -->
      <el-col :span="15">
        <div class="panel">
          <div class="list-header">
            <h3 class="panel-title">{{ isAdmin ? '全部反馈' : '我的反馈' }}</h3>
            <div class="list-filters">
              <el-select v-model="filterStatus" size="small" style="width:120px" @change="loadList" placeholder="状态">
                <el-option label="全部状态" value="" />
                <el-option label="待处理" value="pending" />
                <el-option label="处理中" value="processing" />
                <el-option label="已解决" value="resolved" />
                <el-option label="已关闭" value="closed" />
              </el-select>
              <el-button size="small" :icon="Refresh" @click="loadList" />
            </div>
          </div>

          <div v-loading="loading" class="fb-list">
            <div class="fb-empty" v-if="!loading && list.length === 0">暂无反馈记录</div>
            <div class="fb-item" v-for="fb in list" :key="fb.id">
              <div class="fb-top">
                <el-tag size="small" :type="typeTag(fb.type)">{{ typeText(fb.type) }}</el-tag>
                <el-tag size="small" effect="plain" :type="severityTag(fb.severity)">{{ severityText(fb.severity) }}</el-tag>
                <span class="fb-title">{{ fb.title }}</span>
                <el-tag size="small" :type="statusTag(fb.status)" effect="dark">{{ statusText(fb.status) }}</el-tag>
              </div>
              <div class="fb-content">{{ fb.content }}</div>
              <div class="fb-images" v-if="parseImages(fb.images).length">
                <el-image
                  v-for="(img, i) in parseImages(fb.images)" :key="i"
                  :src="img" :preview-src-list="parseImages(fb.images)"
                  fit="cover" style="width:72px;height:72px;border-radius:6px"
                />
              </div>
              <div class="fb-reply" v-if="fb.reply">
                <b>官方回复：</b>{{ fb.reply }}
                <span class="fb-reply-by">—— {{ fb.handledBy }}</span>
              </div>
              <div class="fb-meta">
                <span>{{ fb.reporterName }}（{{ fb.reporterType === 'web' ? 'Web' : '小程序' }}）</span>
                <span>{{ fb.contact || '未留联系方式' }}</span>
                <span>{{ (fb.createdAt || '').replace('T', ' ').slice(0, 19) }}</span>
                <span class="fb-ops" v-if="isAdmin">
                  <el-button size="small" text type="primary" @click="openHandle(fb)">处理</el-button>
                  <el-button size="small" text type="danger" @click="removeFb(fb)">删除</el-button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 处理对话框 -->
    <el-dialog v-model="handleDialog" title="处理反馈" width="480px">
      <el-form label-width="70px">
        <el-form-item label="状态">
          <el-select v-model="handleForm.status" style="width:100%">
            <el-option label="待处理" value="pending" />
            <el-option label="处理中" value="processing" />
            <el-option label="已解决" value="resolved" />
            <el-option label="已关闭" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="回复">
          <el-input v-model="handleForm.reply" type="textarea" :rows="3" maxlength="500" show-word-limit
            placeholder="处理结果或后续安排（提交者可在反馈列表看到）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveHandle">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Refresh } from '@element-plus/icons-vue'
import api from '../utils/request'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const isAdmin = userStore.isAdmin

const form = reactive({ type: 'bug', severity: 'medium', title: '', content: '', contact: '', images: [] })
const submitting = ref(false)
const uploading = ref(false)
const list = ref([])
const stats = ref({})
const loading = ref(false)
const filterStatus = ref('')
const isAdminFlag = ref(false)

const handleDialog = ref(false)
const saving = ref(false)
const editingId = ref(null)
const handleForm = reactive({ status: 'pending', reply: '' })

const TYPE_TEXT = { bug: '功能缺陷', suggestion: '功能建议', experience: '体验问题', other: '其他' }
const SEV_TEXT = { low: '轻微', medium: '一般', high: '严重' }
const STATUS_TEXT = { pending: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }

const typeText = (t) => TYPE_TEXT[t] || t
const severityText = (s) => SEV_TEXT[s] || s
const statusText = (s) => STATUS_TEXT[s] || s
const typeTag = (t) => (t === 'bug' ? 'danger' : t === 'suggestion' ? 'primary' : 'info')
const severityTag = (s) => (s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'info')
const statusTag = (s) => (s === 'pending' ? 'danger' : s === 'processing' ? 'warning' : s === 'resolved' ? 'success' : 'info')

function parseImages(images) {
  if (!images) return []
  try {
    const arr = JSON.parse(images)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

async function loadList() {
  loading.value = true
  try {
    const qs = new URLSearchParams()
    if (filterStatus.value) qs.set('status', filterStatus.value)
    const res = await api.get('/feedbacks' + (qs.toString() ? '?' + qs : ''))
    if (res.status === 'ok') {
      list.value = res.data.list || []
      isAdminFlag.value = !!res.data.isAdmin
    }
  } catch (e) {
    ElMessage.error('加载反馈列表失败')
  }
  loading.value = false
}

async function loadStats() {
  if (!isAdmin) return
  try {
    const res = await api.get('/feedbacks/stats')
    if (res.status === 'ok') stats.value = res.data
  } catch { /* ignore */ }
}

async function uploadImage({ file }) {
  if (form.images.length >= 3) return ElMessage.warning('最多上传 3 张截图')
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    const res = await fetch('http://localhost:8000/api/upload', { method: 'POST', body: fd })
    const json = await res.json()
    if (json.status === 'ok') {
      form.images.push(json.data.url)
    } else {
      ElMessage.error('截图上传失败')
    }
  } catch (e) {
    ElMessage.error('截图上传失败')
  }
  uploading.value = false
}

async function submit() {
  if (!form.title.trim()) return ElMessage.warning('请填写反馈标题')
  if (!form.content.trim()) return ElMessage.warning('请填写详细描述')
  submitting.value = true
  try {
    const res = await api.post('/feedbacks', { ...form, images: JSON.stringify(form.images) })
    if (res.status === 'ok') {
      ElMessage.success(res.message || '反馈已提交')
      form.title = ''
      form.content = ''
      form.contact = ''
      form.images = []
      await Promise.all([loadList(), loadStats()])
    } else {
      ElMessage.error(res.message || '提交失败')
    }
  } catch (e) {
    ElMessage.error('提交失败')
  }
  submitting.value = false
}

function openHandle(fb) {
  editingId.value = fb.id
  handleForm.status = fb.status
  handleForm.reply = fb.reply || ''
  handleDialog.value = true
}

async function saveHandle() {
  saving.value = true
  try {
    const res = await api.put(`/feedbacks/${editingId.value}/handle`, {
      status: handleForm.status,
      reply: handleForm.reply,
      handledBy: userStore.user?.name || 'admin'
    })
    if (res.status === 'ok') {
      ElMessage.success('已更新')
      handleDialog.value = false
      await Promise.all([loadList(), loadStats()])
    } else {
      ElMessage.error(res.message || '更新失败')
    }
  } catch (e) {
    ElMessage.error('更新失败')
  }
  saving.value = false
}

async function removeFb(fb) {
  const ok = await ElMessageBox.confirm(`确定删除反馈「${fb.title}」吗？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  }).catch(() => false)
  if (!ok) return
  try {
    const res = await api.delete(`/feedbacks/${fb.id}`)
    if (res.status === 'ok') {
      ElMessage.success('已删除')
      await Promise.all([loadList(), loadStats()])
    } else {
      ElMessage.error(res.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(() => { loadList(); loadStats() })
</script>

<style scoped>
.feedback-page { padding: 20px 24px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.sub { margin: 0; color: #86909c; font-size: 13px; }
.stat-badges { display: flex; gap: 8px; }
.panel { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.panel-title { margin: 0 0 14px; font-size: 15px; }
.list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.list-header .panel-title { margin: 0; }
.list-filters { display: flex; gap: 8px; }
.fb-list { max-height: calc(100vh - 240px); overflow-y: auto; }
.fb-empty { text-align: center; color: #c9cdd4; padding: 60px 0; }
.fb-item { border: 1px solid #e5e6eb; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.fb-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fb-title { font-weight: 600; flex: 1; }
.fb-content { font-size: 13px; color: #4e5969; white-space: pre-wrap; }
.fb-images { display: flex; gap: 8px; margin-top: 8px; }
.fb-reply { margin-top: 8px; padding: 8px 12px; background: rgba(0, 180, 42, 0.06); border-left: 3px solid #00b42a; border-radius: 4px; font-size: 13px; }
.fb-reply-by { color: #86909c; font-size: 12px; margin-left: 8px; }
.fb-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #86909c; }
.fb-ops { margin-left: auto; }
.img-preview { display: flex; gap: 8px; margin-top: 8px; }
.img-item { position: relative; }
.img-remove { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; background: #f53f3f; color: #fff; border-radius: 50%; text-align: center; line-height: 18px; font-size: 12px; cursor: pointer; }
</style>
