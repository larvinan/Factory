<template>
  <div
    ref="divRef"
    @mousemove="handleMouseMove"
    @focus="handleFocus"
    @blur="handleBlur"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :class="['spotlight-card', className]"
  >
    <div
      class="spotlight-overlay"
      :style="{
        opacity: opacity,
        background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`
      }"
    />

    <slot />
  </div>
</template>

<script setup>
// SpotlightCard 鼠标跟随聚光灯卡片（来自 Vue Bits）
// 本项目为 JS 技术栈且未使用 Tailwind：官方 TS 源码转译为 JS，
// Tailwind 工具类（relative/overflow-hidden 等）转为等效 scoped CSS，圆角/内边距等外观由使用处的类控制
import { ref } from 'vue';

const props = defineProps({
  className: { type: String, default: '' },
  spotlightColor: { type: String, default: 'rgba(255, 255, 255, 0.25)' }
});

const divRef = ref(null);
const isFocused = ref(false);
const position = ref({ x: 0, y: 0 });
const opacity = ref(0);

const handleMouseMove = (e) => {
  if (!divRef.value || isFocused.value) return;

  const rect = divRef.value.getBoundingClientRect();
  position.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const handleFocus = () => {
  isFocused.value = true;
  opacity.value = 0.6;
};

const handleBlur = () => {
  isFocused.value = false;
  opacity.value = 0;
};

const handleMouseEnter = () => {
  opacity.value = 0.6;
};

const handleMouseLeave = () => {
  opacity.value = 0;
};
</script>

<style scoped>
/* 对应官方 Tailwind 类 relative rounded-3xl border overflow-hidden p-8 中的结构项；
   圆角、边框、内边距等外观由使用处传入的类（如 .login-box）覆盖 */
.spotlight-card {
  position: relative;
  overflow: hidden;
}

/* 对应官方 overlay：pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 */
.spotlight-overlay {
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.5s ease-in-out;
}
</style>
