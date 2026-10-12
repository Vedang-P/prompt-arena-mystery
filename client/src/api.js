const request = (url, { timeout = 65000, ...options } = {}) => fetch(url, { ...options, headers: { ...(options.headers ?? {}), ...(localStorage.getItem('moon-mode') === 'practice' ? { 'x-game-mode': 'practice' } : {}) }, signal: AbortSignal.timeout(timeout) });

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || res.statusText);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const getAuthConfig = () => request('/api/auth/config').then(json);

// Team-code sign-in: local development only (bridged for the login form when
// the deployment enables ALLOW_CODE_LOGIN).
export const devLogin = (code) =>
  request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(json);

export const getState = () => request('/api/state', { cache: 'no-store' }).then(json);

export const startGuest = () => request('/api/guest', { method: 'POST' }).then(json);

export const completeAct = (act) =>
  request('/api/act/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ act }),
  }).then(json);

export const discoverClue = (id) =>
  request(`/api/clues/${id}/discover`, { method: 'POST' }).then(json);

export const solvePuzzle = (id, answer) =>
  request(`/api/puzzles/${id}/solve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  }).then(json);

export const getHistory = (id) => request(`/api/characters/${id}/history`).then(json);

export const accuse = (payload) =>
  request('/api/accuse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(json);

export async function interrogate(character, text, { onDelta, onReset, onDone, reqId } = {}) {
  // The server may walk its whole failover chain (12s first token + up to 60s per model),
  // so this call gets a wider budget than ordinary requests.
  const res = await request('/api/interrogate', {
    method: 'POST',
    timeout: 150000,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ character, text, reqId }),
  });
  if (!res.ok || !res.body) throw await json(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        let data = {};
        try {
          data = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (event === 'delta') onDelta?.(data.text);
        else if (event === 'reset') onReset?.(data.text);
        else if (event === 'done') onDone?.(data);
      } else if (line === '') event = 'message';
    }
  }
}

export const startPractice = (act) => request('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act }) }).then(json);

// Reopens the case from Act 0 with a penalty; the event clock keeps running.
export const restartRun = () => request('/api/restart', { method: 'POST' }).then(json);
