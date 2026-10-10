// Vercel Node.js function entry — bridges the Node request/response pair to the
// same Hono app the Cloudflare Worker runs (src/worker.js), with a node:sqlite
// backed DB from lib/vercel-env.js.

import app from '../src/worker.js';
import { getEnv } from '../lib/vercel-env.js';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req, res) {
  try {
    const env = await getEnv();
    const host = req.headers.host ?? 'localhost';
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
    const proto = forwardedProto || (req.socket && req.socket.encrypted ? 'https' : 'http');
    const url = new URL(req.url, `${proto}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) for (const v of value) headers.append(key, v);
      else headers.set(key, value);
    }

    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
    const request = new Request(url, { method, headers, body });

    const response = await app.fetch(request, env, {
      waitUntil() {},
      passThroughOnException() {},
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      res.setHeader(key, value);
    });
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('set-cookie', cookies);

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error('vercel_handler_error', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
