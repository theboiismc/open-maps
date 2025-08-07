const CACHE_NAME = 'theboiismc-maps-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/callback.html',
  '/callback.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon512_rounded.png',
  '/icon512_maskable.png',
  'https://cdn.jsdelivr.net/npm/oidc-client-ts@2.2.0/dist/browser/oidc-client-ts.min.js',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
  'https://unpkg.com/@turf/turf@6.5.0/turf.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('https://accounts.theboiismc.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
