import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'C:/Users/vedang/AppData/Local/Temp/opencode';
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
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });

try {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinema, .story-overlay, .hud-top, .login-card', { timeout: 40000 }).catch(() => {});
  const prep = await page.evaluate(async () => {
    const g = await fetch('/api/guest', { method: 'POST' });
    const p = await fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act3' }) });
    localStorage.setItem('moon-mode', 'practice');
    return { guest: g.status, practice: p.status };
  });
  console.log('prep', JSON.stringify(prep));
  const t0 = Date.now();
  await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.story-overlay', { timeout: 40000 }).catch(() => console.log('[warn] no story overlay'));
  const storyAt = Date.now();
  console.log('story appeared after', storyAt - t0, 'ms');
  for (let i = 0; i < 40; i += 1) {
    const s = await page.evaluate(() => ({
      loader: document.querySelector('.scene-loader')?.innerText?.replace(/\n/g, ' | ') ?? null,
      readyAttr: document.querySelector('.story-overlay')?.dataset?.sceneReady ?? document.querySelector('[data-scene-ready]')?.dataset?.sceneReady ?? null,
      index: document.querySelector('.cinematic-tools > span')?.textContent ?? null,
      story: Boolean(document.querySelector('.story-overlay')),
      hud: Boolean(document.querySelector('.hud-top')),
      canvases: document.querySelectorAll('canvas').length,
    }));
    console.log(`t+${((Date.now() - storyAt) / 1000).toFixed(0)}s`, JSON.stringify(s));
    if (i === 3) await page.screenshot({ path: `${OUT}/act3-intro-4s.png` });
    if (i === 18) await page.screenshot({ path: `${OUT}/act3-intro-19s.png` });
    await sleep(1000);
  }
  await page.screenshot({ path: `${OUT}/act3-intro-40s.png` });
} finally {
  await browser.close();
}
