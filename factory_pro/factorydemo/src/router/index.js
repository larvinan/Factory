import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'
import { FEATURES } from '../config/features'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { guest: true }
  },
  {
    path: '/',
    component: () => import('../layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '综合监控大屏', icon: 'Monitor' }
      },
      {
        path: 'temperature',
        name: 'Temperature',
        component: () => import('../views/Temperature.vue'),
        meta: { title: '温湿度监控', icon: 'Temperature' }
      },
      {
        path: 'lighting',
        name: 'Lighting',
        component: () => import('../views/Lighting.vue'),
        meta: { title: '红外照明控制', icon: 'Sunny' }
      },
      {
        path: 'gas-monitor',
        name: 'GasMonitor',
        component: () => import('../views/GasMonitor.vue'),
        meta: { title: '废气监测', icon: 'Warning' }
      },
      {
        path: 'agv',
        name: 'AGV',
        // 功能开关：config/features.js 中 AGV_ENABLED 控制
        // false=显示「正在开发」占位；true=显示完整 AGV 页面（AGV.vue 本身不做任何改动）
        component: FEATURES.AGV_ENABLED
          ? () => import('../views/AGV.vue')
          : () => import('../views/UnderDevelopment.vue'),
        meta: { title: 'AGV避障系统', icon: 'Van' }
      },
      {
        path: 'automation',
        name: 'Automation',
        component: () => import('../views/Automation.vue'),
        meta: { title: '智能联动', icon: 'MagicStick' }
      },
      {
        path: 'counter',
        name: 'Counter',
        component: () => import('../views/Counter.vue'),
        meta: { title: '货物感应计数', icon: 'Goods' }
      },
      {
        path: 'alarm',
        name: 'Alarm',
        component: () => import('../views/Alarm.vue'),
        meta: { title: '告警中心', icon: 'Bell' }
      },
      {
        path: 'digital-twin',
        name: 'DigitalTwin',
        component: () => import('../views/DigitalTwin.vue'),
        meta: { title: '3D 场景', icon: 'Box', adminOnly: true }
      },
      {
        path: 'device',
        name: 'Device',
        component: () => import('../views/Device.vue'),
        meta: { title: '设备管理', icon: 'Cpu', adminOnly: true }
      },
      {
        path: 'report',
        name: 'Report',
        component: () => import('../views/Report.vue'),
        meta: { title: '数据报表', icon: 'DataAnalysis', adminOnly: true }
      },
      {
        path: 'factory',
        name: 'Factory',
        component: () => import('../views/Factory.vue'),
        meta: { title: '工厂管理', icon: 'Office', adminOnly: true }
      },
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('../views/Feedback.vue'),
        meta: { title: '意见反馈', icon: 'Feedback' }
      },
      {
        path: 'energy',
        name: 'Energy',
        component: () => import('../views/Energy.vue'),
        meta: { title: '照明与在场分析', icon: 'Lightning' }
      },
      {
        path: 'safety',
        name: 'Safety',
        component: () => import('../views/Safety.vue'),
        meta: { title: '环境安全评估', icon: 'Shield' }
      },
      {
        path: 'helmet-detection',
        name: 'HelmetDetection',
        component: () => import('../views/HelmetDetection.vue'),
        meta: { title: 'AI 安全帽检测', icon: 'Camera' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  const isAuthenticated = userStore.isLogin
  const isAdmin = userStore.isAdmin

  if (to.meta.guest) {
    if (isAuthenticated) {
      next('/dashboard')
    } else {
      next()
    }
    return
  }

  if (to.meta.requiresAuth) {
    if (!isAuthenticated) {
      next('/login')
      return
    }
    if (to.meta.adminOnly && !isAdmin) {
      next('/dashboard')
      return
    }
    next()
  } else {
    next()
  }
})

export default router
