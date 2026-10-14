// Visual review of the interview HUD across every talkable character.
// Usage: node ui-review.mjs [outDir]
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5174';
const OUT = process.argv[2] ?? 'C:/Users/vedang/AppData/Local/Temp/opencode/ui-shots';
const CODE = 'UI-REVIEW';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const SCENES = [
  { act: 'act2', room: 'cyber_cafe', label: 'Ramu', ask: 'What did Parth usually order?' },
  { act: 'act2', room: 'parth_home', label: "Parth's Mother", ask: 'Did you call Parth that evening?' },
  { act: 'act3', room: 'concert', label: 'Veer', ask: 'What is your band called?' },
  { act: 'act6', room: 'police_station', label: 'Officer Rao', ask: 'Where did he get it?' },
  { act: 'act7', room: 'sameer_room', label: 'Veer', ask: 'Why did you come to my door?' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

const api = (p, body) => page.evaluate(async (p2, b) => {
  const res = await fetch(p2, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  return res.json();
}, p, body ?? null);

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#enter', { timeout: 30000 });
await page.waitForFunction(() => document.documentElement.classList.contains('is-entered'), { timeout: 15000 }).catch(() => {});
await page.click('#enter');
await page.waitForSelector('#entry[open]', { timeout: 15000 });
await page.type('#team-code', CODE);
await page.evaluate(() => document.getElementById('begin-btn').click());
await page.waitForSelector('.hud-top, .cinema, .story-overlay', { timeout: 60000 });

const report = {};

for (const scene of SCENES) {
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.hud-top, .cinema, .story-overlay', { timeout: 60000 }).catch(() => null);
  const a = await api('/api/dev/act', { act: scene.act });
  const r = await api('/api/dev/room', { room: scene.room });
  if (a.error || r.error) { console.log('dev jump failed', scene, a, r); continue; }
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.hud-top', { timeout: 60000 });
  await sleep(2500);

  const opened = await page.evaluate((label) => {
    document.querySelector('.explore-toggle')?.click();
    return new Promise((resolve) => setTimeout(() => {
      const item = [...document.querySelectorAll('.explore-item')].find((el) => el.querySelector('small')?.textContent === 'Talk' && el.querySelector('strong')?.textContent.includes(label));
      if (item) { item.click(); resolve(true); } else {
        resolve([...document.querySelectorAll('.explore-item')].map((el) => el.textContent.trim()).join(' || '));
      }
    }, 600));
  }, scene.label);
  if (opened !== true) { console.log(`could not open ${scene.label}:`, opened); continue; }

  await page.waitForSelector('.talk-hud', { timeout: 15000 });
  await sleep(400);
  await page.type('.talk-ask input', scene.ask);
  await page.screenshot({ path: path.join(OUT, 'typed-' + scene.act + '-' + scene.room + '.png') });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.talk-line.npc .talk-text').length > 0, { timeout: 45000 }).catch(() => console.log(`[warn] no npc reply for ${scene.label}`));
  await sleep(500);

  const diag = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        color: cs.color, background: cs.backgroundColor, border: cs.border,
        outline: cs.outline, height: r.height, width: r.width, top: r.top, left: r.left, bottom: r.bottom,
        padding: cs.padding, boxShadow: cs.boxShadow,
      };
    };
    const input = document.querySelector('.talk-ask input');
    const ir = input?.getBoundingClientRect();
    const asks = document.querySelector('.talk-ask')?.getBoundingClientRect();
    return {
      fontsLoaded: {
        garamond: document.fonts.check('16px "EB Garamond"'),
        cinzel: document.fonts.check('16px Cinzel'),
        playfair: document.fonts.check('16px "Playfair Display"'),
        inter: document.fonts.check('16px Inter'),
      },
      location: pick('.talk-location h2'),
      speaker: pick('.talk-speaker'),
      text: pick('.talk-line.npc .talk-text:last-child') ?? pick('.talk-text'),
      ask: pick('.talk-ask'),
      input: pick('.talk-ask input'),
      button: pick('.talk-ask button'),
      inputVsAsk: input && asks ? { inputH: ir.height, askH: asks.height, inputTopOffset: ir.top - asks.top, inputW: ir.width, askW: asks.width, buttonW: asks.width - ir.width } : null,
      activeElement: document.activeElement?.className ?? document.activeElement?.tagName,
    };
  });
  report[`${scene.act}-${scene.room}-${scene.label}`] = diag;
  await page.screenshot({ path: path.join(OUT, `talk-${scene.act}-${scene.room}-${scene.label.replace(/[^a-z]/gi, '')}.png`) });
  console.log('shot', scene.label, '->', JSON.stringify(diag.inputVsAsk));
}

// Mobile viewport pass on Ramu.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.hud-top', { timeout: 60000 }).catch(() => null);
await sleep(1500);
await page.evaluate(() => document.querySelector('.explore-toggle')?.click());
await sleep(600);
const mob = await page.evaluate(() => {
  const item = [...document.querySelectorAll('.explore-item')].find((el) => el.querySelector('small')?.textContent === 'Talk' && el.querySelector('strong')?.textContent.includes('Ramu'));
  if (item) { item.click(); return true; }
  return false;
});
if (mob) {
  await page.waitForSelector('.talk-hud', { timeout: 15000 });
  await sleep(400);
  const diag = await page.evaluate(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { fontSize: cs.fontSize, height: r.height, width: r.width, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    return { ask: pick('.talk-ask'), input: pick('.talk-ask input'), name: pick('.talk-name h3'), log: pick('.talk-log') };
  });
  report['mobile-ramu'] = diag;
  await page.screenshot({ path: path.join(OUT, 'talk-mobile-ramu.png') });
  console.log('mobile ramu ->', JSON.stringify(diag));
}

await fs.writeFile(path.join(OUT, 'diagnostics.json'), JSON.stringify(report, null, 2));
console.log('diagnostics saved to', path.join(OUT, 'diagnostics.json'));
await browser.close();
