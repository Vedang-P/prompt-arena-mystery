import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'C:/Users/vedang/AppData/Local/Temp/opencode';
const TAG = process.env.TAG ?? 'before';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
let executablePath = null;
for (const p of candidates) { try { await fs.access(p); executablePath = p; break; } catch {} }
if (!executablePath) throw new Error('no browser');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

try {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinema, .story-overlay, .hud-top, .login-card', { timeout: 40000 }).catch(() => {});
  const prep = await page.evaluate(async () => {
    const g = await fetch('/api/guest', { method: 'POST' });
    const p = await fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act2' }) });
    localStorage.setItem('moon-mode', 'practice');
    return { guest: g.status, practice: p.status };
  });
  console.log('prep', JSON.stringify(prep));
  await page.goto(`${BASE}/play/?resume=1&room=cyber_cafe`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i += 1) {
    const hasStory = await page.$('.story-overlay');
    if (!hasStory) break;
    const btn = await page.$('.cinematic-tools .btn.brass, .story-buttons .btn.brass');
    if (btn) await btn.click().catch(() => {});
    else await page.evaluate(() => document.querySelector('.story-overlay')?.click());
    await sleep(250);
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 }).catch(() => console.log('[warn] no hud'));
  await sleep(5000);
  const state = await page.evaluate(() => ({
    hud: Boolean(document.querySelector('.hud-top')),
    location: document.querySelector('.location-name')?.textContent ?? null,
    story: Boolean(document.querySelector('.story-overlay')),
    markers: [...document.querySelectorAll('.hotspot, .object-anchor')].map((b) => b.textContent).slice(0, 20),
  }));
  console.log('state', JSON.stringify(state));
  await page.screenshot({ path: `${OUT}/cafe-${TAG}.png` });
  console.log('shot', `${OUT}/cafe-${TAG}.png`);
} finally {
  await browser.close();
}
