// Minimal service worker: network first, fall back to the last cached copy of
// a page so the dashboard still opens when the NAS is briefly unreachable.
// The sign-in and unlock screens delete this cache (ForgetOfflinePages in
// src/components/app/pwa.tsx), so keep the name in step with it.
const CACHE = 'hud-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || url.pathname.startsWith('/_next/static/'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit ?? (req.mode === 'navigate' ? caches.match('/') : undefined))
          .then((r) => r ?? Response.error()),
      ),
  );
});
