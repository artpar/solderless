import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/solderless/',
  plugins: [react()],
  resolve: {
    alias: {
      // The TS compiler checks for `process` and Node APIs.
      // These polyfills stub them out for browser usage.
    },
  },
  define: {
    // The typescript package checks for process.env / process.browser
    'process.env': '{}',
    'process.browser': 'true',
  },
  optimizeDeps: {
    include: ['typescript'],
  },
})
