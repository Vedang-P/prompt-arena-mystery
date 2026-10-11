// Vercel Node.js function entry — bridges the Node request/response pair to the
// Hono app in src/worker.js, with a Postgres (or node:sqlite fallback) DB from
// lib/vercel-env.js. The same entry point powers local development.

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
    // A player who closes the tab mid-SSE aborts the Request, which lets the
    // worker notice the dropped client and still persist the finished reply.
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const request = new Request(url, { method, headers, body, signal: abort.signal });

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
    // Never append an error payload to an already-streaming response body.
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
