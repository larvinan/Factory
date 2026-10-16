<template>
  <div class="login-page">
    <div class="login-bg"></div>
    <Silk
      class="login-silk"
      :speed="4"
      :scale="1.2"
      color="#1D4ED8"
      :noise-intensity="1.2"
      :rotation="0"
    />
    <div class="login-container">
      <SpotlightCard class="login-box register-box" spotlight-color="rgba(0, 212, 255, 0.22)">
        <div class="login-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 class="login-title">用户注册</h1>
          <p class="login-sub">创建智慧工厂平台账号</p>
        </div>

        <el-form
          ref="registerFormRef"
          :model="registerForm"
          :rules="registerRules"
          class="login-form"
          size="large"
        >
          <div class="role-tabs">
            <div
              class="role-tab"
              :class="{ active: registerForm.role === 'user' }"
              @click="registerForm.role = 'user'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              普通用户
            </div>
            <div
              class="role-tab"
              :class="{ active: registerForm.role === 'admin' }"
              @click="registerForm.role = 'admin'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              管理员
            </div>
          </div>

          <el-form-item prop="name">
            <el-input
              v-model="registerForm.name"
              placeholder="请输入姓名（选填）"
              clearable
            >
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#909399" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="username">
            <el-input
              v-model="registerForm.username"
              placeholder="请输入用户名（登录账号）"
              clearable
            >
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#909399" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="registerForm.password"
              type="password"
              placeholder="请输入密码"
              show-password
              clearable
            >
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#909399" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <el-input
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              show-password
              clearable
            >
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#909399" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item v-if="registerForm.role === 'admin'" prop="adminCode">
            <el-input
              v-model="registerForm.adminCode"
              placeholder="请输入管理员注册码"
              show-password
              clearable
            >
              <template #prefix>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#909399" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </template>
            </el-input>
          </el-form-item>

          <div class="form-tips" v-if="registerForm.role === 'admin'">
            提示：管理员注册码为 2026
          </div>

          <el-form-item>
            <el-button type="primary" class="login-btn" @click="handleRegister" :loading="loading">
              注 册
            </el-button>
          </el-form-item>
        </el-form>

        <div class="login-footer">
          已有账号？
          <router-link :to="{ path: '/login', query: { role: registerForm.role } }">返回登录</router-link>
        </div>
      </SpotlightCard>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import Silk from '../components/Silk.vue'
import SpotlightCard from '../components/SpotlightCard.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const registerFormRef = ref(null)
const loading = ref(false)

const registerForm = reactive({
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  role: route.query.role === 'admin' ? 'admin' : 'user',
  adminCode: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== registerForm.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const registerRules = computed(() => ({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 4, max: 20, message: '密码长度 4-20 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ],
  adminCode: registerForm.role === 'admin' ? [
    { required: true, message: '请输入管理员注册码', trigger: 'blur' }
  ] : []
}))

async function handleRegister() {
  if (!registerFormRef.value) return
  await registerFormRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    setTimeout(async () => {
      const res = await userStore.register(registerForm)
      loading.value = false
      if (res.success) {
        ElMessage.success(res.message)
        setTimeout(async () => {
          router.push({ path: '/login', query: { role: registerForm.role } })
        }, 800)
      } else {
        ElMessage.error(res.message)
      }
    }, 600)
  })
}
</script>

<style scoped>
.login-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, #08121f 0%, #0a1929 50%, #0f2440 100%);
}

.login-bg {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(0, 212, 255, 0.18) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(0, 120, 255, 0.12) 0%, transparent 50%);
  z-index: 0;
}

/* Silk 丝绸 WebGL 动画层（canvas 自带 zIndex:1，叠在渐变底色上） */
.login-silk {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.login-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
  /* 表单层必须高于 Silk 的 canvas(zIndex:1) */
  z-index: 2;
}

.login-box {
  width: 100%;
  max-width: 440px;
  background: rgba(15, 36, 64, 0.85);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 16px;
  padding: 36px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1);
  backdrop-filter: blur(10px);
  margin: 20px 0;
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.logo-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, #00d4ff, #0066cc);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 8px 20px rgba(0, 212, 255, 0.5);
}

.login-title {
  font-size: 20px;
  font-weight: 700;
  color: #e0f0ff;
  margin: 0 0 4px;
  text-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
}

.login-sub {
  font-size: 12px;
  color: #8899b0;
  margin: 0;
}

.role-tabs {
  display: flex;
  background: rgba(10, 25, 41, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 20px;
}

.role-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 0;
  border-radius: 8px;
  font-size: 13px;
  color: #8899b0;
  cursor: pointer;
  transition: all 0.2s;
}

.role-tab:hover {
  color: #e0f0ff;
}

.role-tab.active {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(64, 158, 255, 0.15));
  color: #00d4ff;
  font-weight: 600;
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
}

.login-form {
  margin-bottom: 16px;
}

:deep(.el-input__wrapper) {
  padding: 5px 15px;
  border-radius: 10px;
  background: rgba(10, 25, 41, 0.6) !important;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.2) inset !important;
}
:deep(.el-input__inner) {
  color: #e0f0ff !important;
}
:deep(.el-input__inner::placeholder) {
  color: #5a6a80 !important;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

.form-tips {
  font-size: 12px;
  text-align: center;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(0, 212, 255, 0.08);
  border-radius: 6px;
  border: 1px solid rgba(0, 212, 255, 0.2);
  color: #00d4ff;
}

.login-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #00d4ff, #0066cc);
  border: none;
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3);
}

.login-btn:hover {
  background: linear-gradient(90deg, #33ddff, #0077dd);
  box-shadow: 0 4px 20px rgba(0, 212, 255, 0.5);
}

.login-footer {
  text-align: center;
  font-size: 13px;
  color: #8899b0;
}

.login-footer a {
  color: #00d4ff;
  text-decoration: none;
  font-weight: 500;
}

.login-footer a:hover {
  text-decoration: underline;
}
</style>
