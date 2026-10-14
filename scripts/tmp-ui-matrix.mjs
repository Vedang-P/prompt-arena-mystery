import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = 'http://127.0.0.1:5174';
const OUT = 'C:/Users/vedang/AppData/Local/Temp/opencode/ui-shots';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--window-size=1920,1080', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.setViewport({ width: 1600, height: 900 });
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#enter', { timeout: 30000 });
await page.waitForFunction(() => document.documentElement.classList.contains('is-entered'), { timeout: 15000 }).catch(() => {});
await page.click('#enter');
await page.waitForSelector('#entry[open]', { timeout: 15000 });
await page.type('#team-code', 'UI-REVIEW');
await page.evaluate(() => document.getElementById('begin-btn').click());
await page.waitForSelector('.hud-top, .cinema, .story-overlay', { timeout: 60000 });

const api = (p, b) => page.evaluate(async (p2, x) => (await fetch(p2, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(x ?? {}) })).json(), p, b ?? null);
await api('/api/dev/act', { act: 'act2' });
await api('/api/dev/room', { room: 'cyber_cafe' });

const openRamu = async () => {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.hud-top', { timeout: 60000 });
  await sleep(2200);
  await page.evaluate(() => document.querySelector('.explore-toggle')?.click());
  await sleep(600);
  const ok = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.explore-item')].find((el) => el.querySelector('small')?.textContent === 'Talk' && el.querySelector('strong')?.textContent.includes('Ramu'));
    if (!item) return false;
    item.click();
    return true;
  });
  if (!ok) throw new Error('ramu talk item missing');
  await page.waitForSelector('.talk-hud', { timeout: 15000 });
  await sleep(300);
};

for (const [w, h, name] of [[1280, 720, '1280x720'], [1920, 1080, '1920x1080']]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await openRamu();
  await page.type('.talk-ask input', 'Have you seen Parth lately?');
  const d = await page.evaluate(() => {
    const r = document.querySelector('.talk-ask')?.getBoundingClientRect();
    const n = document.querySelector('.talk-name h3')?.getBoundingClientRect();
    const l = document.querySelector('.talk-log')?.getBoundingClientRect();
    return { ask: r && { w: r.width, h: r.height, left: r.left, bottom: r.bottom }, name: n && { left: n.left, bottom: n.bottom, w: n.width }, log: l && { left: l.left, top: l.top, bottom: l.bottom, right: l.right } };
  });
  console.log(name, JSON.stringify(d));
  await page.screenshot({ path: path.join(OUT, `matrix-${name}.png`) });
}

// Mobile
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.hud-top', { timeout: 60000 }).catch(() => null);
await sleep(2000);
const m = await page.evaluate(() => {
  const openExplore = document.querySelector('.explore-toggle');
  openExplore?.click();
  return new Promise((res) => setTimeout(() => {
    const item = [...document.querySelectorAll('.explore-item')].find((el) => el.querySelector('small')?.textContent === 'Talk' && el.querySelector('strong')?.textContent.includes('Ramu'));
    if (item) { item.click(); res(true); } else res([...document.querySelectorAll('.explore-item')].map((e) => e.textContent.trim()));
  }, 600));
});
if (m === true) {
  await page.waitForSelector('.talk-hud', { timeout: 15000 });
  await page.type('.talk-ask input', 'Have you seen Parth lately?');
  const dm = await page.evaluate(() => {
    const r = document.querySelector('.talk-ask')?.getBoundingClientRect();
    const n = document.querySelector('.talk-name h3')?.getBoundingClientRect();
    const l = document.querySelector('.talk-log')?.getBoundingClientRect();
    const loc = document.querySelector('.talk-location h2')?.getBoundingClientRect();
    return { ask: r && { w: r.width, h: r.height, left: r.left, right: r.right, bottom: r.bottom }, name: n && { top: n.top, left: n.left, h: n.height }, log: l && { top: l.top, bottom: l.bottom }, loc: loc && { top: loc.top, h: loc.height } };
  });
  console.log('mobile', JSON.stringify(dm));
  await page.screenshot({ path: path.join(OUT, 'matrix-mobile.png') });
} else {
  console.log('mobile items:', m);
}

await browser.close();
