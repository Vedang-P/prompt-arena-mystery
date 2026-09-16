// Provider adapter for any OpenAI-compatible /chat/completions endpoint.
// Streaming with model failover and a global concurrency cap.
// Plain fetch + AbortController, so it runs in Workers and in Node tests alike.

const FIRST_TOKEN_MS = 12000;
const DEFAULT_TIMEOUT_MS = 60000;

export function makeLLM(env, onEvent = () => {}) {
  const base = (env.LLM_BASE_URL || '').replace(/\/+$/, '');
  const key = env.LLM_API_KEY;
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

  const maxConcurrent = Number(env.LLM_MAX_CONCURRENT || 10);
  let active = 0;
  const waiters = [];
  let preferred = null;

  async function acquire() {
    if (active < maxConcurrent) {
      active++;
      return;
    }
    await new Promise((resolve) => waiters.push(resolve));
    active++;
  }

  function release() {
    active--;
    const next = waiters.shift();
    if (next) next();
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
