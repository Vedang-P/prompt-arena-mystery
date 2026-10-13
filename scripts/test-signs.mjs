// Sign regression checks. Every generated board image must:
//   1. be referenced by a board that actually exists in the scenes,
//   2. share its plane's aspect ratio (otherwise the runtime crops the art),
//   3. have been visually reviewed — its SHA-256 is in scripts/sign-art.lock.json.
//
// A generator once shipped boards with the lettering cropped, so an unreviewed
// or changed image must fail here instead of reaching a room. To approve new
// art: run `node scripts/test-signs.mjs --update`, review
// shots/signs-review.png, and commit both the art and the lock file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SIGN_FILES } from '../client/src/signFiles.js';

const ROOT = resolve('.');
const PUBLIC = resolve('client/public');
const LOCK_PATH = resolve('scripts/sign-art.lock.json');
const UPDATE = process.argv.includes('--update');

// Standalone sign pictures drawn through <Picture> rather than a board key.
const PICTURE_SIGNS = [
  { src: '/assets/signs/police.jpg', planeAspect: 3.7 / 1.2 },
  { src: '/assets/signs/noticeboard.jpg', planeAspect: 1.65 / 1.2 },
  { src: '/assets/signs/duty.jpg', planeAspect: 1.65 / 0.9 },
  { src: '/assets/signs/perigee_emblem.jpg', planeAspect: 1.9 / 1.425 },
];

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function imageInfo(file) {
  const buf = readFileSync(file);
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  throw new Error(`unreadable image: ${file}`);
}

// Walk the scenes and collect every board key with the aspect ratio of the
// plane it is drawn on. WallSign tags are single-line JSX by convention.
function boardSites() {
  const dir = resolve(ROOT, 'client/src');
  const sites = new Map(); // key -> [{ file, aspect }]
  const add = (key, file, aspect) => {
    if (!sites.has(key)) sites.set(key, []);
    sites.get(key).push({ file, aspect });
  };
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.jsx'))) {
    const src = readFileSync(resolve(dir, name), 'utf8');
    for (const m of src.matchAll(/<WallSign\b[^>]*\/>/g)) {
      const tag = m[0];
      const attr = (n) => {
        const r = tag.match(new RegExp(n + '=("([^"]*)"|\\{([^}]*)\\})'));
        return r ? (r[2] !== undefined ? r[2] : r[3]) : null;
      };
      const title = attr('title');
      const lines = attr('lines') ?? '';
      const aspect = Number(attr('width') ?? 1.4) / Number(attr('height') ?? 0.5);
      if (title?.startsWith('`') && title.includes('number')) {
        for (const n of [1, 2, 3]) add(`RAMU / 0${n}|INTERNET • PRINT • SCAN`, name, aspect);
        continue;
      }
      if (title?.startsWith('`') && title.includes('i+1')) {
        for (const n of [1, 2, 3, 4, 5]) add(`RECORDS / 0${n}|`, name, aspect);
        continue;
      }
      if (/^\{?yardName\}?$/.test(title ?? '')) {
        add('APOGEE / SERVICE YARD|STAFF & VEHICLES ONLY', name, aspect);
        add('PERIGEE / SERVICE YARD|STAFF & VEHICLES ONLY', name, aspect);
        continue;
      }
      const lineKeys = [...lines.matchAll(/'([^']*)'/g)].map((x) => x[1]);
      add(`${title}|${lineKeys.join('|')}`, name, aspect);
    }
    for (const m of src.matchAll(/<DoorOpening\b[^>]*\/>/g)) {
      const label = m[0].match(/label="([^"]*)"/)?.[1];
      if (label) add(`${label}|`, name, 1.45 / 0.36);
    }
  }
  return sites;
}

const sites = boardSites();
const errors = [];
const entries = [];

for (const [key, art] of Object.entries(SIGN_FILES)) {
  const places = sites.get(key);
  if (!places?.length) {
    errors.push(`"${key}" has art (${art}) but no board draws that key`);
    continue;
  }
  const file = resolve(PUBLIC, '.' + art);
  if (!existsSync(file)) {
    errors.push(`"${key}" points at a missing file: ${art}`);
    continue;
  }
  const { w, h } = imageInfo(file);
  const artAspect = w / h;
  for (const place of places) {
    if (Math.abs(artAspect - place.aspect) / place.aspect > 0.015) {
      errors.push(`${art} is ${w}x${h} (aspect ${artAspect.toFixed(2)}) but ${place.file} draws it at ${place.aspect.toFixed(2)} — the runtime would crop it`);
    }
  }
  entries.push({
    key,
    art,
    file,
    w,
    h,
    aspect: +artAspect.toFixed(4),
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  });
}

for (const pic of PICTURE_SIGNS) {
  const file = resolve(PUBLIC, '.' + pic.src);
  if (!existsSync(file)) { errors.push(`picture sign missing: ${pic.src}`); continue; }
  const { w, h } = imageInfo(file);
  const aspect = w / h;
  if (Math.abs(aspect - pic.planeAspect) / pic.planeAspect > 0.02) {
    errors.push(`${pic.src} is ${w}x${h} (aspect ${aspect.toFixed(2)}) but is drawn at ${pic.planeAspect.toFixed(2)}`);
  }
  entries.push({
    key: pic.src,
    art: pic.src,
    file,
    w,
    h,
    aspect: +aspect.toFixed(4),
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    picture: true,
  });
}

if (errors.length) {
  for (const e of errors) console.error(`  ERROR  ${e}`);
  console.error(`FAIL  ${errors.length} sign error(s)`);
  process.exit(1);
}

entries.sort((a, b) => a.art.localeCompare(b.art));

// On --update, refresh the review sheet so the art can actually be looked at
// before its hashes are locked in.
async function writeReviewSheet() {
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; } catch { console.log('  warn   puppeteer-core unavailable — skipping the review sheet'); return; }
  const http = await import('node:http');
  const fs = await import('node:fs');
  const pathMod = await import('node:path');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = pathMod.resolve(PUBLIC, rel);
    if (!file.startsWith(pathMod.resolve(PUBLIC)) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const CANDIDATES = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  let executablePath = null;
  for (const p of CANDIDATES) { if (fs.existsSync(p)) { executablePath = p; break; } }
  if (!executablePath) { console.log('  warn   no Edge/Chrome found — skipping the review sheet'); server.close(); return; }
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const grid = entries.map((e) => `<div style="border:1px solid #2a3742;padding:6px"><div>${e.key}</div><div style="color:#7f95a3">${e.art}</div><img src="${base + e.art}" style="width:100%;display:block;margin-top:4px;background:#000"></div>`).join('');
  await page.setContent(`<html><body style="margin:0;background:#0c1116;color:#e6edf3;font:12px monospace"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:10px">${grid}</div></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await fs.promises.mkdir(resolve(ROOT, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(ROOT, 'shots/signs-review.png'), fullPage: true });
  await browser.close();
  server.close();
  console.log('OK    review sheet -> shots/signs-review.png (check every board is complete before committing)');
}

if (UPDATE) {
  const lock = {};
  for (const e of entries) lock[e.art] = { sha256: e.sha256, w: e.w, h: e.h, aspect: e.aspect };
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
  console.log(`OK    reviewed ${entries.length} sign images -> scripts/sign-art.lock.json`);
  await writeReviewSheet();
} else {
  const lock = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : null;
  if (!lock) {
    console.error('FAIL  scripts/sign-art.lock.json is missing — run node scripts/test-signs.mjs --update and review the art');
    process.exit(1);
  }
  let unseen = 0;
  for (const e of entries) {
    const locked = lock[e.art];
    if (!locked) { console.error(`  ERROR  ${e.art} is not in the reviewed lock file`); unseen += 1; continue; }
    if (locked.sha256 !== e.sha256) {
      console.error(`  ERROR  ${e.art} changed since it was reviewed — regenerate the lock after a visual check`);
      unseen += 1;
    }
  }
  for (const art of Object.keys(lock)) {
    if (!entries.some((e) => e.art === art)) console.log(`  warn   ${art} is locked but no longer used`);
  }
  if (unseen) { console.error(`FAIL  ${unseen} unreviewed sign image(s)`); process.exit(1); }
}

const boardsWithArt = entries.filter((e) => !e.picture).length;
console.log(`OK    signs: ${boardsWithArt} boards use reviewed art, ${Math.max(0, sites.size - boardsWithArt)} render procedurally`);

