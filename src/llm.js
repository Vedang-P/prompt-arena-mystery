// Pooled provider adapter for OpenCode Go. The primary route is
// muse-spark-1.3-contributor on the Responses API, with a pool of API keys
// spread across conversations, per-key/per-model cooldowns on usage limits and
// a hard per-turn budget. Chat-completions endpoints are still supported for
// fallback models. Plain fetch + AbortController, so it runs in Workers and in
// Node tests alike.

const OPENCODE_BASE = 'https://opencode.ai/inference/v1';
const OPENCODE_GO_BASE = 'https://opencode.ai/inference/go/v1';
const USER_AGENT = 'prompt-arena-mystery/1.1';
const OPENCODE_SESSION_HEADER = 'x-opencode-session';

// The event runs on a pool of Go keys pinned to Muse Spark 1.3 Contributor.
export const OPENCODE_GO_MODELS = ['muse-spark-1.3-contributor'];

// Console free models, for deployments using a pay-as-you-go Console key.
export const OPENCODE_FREE_MODELS = [
  'big-pickle',
  'ling-3.1-flash-free',
  'cat-jam-free',
  'mimo-v2.6-flash-free',
  'nemotron-3.5-lightning-free',
  'longcat-2.5-preview-free',
  'step-5-preview-free',
  'space-bunny-free',
];

const RESPONSES_PROTOCOL_MODELS = ['muse-spark-1.3-contributor', 'muse-spark-1.3'];

const DEFAULTS = {
  firstTokenMs: 9000,
  turnBudgetMs: 22000,
  cooldownMs: 60_000,
  maxCooldownMs: 15 * 60_000,
  maxAttempts: 16,
  maxConcurrent: 32,
  acquireTimeoutMs: 15_000,
  maxOutputTokens: 800,
  reasoningEffort: 'minimal',
};

const splitList = (value) =>
  String(value ?? '')
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

const dedupe = (list) => list.filter((v, i, all) => all.indexOf(v) === i);

const parseNum = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max ?? n, Math.max(min ?? 1, n));
};

const hash32 = (value) => {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function llmConfig(env = {}) {
  const goKeys = dedupe([...splitList(env.OPENCODE_GO_API_KEYS), ...splitList(env.OPENCODE_GO_API_KEY)]);
  const consoleKeys = dedupe(splitList(env.OPENCODE_API_KEY));
  const explicitKeys = dedupe([...splitList(env.LLM_API_KEYS), ...splitList(env.LLM_API_KEY)]);
  const explicitBase = String(env.LLM_BASE_URL || '').replace(/\/+$/, '');
  let base = explicitBase;
  let keys;
  if (explicitBase) {
    const isOpencode = /opencode\.ai\/inference/.test(explicitBase) || !explicitBase;
    keys = dedupe([...explicitKeys, ...(isOpencode ? [...goKeys, ...consoleKeys] : [])]);
  } else if (goKeys.length) {
    base = OPENCODE_GO_BASE;
    keys = explicitKeys.length ? dedupe([...explicitKeys, ...goKeys]) : goKeys;
  } else if (consoleKeys.length) {
    base = OPENCODE_BASE;
    keys = explicitKeys.length ? explicitKeys : consoleKeys;
  } else {
    keys = explicitKeys;
  }
  const models = dedupe([
    ...splitList(env.LLM_MODELS),
    ...splitList(env.LLM_MODEL),
    ...splitList(env.LLM_FALLBACK_MODELS),
  ]);
  if (!models.length) {
    if (base === OPENCODE_GO_BASE) models.push(...OPENCODE_GO_MODELS);
    else if (base === OPENCODE_BASE) models.push(...OPENCODE_FREE_MODELS);
  }
  const extraHeaders = Object.fromEntries(
    String(env.LLM_EXTRA_HEADERS || '')
      .split('|')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const split = pair.indexOf(':');
        return split === -1 ? [pair, ''] : [pair.slice(0, split).trim(), pair.slice(split + 1).trim()];
      })
  );
  const protocolSetting = String(env.LLM_PROTOCOL || '').trim().toLowerCase();
  return {
    base,
    keys,
    models,
    extraHeaders,
    userAgent: String(env.LLM_USER_AGENT || '').trim() || USER_AGENT,
    protocol: protocolSetting === 'responses' || protocolSetting === 'chat' ? protocolSetting : null,
    responsesModels: dedupe([...RESPONSES_PROTOCOL_MODELS, ...splitList(env.LLM_RESPONSES_MODELS)]),
    maxOutputTokens: parseNum(env.LLM_MAX_OUTPUT_TOKENS, DEFAULTS.maxOutputTokens, 200, 4000),
    reasoningEffort: ['minimal', 'low', 'medium', 'high'].includes(String(env.LLM_REASONING_EFFORT || '').toLowerCase())
      ? String(env.LLM_REASONING_EFFORT).toLowerCase()
      : DEFAULTS.reasoningEffort,
    firstTokenMs: parseNum(env.LLM_FIRST_TOKEN_MS, DEFAULTS.firstTokenMs, 1500, 30000),
    turnBudgetMs: parseNum(env.LLM_TURN_BUDGET_MS, DEFAULTS.turnBudgetMs, 3000, 60000),
    cooldownMs: parseNum(env.LLM_COOLDOWN_MS, DEFAULTS.cooldownMs, 5000, DEFAULTS.maxCooldownMs),
    maxCooldownMs: parseNum(env.LLM_MAX_COOLDOWN_MS, DEFAULTS.maxCooldownMs, 30_000, 24 * 3600_000),
    maxAttempts: parseNum(env.LLM_MAX_ATTEMPTS, DEFAULTS.maxAttempts, 1, 32),
    maxConcurrent: parseNum(env.LLM_MAX_CONCURRENT, DEFAULTS.maxConcurrent, 1, 256),
  };
}

export function llmConfigured(env = {}) {
  const cfg = llmConfig(env);
  return Boolean(cfg.base && cfg.keys.length && cfg.models.length);
}

// Cooldowns and concurrency spans live at module scope, keyed by upstream base,
// so every request in an isolate shares the same pool health.
const cooldowns = new Map();
const cooling = (base, scope, now) => {
  const map = cooldowns.get(base);
  return map ? (map.get(scope) ?? 0) > now : false;
};
const cool = (base, scope, ms, now = Date.now()) => {
  let map = cooldowns.get(base);
  if (!map) {
    map = new Map();
    cooldowns.set(base, map);
  }
  map.set(scope, Math.max(map.get(scope) ?? 0, now + ms));
};

const limiters = new Map();
const limiterFor = (base, limit) => {
  let limiter = limiters.get(base);
  if (!limiter) {
    limiter = { active: 0, waiters: [], limit };
    limiters.set(base, limiter);
  }
  limiter.limit = limit;
  return limiter;
};

const retryAfterMs = (res, fallback, cap) => {
  const raw = res.headers.get('retry-after');
  let ms = fallback;
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) ms = seconds * 1000;
    else {
      const at = Date.parse(raw);
      if (Number.isFinite(at)) ms = Math.max(0, at - Date.now());
    }
  }
  return Math.min(cap, Math.max(500, ms));
};

const toResponsesInput = (messages) =>
  messages.map((m) => ({ role: m.role, content: m.content }));

const responsesText = (data) =>
  (data?.output ?? [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => item?.content ?? [])
    .filter((part) => part?.type === 'output_text')
    .map((part) => part?.text ?? '')
    .join(' ')
    .trim();

export function makeLLM(env, onEvent = () => {}) {
  const cfg = llmConfig(env);
  if (!cfg.base || !cfg.keys.length || !cfg.models.length) return null;
  const { base, keys, models } = cfg;
  const keyIndex = new Map(keys.map((key, index) => [key, index]));
  const limiter = limiterFor(base, cfg.maxConcurrent);
  const fallbackSession = `pa-${Math.random().toString(36).slice(2, 10)}`;
  let preferred = null;

  const protocolFor = (model) =>
    cfg.protocol ?? (cfg.responsesModels.includes(model) ? 'responses' : 'chat');

  async function acquire() {
    if (limiter.active < limiter.limit) {
      limiter.active++;
      return;
    }
    await new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
      limiter.waiters = limiter.waiters.filter((w) => w !== waiter);
          reject(new Error('llm_capacity_timeout'));
        }, DEFAULTS.acquireTimeoutMs),
      };
      limiter.waiters.push(waiter);
    });
    limiter.active++;
  }

  function release() {
    limiter.active = Math.max(0, limiter.active - 1);
    const next = limiter.waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    }
  }

  // Each conversation keeps a sticky starting key (hash of its session), so the
  // pool spreads ~evenly across teams and prompt caching stays warm per key.
  // Failures still fail over across every other key.
  function attemptList(session) {
    const now = Date.now();
    const orderedModels = preferred && models.includes(preferred)
      ? [preferred, ...models.filter((m) => m !== preferred)]
      : [...models];
    const start = keys.length > 1 ? hash32(session ?? fallbackSession) % keys.length : 0;
    const orderedKeys = [...keys.slice(start), ...keys.slice(0, start)];
    const liveKeys = orderedKeys.filter((key) => !cooling(base, `key:${key}`, now));
    const liveModels = orderedModels.filter((model) => !cooling(base, `model:${model}`, now));
    const list = [];
    for (const key of liveKeys) {
      for (const model of liveModels) {
        if (!cooling(base, `pair:${key}|${model}`, now)) list.push({ model, key });
      }
    }
    if (list.length) return list.slice(0, cfg.maxAttempts);
    // Every pair is cooling. Rather than fail instantly, retry the pairs whose
    // cooldown expires soonest — a burst of transient first-token timeouts must
    // never lock the whole pool out while the accounts are healthy.
    const nowMap = cooldowns.get(base);
    const late = [];
    for (const key of orderedKeys) {
      if (cooling(base, `key:${key}`, now)) continue;
      for (const model of orderedModels) {
        if (cooling(base, `model:${model}`, now)) continue;
        late.push({ model, key, until: nowMap?.get(`pair:${key}|${model}`) ?? 0 });
      }
    }
    late.sort((a, b) => a.until - b.until);
    return late.slice(0, Math.min(2, cfg.maxAttempts)).map(({ model, key }) => ({ model, key }));
  }

  function noteFailure(model, key, error) {
    const status = error?.status;
    if (status === 401 || status === 403) {
      cool(base, `key:${key}`, 10 * 60_000);
      return;
    }
    if (status === 429) {
      cool(base, `pair:${key}|${model}`, error.retryAfterMs ?? cfg.cooldownMs);
      return;
    }
    if (status >= 500) {
      cool(base, `model:${model}`, 5000);
      return;
    }
    const message = String(error?.message ?? '');
    if (message.includes('first_token_timeout') || message === 'llm_timeout') {
      // Transient provider queueing, not an account limit: cool the pair only
      // briefly so a burst cannot starve the single-model pool for long.
      cool(base, `pair:${key}|${model}`, 10_000);
      return;
    }
    if (message === 'llm_empty' || message === 'llm_incomplete') {
      cool(base, `pair:${key}|${model}`, 20_000);
    }
  }

  async function request(model, key, messages, opts, deadline) {
    const remaining = Math.max(1000, deadline - Date.now());
    const firstTokenMs = Math.min(opts.firstTokenMs ?? cfg.firstTokenMs, remaining);
    const totalMs = Math.min(opts.timeoutMs ?? cfg.turnBudgetMs, remaining);
    const session = opts.session ?? fallbackSession;
    const protocol = protocolFor(model);
    const controller = new AbortController();
    const firstToken = setTimeout(
      () => controller.abort(new Error('first_token_timeout')),
      firstTokenMs
    );
    const total = setTimeout(() => controller.abort(new Error('llm_timeout')), totalMs);
    try {
      const body = protocol === 'responses'
        ? {
            model,
            input: toResponsesInput(messages),
            stream: !!opts.stream,
            max_output_tokens: opts.maxOutputTokens ?? cfg.maxOutputTokens,
            reasoning: { effort: opts.reasoningEffort ?? cfg.reasoningEffort },
          }
        : {
            model,
            messages,
            stream: !!opts.stream,
            temperature: opts.temperature ?? 0.7,
            max_tokens: opts.maxTokens ?? 220,
          };
      const res = await fetch(`${base}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          'user-agent': cfg.userAgent,
          [OPENCODE_SESSION_HEADER]: String(session).slice(0, 128),
          ...cfg.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const error = new Error(`llm_http_${res.status}`);
        error.status = res.status;
        if (res.status === 429) error.retryAfterMs = retryAfterMs(res, cfg.cooldownMs, cfg.maxCooldownMs);
        throw error;
      }
      return {
        res,
        protocol,
        firstTokenDone: () => clearTimeout(firstToken),
        done: () => {
          clearTimeout(firstToken);
          clearTimeout(total);
        },
      };
    } catch (e) {
      clearTimeout(firstToken);
      clearTimeout(total);
      throw e;
    }
  }

  async function complete(messages, opts = {}) {
    await acquire();
    const deadline = Date.now() + Math.max(2000, opts.budgetMs ?? opts.timeoutMs ?? cfg.turnBudgetMs);
    try {
      const attempts = attemptList(opts.session);
      if (!attempts.length) throw new Error('llm_pool_exhausted');
      let lastError;
      for (const { model, key } of attempts) {
        if (Date.now() >= deadline - 500) {
          lastError = lastError ?? new Error('llm_budget_exhausted');
          break;
        }
        try {
          const { res, protocol, done } = await request(model, key, messages, { ...opts, stream: false }, deadline);
          try {
            const data = await res.json();
            const text = protocol === 'responses'
              ? responsesText(data)
              : (data?.choices?.[0]?.message?.content ?? '').trim();
            if (!text) throw new Error('llm_empty');
            preferred = model;
            onEvent({ type: 'llm_ok', model, keyIndex: keyIndex.get(key), session: String(opts.session ?? fallbackSession) });
            return text;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          noteFailure(model, key, e);
          onEvent({ type: 'llm_error', model, keyIndex: keyIndex.get(key), session: String(opts.session ?? fallbackSession), detail: String(e?.message ?? e), retryAfterMs: e?.retryAfterMs ?? null });
        }
      }
      throw lastError ?? new Error('llm_unavailable');
    } finally {
      release();
    }
  }

  async function* stream(messages, opts = {}) {
    await acquire();
    const deadline = Date.now() + Math.max(2000, opts.budgetMs ?? opts.timeoutMs ?? cfg.turnBudgetMs);
    try {
      const attempts = attemptList(opts.session);
      if (!attempts.length) throw new Error('llm_pool_exhausted');
      let lastError;
      for (const { model, key } of attempts) {
        if (Date.now() >= deadline - 500) {
          lastError = lastError ?? new Error('llm_budget_exhausted');
          break;
        }
        let yielded = false;
        try {
          const { res, protocol, firstTokenDone, done } = await request(model, key, messages, { ...opts, stream: true }, deadline);
          try {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finished = false;
            while (!finished) {
              const { value, done: readerDone } = await reader.read();
              if (readerDone) break;
              buffer += decoder.decode(value, { stream: true });
              let newline;
              while ((newline = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') {
                  finished = true;
                  break;
                }
                let chunk;
                try {
                  chunk = JSON.parse(payload);
                } catch {
                  continue;
                }
                if (protocol === 'responses') {
                  const type = chunk?.type;
                  if (type === 'response.output_text.delta' && chunk.delta) {
                    // The first-token clock measures visible text, not the
                    // reasoning events that lead up to it.
                    firstTokenDone();
                    yielded = true;
                    yield chunk.delta;
                  } else if (type === 'response.completed') {
                    finished = true;
                    break;
                  } else if (type === 'response.failed' || type === 'response.incomplete' || type === 'error') {
                    throw new Error('llm_incomplete');
                  }
                } else {
                  const delta = chunk?.choices?.[0]?.delta?.content;
                  if (delta) {
                    firstTokenDone();
                    yielded = true;
                    yield delta;
                  }
                }
              }
            }
            // A stream that yields nothing usable is a failed attempt: a model
            // that spends its whole budget on reasoning must not answer with
            // silence — the pool moves to the next route instead.
            if (!yielded) throw new Error('llm_empty');
            preferred = model;
            onEvent({ type: 'llm_ok', model, keyIndex: keyIndex.get(key), session: String(opts.session ?? fallbackSession) });
            return;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          noteFailure(model, key, e);
          onEvent({ type: 'llm_error', model, keyIndex: keyIndex.get(key), session: String(opts.session ?? fallbackSession), detail: String(e?.message ?? e), yielded, retryAfterMs: e?.retryAfterMs ?? null });
          if (yielded) throw e;
        }
      }
      throw lastError ?? new Error('llm_unavailable');
    } finally {
      release();
    }
  }

  return { stream, complete, models: [...models] };
}
