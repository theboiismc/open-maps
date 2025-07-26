const CACHE_NAME = 'theboiismc-maps-cache-v2'; // Incremented cache version
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
  'https://npmcdn.com/@turf/turf/turf.min.js', // Cache Turf.js
  '/icons512_rounded.png',
  '/icons512_maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching core files');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Let the browser handle non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Don't cache dynamic API requests
  const isApiRequest = event.request.url.includes('api.open-meteo.com') || 
                       event.request.url.includes('nominatim.openstreetmap.org') || 
                       event.request.url.includes('router.project-osrm.org');

  if (isApiRequest) {
    // For API requests, use a network-first strategy
    event.respondWith(fetch(event.request));
    return;
  }

  // For static assets, use a cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return from cache
        }
        // Not in cache, fetch and cache
        return fetch(event.request).then(
          networkResponse => {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});
