const CACHE_NAME = 'theboiismc-maps-cache-v4'; // Updated version

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/assets/icon512_rounded.png', // Ensure this image exists on your server
  
  // Static Resources from your static server
  'https://static.theboiismc.com/css/maplibre-gl-4.1.0.css',
  'https://static.theboiismc.com/css/map2.css',
  'https://static.theboiismc.com/js/maps/maplibre-gl-4.1.0.js',
  'https://static.theboiismc.com/js/maps/turf.js',
  'https://static.theboiismc.com/js/maps/maps17.js'
];

// Install event - cache all resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Stale-While-Revalidate strategy
self.addEventListener('fetch', event => {
  // Skip cross-origin authentication requests or non-GET requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('https://accounts.theboiismc.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Valid response check
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }

        // Update cache with new version
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback logic could go here
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
