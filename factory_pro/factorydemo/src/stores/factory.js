import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../utils/request'

/**
 * 全局工厂上下文
 * currentFactoryId 持久化到 localStorage，供设备管理/数字孪生等页面读取过滤
 */
export const useFactoryStore = defineStore('factory', () => {
  const savedId = localStorage.getItem('currentFactoryId')
  const currentFactoryId = ref(savedId ? Number(savedId) : null)
  const factories = ref([])

  const currentFactory = computed(() =>
    factories.value.find(f => f.id === currentFactoryId.value) || null
  )

  function setCurrentFactory(id) {
    currentFactoryId.value = id
    if (id) localStorage.setItem('currentFactoryId', String(id))
    else localStorage.removeItem('currentFactoryId')
  }

  async function loadFactories() {
    try {
      const res = await api.get('/factories')
      if (res.status === 'ok') {
        factories.value = res.data || []
        // 当前选择失效（被删）时回退第一工厂
        if (currentFactoryId.value && !factories.value.find(f => f.id === currentFactoryId.value)) {
          setCurrentFactory(factories.value[0]?.id ?? null)
        }
        if (!currentFactoryId.value && factories.value.length) {
          setCurrentFactory(factories.value[0].id)
        }
      }
    } catch (e) {
      console.warn('[FactoryStore] 加载工厂失败', e)
    }
    return factories.value
  }

  return { currentFactoryId, currentFactory, factories, setCurrentFactory, loadFactories }
})
