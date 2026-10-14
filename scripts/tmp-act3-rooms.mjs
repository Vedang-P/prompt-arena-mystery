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
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}, path, body ?? null);

const waitLoaderGone = async (tag, limitMs = 30000) => {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < limitMs) {
    const s = await page.evaluate(() => ({
      loader: document.querySelector('.scene-loader')?.innerText?.replace(/\n/g, ' | ') ?? null,
      location: document.querySelector('.location-name')?.textContent ?? null,
    }));
    last = s;
    if (!s.loader) break;
    await sleep(500);
  }
  console.log(`${tag}: loader ${last.loader ? `STUCK after ${limitMs}ms: ${last.loader}` : `cleared in ${Date.now() - t0}ms`} | room=${last.location}`);
  return last;
};

const clickThroughStory = async () => {
  for (let i = 0; i < 240; i += 1) {
    const has = await page.$('.story-overlay');
    if (!has) return true;
    await page.evaluate(() => {
      const btn = document.querySelector('.cinematic-tools .btn.brass, .story-buttons .btn.brass');
      if (btn && !btn.disabled) btn.click();
    });
    await sleep(520);
  }
  return !(await page.$('.story-overlay'));
};

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
  await page.waitForSelector('.story-overlay', { timeout: 40000 }).catch(() => console.log('[warn] no story'));
  await page.waitForSelector('.cinematic-tools .btn.brass', { timeout: 40000 }).catch(() => {});
  console.log('story done?', await clickThroughStory());
  await page.waitForSelector('.hud-top', { timeout: 30000 });
  await waitLoaderGone('concert room', 30000);
  await page.screenshot({ path: `${OUT}/flow-1-concert.png` });

  // Solve the act 3 chain so the travel tabs open.
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_veer_1/solve', { answer: 'No, but I have donated some money to them' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_veer_2/solve', { answer: 'Foster scientific temper, empowering the youth' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_band_name/solve', { answer: 'apogee' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_registration/solve', { answer: 'sameer@gotmail.com' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_destination/solve', { answer: 'hutting 3rd cross dj halli' })));
  console.log('solve', JSON.stringify(await call('/api/puzzles/p_fare/solve', { answer: '230' })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hud-top', { timeout: 40000 });
  await clickThroughStory();
  await waitLoaderGone('concert reload', 30000);

  const travel = async (label, tag) => {
    const ok = await page.evaluate((l) => {
      const tab = [...document.querySelectorAll('.room-tabs .tab')].find((t) => t.textContent.trim() === l);
      if (!tab || tab.disabled) return false;
      tab.click();
      return true;
    }, label);
    console.log('click tab', label, ok);
    if (!ok) return false;
    await sleep(400);
    await waitLoaderGone(tag, 30000);
    await page.screenshot({ path: `${OUT}/flow-${tag}.png` });
    return true;
  };

  if (!(await travel('Night Sky Workshop', '2-workshop'))) throw new Error('workshop tab blocked');
  console.log('discover', JSON.stringify(await call('/api/clues/c_workshop/discover')));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hud-top', { timeout: 40000 });
  await clickThroughStory();
  await waitLoaderGone('workshop reload', 30000);

  if (!(await travel('Perigee Headquarters', '3-ngo_hq'))) throw new Error('ngo_hq tab blocked');
  console.log('discover', JSON.stringify(await call('/api/clues/c_hq/discover')));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hud-top', { timeout: 40000 });
  await clickThroughStory();
  await waitLoaderGone('ngo_hq reload', 30000);

  if (!(await travel('The Archive Room', '4-ngo_archive'))) throw new Error('archive tab blocked');
  console.log('all rooms visited');
} finally {
  await browser.close();
}
