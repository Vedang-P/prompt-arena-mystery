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

const snapshot = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.pathname + location.search,
    loader: document.querySelector('.scene-loader')?.innerText?.replace(/\n/g, ' | ') ?? null,
    hud: Boolean(document.querySelector('.hud-top')),
    location: document.querySelector('.location-name')?.textContent ?? null,
    story: Boolean(document.querySelector('.story-overlay')),
    tabs: [...document.querySelectorAll('.room-tabs .tab')].map((t) => `${t.textContent}${t.disabled ? ' (disabled)' : ''}`),
  }));
  console.log(tag, JSON.stringify(s));
  return s;
};

try {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinema, .story-overlay, .hud-top, .login-card', { timeout: 40000 }).catch(() => {});
  // Guest + practice act3 through the API in-page (cookies land in the browser).
  const prep = await page.evaluate(async () => {
    const g = await fetch('/api/guest', { method: 'POST' });
    const p = await fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act3' }) });
    localStorage.setItem('moon-mode', 'practice');
    return { guest: g.status, practice: p.status };
  });
  console.log('prep', JSON.stringify(prep));
  await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Click through the act 3 intro story if it appears.
  for (let i = 0; i < 60; i += 1) {
    const hasStory = await page.$('.story-overlay');
    if (!hasStory) break;
    const btn = await page.$('.story-buttons .btn.brass, .cinematic-tools .btn.brass');
    if (btn) await btn.click().catch(() => {});
    else await page.evaluate(() => document.querySelector('.story-overlay')?.click());
    await sleep(150);
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 }).catch(() => console.log('[warn] no hud'));
  await sleep(4000);
  await snapshot('concert');
  await page.screenshot({ path: `${OUT}/act3-concert.png` });

  // Walk the room tabs: workshop -> ngo_hq -> ngo_archive. Tabs may be
  // disabled; report and stop when blocked.
  for (const room of ['Night Sky Workshop', 'Perigee Headquarters', 'The Archive Room']) {
    const ok = await page.evaluate((label) => {
      const tab = [...document.querySelectorAll('.room-tabs .tab')].find((t) => t.textContent.trim() === label);
      if (!tab || tab.disabled) return false;
      tab.click();
      return true;
    }, room);
    console.log('travel', room, ok);
    if (!ok) break;
    await sleep(500);
    await snapshot(`${room} (early)`);
    await sleep(6000);
    await snapshot(`${room} (settled)`);
    await page.screenshot({ path: `${OUT}/act3-${room.replace(/\s+/g, '-').toLowerCase()}.png` });
  }
} finally {
  await browser.close();
}
