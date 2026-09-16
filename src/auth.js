// Team codes and sessions. WebCrypto only, so it runs in Workers and Node alike.

const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64url(new Uint8Array(signature));
}

export async function hashCode(code, pepper) {
  const normalized = String(code).trim().toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${pepper}:${normalized}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_HOURS = 12;

export async function createSession(teamId, secret = 'dev-secret') {
  const payload = b64url(
    enc.encode(JSON.stringify({ t: teamId, exp: Date.now() + SESSION_HOURS * 3600 * 1000 }))
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function readSession(token, secret = 'dev-secret') {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if ((await hmac(secret, payload)) !== signature) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.exp > Date.now() ? data.t : null;
  } catch {
    return null;
  }
}
