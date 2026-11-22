/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/; set BASE_PATH there. Local and other hosts use /.
const base = process.env.BASE_PATH ?? '/';

/**
 * Content-Security-Policy for the built app (GitHub Pages cannot send headers, so it is a meta tag).
 * Only in builds: the dev server injects an inline React refresh script that 'self' would block.
 * Connectors add their declared hosts to connect-src when they arrive.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'weekbeat-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  base,
  plugins: [
    cspMeta(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Weekbeat – Wochenplaner für Bewegung',
        short_name: 'Weekbeat',
        description: 'Deine Woche für Bewegung und Wohlbefinden – realistisch geplant.',
        lang: 'de',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0f766e',
        background_color: '#f7f7f5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    include: ['{core,connectors,knowledge,app}/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['core/**/*.ts', 'connectors/**/*.ts', 'knowledge/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      // The planner and game must stay well tested; raise these as v0.1 grows.
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
