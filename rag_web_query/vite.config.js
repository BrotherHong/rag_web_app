import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 設定基礎路徑（部署到子路徑時使用）
  // 從 .env 讀取，預設為 /query（Docker 部署）或 /（開發環境）
  base: `${process.env.VITE_BASE_PATH}/` || '/query',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5174,
    strictPort: true, // 如果 port 被占用就報錯,不要自動遞增
    proxy: {
      // API 代理到後端
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  }
})
