<template>
  <div class="admin-layout">
    <aside class="layout-sidebar" :class="{ collapsed: isCollapsed }">
      <div class="logo-area" @click="$router.push('/dashboard')">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="logo-text" v-show="!isCollapsed">
          <div class="logo-title">智慧工厂</div>
          <div class="logo-sub">安全监测平台</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-for="item in visibleMenuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
          exact-active-class="active"
        >
          <span class="nav-icon" v-html="item.icon"></span>
          <span class="nav-label" v-show="!isCollapsed">{{ item.title }}</span>
        </router-link>
      </nav>
    </aside>

    <div class="layout-main">
      <header class="layout-header">
        <div class="header-left">
          <button class="collapse-btn" @click="isCollapsed = !isCollapsed" :title="isCollapsed ? '展开' : '收起'">
            <svg v-if="!isCollapsed" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          <div class="breadcrumb">
            <span>{{ currentTitle }}</span>
          </div>
          <el-select
            v-if="factoryStore.factories.length"
            :model-value="factoryStore.currentFactoryId"
            @update:model-value="factoryStore.setCurrentFactory"
            size="small"
            style="width: 150px; margin-left: 16px;"
            title="全局当前工厂"
          >
            <el-option v-for="f in factoryStore.factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </div>
        <div class="header-right">
          <div class="alarm-indicator" :class="{ active: criticalCount > 0 }" @click="$router.push('/alarm')">
            <span class="indicator-dot"></span>
            <span>{{ alarmCount }} 告警</span>
          </div>
          <div class="time-display">{{ currentTime }}</div>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="user-info" style="cursor: pointer;">
              <div class="avatar" :class="{ admin: userStore.isAdmin }">{{ userStore.userAvatar }}</div>
              <div class="user-detail">
                <span class="user-name">{{ userStore.userName }}</span>
                <span class="user-role" :class="{ admin: userStore.isAdmin }">
                  {{ userStore.isAdmin ? '管理员' : '普通用户' }}
                </span>
              </div>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item divided command="logout" style="color: #ff4757;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 全局 AI 助手浮窗：任意页面右下角可用 -->
    <AiAssistantWidget />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useDeviceStore } from '../stores/device'
import { useUserStore } from '../stores/user'
import { useFactoryStore } from '../stores/factory'
import AiAssistantWidget from '../components/AiAssistantWidget.vue'

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()
const userStore = useUserStore()
const factoryStore = useFactoryStore()

const isCollapsed = ref(false)
const currentTime = ref('')

const currentTitle = computed(() => route.meta?.title || '首页')
const alarmCount = computed(() => deviceStore.alarmCount)
const criticalCount = computed(() => deviceStore.criticalCount)

const menuIconMap = {
  Monitor: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  Temperature: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></svg>',
  Sunny: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  Warning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  Van: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  Goods: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
  Bell: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
  Box: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  Cpu: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  DataAnalysis: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  Lightning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  Shield: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  Feedback: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  Office: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>',
  MagicStick: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 6.2L11 5M14 9a2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 012-2h7a2 2 0 012 2zM3 21l9-9"/></svg>',
  Camera: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
}

const allMenuItems = [
  { path: '/dashboard', title: '综合监控大屏', iconKey: 'Monitor' },
  { path: '/temperature', title: '温湿度监控', iconKey: 'Temperature' },
  { path: '/lighting', title: '红外照明控制', iconKey: 'Sunny' },
  { path: '/gas-monitor', title: '废气监测', iconKey: 'Warning' },
  { path: '/agv', title: 'AGV避障系统', iconKey: 'Van' },
  { path: '/counter', title: '货物感应计数', iconKey: 'Goods' },
  { path: '/alarm', title: '告警中心', iconKey: 'Bell' },
  { path: '/automation', title: '智能联动', iconKey: 'MagicStick' },
  { path: '/energy', title: '能耗统计', iconKey: 'Lightning' },
  { path: '/safety', title: '环境安全评估', iconKey: 'Shield' },
  { path: '/helmet-detection', title: 'AI 安全帽检测', iconKey: 'Camera' },
  { path: '/digital-twin', title: '3D 场景', iconKey: 'Box', adminOnly: true },
  { path: '/device', title: '设备管理', iconKey: 'Cpu', adminOnly: true },
  { path: '/factory', title: '工厂管理', iconKey: 'Office', adminOnly: true },
  { path: '/feedback', title: '意见反馈', iconKey: 'Feedback' },
  { path: '/report', title: '数据报表', iconKey: 'DataAnalysis', adminOnly: true }
]

const visibleMenuItems = computed(() => {
  return allMenuItems
    .filter(m => !m.adminOnly || userStore.isAdmin)
    .map(m => ({
      ...m,
      icon: menuIconMap[m.iconKey]
    }))
})

onMounted(() => {
  factoryStore.loadFactories()
})

function updateTime() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  currentTime.value = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function handleUserCommand(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      userStore.logout()
      router.push('/login')
    }).catch(() => {})
  }
}

let timeTimer = null
onMounted(() => {
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
  // 启动真实数据订阅（WebSocket 实时推送 + 告警加载），替代原 mock 轮询
  deviceStore.startRealtime()
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.layout-sidebar {
  width: 210px;
  background: linear-gradient(180deg, #0c1f38 0%, #0a1929 100%);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  flex-shrink: 0;
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.4);
}

.layout-sidebar.collapsed {
  width: 60px;
}

.logo-area {
  padding: 16px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
  min-height: 60px;
  cursor: pointer;
  background: rgba(0, 120, 255, 0.05);
}

.logo-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #409eff, #00d4ff);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
}

.logo-text {
  overflow: hidden;
  white-space: nowrap;
}

.logo-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.logo-sub {
  font-size: 11px;
  color: var(--accent-cyan);
  margin-top: 2px;
  letter-spacing: 1px;
}

.sidebar-nav {
  flex: 1;
  padding: 10px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.2s ease;
  position: relative;
  font-size: 13.5px;
}

.nav-item:hover {
  background: rgba(64, 158, 255, 0.12);
  color: var(--accent-cyan);
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.18), rgba(64, 158, 255, 0.05));
  color: var(--accent-cyan);
  font-weight: 500;
  box-shadow: inset 0 0 12px rgba(0, 212, 255, 0.15);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: var(--accent-cyan);
  border-radius: 2px;
  box-shadow: 0 0 8px var(--accent-cyan);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  flex-shrink: 0;
  color: inherit;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
}

.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.layout-header {
  height: 56px;
  background: linear-gradient(90deg, #0c1f38 0%, #0f2440 100%);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 20px;
  flex-shrink: 0;
  box-shadow: 0 1px 12px rgba(0, 0, 0, 0.4);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.collapse-btn {
  background: rgba(64, 158, 255, 0.1);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: rgba(0, 212, 255, 0.15);
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 20px;
}

.alarm-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 16px;
  font-size: 12px;
  color: var(--accent-green);
  cursor: pointer;
  transition: all 0.2s;
}

.alarm-indicator:hover {
  background: rgba(0, 255, 136, 0.2);
}

.alarm-indicator.active {
  background: rgba(255, 71, 87, 0.12);
  border-color: rgba(255, 71, 87, 0.4);
  color: var(--accent-red);
  animation: blink 1.5s infinite;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.time-display {
  font-size: 13px;
  color: var(--accent-cyan);
  font-family: Consolas, Monaco, monospace;
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #409eff, #00d4ff);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: white;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.4);
}

.avatar.admin {
  background: linear-gradient(135deg, #e6a23c, #f0c78a);
  box-shadow: 0 0 10px rgba(230, 162, 60, 0.4);
}

.user-detail {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.user-role {
  font-size: 11px;
  color: var(--text-secondary);
}

.user-role.admin {
  color: var(--accent-orange);
}

.layout-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
