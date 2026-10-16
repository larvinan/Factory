<template>
  <div class="dev-page">
    <div class="dev-card">
      <div class="dev-icon">
        <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>
      <h2 class="dev-title">{{ title }}</h2>
      <p class="dev-desc">该功能正在开发中，硬件联调完成后将正式上线，敬请期待</p>
      <div class="dev-actions">
        <el-button type="primary" @click="$router.push('/dashboard')">返回监控大屏</el-button>
        <el-button @click="$router.back()">返回上一页</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => `${route.meta?.title || '该功能'} · 开发中`)
</script>

<style scoped>
.dev-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.dev-card {
  text-align: center;
  background: var(--bg-card, rgba(255,255,255,0.03));
  border: 1px dashed var(--border-color, rgba(0,212,255,0.3));
  border-radius: 16px;
  padding: 56px 72px;
  max-width: 480px;
}

.dev-icon {
  width: 88px;
  height: 88px;
  margin: 0 auto 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.25);
  animation: dev-pulse 2.4s ease-in-out infinite;
}

@keyframes dev-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.25); }
  50% { box-shadow: 0 0 0 14px rgba(0, 212, 255, 0); }
}

.dev-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 10px;
}

.dev-desc {
  font-size: 13px;
  color: var(--text-secondary, #8899b0);
  line-height: 1.7;
  margin: 0 0 26px;
}

.dev-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
