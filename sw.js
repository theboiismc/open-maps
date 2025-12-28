const CACHE_NAME = 'theboiismc-maps-core-v5'; // Increment this to force update app shell
const TILE_CACHE_NAME = 'theboiismc-map-tiles-v1'; // Separate bucket for heavy tiles

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/assets/icon512_rounded.png',
  
  // Static Resources
  'https://static.theboiismc.com/css/maplibre-gl-4.1.0.css',
  'https://static.theboiismc.com/css/map2.css',
  'https://static.theboiismc.com/js/maps/maplibre-gl-4.1.0.js',
  'https://static.theboiismc.com/js/maps/turf.js',
  'https://static.theboiismc.com/js/maps/mapsv.js'
];

// 1. Install - Cache App Shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened core cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate - Cleanup Old Caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== TILE_CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch - Smart Strategies
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // A. IGNORE: Cross-origin Auth & Non-GET
  if (event.request.method !== 'GET' || url.hostname === 'accounts.theboiismc.com') {
    return;
  }

  // B. MAP TILES STRATEGY: Cache First, falling back to Network
  // Detects: .pbf (vector tiles), .png/.jpg (raster/satellite), fonts (.pbf), and styles (.json)
  const isMapAsset = (
    url.hostname.includes('maptiler') || 
    url.hostname.includes('openfreemap') || 
    url.hostname.includes('tiles.theboiismc.com')
  ) && (
    url.pathname.endsWith('.pbf') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.json') ||
    url.pathname.includes('/font/')
  );

  if (isMapAsset) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          // 1. Return Cache if found (Fastest)
          if (cachedResponse) {
            return cachedResponse;
          }

          // 2. Fetch from Network if missing
          return fetch(event.request).then(networkResponse => {
            // Validate response before caching
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
              return networkResponse;
            }

            // Cache the new tile
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => {
             // Optional: Return a transparent placeholder image if offline and tile missing
          });
        });
      })
    );
    return;
  }

  // C. APP SHELL STRATEGY: Stale-While-Revalidate
  // Loads cache immediately, but updates in background for next time
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }
        
        // Put in Core Cache
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
