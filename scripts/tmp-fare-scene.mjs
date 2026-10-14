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

const call = (path, body) => page.evaluate(async (p, b) => {
  const res = await fetch(p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-game-mode': 'practice' },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: res.status, body: (await res.text()).slice(0, 120) };
}, path, body ?? null);

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
  await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.hud-top, .story-overlay', { timeout: 40000 });
  // Click through the act 3 intro.
  for (let i = 0; i < 240; i += 1) {
    if (!(await page.$('.story-overlay'))) break;
    await page.evaluate(() => {
      const btn = document.querySelector('.cinematic-tools .btn.brass, .story-buttons .btn.brass');
      if (btn && !btn.disabled) btn.click();
    });
    await sleep(520);
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 });
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_veer_1/solve', { answer: 'No, but I have donated some money to them' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_veer_2/solve', { answer: 'Foster scientific temper, empowering the youth' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_band_name/solve', { answer: 'apogee' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_registration/solve', { answer: 'sameer@gotmail.com' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_destination/solve', { answer: 'hutting 3rd cross dj halli' })));

  // Open the p_fare scene via the dev param.
  await page.goto(`${BASE}/play/?puzzle=p_fare`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const opened = await page.waitForSelector('.story-overlay.cinematic-story', { timeout: 30000 }).then(() => true).catch(() => false);
  console.log('scene overlay opened:', opened);
  if (!opened) {
    console.log('body:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
    await page.screenshot({ path: `${OUT}/fare-debug.png` });
  } else {
    for (let i = 0; i < 30; i += 1) {
      const s = await page.evaluate(() => ({
        loader: document.querySelector('.scene-loader')?.innerText?.replace(/\n/g, ' | ') ?? null,
        ready: document.querySelector('.story-overlay')?.dataset?.sceneReady ?? null,
        idx: document.querySelector('.cinematic-tools > span')?.textContent ?? null,
        tools: [...document.querySelectorAll('.cinematic-tools button')].map((b) => `${b.textContent}${b.disabled ? '(disabled)' : ''}`),
      }));
      console.log(`t+${i}s`, JSON.stringify(s));
      if (i === 5) await page.screenshot({ path: `${OUT}/fare-5s.png` });
      await sleep(1000);
    }
    await page.screenshot({ path: `${OUT}/fare-30s.png` });
    // Click through the scene to the end and see if it closes.
    for (let i = 0; i < 30; i += 1) {
      if (!(await page.$('.story-overlay'))) break;
      await page.evaluate(() => {
        const btn = document.querySelector('.cinematic-tools .btn.brass');
        if (btn && !btn.disabled) btn.click();
      });
      await sleep(600);
    }
    const closed = !(await page.$('.story-overlay'));
    console.log('scene overlay closed after clicking:', closed);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/fare-after.png` });
  }
} finally {
  await browser.close();
}
