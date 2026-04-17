// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lex-atc/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@dnd-kit/')) return 'dnd'
          if (id.includes('react-draggable') || id.includes('react-resizable')) return 'interaction'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('node_modules/@react-three/')) return 'three-react'
          if (id.includes('node_modules/three-stdlib/')) return 'three-stdlib'
          if (id.includes('node_modules/lucide-react/')) return 'lucide'
          if (id.includes('node_modules/react-router/')) return 'router'
          if (id.includes('node_modules/react-router-dom/')) return 'router'
          if (id.includes('node_modules/@remix-run/')) return 'router'
          if (id.includes('node_modules/framer-motion/')) return 'motion'
          if (id.includes('node_modules/react-joyride/')) return 'joyride'
          if (id.includes('node_modules/react-i18next/')) return 'i18n'
          if (id.includes('node_modules/i18next/')) return 'i18n'
          if (id.includes('node_modules/react-draggable/')) return 'interaction'
          if (id.includes('node_modules/react-resizable/')) return 'interaction'
          if (id.includes('node_modules/@floating-ui/')) return 'radix-ui'
          if (id.includes('node_modules/zustand/')) return 'zustand'
          if (id.includes('node_modules/@mui/')) return 'mui'
          if (id.includes('node_modules/lodash/')) return 'lodash'
          if (id.includes('node_modules/clsx/')) return 'clsx'
          if (id.includes('node_modules/radix-ui/')) return 'radix-ui'
          if (id.includes('node_modules/tailwind-merge/')) return 'tailwind-merge'
          if (id.includes('node_modules/@radix-ui/')) return 'radix-ui'
          if (id.includes('node_modules/date-fns/')) return 'date-fns'
          if (id.includes('node_modules/recharts/')) return 'recharts'
          if (id.includes('node_modules/axios/')) return 'axios'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('react-joyride')) return 'joyride'
          if (id.includes('react-i18next') || id.includes('i18next')) return 'i18n'
          if (id.includes('react-router')) return 'router'
          return 'vendor'
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [
        path.resolve(__dirname, './'),
        path.resolve(__dirname, '../shared')
      ]
    },
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    host: '127.0.0.1'
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://127.0.0.1'
      }
    },
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/tests/e2e/**']
  }
})
