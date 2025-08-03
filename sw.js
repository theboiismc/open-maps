// A name for our cache
const CACHE_NAME = 'theboiismc-maps-cache-v1';

// The list of files to cache on install
const URLS_TO_CACHE = [
    '/index.html',
    '/app.js',
    '/manifest.json',
    // We also cache the external libraries for a full offline experience
    'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
    'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
    'https://npmcdn.com/@turf/turf/turf.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
    // Note: App icons are implicitly cached via the manifest.
    // API calls (like to OSRM or Nominatim) are not cached here as they need to be live.
];

// 1. Install Event: Cache the application shell
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    // waitUntil() ensures that the service worker will not install until the code inside has successfully completed.
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(URLS_TO_CACHE);
            })
            .then(() => {
                console.log('Service Worker: Install complete.');
                // Immediately activate the new service worker
                return self.skipWaiting();
            })
    );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // If the cache name is not our current one, delete it
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all open clients (tabs)
            return self.clients.claim();
        })
    );
});

// 3. Fetch Event: Serve from cache or fetch from network
self.addEventListener('fetch', (event) => {
    // We only want to cache GET requests for our app shell files
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // If the response is in the cache, return it
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // If it's not in the cache, fetch it from the network
                return fetch(event.request);
            })
    );
});
