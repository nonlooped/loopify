import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxyTarget = process.env.VITE_DEV_PROXY_TARGET ?? 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  // Keep Vite cache out of node_modules to avoid permission issues
  // when node_modules artifacts are created by Docker/root processes.
  cacheDir: '.cache/vite',
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth': { target: proxyTarget, changeOrigin: true },
      '/api': { target: proxyTarget, changeOrigin: true },
    },
  },
})
