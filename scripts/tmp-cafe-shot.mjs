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
    const v = await fetch('/api/puzzles/p_voicenote2/solve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'park' }) });
    const c = await fetch('/api/clues/c_cd/discover', { method: 'POST' });
    localStorage.setItem('moon-mode', 'practice');
    return { guest: g.status, practice: p.status, voicenote: v.status, cd: c.status };
  });
  console.log('prep', JSON.stringify(prep));
  await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  for (let i = 0; i < 80; i += 1) {
    const info = await page.evaluate(() => {
      const overlay = document.querySelector('.story-overlay');
      if (!overlay) return null;
      const btn = [...overlay.querySelectorAll('.btn')].find((b) => /skip/i.test(b.textContent));
      const detail = { index: overlay.querySelector('.cinematic-tools span, .cinema-progress')?.textContent?.trim() ?? null, disabled: btn?.disabled ?? null, clicked: false };
      if (btn && !btn.disabled) { btn.click(); detail.clicked = true; }
      return detail;
    });
    console.log('loop', i, JSON.stringify(info));
    if (!info) break;
    await sleep(500);
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 }).catch(() => console.log('[warn] no hud'));
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.room-tabs .tab')].map((t) => t.textContent.trim()));
  console.log('tabs', JSON.stringify(tabs));
  const opened = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.room-tabs .tab')].find((t) => /cyber/i.test(t.textContent));
    if (!tab || tab.disabled) return false;
    tab.click();
    return true;
  });
  console.log('opened cafe tab', opened);
  await page.waitForFunction(() => /cyber/i.test(document.querySelector('.location-name')?.textContent ?? ''), { timeout: 30000 }).catch(() => console.log('[warn] not in the cyber cafe'));
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
