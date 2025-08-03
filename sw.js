// A name for our cache
const CACHE_NAME = 'theboiismc-maps-cache-v4'; // Incremented version to force update

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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Smartly serve from cache or network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // For app shell files, use a Cache First strategy.
    // We check if the request URL is one of our cached assets.
    if (APP_SHELL_URLS.some(appUrl => url.href.endsWith(appUrl))) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                return cachedResponse || fetch(event.request);
            })
        );
        return;
    }
    
    // For all other requests (API calls, map tiles), go Network First.
    // This ensures the map and any API data is always fresh.
    event.respondWith(fetch(event.request));
});
