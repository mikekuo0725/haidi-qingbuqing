import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt', // a new version waits for the user to press the update bar (src/ui/updateBar.js)
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '海底清不清',
        short_name: '海底清不清',
        description: '潛點海底能見度預測',
        lang: 'zh-Hant',
        start_url: '/',
        display: 'standalone',
        background_color: '#07141f',
        theme_color: '#07141f',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the page files are cached here. Weather is cached by our own code (Task 13),
        // so we never show old weather without the "N 小時前" warning.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
