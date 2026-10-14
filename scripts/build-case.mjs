#!/usr/bin/env node
// Validates a case file and compiles it to a JS module for the Worker.
//
//   node scripts/build-case.mjs                      # validate + compile case/main.yaml
//   node scripts/build-case.mjs --check              # validate only
//   node scripts/build-case.mjs --case case/test.yaml --out src/generated/case.js

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const CHECK = argv.includes('--check');
const CASE_PATH = resolve(flag('--case', 'case/main.yaml'));
const OUT_PATH = resolve(flag('--out', 'src/generated/case.js'));

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
if (c.puzzles !== undefined && !Array.isArray(c.puzzles)) err('puzzles must be a list');
if (c.endings !== undefined && !Array.isArray(c.endings)) err('endings must be a list');

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
const roomIds = collectIds(c.rooms, 'rooms');
const charIds = collectIds(c.characters, 'characters');
const clueIds = collectIds(c.clues, 'clues');
const puzzleIds = collectIds(c.puzzles, 'puzzles');
const endingIds = collectIds(c.endings, 'endings');

// Shared shape check for `requires: { clues: [], puzzles: [] }`.
const checkRequires = (where, req) => {
  if (req === undefined) return;
  if (!isObj(req)) {
    err(`${where}: requires must be { clues: [], puzzles: [] }`);
    return;
  }
  for (const [key, list] of Object.entries(req)) {
    if (key !== 'clues' && key !== 'puzzles') {
      err(`${where}: requires has unknown key "${key}"`);
      continue;
    }
    if (!Array.isArray(list) || !list.every(isStr)) {
      err(`${where}: requires.${key} must be a list of ids`);
      continue;
    }
    for (const id of list) {
      const known = key === 'clues' ? clueIds.has(id) : puzzleIds.has(id);
      if (!known) err(`${where}: requires unknown ${key === 'clues' ? 'clue' : 'puzzle'} "${id}"`);
    }
  }
};

// ---------- facts ----------
const factIndex = new Map(); // factId -> { character, unlock }
for (const ch of c.characters ?? []) {
  if (!isStr(ch.id)) continue;
  if (!isStr(ch.persona)) warn(`character "${ch.id}" has no persona`);
  if (!Array.isArray(ch.facts) || !ch.facts.length) warn(`character "${ch.id}" has no facts`);
  if (ch.deflections !== undefined && (!Array.isArray(ch.deflections) || !ch.deflections.every(isStr))) {
    err(`character "${ch.id}": deflections must be a list of non-empty strings`);
  }
  if (ch.snubs !== undefined && (!Array.isArray(ch.snubs) || !ch.snubs.every(isStr))) {
    err(`character "${ch.id}": snubs must be a list of non-empty strings`);
  }
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
    const unlockOk =
      f.unlock === 'always' ||
      (isObj(f.unlock) &&
        ((Array.isArray(f.unlock.requires) && f.unlock.requires.length > 0) ||
          (Array.isArray(f.unlock.after) && f.unlock.after.length > 0)));
    if (!unlockOk) {
      err(`fact "${f.id}": unlock must be "always" or { requires: [clues] } and/or { after: [facts] }`);
    }
    factIndex.set(f.id, { character: ch.id, unlock: f.unlock });
  }
}

// ---------- clues ----------
const clueIndex = new Map();
for (const clue of c.clues ?? []) {
  if (!isStr(clue.id)) continue;
  if (!isStr(clue.name)) warn(`clue "${clue.id}" has no name`);
  if (clue.page !== undefined && !isStr(clue.page)) err(`clue "${clue.id}": page must be an asset path`);
  if (clue.grants !== undefined && !Array.isArray(clue.grants)) {
    err(`clue "${clue.id}": grants must be a list of fact ids`);
  }
  for (const g of clue.grants ?? []) {
    if (!factIndex.has(g)) err(`clue "${clue.id}": grants unknown fact "${g}"`);
  }
  if (clue.requires !== undefined && !Array.isArray(clue.requires)) {
    err(`clue "${clue.id}": requires must be a list of clue ids`);
  }
  for (const r of clue.requires ?? []) {
    if (!clueIds.has(r)) {
      if (puzzleIds.has(r)) {
        err(`clue "${clue.id}": requires puzzle "${r}" — gate the hotspot with requires.puzzles instead`);
      } else {
        err(`clue "${clue.id}": requires unknown clue "${r}"`);
      }
    }
    if (r === clue.id) err(`clue "${clue.id}": cannot require itself`);
  }
  clueIndex.set(clue.id, clue);
}
for (const [factId, meta] of factIndex) {
  if (!isObj(meta.unlock)) continue;
  for (const r of Array.isArray(meta.unlock.requires) ? meta.unlock.requires : []) {
    if (!clueIds.has(r)) err(`fact "${factId}": requires unknown clue "${r}"`);
  }
  for (const a of Array.isArray(meta.unlock.after) ? meta.unlock.after : []) {
    if (!factIndex.has(a)) err(`fact "${factId}": after unknown fact "${a}"`);
  }
}

// ---------- puzzles ----------
const puzzleIndex = new Map();
for (const pz of c.puzzles ?? []) {
  if (!isStr(pz.id)) continue;
  const where = `puzzle "${pz.id}"`;
  if (!['text', 'choice', 'code', 'email', 'scene'].includes(pz.kind)) {
    err(`${where}: kind must be text | choice | code | email | scene`);
  }
  if (!isStr(pz.prompt)) err(`${where}: prompt is required`);
  for (const key of ['evidence', 'success', 'fail_message']) {
    if (pz[key] !== undefined && !isStr(pz[key])) err(`${where}: ${key} must be a non-empty string`);
  }
  if (pz.penalty !== undefined) {
    err(`${where}: per-puzzle penalty is not supported — every wrong answer costs 1 penalty (cap 3 per puzzle)`);
  }
  if (pz.kind === 'choice') {
    const optionsOk =
      Array.isArray(pz.options) &&
      pz.options.length > 0 &&
      pz.options.every((o) => isStr(o) || Number.isFinite(o));
    if (!optionsOk) err(`${where}: choice puzzles need a non-empty options list`);
  }
  if (pz.kind === 'scene') {
    const speakers = new Set(['narrator', 'voice', ...charIds]);
    if (!Array.isArray(pz.lines) || !pz.lines.length) {
      err(`${where}: scene puzzles need a non-empty lines list`);
    } else {
      for (const ln of pz.lines) {
        if (!speakers.has(ln?.speaker)) err(`${where}: unknown speaker "${ln?.speaker}"`);
        if (!isStr(ln?.text)) err(`${where}: every scene line needs text`);
      }
    }
    if (pz.options !== undefined) err(`${where}: scene puzzles have no options — the scene plays itself out`);
    if (pz.answers !== undefined) err(`${where}: scene puzzles have no answers — the scene plays itself out`);
    if (pz.cast !== undefined) {
      if (!Array.isArray(pz.cast)) {
        err(`${where}: cast must be a list of { character, at?, rot? }`);
      } else {
        for (const cst of pz.cast) {
          if (!charIds.has(cst?.character)) err(`${where}: cast unknown character "${cst?.character}"`);
          if (cst?.at !== undefined && (!Array.isArray(cst.at) || cst.at.length !== 2 || !cst.at.every(Number.isFinite))) {
            err(`${where}: cast "${cst?.character}" at must be [x, z]`);
          }
          if (cst?.rot !== undefined && !Number.isFinite(cst.rot)) {
            err(`${where}: cast "${cst?.character}" rot must be a number`);
          }
        }
      }
    }
  }
  // A scene can hand the player straight to the room it lands in (the arrest
  // ride ends at the police station) instead of returning them to the room
  // they left.
  if (pz.lands_in !== undefined) {
    if (pz.kind !== 'scene') err(`${where}: lands_in only applies to scene puzzles`);
    else if (!roomIds.has(pz.lands_in)) err(`${where}: lands_in must be a known room id`);
  }
  if (pz.kind !== 'email' && pz.kind !== 'scene') {
    const answersOk =
      Array.isArray(pz.answers) &&
      pz.answers.length > 0 &&
      pz.answers.every((a) => isStr(a) || Number.isFinite(a));
    if (!answersOk) err(`${where}: answers are required for ${pz.kind} puzzles`);
  }
  if (pz.grants !== undefined && !Array.isArray(pz.grants)) {
    err(`${where}: grants must be a list of clue ids`);
  }
  for (const g of pz.grants ?? []) {
    if (!clueIds.has(g)) err(`${where}: grants unknown clue "${g}"`);
  }
  // A puzzle may add evidence without announcing its title on the result card.
  if (pz.hide_grants !== undefined && typeof pz.hide_grants !== 'boolean') {
    err(`${where}: hide_grants must be a boolean`);
  } else if (pz.hide_grants === true && !(pz.grants ?? []).length) {
    warn(`${where}: hide_grants has no effect without grants`);
  }
  checkRequires(where, pz.requires);
  if (pz.continue_on_fail !== undefined && typeof pz.continue_on_fail !== 'boolean') {
    err(`${where}: continue_on_fail must be a boolean`);
  }
  if (pz.fail_grants !== undefined && !Array.isArray(pz.fail_grants)) {
    err(`${where}: fail_grants must be a list of clue ids`);
  } else {
    for (const g of pz.fail_grants ?? []) {
      if (!clueIds.has(g)) err(`${where}: fail_grants unknown clue "${g}"`);
    }
    if ((pz.fail_grants ?? []).length && pz.continue_on_fail !== true) {
      warn(`${where}: fail_grants has no effect without continue_on_fail`);
    }
  }
  if (pz.option_endings !== undefined) {
    if (!isObj(pz.option_endings) || !Object.keys(pz.option_endings).length) {
      err(`${where}: option_endings must map an option to an ending id`);
    } else {
      const options = (pz.options ?? []).map(String);
      for (const [option, endingId] of Object.entries(pz.option_endings)) {
        if (!options.includes(option)) err(`${where}: option_endings key "${option}" is not one of the options`);
        if (!endingIds.has(endingId)) err(`${where}: option_endings "${option}" points to unknown ending "${endingId}"`);
      }
    }
  }
  puzzleIndex.set(pz.id, pz);
}

// ---------- endings ----------
for (const ending of c.endings ?? []) {
  if (!isStr(ending.id)) continue;
  if (!isStr(ending.title)) err(`ending "${ending.id}": title is required`);
  if (!isStr(ending.body)) err(`ending "${ending.id}": body is required`);
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
    } else if (h.type === 'puzzle') {
      if (!puzzleIds.has(h.puzzle)) err(`hotspot "${room.id}/${h.id}": unknown puzzle "${h.puzzle}"`);
    } else if (h.type === 'travel') {
      if (!roomIds.has(h.to)) err(`hotspot "${room.id}/${h.id}": travel to unknown room "${h.to}"`);
    } else {
      err(`hotspot "${room.id}/${h.id}": type must be "character", "clue", "puzzle" or "travel"`);
    }
    checkRequires(`hotspot "${room.id}/${h.id}"`, h.requires);
    if (h.position !== undefined) {
      const ok = Array.isArray(h.position) && h.position.length === 3 && h.position.every(Number.isFinite);
      if (!ok) err(`hotspot "${room.id}/${h.id}": position must be [x, y, z] numbers`);
    }
  }
}

// Clues granted by a puzzle (success or fail path) still count as placed.
const clueGrantedBy = new Map(); // clueId -> [puzzleId]
for (const pz of puzzleIndex.values()) {
  for (const g of [...(pz.grants ?? []), ...(pz.fail_grants ?? [])]) {
    if (!clueIds.has(g)) continue;
    if (!clueGrantedBy.has(g)) clueGrantedBy.set(g, []);
    clueGrantedBy.get(g).push(pz.id);
  }
}
for (const clueId of clueIndex.keys()) {
  const placed = cluePlacement.has(clueId);
  const granted = clueGrantedBy.has(clueId);
  if (!placed && !granted) err(`clue "${clueId}" is not placed in any hotspot and not granted by any puzzle`);
  if (placed && granted) warn(`clue "${clueId}" is both placed in a hotspot and granted by a puzzle`);
}

// Every interrogable character needs enough deflection lines to cycle through
// wrong or nonsensical questions without visibly repeating itself.
const interrogable = new Set();
for (const room of c.rooms ?? []) {
  for (const h of room.hotspots ?? []) {
    if (h.type === 'character') interrogable.add(h.character);
  }
}
for (const ch of c.characters ?? []) {
  if (!interrogable.has(ch.id)) continue;
  const count = ch.deflections?.length ?? 0;
  if (count < 20) err(`character "${ch.id}" is interrogable and needs at least 20 deflections (has ${count})`);
}

// ---------- solution ----------
if (c.solution === undefined) {
  if (!Array.isArray(c.acts) || !c.acts.length) err('solution is required (or provide acts)');
} else if (!isObj(c.solution)) {
  err('solution is required');
} else {
  if (!charIds.has(c.solution.culprit)) err(`solution.culprit "${c.solution.culprit}" is not a character`);
  if (!isStr(c.solution.method)) err('solution.method is required');
  if (!isStr(c.solution.motive)) err('solution.motive is required');
  if (c.solution.required_clues !== undefined) {
    const ok =
      Array.isArray(c.solution.required_clues) && c.solution.required_clues.every((id) => clueIds.has(id));
    if (!ok) err('solution.required_clues must be a list of known clue ids');
  }
}

// ---------- acts ----------
if (c.acts !== undefined) {
  if (!Array.isArray(c.acts) || !c.acts.length) err('acts must be a non-empty list');
  const actIds = new Set();
  const speakers = new Set(['narrator', 'voice', ...charIds]);
  const checkLines = (where, lines, { requireNonEmpty = false } = {}) => {
    if (!Array.isArray(lines)) {
      err(`${where}: lines must be a list of { speaker, text }`);
      return;
    }
    if (requireNonEmpty && !lines.length) {
      err(`${where}: lines are required`);
      return;
    }
    for (const ln of lines) {
      if (!speakers.has(ln?.speaker)) err(`${where}: unknown speaker "${ln?.speaker}"`);
      if (!isStr(ln?.text)) err(`${where}: every line needs text`);
    }
  };
  for (const act of c.acts ?? []) {
    if (!isStr(act.id)) {
      err('act missing id');
      continue;
    }
    if (actIds.has(act.id)) err(`duplicate act id "${act.id}"`);
    actIds.add(act.id);
    if (!['cinematic', 'interactive'].includes(act.type)) {
      err(`act "${act.id}": type must be cinematic | interactive`);
      continue;
    }
    if (!isStr(act.title)) warn(`act "${act.id}" has no title`);
    if (act.kicker !== undefined && !isStr(act.kicker)) {
      err(`act "${act.id}": kicker must be a non-empty string`);
    }
    if (act.intro !== undefined) checkLines(`act "${act.id}"/intro`, act.intro);
    if (act.outro !== undefined) checkLines(`act "${act.id}"/outro`, act.outro);
    if (act.complete !== undefined) {
      if (!isObj(act.complete)) {
        err(`act "${act.id}": complete must be { clues: [], puzzles: [] }`);
      } else {
        for (const key of ['clues', 'puzzles']) {
          const list = act.complete[key];
          if (list === undefined) continue;
          if (!Array.isArray(list) || !list.every(isStr)) {
            err(`act "${act.id}": complete.${key} must be a list of ids`);
            continue;
          }
          for (const id of list) {
            const known = key === 'clues' ? clueIds.has(id) : puzzleIds.has(id);
            if (!known) err(`act "${act.id}": complete references unknown ${key === 'clues' ? 'clue' : 'puzzle'} "${id}"`);
          }
        }
      }
    }
    if (act.type === 'cinematic') {
      if (act.rooms !== undefined) err(`act "${act.id}": rooms are only allowed on interactive acts`);
      if (!Array.isArray(act.beats) || !act.beats.length) {
        err(`act "${act.id}": cinematic act needs beats`);
        continue;
      }
      const beatIds = new Set();
      for (const b of act.beats) {
        const where = `act "${act.id}"/beat "${b?.id ?? '?'}"`;
        if (!isStr(b?.id)) {
          err(`${where}: missing id`);
          continue;
        }
        if (beatIds.has(b.id)) err(`${where}: duplicate beat id`);
        beatIds.add(b.id);
        if (!roomIds.has(b.room)) err(`${where}: unknown room "${b.room}"`);
        if (!isStr(b.shot)) err(`${where}: shot is required`);
        if (!Number.isFinite(b.seconds) || b.seconds <= 0) err(`${where}: seconds must be a positive number`);
        checkLines(where, b.lines, { requireNonEmpty: true });
        for (const cst of b.cast ?? []) {
          if (!charIds.has(cst?.character)) err(`${where}: unknown cast character "${cst?.character}"`);
          if (!Array.isArray(cst?.at) || cst.at.length !== 2 || !cst.at.every(Number.isFinite)) {
            err(`${where}: cast "${cst?.character}" needs at: [x, z]`);
          }
        }
      }
    } else {
      if (!roomIds.has(act.entry_room)) err(`act "${act.id}": unknown entry_room "${act.entry_room}"`);
      if (act.rooms !== undefined) {
        if (!Array.isArray(act.rooms) || !act.rooms.every((id) => roomIds.has(id))) {
          err(`act "${act.id}": rooms must be a list of known room ids`);
        } else if (isStr(act.entry_room) && !act.rooms.includes(act.entry_room)) {
          err(`act "${act.id}": entry_room "${act.entry_room}" is not in rooms`);
        }
      }
      if (act.objective !== undefined && !isStr(act.objective)) {
        err(`act "${act.id}": objective must be a non-empty string`);
      }
    }
  }
}

// ---------- hotspot act tags ----------
if (c.acts !== undefined) {
  const actIdSet = new Set((c.acts ?? []).map((a) => a?.id).filter(isStr));
  for (const room of c.rooms ?? []) {
    for (const h of room.hotspots ?? []) {
      if (h.act !== undefined && !actIdSet.has(h.act)) {
        err(`hotspot "${room.id}/${h.id}": unknown act "${h.act}"`);
      }
    }
  }
}

// ---------- canonical q&a ----------
for (const qa of c.canonical_qa ?? []) {
  if (!charIds.has(qa.character)) err(`canonical_qa: unknown character "${qa.character}"`);
  if (!isStr(qa.q) || !isStr(qa.a)) err('canonical_qa: every entry needs q and a');
  if (!Array.isArray(qa.keywords) || !qa.keywords.length || !qa.keywords.every(isStr)) {
    err(`canonical_qa (${qa.character}): every entry needs a non-empty keywords list`);
  }
}

// ---------- reachability ----------
// Puzzles and clues gate each other, so both grow to a fixed point together.
const reachableClues = new Set();
const reachablePuzzles = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const [id, clue] of clueIndex) {
    if (reachableClues.has(id)) continue;
    const cluesOk = (clue.requires ?? []).every((r) => reachableClues.has(r));
    const placed = cluePlacement.has(id);
    const viaPuzzle = (clueGrantedBy.get(id) ?? []).some((pid) => reachablePuzzles.has(pid));
    if (cluesOk && (placed || viaPuzzle)) {
      reachableClues.add(id);
      grew = true;
    }
  }
  for (const [id, pz] of puzzleIndex) {
    if (reachablePuzzles.has(id)) continue;
    const cluesOk = (pz.requires?.clues ?? []).every((r) => reachableClues.has(r));
    const puzzlesOk = (pz.requires?.puzzles ?? []).every((r) => reachablePuzzles.has(r));
    if (cluesOk && puzzlesOk) {
      reachablePuzzles.add(id);
      grew = true;
    }
  }
}
for (const id of clueIndex.keys()) {
  if (!reachableClues.has(id)) err(`clue "${id}" is unreachable (circular or unsatisfiable "requires")`);
}
for (const id of puzzleIndex.keys()) {
  if (!reachablePuzzles.has(id)) err(`puzzle "${id}" is unreachable (circular or unsatisfiable "requires")`);
}

const reachableFacts = new Set();
let factsGrew = true;
while (factsGrew) {
  factsGrew = false;
  for (const [factId, meta] of factIndex) {
    if (reachableFacts.has(factId)) continue;
    if (meta.unlock === 'always') {
      reachableFacts.add(factId);
      factsGrew = true;
      continue;
    }
    const cluesOk = (meta.unlock?.requires ?? []).every((r) => reachableClues.has(r));
    const factsOk = (meta.unlock?.after ?? []).every((a) => reachableFacts.has(a));
    if (cluesOk && factsOk) {
      reachableFacts.add(factId);
      factsGrew = true;
    }
  }
}
for (const factId of factIndex.keys()) {
  if (!reachableFacts.has(factId)) err(`fact "${factId}" can never unlock (unsatisfiable requires/after)`);
}

// ---------- dead content ----------
const requiredClues = new Set();
for (const clue of clueIndex.values()) for (const r of clue.requires ?? []) requiredClues.add(r);
for (const meta of factIndex.values()) {
  if (!isObj(meta.unlock)) continue;
  for (const r of meta.unlock.requires ?? []) requiredClues.add(r);
  for (const a of meta.unlock.after ?? []) requiredClues.add(a);
}
for (const pz of puzzleIndex.values()) {
  for (const r of pz.requires?.clues ?? []) requiredClues.add(r);
}
for (const room of c.rooms ?? []) {
  for (const h of room.hotspots ?? []) {
    for (const r of h.requires?.clues ?? []) requiredClues.add(r);
  }
}
for (const act of c.acts ?? []) {
  for (const r of act.complete?.clues ?? []) requiredClues.add(r);
}
for (const r of c.solution?.required_clues ?? []) requiredClues.add(r);
for (const [id, clue] of clueIndex) {
  if (!(clue.grants ?? []).length && !requiredClues.has(id) && !clueGrantedBy.has(id)) {
    warn(`clue "${id}" grants nothing and gates nothing`);
  }
}

// ---------- report ----------
console.log(`case: ${CASE_PATH}`);
console.log(
  `  ${c.rooms?.length ?? 0} rooms, ${c.characters?.length ?? 0} characters, ${factIndex.size} facts, ${clueIndex.size} clues, ${puzzleIndex.size} puzzles, ${endingIds.size} endings`
);
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
  const banner = '// generated by scripts/build-case.mjs — do not edit\n';
  writeFileSync(OUT_PATH, `${banner}export default ${JSON.stringify(c, null, 2)};\n`);
  console.log(`OK    compiled -> ${OUT_PATH}`);
}
