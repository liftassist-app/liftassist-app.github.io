const CACHE_NAME = 'gg-powerlifting-pwa-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Never intercept live auth or database sync calls
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebaseapp.com',
  'firebaseio.com',
  'apis.google.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h))) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isAppEntryHtml = isSameOrigin && (
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  );

  // Network-First strictly for same-origin main app HTML so GitHub Pages updates appear immediately when online,
  // while never poisoning ./index.html with unrelated HTML pages (e.g., local preview files).
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav && isAppEntryHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {})
            );
          }
          return res;
        })
        .catch(() =>
          caches.match('./index.html')
            .then((cached) => cached || caches.match('./'))
            .then((fallback) => fallback || new Response('Offline — reload once connected.', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }))
        )
    );
    return;
  }

  // Stale-While-Revalidate for static assets & CDNs (Tailwind, Chart.js, Firebase SDK, fonts, icons)
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {})
            );
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503, statusText: 'Offline' }));
      if (cached) {
        event.waitUntil(networkFetch.catch(() => {}));
        return cached;
      }
      return networkFetch;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
