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
  './js/preload.js',
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

// Same-origin code (js/css/html/manifests): network-first so edits show up
// immediately, falling back to cache when offline.
// Heavy drop-in assets (3D models, floor art, map art): cache-first with a
// background refresh — GitHub Pages resets every file's ETag on each deploy,
// so revalidating multi-MB GLBs would re-download them all after every code
// push. Serving from cache keeps joins instant; the silent refresh means a
// genuinely changed model appears on the next visit.
// (Dev servers stay network-first so local model edits are never masked.)
// CDN deps (versioned, immutable): cache-first.
const ASSET_RE = /\/(models|floor-textures|maps|icons)\//;
const IS_DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const isHeavyAsset = (url) => {
  const path = new URL(url).pathname;
  return ASSET_RE.test(path) && !path.endsWith('.json'); // manifests stay fresh
};

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = e.request.url.startsWith(self.location.origin);

  if (sameOrigin && !IS_DEV && isHeavyAsset(e.request.url)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const refresh = fetch(e.request, { cache: 'no-cache' })
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          });
        if (cached) e.waitUntil(refresh.catch(() => {}));
        return cached || refresh;
      })
    );
    return;
  }

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
