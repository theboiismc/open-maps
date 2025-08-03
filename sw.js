// sw.js

const CORE_CACHE_NAME = 'theboiismc-maps-core-v1';
const TILE_CACHE_NAME = 'theboiismc-maps-tiles-v1';

const coreAssets = [
  '/',
  '/index.html',
  '/app.js',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
  'https://npmcdn.com/@turf/turf.min.js',
  '/icons512_rounded.png',
  '/icons512_maskable.png'
];

self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CORE_CACHE_NAME).then(cache => {
      console.log('Service Worker: Caching core assets');
      return cache.addAll(coreAssets);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CORE_CACHE_NAME, TILE_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});


self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isMapTileRequest = url.hostname.includes('openfreemap.org') || url.hostname.includes('arcgisonline.com');
  const isApiRequest = url.hostname.includes('nominatim') || url.hostname.includes('project-osrm') || url.hostname.includes('open-meteo');

  if (isMapTileRequest) {
    // Stale-While-Revalidate strategy for map tiles
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
  } else if (isApiRequest) {
    // Network-only for API calls
    event.respondWith(fetch(event.request));
  } else {
    // Cache-first for core app assets
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});
