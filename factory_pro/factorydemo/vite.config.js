import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 端口被其他项目占用时直接报错退出，不是静默换到 5174
    strictPort: true
  }
})
