import assert from 'node:assert/strict';
import http from 'node:http';
import { makeLLM, llmConfig, llmConfigured, OPENCODE_FREE_MODELS } from '../src/llm.js';

const calls = [];
let handler = () => {};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let json = {};
    try {
      json = JSON.parse(body);
    } catch {}
    calls.push({ model: json.model, key: req.headers.authorization, stream: json.stream, path: req.url });
    handler(json, req, res);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const baseFor = (name) => `http://127.0.0.1:${port}/${name}`;

const sse = (res, text) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const part of text.match(/.{1,5}/gs) ?? []) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
};
const limited = (res, retryAfter) => {
  res.writeHead(429, { 'content-type': 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) });
  res.end(JSON.stringify({ error: 'FreeUsageLimitError', message: 'Rate limit exceeded.' }));
};
const broken = (res) => {
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'server_error' }));
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('opencode keys default to the free model pool', () => {
  const cfg = llmConfig({ OPENCODE_API_KEY: 'sk-test' });
  assert.equal(cfg.base, 'https://opencode.ai/inference/v1');
  assert.deepEqual(cfg.keys, ['sk-test']);
  assert.deepEqual(cfg.models.slice(0, OPENCODE_FREE_MODELS.length), OPENCODE_FREE_MODELS);
  assert.equal(llmConfigured({ OPENCODE_API_KEY: 'sk-test' }), true);
  assert.equal(llmConfigured({}), false);
  assert.equal(llmConfigured({ OPENCODE_API_KEY: 'sk-test', LLM_MODEL: '' }), true);
});

test('explicit configuration still wins', () => {
  const cfg = llmConfig({ LLM_BASE_URL: 'https://example.test/v1/', LLM_API_KEY: 'a,b', LLM_MODEL: 'm1', LLM_FALLBACK_MODELS: 'm2, m1' });
  assert.equal(cfg.base, 'https://example.test/v1');
  assert.deepEqual(cfg.keys, ['a', 'b']);
  assert.deepEqual(cfg.models, ['m1', 'm2']);
  assert.equal(llmConfigured({ LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'a', LLM_MODEL: '' }), false);
});

test('streams from a model and rotates the key on a usage limit', async () => {
  const env = { LLM_BASE_URL: baseFor('keys'), LLM_API_KEYS: 'k1,k2', LLM_MODEL: 'good', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  handler = (json, req, res) => {
    if (req.headers.authorization === 'Bearer k1') return limited(res, '30');
    return sse(res, 'Stay out of this, detective.');
  };
  const llm = makeLLM(env);
  let text = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'hi' }])) text += delta;
  assert.equal(text, 'Stay out of this, detective.');
  const tried = calls.filter((c) => c.model === 'good');
  assert.equal(tried.length, 2);
  assert.equal(tried[0].key, 'Bearer k1');
  assert.equal(tried[1].key, 'Bearer k2');
});

test('a cooled pair is skipped on the next turn', async () => {
  const env = { LLM_BASE_URL: baseFor('cooldown'), LLM_API_KEYS: 'k1,k2', LLM_MODEL: 'good', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  handler = (json, req, res) => (req.headers.authorization === 'Bearer k1' ? limited(res, '60') : sse(res, 'Fine.'));
  const llm = makeLLM(env);
  for await (const _ of llm.stream([{ role: 'user', content: 'one' }])) void _;
  const afterFirst = calls.length;
  let second = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'two' }])) second += delta;
  assert.equal(second, 'Fine.');
  assert.equal(calls.length, afterFirst + 1);
  assert.equal(calls.at(-1).key, 'Bearer k2');
});

test('falls over to the next model on a 5xx', async () => {
  const env = {
    LLM_BASE_URL: baseFor('models'),
    LLM_API_KEY: 'k1',
    LLM_MODEL: 'alpha',
    LLM_FALLBACK_MODELS: 'beta',
    LLM_TURN_BUDGET_MS: '4000',
  };
  calls.length = 0;
  handler = (json, req, res) => (json.model === 'alpha' ? broken(res) : sse(res, 'Beta speaking.'));
  const llm = makeLLM(env);
  let text = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'hi' }])) text += delta;
  assert.equal(text, 'Beta speaking.');
  assert.ok(calls.some((c) => c.model === 'alpha'));
  assert.ok(calls.some((c) => c.model === 'beta'));
});

test('a fully limited pool throws quickly so the authored fallback can play', async () => {
  const env = { LLM_BASE_URL: baseFor('limited'), LLM_API_KEYS: 'k1,k2', LLM_MODELS: 'a,b', LLM_TURN_BUDGET_MS: '4000' };
  handler = (json, req, res) => limited(res, '120');
  const llm = makeLLM(env);
  const started = Date.now();
  await assert.rejects(async () => {
    for await (const _ of llm.stream([{ role: 'user', content: 'hi' }])) void _;
  }, /llm_/);
  assert.ok(Date.now() - started < 2500, 'the pool must fail fast, not hang the stream');
});

test('a slow model is dropped at the turn budget', async () => {
  const env = {
    LLM_BASE_URL: baseFor('budget'),
    LLM_API_KEY: 'k1',
    LLM_MODEL: 'slow',
    LLM_FIRST_TOKEN_MS: '800',
    LLM_TURN_BUDGET_MS: '2500',
  };
  handler = (json, req, res) => {
    res.on('close', () => {});
  };
  const llm = makeLLM(env);
  const started = Date.now();
  await assert.rejects(async () => {
    for await (const _ of llm.stream([{ role: 'user', content: 'hi' }])) void _;
  }, /timeout/);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 700 && elapsed < 4000, `budgeted fail took ${elapsed}ms`);
});

test('non-streaming complete() returns the model text', async () => {
  const env = { LLM_BASE_URL: baseFor('complete'), LLM_API_KEY: 'k1', LLM_MODEL: 'judge', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  handler = (json, req, res) => {
    assert.equal(json.stream, false);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"method":true,"motive":true}' } }] }));
  };
  const llm = makeLLM(env);
  const text = await llm.complete([{ role: 'user', content: 'grade' }], { maxTokens: 100 });
  assert.equal(text, '{"method":true,"motive":true}');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}
server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
if (failed) {
  console.error(`${failed} of ${tests.length} LLM pool tests failed`);
  process.exit(1);
}
console.log(`${tests.length} LLM pool tests passed`);
