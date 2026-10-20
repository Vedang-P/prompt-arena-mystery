import http from 'node:http';
import { resolve } from 'node:path';
import { createServer } from 'vite';
process.env.SQLITE_PATH ??= resolve('.game-dev.local');
// Local dev sandbox: sign in from the login screen's developer link with this code.
process.env.DEV_TEAM_CODE ??= 'DEV-ARENA';
const { default: handler } = await import('../api/index.js');
const {caseData}=await import('../src/case.js');
// Single-origin local development uses the exact Vercel API entry point.
const vite = await createServer({ server: { middlewareMode: true, proxy: {} } });
const server = http.createServer((req, res) => {
  if(req.url==='/api/dev/scene-review'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({rooms:caseData.rooms,acts:caseData.acts.map(({id,title,kicker,entry_room,beats,intro,outro})=>({id,title,kicker,entry_room,beats,intro,outro})),characters:caseData.characters.map(({id,name})=>({id,name}))}));return;
  }
  if (req.url.startsWith('/api/')) return handler(req, res);
  vite.middlewares(req, res);
});
const port=Number(process.env.PORT||5173);
server.listen(port, '127.0.0.1', () => {
  console.log(`Game running at http://127.0.0.1:${port}`);
  console.log(`Control room at http://127.0.0.1:${port}/admin/ (${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'arena-admin'})`);
});
