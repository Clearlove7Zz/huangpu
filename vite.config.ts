import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', '.ngrok.io', '.cpolar.io'],
    proxy: {
      // 开发环境：WeKnora API 代理（绕开浏览器跨域）
      '/api/v1': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok.io', '.cpolar.io'],
  },
})
