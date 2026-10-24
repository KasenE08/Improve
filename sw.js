// Improve service worker. Scope is this folder only (/Improve/), set by its location.
// Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'v1';
const PREFIX = 'imp-cache-';            // only caches with this prefix are ever touched
const CACHE = PREFIX + VERSION;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'assets/css/tokens.css',
  'assets/css/components.css',
  'assets/icons/icons.svg',
  'assets/fonts/silkscreen-latin-400-normal.woff2',
  'assets/fonts/silkscreen-latin-700-normal.woff2',
  'assets/fonts/vt323-latin-400-normal.woff2',
  'assets/app-icons/icon-192.png',
  'assets/app-icons/icon-512.png',
  'assets/app-icons/apple-touch-icon.png',
  'js/app.js',
  'js/dates.js',
  'js/store.js',
  'js/defaults.js',
  'js/habits.js',
  'js/ui.js',
  'js/screens/today.js',
  'js/screens/other.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.href.startsWith(self.registration.scope)) return; // never handle other apps' requests

  if (req.mode === 'navigate') {
    const scopePath = new URL(self.registration.scope).pathname;
    if (url.pathname === scopePath || url.pathname === scopePath + 'index.html') {
      // App page: cached copy so it opens offline instantly
      event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    } else {
      // Other pages in the folder (design samples, style guide): network first
      event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true })));
    }
    return;
  }

  // Everything else: cache first, then network (and remember it)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
