// Pooled provider adapter for OpenAI-compatible /chat/completions endpoints.
// Multiple API keys and models are tried as one pool, with streaming, per-pair
// cooldowns on usage limits and a hard per-turn budget. Plain fetch +
// AbortController, so it runs in Workers and in Node tests alike.

const OPENCODE_BASE = 'https://opencode.ai/inference/v1';
const OPENCODE_GO_BASE = 'https://opencode.ai/inference/go/v1';
const USER_AGENT = 'prompt-arena-mystery/1.1';

// Go's unlimited free models come first for the event, then the cheap fast
// models included in the Go plan as extra capacity. The Go API expects an
// identifying user agent and a stable session per conversation (sent below).
export const OPENCODE_GO_MODELS = [
  'cat-jam-free',
  'longcat-2.5-preview-free',
  'step-5-preview-free',
  'space-bunny',
  'mimo-v2.6-flash',
  'glm-5.3-flash',
  'deepseek-v4.1-flash',
];

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

const DEFAULTS = {
  firstTokenMs: 7000,
  turnBudgetMs: 22000,
  cooldownMs: 60_000,
  maxCooldownMs: 15 * 60_000,
  maxAttempts: 6,
  maxConcurrent: 12,
  acquireTimeoutMs: 10_000,
};

const splitList = (value) =>
  String(value ?? '')
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

const dedupe = (list) => list.filter((v, i, all) => all.indexOf(v) === i);

const parseMs = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max ?? n, Math.max(min ?? 1, n));
};

export function llmConfig(env = {}) {
  const goKeys = dedupe(splitList(env.OPENCODE_GO_API_KEY));
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
    keys = explicitKeys.length ? explicitKeys : goKeys;
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
  return {
    base,
    keys,
    models,
    extraHeaders,
    userAgent: String(env.LLM_USER_AGENT || '').trim() || USER_AGENT,
    firstTokenMs: parseMs(env.LLM_FIRST_TOKEN_MS, DEFAULTS.firstTokenMs, 1500, 30000),
    turnBudgetMs: parseMs(env.LLM_TURN_BUDGET_MS, DEFAULTS.turnBudgetMs, 3000, 60000),
    cooldownMs: parseMs(env.LLM_COOLDOWN_MS, DEFAULTS.cooldownMs, 5000, DEFAULTS.maxCooldownMs),
    maxCooldownMs: parseMs(env.LLM_MAX_COOLDOWN_MS, DEFAULTS.maxCooldownMs, 30_000, 24 * 3600_000),
    maxAttempts: parseMs(env.LLM_MAX_ATTEMPTS, DEFAULTS.maxAttempts, 1, 24),
    maxConcurrent: parseMs(env.LLM_MAX_CONCURRENT, DEFAULTS.maxConcurrent, 1, 256),
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

export function makeLLM(env, onEvent = () => {}) {
  const cfg = llmConfig(env);
  if (!cfg.base || !cfg.keys.length || !cfg.models.length) return null;
  const { base, keys, models } = cfg;
  const limiter = limiterFor(base, cfg.maxConcurrent);
  const fallbackSession = `pa-${Math.random().toString(36).slice(2, 10)}`;
  let preferred = null;
  let rr = -1;

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

  function attemptList() {
    const now = Date.now();
    const ordered = preferred && models.includes(preferred)
      ? [preferred, ...models.filter((m) => m !== preferred)]
      : [...models];
    const liveModels = ordered.filter((m) => !cooling(base, `model:${m}`, now));
    const liveKeys = keys.filter((k) => !cooling(base, `key:${k}`, now));
    const list = [];
    for (const model of liveModels) {
      for (const key of liveKeys) {
        if (!cooling(base, `pair:${key}|${model}`, now)) list.push({ model, key });
      }
    }
    if (list.length > 1) {
      rr = (rr + 1) % list.length;
      list.push(...list.splice(0, rr));
    }
    return list.slice(0, cfg.maxAttempts);
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
    if (String(error?.message ?? '').includes('first_token_timeout')) {
      cool(base, `pair:${key}|${model}`, 30_000);
    }
  }

  async function request(model, key, messages, opts, deadline) {
    const remaining = Math.max(1000, deadline - Date.now());
    const firstTokenMs = Math.min(cfg.firstTokenMs, remaining);
    const totalMs = Math.min(opts.timeoutMs ?? cfg.turnBudgetMs, remaining);
    const session = opts.session ?? fallbackSession;
    const controller = new AbortController();
    const firstToken = setTimeout(
      () => controller.abort(new Error('first_token_timeout')),
      firstTokenMs
    );
    const total = setTimeout(() => controller.abort(new Error('llm_timeout')), totalMs);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          'user-agent': cfg.userAgent,
          'x-opencode-session': String(session).slice(0, 128),
          ...cfg.extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: !!opts.stream,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 220,
        }),
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
      const attempts = attemptList();
      if (!attempts.length) throw new Error('llm_pool_exhausted');
      let lastError;
      for (const { model, key } of attempts) {
        if (Date.now() >= deadline - 500) {
          lastError = lastError ?? new Error('llm_budget_exhausted');
          break;
        }
        try {
          const { res, done } = await request(model, key, messages, { ...opts, stream: false }, deadline);
          try {
            const data = await res.json();
            const text = (data?.choices?.[0]?.message?.content ?? '').trim();
            if (!text) throw new Error('llm_empty');
            preferred = model;
            onEvent({ type: 'llm_ok', model });
            return text;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          noteFailure(model, key, e);
          onEvent({ type: 'llm_error', model, detail: String(e?.message ?? e) });
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
      const attempts = attemptList();
      if (!attempts.length) throw new Error('llm_pool_exhausted');
      let lastError;
      for (const { model, key } of attempts) {
        if (Date.now() >= deadline - 500) {
          lastError = lastError ?? new Error('llm_budget_exhausted');
          break;
        }
        let yielded = false;
        try {
          const { res, firstTokenDone, done } = await request(model, key, messages, { ...opts, stream: true }, deadline);
          try {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finished = false;
            while (!finished) {
              const { value, done: readerDone } = await reader.read();
              if (readerDone) break;
              firstTokenDone();
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
                const delta = chunk?.choices?.[0]?.delta?.content;
                if (delta) {
                  yielded = true;
                  yield delta;
                }
              }
            }
            // A stream that yields nothing usable is a failed attempt: a model
            // that spends its whole budget on reasoning must not answer with
            // silence — the pool moves to the next route instead.
            if (!yielded) throw new Error('llm_empty');
            preferred = model;
            onEvent({ type: 'llm_ok', model });
            return;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          noteFailure(model, key, e);
          onEvent({ type: 'llm_error', model, detail: String(e?.message ?? e), yielded });
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
