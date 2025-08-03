// A name for our cache
const CACHE_NAME = 'theboiismc-maps-cache-v3'; // Incremented version to force update

// The list of core files to cache on install
const APP_SHELL_URLS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
    'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
    'https://npmcdn.com/@turf/turf/turf.min.js'
];

// Install Event: Cache the application shell
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(APP_SHELL_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Smartly serve from cache or network
self.addEventListener('fetch', (event) => {
    // For app shell files, use a Cache First strategy
    const isAppShellUrl = APP_SHELL_URLS.some(url => event.request.url.endsWith(url));
    if (isAppShellUrl) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                return cachedResponse || fetch(event.request);
            })
        );
        return;
    }
    
    // For all other requests (API calls, map tiles), go Network Only.
    // This ensures the map and any API data is always fresh.
    event.respondWith(fetch(event.request));
});
