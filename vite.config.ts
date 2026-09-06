import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // относительные пути — приложение одинаково работает и локально,
  // и на GitHub Pages в подпапке репозитория
  base: './',
  server: { host: true, port: 5173 },
})
