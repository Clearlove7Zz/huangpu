import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', '.ngrok.io', '.cpolar.io'],
    proxy: {
      // 开发环境：经后端网关（工作区 huangpu-gateway/，node server.mjs，:8090）访问 WeKnora。
      // 网关执行角色调度、凭据持有与输出对账；网关未启动时前端自动降级本地引擎。
      '/api/v1': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok.io', '.cpolar.io'],
  },
})
