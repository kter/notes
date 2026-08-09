
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    // vi.stubEnv() の値をテストごとに自動で戻す。
    // 以前は process.env.NODE_ENV を直接代入しており、値がテスト間に漏れていた。
    unstubEnvs: true,
    globals: true,
    setupFiles: './vitest.setup.ts',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    exclude: ['tests/**', 'node_modules/**', '../.claude/**'],
  },
})
