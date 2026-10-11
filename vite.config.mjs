import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const shortHash = (() => {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
})();
const pkgVersion = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '';
  }
})();
const buildId = `${pkgVersion ? 'v' + pkgVersion + ' · ' : ''}${shortHash} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildId) },
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
