#!/usr/bin/env node
// Validates a case file and compiles it to JSON for the Worker.
//
//   node scripts/build-case.mjs                      # validate + compile case/smoke.yaml
//   node scripts/build-case.mjs --check              # validate only
//   node scripts/build-case.mjs --case case/main.yaml --out src/generated/case.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const CHECK = argv.includes('--check');
const CASE_PATH = resolve(flag('--case', 'case/smoke.yaml'));
const OUT_PATH = resolve(flag('--out', 'src/generated/case.json'));

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const idOf = (v) => (isObj(v) ? v.id : undefined);

let c;
try {
  c = parse(readFileSync(CASE_PATH, 'utf8'));
} catch (e) {
  console.error(`FAIL  cannot read/parse ${CASE_PATH}\n  ${e.message}`);
  process.exit(1);
}

if (!isObj(c)) {
  console.error('FAIL  case file must be a YAML mapping');
  process.exit(1);
}

// ---------- top level ----------
if (!isStr(c.title)) err('title is required');
if (!Array.isArray(c.rooms) || !c.rooms.length) err('rooms must be a non-empty list');
if (!Array.isArray(c.characters) || !c.characters.length) err('characters must be a non-empty list');
if (!Array.isArray(c.clues)) err('clues must be a list (may be empty)');

function collectIds(items, label) {
  const ids = new Set();
  for (const it of items ?? []) {
    if (!isStr(idOf(it))) {
      err(`${label}: every entry needs a string id`);
      continue;
    }
    if (ids.has(it.id)) err(`${label}: duplicate id "${it.id}"`);
    ids.add(it.id);
  }
  return ids;
}
collectIds(c.rooms, 'rooms');
const charIds = collectIds(c.characters, 'characters');
const clueIds = collectIds(c.clues, 'clues');

// ---------- facts ----------
const factIndex = new Map(); // factId -> { character, unlock }
for (const ch of c.characters ?? []) {
  if (!isStr(ch.id)) continue;
  if (!isStr(ch.persona)) warn(`character "${ch.id}" has no persona`);
  if (!Array.isArray(ch.facts) || !ch.facts.length) warn(`character "${ch.id}" has no facts`);
  for (const f of ch.facts ?? []) {
    if (!isStr(f.id)) {
      err(`character "${ch.id}": fact missing id`);
      continue;
    }
    if (factIndex.has(f.id)) err(`duplicate fact id "${f.id}"`);
    if (!isStr(f.text)) err(`fact "${f.id}": text is required`);
    if (f.disposition !== undefined && !['admit', 'deny', 'deflect'].includes(f.disposition)) {
      err(`fact "${f.id}": disposition must be admit | deny | deflect`);
    }
    if (f.unlock !== 'always' && !(isObj(f.unlock) && Array.isArray(f.unlock.requires))) {
      err(`fact "${f.id}": unlock must be "always" or { requires: [clue ids] }`);
    }
    factIndex.set(f.id, { character: ch.id, unlock: f.unlock });
  }
}

// ---------- clues ----------
const clueIndex = new Map();
for (const clue of c.clues ?? []) {
  if (!isStr(clue.id)) continue;
  if (!isStr(clue.name)) warn(`clue "${clue.id}" has no name`);
  for (const g of clue.grants ?? []) {
    if (!factIndex.has(g)) err(`clue "${clue.id}": grants unknown fact "${g}"`);
  }
  for (const r of clue.requires ?? []) {
    if (!clueIds.has(r)) err(`clue "${clue.id}": requires unknown clue "${r}"`);
    if (r === clue.id) err(`clue "${clue.id}": cannot require itself`);
  }
  clueIndex.set(clue.id, clue);
}
for (const [factId, meta] of factIndex) {
  if (!isObj(meta.unlock)) continue;
  for (const r of meta.unlock.requires ?? []) {
    if (!clueIds.has(r)) err(`fact "${factId}": requires unknown clue "${r}"`);
  }
}

// ---------- rooms / hotspots ----------
const cluePlacement = new Map(); // clueId -> { room, hotspot }
for (const room of c.rooms ?? []) {
  if (!isStr(room.id)) continue;
  const spotIds = new Set();
  for (const h of room.hotspots ?? []) {
    if (!isStr(h.id)) {
      err(`room "${room.id}": hotspot missing id`);
      continue;
    }
    if (spotIds.has(h.id)) err(`room "${room.id}": duplicate hotspot id "${h.id}"`);
    spotIds.add(h.id);
    if (h.type === 'character') {
      if (!charIds.has(h.character)) err(`hotspot "${room.id}/${h.id}": unknown character "${h.character}"`);
    } else if (h.type === 'clue') {
      if (!clueIds.has(h.clue)) {
        err(`hotspot "${room.id}/${h.id}": unknown clue "${h.clue}"`);
      } else if (cluePlacement.has(h.clue)) {
        err(`clue "${h.clue}" is placed in more than one hotspot`);
      } else {
        cluePlacement.set(h.clue, { room: room.id, hotspot: h.id });
      }
    } else {
      err(`hotspot "${room.id}/${h.id}": type must be "character" or "clue"`);
    }
    if (h.position !== undefined) {
      const ok = Array.isArray(h.position) && h.position.length === 3 && h.position.every(Number.isFinite);
      if (!ok) err(`hotspot "${room.id}/${h.id}": position must be [x, y, z] numbers`);
    }
  }
}
for (const clueId of clueIndex.keys()) {
  if (!cluePlacement.has(clueId)) err(`clue "${clueId}" is not placed in any hotspot`);
}

// ---------- solution ----------
if (!isObj(c.solution)) {
  err('solution is required');
} else {
  if (!charIds.has(c.solution.culprit)) err(`solution.culprit "${c.solution.culprit}" is not a character`);
  if (!isStr(c.solution.method)) err('solution.method is required');
  if (!isStr(c.solution.motive)) err('solution.motive is required');
}

// ---------- canonical q&a ----------
for (const qa of c.canonical_qa ?? []) {
  if (!charIds.has(qa.character)) err(`canonical_qa: unknown character "${qa.character}"`);
  if (!isStr(qa.q) || !isStr(qa.a)) err('canonical_qa: every entry needs q and a');
}

// ---------- reachability ----------
const reachable = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const [id, clue] of clueIndex) {
    if (reachable.has(id)) continue;
    if ((clue.requires ?? []).every((r) => reachable.has(r))) {
      reachable.add(id);
      grew = true;
    }
  }
}
for (const id of clueIndex.keys()) {
  if (!reachable.has(id)) err(`clue "${id}" is unreachable (circular or unsatisfiable "requires")`);
}
for (const [factId, meta] of factIndex) {
  if (!isObj(meta.unlock)) continue;
  for (const r of meta.unlock.requires ?? []) {
    if (!reachable.has(r)) warn(`fact "${factId}" can never unlock (requires unreachable clue "${r}")`);
  }
}

// ---------- dead content ----------
const requiredClues = new Set();
for (const clue of clueIndex.values()) for (const r of clue.requires ?? []) requiredClues.add(r);
for (const meta of factIndex.values()) {
  if (isObj(meta.unlock)) for (const r of meta.unlock.requires ?? []) requiredClues.add(r);
}
for (const [id, clue] of clueIndex) {
  if (!(clue.grants ?? []).length && !requiredClues.has(id)) {
    warn(`clue "${id}" grants nothing and gates nothing`);
  }
}

// ---------- report ----------
console.log(`case: ${CASE_PATH}`);
console.log(`  ${c.rooms?.length ?? 0} rooms, ${c.characters?.length ?? 0} characters, ${factIndex.size} facts, ${clueIndex.size} clues`);
for (const w of warnings) console.log(`  warn   ${w}`);
for (const e of errors) console.error(`  ERROR  ${e}`);

if (errors.length) {
  console.error(`FAIL  ${errors.length} error(s) — case not compiled`);
  process.exit(1);
}

if (CHECK) {
  console.log(`OK    case is valid (${warnings.length} warning(s))`);
} else {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(c, null, 2) + '\n');
  console.log(`OK    compiled -> ${OUT_PATH}`);
}
