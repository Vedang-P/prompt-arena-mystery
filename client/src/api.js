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

export const login = (code) =>
  fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(json);

export const getState = () => fetch('/api/state').then(json);

export const discoverClue = (id) =>
  fetch(`/api/clues/${id}/discover`, { method: 'POST' }).then(json);

export const getHistory = (id) => fetch(`/api/characters/${id}/history`).then(json);

export const accuse = (payload) =>
  fetch('/api/accuse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(json);

export async function interrogate(character, text, { onDelta, onReset, onDone } = {}) {
  const res = await fetch('/api/interrogate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ character, text }),
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
