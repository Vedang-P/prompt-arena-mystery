import http from 'node:http';
import { resolve } from 'node:path';
import { createServer } from 'vite';
process.env.SQLITE_PATH ??= resolve('.game-dev.local');
process.env.ALLOW_CODE_LOGIN ??= 'true';
const { default: handler } = await import('../api/index.js');
// Single-origin local development uses the exact Vercel API entry point.
const vite = await createServer({ server: { middlewareMode: true, proxy: {} } });
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handler(req, res);
  vite.middlewares(req, res);
});
server.listen(5173, '127.0.0.1', () => console.log('Game running at http://127.0.0.1:5173'));
