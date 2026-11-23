import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/app-*.png', 'art/*.webp'],
      manifest: {
        name: 'NikTan — तीन मिनट की स्वास्थ्य जाँच',
        short_name: 'NikTan',
        description: 'A 3-minute phone health check that gets you triaged before you reach the OPD.',
        lang: 'hi',
        theme_color: '#5B3FD6',
        background_color: '#FBFAF7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [192, 512].map(size => ({ src: `/brand/app-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })),
      },
      workbox: {
        // Scan steps must work on a flaky venue network once the app has loaded.
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,mp3,wav}'],
        // The 3D viewer only appears on the health card; fetch it on demand instead of on first visit.
        globIgnores: ['**/AnatomyViewer-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/') || /AnatomyViewer-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'anatomy', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|storage\.googleapis\.com)\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
});
