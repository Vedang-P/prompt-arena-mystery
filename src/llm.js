// Provider adapter for any OpenAI-compatible /chat/completions endpoint.
// Streaming with model failover and a global concurrency cap.
// Plain fetch + AbortController, so it runs in Workers and in Node tests alike.

const FIRST_TOKEN_MS = 12000;
const DEFAULT_TIMEOUT_MS = 60000;
const ACQUIRE_TIMEOUT_MS = 20000;

// The concurrency cap has to span requests inside an isolate, not just one call, so the
// counters live at module scope keyed by upstream base URL.
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

// OpenCode Zen free chat-completions models (https://opencode.ai/zen/v1).
// These all speak POST {base}/chat/completions, which is what this adapter
// implements. NOTE: muse-spark-1.3-contributor-free is Responses-API only,
// so it is intentionally NOT listed here.
export const ZEN_CHAT_BASE = 'https://opencode.ai/zen/v1';

export const CHARACTER_DEFAULT_MODELS = {
  sameer: 'big-pickle',
  parth: 'space-bunny-free',
  mother: 'longcat-2.5-preview-free',
  officer: 'step-5-preview-free',
  veer: 'exo-free',
  enakshi: 'mimo-v2.6-flash-free',
  tanush: 'mimo-v2.5-free',
  leader: 'ling-3.1-flash-free',
  ramu: 'nemotron-3-ultra-free',
};

const CHARACTER_FALLBACK_MODELS = [
  'nemotron-3.5-lightning-free',
  'ling-3.0-flash-fin-free',
];

const dedupe = (list) =>
  list.map((m) => (m || '').trim()).filter((m, i, all) => m && all.indexOf(m) === i);

export function resolveLlmBase(env = {}) {
  const explicit = (env.LLM_BASE_URL || '').replace(/\/+$/, '');
  if (explicit) return explicit;
  // Zero-config Zen: if a Zen key is present, default to its chat endpoint.
  if (env.OPENCODE_API_KEY || env.LLM_API_KEY) return ZEN_CHAT_BASE;
  return '';
}

export function resolveLlmKey(env = {}) {
  return env.LLM_API_KEY || env.OPENCODE_API_KEY || '';
}

function parseCharacterMap(env = {}) {
  const raw = (env.LLM_CHARACTER_MODELS || '').trim();
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.trim()) out[String(k).toLowerCase()] = v.trim();
      }
      return out;
    }
  } catch {
    // fall through to per-var lookup
  }
  return {};
}

// Resolve the model chain for one character:
// explicit JSON map > LLM_MODEL_<CHARACTER> > built-in Zen default > global chain.
export function chainForCharacter(env = {}, characterId = '') {
  const id = String(characterId || '').toLowerCase();
  const map = parseCharacterMap(env);
  const perVar = (env[`LLM_MODEL_${id.toUpperCase()}`] || '').trim();
  const globalChain = dedupe([env.LLM_MODEL, ...(env.LLM_FALLBACK_MODELS || '').split(',')]);
  const candidates = dedupe([
    map[id],
    perVar,
    CHARACTER_DEFAULT_MODELS[id],
    ...globalChain,
    ...CHARACTER_FALLBACK_MODELS,
  ]);
  return candidates;
}

export function modelForCharacter(env = {}, characterId = '') {
  return chainForCharacter(env, characterId)[0] ?? '';
}

export function makeLLM(env, onEvent = () => {}) {
  const base = resolveLlmBase(env);
  const key = resolveLlmKey(env);
  const chain = [env.LLM_MODEL, ...(env.LLM_FALLBACK_MODELS || '').split(',')]
    .map((m) => (m || '').trim())
    .filter((m, i, all) => m && all.indexOf(m) === i);
  if (!base || !key || !chain.length) return null;

  // Optional gateway headers, pipe-separated: key:value|key:value
  const extraHeaders = Object.fromEntries(
    (env.LLM_EXTRA_HEADERS || '')
      .split('|')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const split = pair.indexOf(':');
        return split === -1 ? [pair, ''] : [pair.slice(0, split).trim(), pair.slice(split + 1).trim()];
      })
  );

  const maxConcurrent = Math.max(1, Number.parseInt(env.LLM_MAX_CONCURRENT, 10) || 10);
  const limiter = limiterFor(base, maxConcurrent);
  let preferred = null;

  async function acquire() {
    if (limiter.active < limiter.limit) {
      limiter.active++;
      return;
    }
    // Never park a request forever: a wedged upstream rejects and the degradation
    // ladder takes over instead of hanging the SSE stream.
    await new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          limiter.waiters = limiter.waiters.filter((w) => w !== waiter);
          reject(new Error('llm_capacity_timeout'));
        }, ACQUIRE_TIMEOUT_MS),
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

  // Whichever model answered last is tried first next time.
  function orderedModels() {
    if (preferred && chain.includes(preferred)) {
      return [preferred, ...chain.filter((m) => m !== preferred)];
    }
    return chain;
  }

  async function request(model, messages, opts) {
    const controller = new AbortController();
    const firstToken = setTimeout(
      () => controller.abort(new Error('first_token_timeout')),
      FIRST_TOKEN_MS
    );
    const total = setTimeout(
      () => controller.abort(new Error('llm_timeout')),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          ...extraHeaders,
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
      if (!res.ok) throw new Error(`llm_http_${res.status}`);
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

  // Non-streaming call (used by the accusation judge). Returns the text or throws.
  async function complete(messages, opts = {}) {
    await acquire();
    try {
      let lastError;
      for (const model of orderedModels()) {
        try {
          const { res, done } = await request(model, messages, { ...opts, stream: false });
          try {
            const data = await res.json();
            const text = (data?.choices?.[0]?.message?.content ?? '').trim();
            if (!text) throw new Error('llm_empty');
            preferred = model;
            return text;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          onEvent({ type: 'llm_error', model, detail: String(e?.message ?? e) });
        }
      }
      throw lastError ?? new Error('llm_unavailable');
    } finally {
      release();
    }
  }

  // Streaming call. Yields text deltas. Tries the next model only if nothing was
  // yielded yet — mid-answer failover would garble the reply.
  async function* stream(messages, opts = {}) {
    await acquire();
    try {
      let lastError;
      for (const model of orderedModels()) {
        let yielded = false;
        try {
          const { res, firstTokenDone, done } = await request(model, messages, {
            ...opts,
            stream: true,
          });
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
            preferred = model;
            return;
          } finally {
            done();
          }
        } catch (e) {
          lastError = e;
          onEvent({ type: 'llm_error', model, detail: String(e?.message ?? e), yielded });
          if (yielded) throw e;
        }
      }
      throw lastError ?? new Error('llm_unavailable');
    } finally {
      release();
    }
  }

  return { stream, complete, models: chain };
}

// Per-character client: same streaming/failover machinery, but the model
// chain starts with that character's model so 70 concurrent teams each get
// the right voice. Falls back through global + built-in free models.
// Returns null when no base URL + key are configured.
export function makeLLMForCharacter(env = {}, characterId = '', onEvent = () => {}) {
  const chain = chainForCharacter(env, characterId);
  if (!chain.length) return null;
  const scoped = {
    ...env,
    LLM_MODEL: chain[0],
    LLM_FALLBACK_MODELS: chain.slice(1).join(','),
  };
  return makeLLM(scoped, onEvent);
}
