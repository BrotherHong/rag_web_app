import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 設定基礎路徑（部署到子路徑時使用）
  // 從 .env 讀取，預設為 /admin（Docker 部署）或 /（開發環境）
  base: `${process.env.VITE_BASE_PATH}/` || '/admin',
  
  plugins: [
    react(),
    tailwindcss(),
  ],
  
  server: {
    host: true, // 允許外部訪問
    port: 5173,
  },
  
  preview: {
    host: true,
    port: 4173,
  },
  
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})
