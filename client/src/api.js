// AbortSignal.timeout is missing on older Safari/webviews; without a fallback
// every request would throw synchronously and the game could never start there.
const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('timeout')), ms);
  return controller.signal;
};

const request = (url, { timeout = 65000, ...options } = {}) => fetch(url, { ...options, headers: { ...(options.headers ?? {}), ...(localStorage.getItem('moon-mode') === 'practice' ? { 'x-game-mode': 'practice' } : {}) }, signal: options.signal ?? timeoutSignal(timeout) });

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // One place notices a dead session: the app shows the sign-in screen again
    // instead of leaving every action to fail with a generic message.
    if (res.status === 401) {
      try { window.dispatchEvent(new Event('pa-session-expired')); } catch {}
    }
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

export const getHistory = (id, timeout = 65000) => request(`/api/characters/${id}/history`, { timeout }).then(json);

export const accuse = (payload) =>
  request('/api/accuse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(json);

export async function interrogate(character, text, { onDelta, onReset, onDone, reqId } = {}) {
  // The server caps a live turn at ~10s and then streams the authored reply,
  // so the interview always closes quickly; this budget only covers a
  // genuinely dead connection.
  const res = await request('/api/interrogate', {
    method: 'POST',
    timeout: 20000,
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

// Reopens the case from Act 0; after an ending, `'recent'` resumes at the act
// the run ended on with the prior acts' evidence for a heavier penalty. The
// event clock keeps running either way.
export const restartRun = (from = 'act0') =>
  request('/api/restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from }),
  }).then(json);

// Fullscreen enforcement: every leave/return is reported; the server owns the
// grace window and the strike count.
export const fullscreenExit = (kind) =>
  request('/api/fullscreen/exit', {
    method: 'POST',
    timeout: 10000,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).then(json);

export const fullscreenReturn = () => request('/api/fullscreen/return', { method: 'POST', timeout: 10000 }).then(json);

export const fullscreenUnsupported = () => request('/api/fullscreen/unsupported', { method: 'POST', timeout: 10000 }).then(json);

export const heartbeat = (fullscreen = false) =>
  request('/api/heartbeat', {
    method: 'POST',
    timeout: 10000,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullscreen: !!fullscreen }),
  }).then(json);

// The ending screen's feedback form: the server stores it permanently.
export const sendFeedback = (message) =>
  request('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  }).then(json);

// Developer sandbox: available only to the dev team session (DEV_TEAM_CODE).
export const devCatalog = () => request('/api/dev/catalog', { cache: 'no-store' }).then(json);
export const devAct = (act) =>
  request('/api/dev/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act }) }).then(json);
export const devRoom = (room) =>
  request('/api/dev/room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room }) }).then(json);
export const devToggle = (kind, id, on) =>
  request('/api/dev/toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id, on }) }).then(json);
export const devBulk = (mode) =>
  request('/api/dev/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) }).then(json);
export const devReset = () => request('/api/dev/reset', { method: 'POST' }).then(json);
export const devPenalties = (value) =>
  request('/api/dev/penalties', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) }).then(json);
