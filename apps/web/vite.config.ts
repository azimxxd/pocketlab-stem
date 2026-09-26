import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  root: 'apps/web',
  plugins: [
    react(),
    // Service worker is production-only; dev and browser tests run without it.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'PocketLab STEM — карманная лаборатория',
        short_name: 'PocketLab',
        description:
          'Исследуй звук и движение с помощью телефона. Гипотезы, реальные измерения и дневник исследований.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f8f7',
        theme_color: '#102e2c',
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: '../../dist', emptyOutDir: true },
});
