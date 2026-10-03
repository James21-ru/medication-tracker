import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.MINI_APP_BASE ?? '/',
  plugins: [react()],
});
