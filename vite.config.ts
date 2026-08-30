import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflare Pages: 构建命令 npm run build,输出目录 dist
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
  },
})
