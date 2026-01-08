importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
    console.log(`Yay! Workbox is loaded 🎉`);

    // 1. CACHE STRATEGY: HTML (The App Shell)
    // Use NetworkFirst: Try to get the latest version from the network. 
    // If offline, fall back to the last cached version.
    workbox.routing.registerRoute(
        ({request}) => request.mode === 'navigate',
        new workbox.strategies.NetworkFirst({
            cacheName: 'pages-cache',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 50,
                }),
            ],
        })
    );

    // 2. CACHE STRATEGY: JS & CSS (Static Assets)
    // Use StaleWhileRevalidate: Load from cache instantly (fast!), 
    // then check network for updates and update the cache for next time.
    workbox.routing.registerRoute(
        ({url}) => url.origin === 'https://static.theboiismc.com',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: 'static-resources',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200], // Handle opaque responses (CORS) safely
                }),
            ],
        })
    );

    // 3. CACHE STRATEGY: Map Tiles (The "Offline Map" magic)
    // Use CacheFirst: Tiles rarely change. Check cache first. 
    // If not there, fetch from network and cache it.
    // We limit this to 1000 tiles or 30 days to prevent bloat.
    workbox.routing.registerRoute(
        ({url}) => url.origin.includes('maptiler.com') || 
                   url.origin.includes('openfreemap.org') ||
                   url.origin.includes('tiles.theboiismc.com'),
        new workbox.strategies.CacheFirst({
            cacheName: 'map-tiles',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200],
                }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 1000, // Adjust based on how much storage you want to use
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                }),
            ],
        })
    );

    // 4. CACHE STRATEGY: Images & Fonts
    workbox.routing.registerRoute(
        ({request}) => request.destination === 'image' || request.destination === 'font',
        new workbox.strategies.CacheFirst({
            cacheName: 'images-fonts',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 60,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                }),
            ],
        })
    );

} else {
    console.log(`Boo! Workbox didn't load 😬`);
}
