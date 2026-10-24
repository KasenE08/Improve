// Improve service worker. Scope is this folder only (/Improve/), set by its location.
// Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'v6';
const PREFIX = 'imp-cache-';            // only caches with this prefix are ever touched
const CACHE = PREFIX + VERSION;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/food.css',
  'css/money.css',
  'css/journal.css',
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
  'js/screens/profile.js',
  'js/levels.js',
  'js/rewards.js',
  'js/stats.js',
  'js/backup.js',
  'js/screens/food.js',
  'js/food/logic.js',
  'js/food/store.js',
  'js/food/import.js',
  'js/food/autocheck.js',
  'js/auto.js',
  'js/planner-auto.js',
  'js/screens/money.js',
  'js/money/logic.js',
  'js/money/store.js',
  'js/money/autocheck.js',
  'js/screens/journal.js',
  'js/journal/store.js',
  'js/journal/autocheck.js',
  'js/planner/planner.js',
  'js/planner/planner.css',
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

// ---- Planner notifications (Web Push from the user's own free notification server) ----
self.addEventListener('push', (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(n.title || 'Improve', {
    body: n.body || '', tag: n.tag, icon: 'assets/app-icons/icon-192.png', data: { taskId: n.taskId },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list[0];
    if (open) {
      if (taskId) open.postMessage({ type: 'open-task', taskId });
      return open.focus();
    }
    return self.clients.openWindow(taskId ? './#planner?task=' + encodeURIComponent(taskId) : './');
  }));
});
