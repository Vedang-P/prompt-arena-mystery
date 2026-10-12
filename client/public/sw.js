/* Prompt Arena asset cache.
   Static game assets (models, textures, HDRs, music, fonts) are kept in
   a build-versioned Cache Storage bucket so room switches and repeat visits
   never re-download them. The version comes from the registration URL, so each
   deployment starts a fresh cache and old buckets are deleted on activation.
   /api/* is never touched; navigation and app shells stay network-fresh. */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `pa-assets-${VERSION}`;
const MAX_ENTRIES = 900;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('pa-assets-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

const isAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/'));

async function cachePut(cache, request, response) {
  await cache.put(request, response);
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(key);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Range requests (audio/video seeking) are left to the browser and HTTP cache.
  if (request.headers.has('range')) return;
  const url = new URL(request.url);
  if (!isAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cachePut(cache, request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const fallback = await cache.match(request);
        if (fallback) return fallback;
        throw error;
      }
    })()
  );
});
