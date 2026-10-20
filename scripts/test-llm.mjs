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
    calls.push({
      model: json.model,
      key: req.headers.authorization,
      userAgent: req.headers['user-agent'],
      session: req.headers['x-opencode-session'],
      stream: json.stream,
      path: req.url,
    });
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
const emptyStream = (res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
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
  assert.equal(cfg.models[0], 'deepseek-v4.1-flash-free', 'the free deepseek flash tier must lead the pool');
  assert.equal(llmConfigured({ OPENCODE_API_KEY: 'sk-test' }), true);
  assert.equal(llmConfigured({}), false);
  assert.equal(llmConfigured({ OPENCODE_API_KEY: 'sk-test', LLM_MODEL: '' }), true);
});

test('requests identify the agent and carry the conversation session', async () => {
  const env = { LLM_BASE_URL: baseFor('identity'), LLM_API_KEY: 'k1', LLM_MODEL: 'm1', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  handler = (json, req, res) => sse(res, 'Fine.');
  const llm = makeLLM(env);
  for await (const _ of llm.stream([{ role: 'user', content: 'hi' }], { session: 'pa-7-mother' })) void _;
  assert.equal(calls[0].userAgent, 'prompt-arena-mystery/1.1');
  assert.equal(calls[0].session, 'pa-7-mother');
});

test('explicit configuration still wins', () => {
  const cfg = llmConfig({ LLM_BASE_URL: 'https://example.test/v1/', LLM_API_KEY: 'a,b', LLM_MODEL: 'm1', LLM_FALLBACK_MODELS: 'm2, m1' });
  assert.equal(cfg.base, 'https://example.test/v1');
  assert.deepEqual(cfg.keys, ['a', 'b']);
  assert.deepEqual(cfg.models, ['m1', 'm2']);
  assert.equal(llmConfigured({ LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'a', LLM_MODEL: '' }), false);
});

test('an explicit opencode base runs the free pool without an OPENCODE key', () => {
  const cfg = llmConfig({ LLM_BASE_URL: 'https://opencode.ai/inference/v1', LLM_API_KEY: 'ck' });
  assert.equal(cfg.base, 'https://opencode.ai/inference/v1');
  assert.deepEqual(cfg.keys, ['ck']);
  assert.deepEqual(cfg.models, OPENCODE_FREE_MODELS);
});

test('streams through the chat-completions endpoint', async () => {
  const env = {
    LLM_BASE_URL: baseFor('responses'),
    LLM_API_KEY: 'k1',
    LLM_MODEL: 'deepseek-v4.1-flash-free',
    LLM_TURN_BUDGET_MS: '4000',
  };
  calls.length = 0;
  handler = (json, req, res) => sse(res, 'I only know what I saw.');
  const llm = makeLLM(env);
  let text = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'hi' }], { session: 'pa-1-ramu' })) text += delta;
  assert.equal(text, 'I only know what I saw.');
  assert.ok(calls[0].path.endsWith('/chat/completions'), calls[0].path);
});

test('each conversation keeps a sticky key and sessions spread across the pool', async () => {
  const env = { LLM_BASE_URL: baseFor('sticky'), LLM_API_KEYS: 'k1,k2,k3', LLM_MODEL: 'good', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  handler = (json, req, res) => sse(res, 'Fine.');
  const llm = makeLLM(env);
  for await (const _ of llm.stream([{ role: 'user', content: 'one' }], { session: 'pa-team-7-ramu' })) void _;
  const first = calls.at(-1).key;
  for await (const _ of llm.stream([{ role: 'user', content: 'two' }], { session: 'pa-team-7-ramu' })) void _;
  assert.equal(calls.at(-1).key, first, 'the same conversation must start on the same key');
  const used = new Set([first]);
  for (let i = 0; i < 12; i += 1) {
    for await (const _ of llm.stream([{ role: 'user', content: 'hi' }], { session: `pa-team-${i}-veer` })) void _;
    used.add(calls.at(-1).key);
  }
  assert.ok(used.size > 1, 'different conversations must spread across keys');
});

test('rotates to another key when a key hits a usage limit', async () => {
  const env = { LLM_BASE_URL: baseFor('keys'), LLM_API_KEYS: 'k1,k2', LLM_MODEL: 'good', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  let limitedOnce = false;
  handler = (json, req, res) => {
    if (!limitedOnce) {
      limitedOnce = true;
      return limited(res, '30');
    }
    return sse(res, 'Stay out of this, detective.');
  };
  const llm = makeLLM(env);
  let text = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'hi' }], { session: 'pa-9-officer' })) text += delta;
  assert.equal(text, 'Stay out of this, detective.');
  const tried = calls.filter((c) => c.model === 'good');
  assert.equal(tried.length, 2);
  assert.notEqual(tried[0].key, tried[1].key, 'the retry must use a different key');
});

test('a cooled key is skipped on the next turn', async () => {
  const env = { LLM_BASE_URL: baseFor('cooldown'), LLM_API_KEYS: 'k1,k2', LLM_MODEL: 'good', LLM_TURN_BUDGET_MS: '4000' };
  calls.length = 0;
  let limitedOnce = false;
  handler = (json, req, res) => {
    if (!limitedOnce) {
      limitedOnce = true;
      return limited(res, '60');
    }
    return sse(res, 'Fine.');
  };
  const llm = makeLLM(env);
  for await (const _ of llm.stream([{ role: 'user', content: 'one' }], { session: 'pa-3-mother' })) void _;
  const limitedKey = calls[0].key;
  const afterFirst = calls.length;
  let second = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'two' }], { session: 'pa-3-mother' })) second += delta;
  assert.equal(second, 'Fine.');
  assert.equal(calls.length, afterFirst + 1);
  assert.notEqual(calls.at(-1).key, limitedKey);
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

test('a model that streams nothing fails over instead of answering with silence', async () => {
  const env = {
    LLM_BASE_URL: baseFor('silent'),
    LLM_API_KEY: 'k1',
    LLM_MODEL: 'reasoner',
    LLM_FALLBACK_MODELS: 'talker',
    LLM_TURN_BUDGET_MS: '4000',
  };
  calls.length = 0;
  handler = (json, req, res) => (json.model === 'reasoner' ? emptyStream(res) : sse(res, 'Fine.'));
  const llm = makeLLM(env);
  let text = '';
  for await (const delta of llm.stream([{ role: 'user', content: 'hi' }])) text += delta;
  assert.equal(text, 'Fine.');
  assert.ok(calls.some((c) => c.model === 'reasoner'));
  assert.ok(calls.some((c) => c.model === 'talker'));
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
