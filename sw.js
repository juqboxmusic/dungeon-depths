// Dungeon Depths — service worker (offline / add-to-home-screen support)
const CACHE = 'dungeon-depths-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/ui.js',
  './js/engine.js',
  './js/game.js',
  './js/dice.js',
  './js/data.js',
  './js/designer.js',
  './js/preview3d.js',
  './js/tokens.js',
  './js/net.js',
  './js/mp.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(APP_SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin files (your code, models, maps): network-first so edits and new
// model files show up immediately, falling back to cache when offline.
// CDN deps (versioned, immutable): cache-first.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = e.request.url.startsWith(self.location.origin);

  if (sameOrigin) {
    e.respondWith(
      // no-cache: always revalidate with the server so code/model edits are
      // never masked by the browser's HTTP cache
      fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        if (res.ok && e.request.url.includes('unpkg.com')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }))
    );
  }
});
