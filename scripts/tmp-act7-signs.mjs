import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5178';
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

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

try {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinema, .story-overlay, .hud-top, .login-card', { timeout: 40000 }).catch(() => {});

  const chain = await page.evaluate(async () => {
    const call = (p, b, mode) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', ...(mode ? { 'x-game-mode': mode } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
    const out = [];
    out.push(['guest', (await call('/api/guest')).s]);
    const practice = await call('/api/practice', { act: 'act7' });
    out.push(['practice', practice.s, practice.j?.act ?? practice.j?.error]);
    localStorage.setItem('moon-mode', 'practice');
    const add = async (id, p, b) => { const r = await call(p, b, 'practice'); out.push([id, r.s, r.j?.correct ?? r.j?.alreadyFound ?? r.j?.ok ?? r.j?.error ?? null]); };
    await add('p_mask_owner', '/api/puzzles/p_mask_owner/solve', { answer: 'leader' });
    await add('p_veer_mask', '/api/puzzles/p_veer_mask/solve', { answer: 'mask' });
    await add('p_continue', '/api/puzzles/p_continue/solve', { answer: 'Continue' });
    return out;
  });
  console.log('chain', JSON.stringify(chain));

  await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.hud-top, .story-overlay', { timeout: 40000 }).catch(() => {});
  await sleep(2000);
  for (let i = 0; i < 80; i += 1) {
    if (!(await page.$('.story-overlay'))) break;
    const b = await page.$('.story-buttons .btn.brass, .cinematic-tools .btn.brass');
    if (b) await b.click().catch(() => {});
    else await page.evaluate(() => document.querySelector('.story-overlay')?.click());
    await sleep(180);
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 }).catch(() => {});
  await sleep(2500);

  const hospitalTab = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.room-tabs .tab')].find((x) => x.textContent.includes('Shashdhar Hospital'));
    if (!t || t.disabled) return false;
    t.click();
    return true;
  });
  console.log('hospital tab', hospitalTab);
  await sleep(5000);

  await page.screenshot({ path: `${OUT}/act7-loadingbay-full.png` });
  await page.screenshot({ path: `${OUT}/act7-loadingbay-signs.png`, clip: { x: 700, y: 220, width: 520, height: 260 } });
  console.log('shots taken');
} finally {
  await browser.close();
}
