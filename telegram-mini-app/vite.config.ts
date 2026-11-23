import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cacheVersion = process.env.MINI_APP_VERSION ?? 'local';

export default defineConfig({
  base: process.env.MINI_APP_BASE ?? '/',
  plugins: [
    react(),
    {
      name: 'lifecare-release-cache-version',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => html.replace(/(assets\/(?:app\.js|index\.css))(?=["'])/g, `$1?v=${encodeURIComponent(cacheVersion)}`),
      },
    },
  ],
  // Telegram's webview can keep index.html in its cache longer than a Pages
  // deployment. Stable filenames mean a cached shell never points to a
  // non-existent hashed bundle after the next release.
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
