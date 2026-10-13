// Verify per-character Zen routing without needing a live key.
import { CHARACTER_DEFAULT_MODELS, chainForCharacter, makeLLMForCharacter, modelForCharacter, resolveLlmBase } from '../src/llm.js';

const characters = ['sameer','parth','mother','officer','veer','enakshi','tanush','leader','ramu'];
let fail = 0;

// 1. defaults cover all 9
for (const id of characters) {
  const m = CHARACTER_DEFAULT_MODELS[id];
  if (!m) { console.error(`FAIL missing default for ${id}`); fail++; }
}
// 2. distinct models
const vals = characters.map((c) => CHARACTER_DEFAULT_MODELS[c]);
if (new Set(vals).size !== 9) { console.error('FAIL defaults not distinct', vals); fail++; }

// 3. chain resolution with only Zen key (no LLM_* set)
const zenEnv = { OPENCODE_API_KEY: 'test-key' };
if (resolveLlmBase(zenEnv) !== 'https://opencode.ai/zen/v1') { console.error('FAIL zen base default'); fail++; }
for (const id of characters) {
  const chain = chainForCharacter(zenEnv, id);
  if (chain[0] !== CHARACTER_DEFAULT_MODELS[id]) { console.error(`FAIL chain[0] for ${id}: ${chain[0]}`); fail++; }
  const llm = makeLLMForCharacter(zenEnv, id);
  if (!llm) { console.error(`FAIL makeLLM null for ${id}`); fail++; }
  if (llm && llm.models[0] !== CHARACTER_DEFAULT_MODELS[id]) { console.error(`FAIL llm.models for ${id}`); fail++; }
}

// 4. explicit override wins
const over = { ...zenEnv, LLM_CHARACTER_MODELS: JSON.stringify({ veer: 'custom-model' }), LLM_MODEL_SAMEER: 'other-model' };
if (modelForCharacter(over, 'veer') !== 'custom-model') { console.error('FAIL JSON override'); fail++; }
if (modelForCharacter(over, 'sameer') !== 'other-model') { console.error('FAIL per-var override'); fail++; }

// 5. no key -> null (game falls back to canonical, stays playable)
if (makeLLMForCharacter({}, 'sameer') !== null) { console.error('FAIL expected null without key'); fail++; }

if (fail) { console.error(`${fail} check(s) failed`); process.exit(1); }
console.log('OK per-character Zen routing: 9 distinct free chat models, overrides work, null-without-key fallback works.');
console.log(JSON.stringify(CHARACTER_DEFAULT_MODELS, null, 2));
