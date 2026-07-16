/* Tajergrow OMS — Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS, assets): Cache-first, update in background (stale-while-revalidate)
 *   - /api/* requests: Network-first (fresh data always)
 *   - Navigation requests: Serve cached index.html (SPA fallback)
 */

const CACHE_VERSION = 'tajergrow-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const APP_SHELL = [
  '/',
  '/src/main.tsx',
];

// ── Install: pre-cache the bare minimum ─────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(['/'])
        .catch(err => console.warn('[SW] Pre-cache partial failure:', err))
    )
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('tajergrow-') && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 2. API requests → Network-first (never serve stale API data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 3. Navigation requests → SPA shell (serve cached '/' on miss)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // 4. Static assets (JS, CSS, images, fonts) → Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache    = await caches.open(DYNAMIC_CACHE);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('', { status: 504 });
}
