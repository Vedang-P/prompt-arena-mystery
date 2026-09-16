#!/usr/bin/env node
// Unit tests for the pure engine — no Cloudflare needed.
//   npm run test:engine   (compiles case/smoke.yaml first)

import assert from 'node:assert/strict';
import {
  buildMessages,
  canonicalAnswer,
  checkCulprit,
  deflection,
  discover,
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

console.log('engine — smoke case');

test('public case leaks no facts, solution, or authoring data', () => {
  const json = JSON.stringify(publicCase());
  for (const leak of [
    'victor_debts', 'odette_secret', 'victor_key', 'odette_key',
    'solution', 'culprit', 'canonical_qa', 'deny', 'persona',
  ]) {
    assert.ok(!json.includes(leak), `publicCase leaked "${leak}"`);
  }
  assert.ok(json.includes('ballroom'), 'publicCase should include rooms');
});

test('initial knowledge is only the always-facts', () => {
  assert.deepEqual(
    unlockedFactList([]).map((f) => f.fact).sort(),
    ['odette_lockbox', 'victor_alibi']
  );
});

test('unknown clues are rejected', () => {
  const result = discover([], 'nonexistent');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown_clue');
});

test('the ticket stub is gated behind the stage door', () => {
  const result = discover([], 'ticket_stub');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'locked');
  assert.deepEqual(result.missing, ['stage_door']);
});

test('the sheet music unlocks exactly the debt fact', () => {
  const result = discover([], 'sheet_music');
  assert.equal(result.ok, true);
  assert.deepEqual(result.newlyUnlocked.map((f) => f.fact), ['victor_debts']);
});

test('stage door alone unlocks nothing; the stub then unlocks the rest', () => {
  const door = discover([], 'stage_door');
  assert.equal(door.ok, true);
  assert.deepEqual(door.newlyUnlocked, []);

  const stub = discover(['stage_door'], 'ticket_stub');
  assert.equal(stub.ok, true);
  assert.deepEqual(
    stub.newlyUnlocked.map((f) => f.fact).sort(),
    ['odette_key', 'odette_secret', 'victor_key']
  );
});

test('discovering the same clue twice is safe and unlocks nothing new', () => {
  const result = discover(['sheet_music'], 'sheet_music');
  assert.equal(result.ok, true);
  assert.equal(result.alreadyFound, true);
  assert.deepEqual(result.newlyUnlocked, []);
});

test('victor starts knowing his alibi, not his debts', () => {
  const system = buildMessages('victor', [], [], 'hello')[0].content;
  assert.ok(system.includes('whole power cut'));
  assert.ok(!system.includes('card game'));
});

test('finding the sheet music puts the debt in victor\u2019s mouth, marked deny', () => {
  const system = buildMessages('victor', ['sheet_music'], [], 'hello')[0].content;
  assert.ok(system.includes('card game'));
  assert.ok(/never admit/i.test(system));
});

test('odette denies her secret once confronted', () => {
  const system = buildMessages('odette', ['stage_door', 'ticket_stub'], [], 'hello')[0].content;
  assert.ok(system.includes('borrow the stage door key'));
  assert.ok(/never admit/i.test(system));
});

test('history maps roles and the new question comes last', () => {
  const history = [
    { role: 'player', content: 'q1' },
    { role: 'npc', content: 'a1' },
  ];
  const messages = buildMessages('odette', [], history, 'q2');
  assert.deepEqual(messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(messages.at(-1).content, 'q2');
});

test('history is trimmed to the last 12 turns', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 ? 'npc' : 'player',
    content: `message ${i}`,
  }));
  const messages = buildMessages('odette', [], history, 'now');
  assert.equal(messages.length, 1 + 12 + 1);
});

test('canonical fallback matches a paraphrase', () => {
  const answer = canonicalAnswer('victor', 'so, where were you during the power cut?');
  assert.ok(answer && answer.includes('piano'));
});

test('canonical fallback stays quiet on unrelated questions', () => {
  assert.equal(canonicalAnswer('victor', 'do you like jazz'), null);
  assert.equal(canonicalAnswer('ghost', 'hello'), null);
});

test('culprit check is deterministic', () => {
  assert.equal(checkCulprit('victor'), true);
  assert.equal(checkCulprit('odette'), false);
  assert.equal(checkCulprit(''), false);
});

test('deflection returns an authored line, or a generic fallback', () => {
  assert.ok(deflection('victor', 0).length > 0);
  assert.ok(deflection('ghost', 0).length > 0);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
