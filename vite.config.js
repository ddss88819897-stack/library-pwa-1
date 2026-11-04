import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: '스마트 도서관 예약시스템',
        short_name: '스마트도서관',
        description: '빠르고 간편한 대학 도서관 좌석 예약 앱',
        theme_color: '#05070f',
        background_color: '#05070f',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ],
  server: {
    headers: {
      "Content-Security-Policy": "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.gstatic.com blob:; worker-src 'self' blob:;"
    },
    allowedHosts: true
    // 💡 프록시 설정은 vercel dev가 알아서 하므로 삭제했습니다!
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          charts: ['chart.js', 'react-chartjs-2'],
        }
      }
    }
  }
})