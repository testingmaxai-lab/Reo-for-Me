import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // relative paths: works at a domain root or under /<repo>/ on GitHub Pages
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Reo — te reo Māori practice',
        short_name: 'Reo',
        description: 'Personal te reo Māori learning: brief teaching, rigorous testing, spaced review.',
        lang: 'en-NZ',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f5f1',
        theme_color: '#1f5f4a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
