// Eigentümer: E – Service Worker (docs/ARCHITEKTUR.md §8, §9). Klassisches Skript, kein Modul.
// VERSION muss gleich js/version.js sein; bei jedem Deploy erhöhen.
const VERSION = '1.0.1';
const PREFIX = 'elo-duell-';
const CACHE = PREFIX + VERSION;

// Genau ein String pro Zeile (wird von tests/unit/precache.test.mjs geparst).
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/compare.css',
  './css/duel.css',
  './css/lists.css',
  './css/pwa.css',
  './css/ranking.css',
  './css/settings.css',
  './css/share.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/app.js',
  './js/data/backup.js',
  './js/data/schema.js',
  './js/data/store.js',
  './js/logic/compare.js',
  './js/logic/elo.js',
  './js/logic/pairing.js',
  './js/logic/stability.js',
  './js/logic/text.js',
  './js/pwa.js',
  './js/router.js',
  './js/share/codec.js',
  './js/share/qr.js',
  './js/share/scanner.js',
  './js/types.js',
  './js/ui.js',
  './js/version.js',
  './js/views/compare.js',
  './js/views/duel.js',
  './js/views/home.js',
  './js/views/import.js',
  './js/views/list-edit.js',
  './js/views/list.js',
  './js/views/ranking.js',
  './js/views/scan.js',
  './js/views/settings.js',
  './js/views/share.js',
  './vendor/jsQR.js',
  './vendor/qrcode-generator.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((r) => r || fetch(req)));
});
