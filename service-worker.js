const CACHE_VERSION = 'voiceeval-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './js/app.js',
  './js/i18n.js',
  './js/utils.js',
  './js/db.js',
  './js/state.js',
  './js/recorder.js',
  './js/photo.js',
  './js/transcription.js',
  './js/summary.js',
  './js/sync.js',
  './js/zip.js',
  './js/screens/home.js',
  './js/screens/identification.js',
  './js/screens/config.js',
  './js/screens/capture.js',
  './js/screens/pending.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GET requests, network fallback with runtime caching.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
