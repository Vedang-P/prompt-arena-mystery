// Production-only asset cache. Development deliberately skips it so hotfixes
// are never served from a stale bucket.
export function registerAssetCache() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(__BUILD__)}`)
      .catch(() => {});
  });
}
