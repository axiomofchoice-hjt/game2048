import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/game2048/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
