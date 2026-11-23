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
      // main.tsx registers the worker so a new deploy reloads open tabs instead of serving the old shell.
      injectRegister: false,
      includeAssets: ['brand/app-*.png', 'art/*.webp'],
      manifest: {
        name: 'NikTan — तीन मिनट की स्वास्थ्य जाँच',
        short_name: 'NikTan',
        description: 'A 3-minute phone health check that gets you triaged before you reach the OPD.',
        lang: 'hi',
        theme_color: '#FBFAF7',
        background_color: '#FBFAF7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [192, 512].map(size => ({ src: `/brand/app-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })),
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Scan steps must work on a flaky venue network once the app has loaded.
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,mp3,wav}'],
        // The 3D viewer only appears on the health card; fetch it on demand instead of on first visit.
        globIgnores: ['**/AnatomyViewer-*.js', '**/Phone3D-*.js', '**/three3d-*.js', '**/vision_wasm_internal-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/') || /(AnatomyViewer|Phone3D|three3d)-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'anatomy', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/vision_wasm_internal-[^/]+\.(wasm|js)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'face-runtime', expiration: { maxEntries: 4 } },
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
        manualChunks(id) {
          // Group by package. Only the packages named here are pinned to a chunk; their small shared
          // helpers are left to Rollup, so the 3D chunk is never pulled into the first page load.
          // Vite's preload helper and Rollup's CommonJS shims are needed by every page: keep them in the core chunk.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
          const pkg = id.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
          if (!pkg) return undefined;
          if (['react', 'react-dom', 'react-router', 'react-router-dom', '@remix-run/router', 'scheduler'].includes(pkg)) return 'react';
          if (['motion', 'framer-motion', 'motion-dom', 'motion-utils'].includes(pkg)) return 'motion';
          if (pkg === '@mediapipe/tasks-vision') return 'mediapipe';
          // three.js is shared by the health-card anatomy viewer and the landing 3D phone; both load it on demand.
          if (pkg === 'three' || pkg.startsWith('@react-three/') || ['three-stdlib', 'three-mesh-bvh', 'troika-three-text', 'troika-three-utils', 'troika-worker-utils', 'camera-controls', 'maath', 'meshline', 'stats-gl', 'detect-gpu', 'its-fine', 'suspend-react', 'react-use-measure', 'tunnel-rat', 'zustand', '@monogrid/gainmap-js', 'hls.js', 'react-reconciler'].includes(pkg)) return 'three3d';
          return undefined;
        },
      },
    },
  },
});
