// ============================
// 功能开关（Feature Flags）
// 集中管理页面级展示开关，改这里的布尔值即可切换，无需动页面代码
// ============================

export const FEATURES = {
  /**
   * AGV 避障系统
   *  false = 侧边栏仍可见，进入页面显示「正在开发」占位
   *  true  = 显示完整 AGV 避障页面（views/AGV.vue，内容未做任何改动）
   */
  AGV_ENABLED: true,
}
