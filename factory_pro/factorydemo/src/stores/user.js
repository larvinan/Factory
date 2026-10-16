import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../utils/request'

export const useUserStore = defineStore('user', () => {
  // 从 localStorage 恢复，刷新页面保持登录态
  const savedUser = localStorage.getItem('user')
  const savedToken = localStorage.getItem('token')
  const user = ref(savedUser ? JSON.parse(savedUser) : null)
  const token = ref(savedToken || '')

  const isLogin = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const userName = computed(() => user.value?.name || '未登录')
  const userAvatar = computed(() => user.value?.avatar || '')

  function persist(u, t) {
    user.value = u
    token.value = t
    if (u) localStorage.setItem('user', JSON.stringify(u))
    else localStorage.removeItem('user')
  }

  /**
   * 登录：调用后端 /api/auth/login（用户名密码模式）
   * 返回 {success, message} 与旧 mock 结构一致，Login.vue 无需改动
   */
  async function login(form) {
    const { username, password } = form
    try {
      const res = await api.post('/auth/login', { username, password })
      if (res.status !== 'ok') {
        return { success: false, message: res.message || '登录失败' }
      }
      const { token: tk, user: u } = res.data
      localStorage.setItem('token', tk)
      // 界面头像用昵称首字
      const ui = u.avatar || (u.name || u.username || '用').charAt(0)
      persist({ ...u, avatar: ui }, tk)
      return { success: true, message: '登录成功' }
    } catch (e) {
      return { success: false, message: '无法连接服务器，请确认后端已启动' }
    }
  }

  /**
   * 注册：调用后端 /api/auth/register
   */
  async function register(form) {
    const { username, password, name, role, adminCode } = form
    try {
      const res = await api.post('/auth/register', {
        username, password, name, role, adminCode
      })
      if (res.status !== 'ok') {
        return { success: false, message: res.message || '注册失败' }
      }
      return { success: true, message: res.message || '注册成功' }
    } catch (e) {
      return { success: false, message: '无法连接服务器，请确认后端已启动' }
    }
  }

  function logout() {
    persist(null, '')
    localStorage.removeItem('token')
  }

  return {
    user, token, isLogin, isAdmin, userName, userAvatar,
    login, register, logout
  }
})
