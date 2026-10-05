#!/usr/bin/env node
// Unit tests for the pure engine — no Cloudflare needed.
//   npm run test:engine   (compiles case/test.yaml first)

import assert from 'node:assert/strict';
import { caseData } from '../src/case.js';
import {
  buildMessages,
  canonicalAnswer,
  checkCulprit,
  conclusionMatches,
  deflection,
  discover,
  isNoise,
  isRepeat,
  publicCase,
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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
