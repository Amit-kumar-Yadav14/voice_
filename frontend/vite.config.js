import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'VoiceComm Tactical',
        short_name: 'VoiceComm',
        description: 'Low-Bandwidth P2P Voice Comms',
        theme_color: '#1a1a1a', // Tumhari app ka dark theme color
        background_color: '#1a1a1a',
        display: 'standalone', // Yeh URL bar hatayega aur full screen app banayega
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})