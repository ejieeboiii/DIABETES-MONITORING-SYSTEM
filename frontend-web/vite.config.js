import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, '.', 'BREATHDX_')
  const backendTarget = config.BREATHDX_BACKEND_URL || 'http://127.0.0.1:8001'
  return {
  plugins: [react()],
  server: {
    proxy: {
      '/auth': { target: backendTarget, changeOrigin: true },
      '/patients': { target: backendTarget, changeOrigin: true },
      '/readings': { target: backendTarget, changeOrigin: true, ws: true },
      '/health': { target: backendTarget, changeOrigin: true },
    },
  },
  }
})
