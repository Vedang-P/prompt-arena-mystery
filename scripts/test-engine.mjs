#!/usr/bin/env node
// Unit tests for the pure engine — no Cloudflare needed.
//   npm run test:engine   (compiles case/test.yaml first)

import assert from 'node:assert/strict';
import { caseData } from '../src/case.js';
import {
  buildMessages,
  canAdvanceAct,
  canonicalAnswer,
  checkCulprit,
  clueGate,
  conclusionMatches,
  deflection,
  discover,
  isNoise,
  isRepeat,
  normalizeAnswer,
  publicCase,
  publicEnding,
  publicPuzzle,
  puzzleGate,
  solvePuzzle,
  unlockedFactList,
} from '../src/engine.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
}

console.log('engine — test fixture');

test('public case leaks no facts, solution, or authoring data', () => {
  const json = JSON.stringify(publicCase());
  for (const leak of [
    'butler_secret', 'butler_detail', 'persona', 'solution', 'culprit', 'canonical_qa', 'deny',
  ]) {
    assert.ok(!json.includes(leak), `publicCase leaked "${leak}"`);
  }
  assert.ok(json.includes('study'), 'publicCase should include rooms');
});

test('initial knowledge is only the always-facts', () => {
  assert.deepEqual(
    unlockedFactList([]).map((f) => f.fact).sort(),
    ['butler_alibi', 'maid_alibi']
  );
});

test('unknown clues are rejected', () => {
  const result = discover([], 'nonexistent');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_clue');
});

test('the ledger is gated behind the key', () => {
  const result = discover([], 'ledger');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'locked');
});

test('discovering the key then the ledger unlocks the secret (and its chain)', () => {
  const first = discover([], 'key');
  assert.equal(first.ok, true);
  const second = discover(first.discovered, 'ledger');
  assert.equal(second.ok, true);
  const unlocked = unlockedFactList(second.discovered).map((f) => f.fact);
  assert.ok(unlocked.includes('butler_secret'));
  assert.ok(unlocked.includes('butler_detail'), 'facts chained with "after" unlock once their parent is known');
});

test('facts never unlock before their clues', () => {
  const unlocked = unlockedFactList(['key']);
  assert.ok(!unlocked.some((f) => f.fact === 'butler_secret'));
  assert.ok(!unlocked.some((f) => f.fact === 'butler_detail'));
});

test('canonical answers match on token overlap', () => {
  assert.equal(canonicalAnswer('butler', 'so where were you tonight then?'), 'In the kitchen, as I said.');
  assert.equal(canonicalAnswer('butler', 'completely unrelated question'), null);
});

test('deflection returns an authored line, or a generic fallback', () => {
  assert.ok(deflection('butler', 0).length > 0);
  assert.ok(deflection('ghost', 0).length > 0);
});

test('deflection rotates and prefers snubs for repeats', () => {
  assert.ok(deflection('butler', 0, true).includes('eyebrow'));
  assert.notEqual(deflection('butler', 0), deflection('butler', 1));
});

test('noise and repeat detection', () => {
  assert.equal(isNoise('???'), true);
  assert.equal(isNoise('...'), true);
  assert.equal(isNoise('where is the ledger'), false);
  assert.equal(isRepeat('Where is the key?', 'where is the key'), true);
  assert.equal(isRepeat('where is the key', 'where is the ledger'), false);
  assert.equal(isRepeat('anything', ''), false);
});

test('prompt keeps locked facts out and always-facts in', () => {
  const messages = buildMessages('butler', [], [], 'Where were you tonight?');
  const all = messages.map((m) => m.content).join('\n');
  assert.ok(all.includes('kitchen'), 'always-facts should reach the prompt');
  assert.ok(!all.includes('burned the ledger'), 'locked facts must not reach the prompt');
});

test('accusation checking uses the solution', () => {
  assert.equal(checkCulprit('butler'), true);
  assert.equal(checkCulprit('maid'), false);
});

test('conclusion matching tolerates phrasing', () => {
  const reference = caseData.solution.motive;
  assert.equal(conclusionMatches(reference, reference), true);
  assert.equal(conclusionMatches('a totally different motive', reference), false);
});

test('normalizeAnswer lowercases, strips punctuation, and collapses spaces', () => {
  assert.equal(normalizeAnswer('  The   LEDGER!! '), 'the ledger');
  assert.equal(normalizeAnswer('OC-1808'), 'oc1808');
  assert.equal(normalizeAnswer('Sameer@Example.COM'), 'sameer@example.com');
});

test('a text puzzle accepts a normalized answer and grants its clues', () => {
  const result = solvePuzzle([], [], 'p_ash', '  The LEDGER!! ');
  assert.equal(result.ok, true);
  assert.equal(result.correct, true);
  assert.equal(result.penalty, 0);
  assert.deepEqual(result.grants, ['ash']);
  assert.deepEqual(result.solvedPuzzles, ['p_ash']);
  assert.ok(result.discovered.includes('ash'));
  assert.ok(result.newlyUnlocked.some((f) => f.fact === 'maid_ash'));
});

test('a wrong text answer applies the penalty and does not solve', () => {
  const result = solvePuzzle([], [], 'p_ash', 'the cat');
  assert.equal(result.ok, true);
  assert.equal(result.correct, false);
  assert.equal(result.penalty, 2);
  assert.deepEqual(result.solvedPuzzles, []);
  assert.deepEqual(result.discovered, []);
  assert.deepEqual(result.grants, []);
});

test('unknown puzzles are rejected', () => {
  const result = solvePuzzle([], [], 'nope', 'anything');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_puzzle');
});

test('continue_on_fail marks the puzzle solved, penalizes, and applies fail_grants', () => {
  const result = solvePuzzle([], ['mixtape'], 'p_risky', 'Run');
  assert.equal(result.ok, true);
  assert.equal(result.correct, false);
  assert.equal(result.penalty, 1);
  assert.equal(result.message, 'You bolt, and a hand catches your sleeve.');
  assert.ok(result.solvedPuzzles.includes('p_risky'));
  assert.ok(result.discovered.includes('ash'));
});

test('choice puzzles accept the option text or its letter, not wrong options', () => {
  const text = solvePuzzle([], [], 'p_play', 'Play it');
  assert.equal(text.correct, true);
  assert.ok(text.discovered.includes('mixtape'));
  const lower = solvePuzzle([], [], 'p_play', 'a');
  assert.equal(lower.correct, true);
  const upper = solvePuzzle([], [], 'p_play', 'A');
  assert.equal(upper.correct, true);
  const wrong = solvePuzzle([], [], 'p_play', 'Put it back');
  assert.equal(wrong.correct, false);
  assert.deepEqual(wrong.solvedPuzzles, []);
});

test('email puzzles accept any well-formed address and reject the rest', () => {
  const good = solvePuzzle([], [], 'p_contact', ' sameer@example.com ');
  assert.equal(good.correct, true);
  assert.ok(good.solvedPuzzles.includes('p_contact'));
  const noAt = solvePuzzle([], [], 'p_contact', 'not-an-email');
  assert.equal(noAt.correct, false);
  assert.deepEqual(noAt.solvedPuzzles, []);
  const noDot = solvePuzzle([], [], 'p_contact', 'a@b');
  assert.equal(noDot.correct, false);
});

test('option_endings ends the run and marks the puzzle solved', () => {
  const stop = solvePuzzle([], [], 'p_ending', 'Stop');
  assert.equal(stop.ok, true);
  assert.equal(stop.ending, 'ending_cult');
  assert.ok(stop.solvedPuzzles.includes('p_ending'));
  const cont = solvePuzzle([], [], 'p_ending', 'Continue');
  assert.equal(cont.correct, true);
  assert.equal(cont.ending, undefined);
});

test('solved puzzles short-circuit without re-granting', () => {
  const result = solvePuzzle(['p_ash'], [], 'p_ash', 'wrong');
  assert.equal(result.ok, true);
  assert.equal(result.alreadySolved, true);
  assert.equal(result.correct, true);
  assert.deepEqual(result.grants, []);
  assert.deepEqual(result.solvedPuzzles, ['p_ash']);
});

test('canAdvanceAct gates on complete clues and puzzles', () => {
  const blocked = canAdvanceAct([], [], 'act1');
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.missing, { clues: ['mixtape'], puzzles: ['p_risky'] });
  const half = canAdvanceAct(['p_risky'], [], 'act1');
  assert.equal(half.ok, false);
  assert.deepEqual(half.missing, { clues: ['mixtape'], puzzles: [] });
  const ready = canAdvanceAct(['p_risky'], ['mixtape'], 'act1');
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.missing, { clues: [], puzzles: [] });
  const rawJson = canAdvanceAct('["p_risky"]', ['mixtape'], 'act1');
  assert.equal(rawJson.ok, true, 'solved puzzles may arrive as a raw JSON column string');
  assert.equal(canAdvanceAct([], [], 'act0').ok, true, 'cinematic acts without complete are open');
});

test('puzzleGate locks a puzzle until its required clues are found', () => {
  const before = puzzleGate('act1', [], [], 'p_risky');
  assert.equal(before.ok, false);
  assert.equal(before.error, 'locked');
  assert.deepEqual(before.missing, { clues: ['mixtape'], puzzles: [] });
  const after = puzzleGate('act1', [], ['mixtape'], 'p_risky');
  assert.deepEqual(after, { ok: true });
});

test('puzzleGate rejects puzzles owned by a later act', () => {
  const result = puzzleGate('act0', [], [], 'p_play');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'locked');
  assert.deepEqual(result.missing, { clues: [], puzzles: [], act: 'act1' });
});

test('puzzleGate rejects unknown puzzle ids', () => {
  const result = puzzleGate('act1', [], [], 'nope');
  assert.deepEqual(result, { ok: false, error: 'unknown_puzzle' });
});

test('puzzleGate accepts raw JSON column strings and early puzzles in their own act', () => {
  assert.deepEqual(puzzleGate('act1', '[]', '["mixtape"]', 'p_risky'), { ok: true });
  assert.deepEqual(puzzleGate('act1', '[]', '[]', 'p_play'), { ok: true });
});

test('clueGate locks a hotspot clue until its requires are met', () => {
  const before = clueGate('act1', [], [], 'ledger');
  assert.equal(before.ok, false);
  assert.equal(before.error, 'locked');
  assert.deepEqual(before.missing, { clues: ['key'], puzzles: [] });
  assert.deepEqual(clueGate('act1', [], ['key'], 'ledger'), { ok: true });
});

test('clueGate locks hotspot clues from a later act', () => {
  const result = clueGate('act0', [], ['key'], 'ledger');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'locked');
  assert.deepEqual(result.missing, { clues: [], puzzles: [], act: 'act1' });
});

test('clueGate allows ungated clues and rejects unknown ids', () => {
  assert.deepEqual(clueGate('act1', [], [], 'key'), { ok: true });
  assert.deepEqual(clueGate('act1', [], [], 'nope'), { ok: false, error: 'unknown_clue' });
});

test('publicEnding exposes the authored ending or null', () => {
  const ending = publicEnding('ending_cult');
  assert.equal(ending.id, 'ending_cult');
  assert.equal(ending.title, 'The Cult');
  assert.ok(ending.body.length > 0);
  assert.equal(publicEnding('missing'), null);
});

test('publicPuzzle strips answers, grants, and narrative authoring fields', () => {
  const pub = publicPuzzle('p_risky');
  assert.equal(pub.id, 'p_risky');
  assert.equal(pub.kind, 'choice');
  assert.deepEqual(pub.options, ['Run', 'Stay hidden']);
  assert.deepEqual(pub.requires, { clues: ['mixtape'] });
  for (const leak of ['answers', 'grants', 'fail_grants', 'option_endings', 'success', 'fail_message', 'penalty']) {
    assert.equal(pub[leak], undefined, `publicPuzzle leaked "${leak}"`);
  }
  assert.equal(publicPuzzle('missing'), null);
});

test('public case leaks no answers, grants, endings internals, or fact text', () => {
  const json = JSON.stringify(publicCase());
  for (const leak of [
    '"answers"', '"grants"', '"fail_grants"', '"option_endings"', '"success"', '"fail_message"',
    'the ledger', 'You bolt', 'Took the ledger', 'butler_secret', 'maid_ash', 'kitchen', 'polishing the silver',
  ]) {
    assert.ok(!json.includes(leak), `publicCase leaked "${leak}"`);
  }
  const pub = publicCase();
  assert.equal(pub.puzzles.length, 5);
  assert.ok(pub.puzzles.every((pz) => pz.answers === undefined && pz.grants === undefined));
  assert.ok(pub.endings.some((e) => e.id === 'ending_cult' && !e.body));
  assert.ok(pub.acts.some((a) => a.kicker === 'Act I' && a.complete && a.complete.puzzles.includes('p_risky')));
  assert.ok(pub.rooms.some((room) => room.hotspots.some((h) => h.type === 'travel' && h.to === 'cellar')));
  assert.ok(pub.rooms.some((room) => room.hotspots.some((h) => h.type === 'puzzle' && h.puzzle === 'p_play')));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
