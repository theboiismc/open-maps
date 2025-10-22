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
  
  // Local resources as specified in your HTML
  '/libs/css/maplibre-gl-4.1.0.css',
  '/libs/css/styles.css',
  '/libs/js/maplibre-gl-4.1.0.js',
  '/libs/js/turf-6.5.0.min.js',

// Install event - cache all resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - remove old caches if they don't match the current CACHE_NAME
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

// Fetch event - serve cached content first, then try network if not cached
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
