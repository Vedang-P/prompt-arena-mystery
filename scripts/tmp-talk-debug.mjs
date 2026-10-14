import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = 'http://127.0.0.1:5174';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#enter', { timeout: 30000 });
await page.waitForFunction(() => document.documentElement.classList.contains('is-entered'), { timeout: 15000 }).catch(() => {});
await page.click('#enter');
await page.waitForSelector('#entry[open]', { timeout: 15000 });
await page.type('#team-code', 'UI-REVIEW');
await page.evaluate(() => document.getElementById('begin-btn').click());
await page.waitForSelector('.hud-top, .cinema, .story-overlay', { timeout: 60000 });
console.log('logged in, url', page.url());

const api = (p, body) => page.evaluate(async (p2, b) => (await fetch(p2, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) })).json(), p, body ?? null);
console.log('dev act', await api('/api/dev/act', { act: 'act2' }));
console.log('dev room', await api('/api/dev/room', { room: 'cyber_cafe' }));

await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.hud-top', { timeout: 60000 });
await sleep(3000);
console.log('room:', await page.evaluate(() => document.querySelector('.release-hud .location-name')?.textContent));

await page.evaluate(() => document.querySelector('.explore-toggle')?.click());
await sleep(800);
console.log('items:', await page.evaluate(() => [...document.querySelectorAll('.explore-item')].map((e) => e.textContent.trim())));

const clicked = await page.evaluate(() => {
  const item = [...document.querySelectorAll('.explore-item')].find((el) => el.querySelector('small')?.textContent === 'Talk' && el.querySelector('strong')?.textContent.includes('Ramu'));
  if (!item) return false;
  item.click();
  return true;
});
console.log('clicked:', clicked);
await sleep(3000);
console.log('app class:', await page.evaluate(() => document.querySelector('.app')?.className));
console.log('talk-hud count:', await page.evaluate(() => document.querySelectorAll('.talk-hud').length));
console.log('body text sample:', await page.evaluate(() => document.body.innerText.slice(0, 300)));
await page.screenshot({ path: 'shots/debug-talk.png' });

// Try clicking via the 3D hotspot path? Print how state exposes things.
console.log('state probe:', await page.evaluate(async () => {
  const res = await fetch('/api/state');
  const s = await res.json();
  return { act: s.act, dev: s.dev, devRoom: s.devRoom, chars: s.characters?.map((c) => c.id), roomHotspots: s.rooms?.find((r) => r.id === 'cyber_cafe')?.hotspots?.map((h) => `${h.type}:${h.label}`) };
}));

await browser.close();
