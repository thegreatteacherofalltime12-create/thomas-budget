// Thomas Budget service worker: makes the site installable, keeps the app shell available offline,
// and lets the page offer an "Update" button when a new version is deployed.
// VERSION is stamped by deploy.js on every deploy so browsers notice the change.
const VERSION = '20261003T2101';
const CACHE = 'thomas-budget-' + VERSION;
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); }); // no skipWaiting: the page asks first
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stale-while-revalidate: answer from this device's copy straight away (no waiting on the network to open the
// app), and fetch the fresh copy in the background for next time. A new deploy still arrives through the
// Update button, which swaps in the new service worker and its freshly cached shell.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('/') : null);
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); return res; });
    if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh; // nothing saved yet: the network it is
  })());
});
