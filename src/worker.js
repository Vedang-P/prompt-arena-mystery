import { Hono } from 'hono';

const app = new Hono();

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'prompt-arena-mystery', time: new Date().toISOString() })
);

export default app;
