import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { getFactories } from '@/services/api';
import { FactoryInfo } from '@/types/factory';

interface FactoryState {
  factories: FactoryInfo[];
  currentFactoryId: number | null;
  loadFactories: () => Promise<FactoryInfo[]>;
  setCurrentFactory: (id: number | null) => void;
}

const STORE_KEY = 'factory_current_id';

export const useFactoryStore = create<FactoryState>((set, get) => ({
  factories: [],
  // 恢复上次选择的工厂
  currentFactoryId: Taro.getStorageSync(STORE_KEY) || null,

  loadFactories: async () => {
    try {
      const list = await getFactories();
      set({ factories: list || [] });
      const cur = get().currentFactoryId;
      const stillExists = (list || []).some((f) => f.id === cur);
      if (!stillExists && list && list.length > 0) {
        set({ currentFactoryId: list[0].id });
        Taro.setStorageSync(STORE_KEY, list[0].id);
      }
    } catch (e) {
      console.warn('[FactoryStore] 加载工厂失败', e);
    }
    return get().factories;
  },

  setCurrentFactory: (id) => {
    set({ currentFactoryId: id });
    if (id) Taro.setStorageSync(STORE_KEY, id);
    else Taro.removeStorageSync(STORE_KEY);
  }
}));
