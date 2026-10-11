import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // two entry points: the title screen at /, the game itself at /play/
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'client/index.html'),
        play: resolve(import.meta.dirname, 'client/play/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
