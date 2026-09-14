import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      '/patients': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      '/readings': { target: 'http://127.0.0.1:8001', changeOrigin: true, ws: true },
      '/health': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
})
