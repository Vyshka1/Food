import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // относительные пути — приложение одинаково работает и локально,
  // и на GitHub Pages в подпапке репозитория
  base: './',
  server: { host: true, port: 5173 },
  test: {
    /*
     * Рабочие копии, которые инструментарий заводит под параллельную работу,
     * содержат полную копию проекта — вместе с тестами. Без этого исключения
     * прогон подхватывал три набора разом и падал на чужой недоделанной правке,
     * а число тестов утраивалось.
     */
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
