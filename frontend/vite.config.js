import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    build: {
      rolldownOptions: {
        output: {
          // React and the router change rarely: a separate chunk stays cached across app deploys.
          codeSplitting: {
            groups: [{ name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ }],
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      // Same-origin API in dev so the httpOnly refresh cookie just works.
      proxy: { '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true } },
    },
  }
})
