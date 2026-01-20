importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
    console.log(`Workbox is loaded and ready to clean up your mess! 🧹`);

    // 1. HTML (App Shell) - Keep it fresh
    workbox.routing.registerRoute(
        ({request}) => request.mode === 'navigate',
        new workbox.strategies.NetworkFirst({
            cacheName: 'pages-cache',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 10, // Only keep the last 10 pages visited
                    maxAgeSeconds: 7 * 24 * 60 * 60, // Expire after 7 days
                }),
            ],
        })
    );

    // 2. JS & CSS (Your "Maps1, Maps2" Scenario) - SAFE VERSION
    workbox.routing.registerRoute(
        ({url}) => url.origin === 'https://static.theboiismc.com',
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: 'static-resources',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200],
                }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 20, // Only keep the 20 most recent JS/CSS files
                    maxAgeSeconds: 30 * 24 * 60 * 60, // Delete anything older than 30 days
                    purgeOnQuotaError: true, // If disk is full, delete this cache first
                }),
            ],
        })
    );

    // --- NEW: Cache Heavy CDN Libraries (MapLibre, etc) ---
    workbox.routing.registerRoute(
        ({url}) => url.origin === 'https://unpkg.com' || 
                   url.origin === 'https://cdn.jsdelivr.net' ||
                   url.origin === 'https://storage.googleapis.com',
        new workbox.strategies.CacheFirst({
            cacheName: 'cdn-libraries',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200],
                }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 24 * 60 * 60, // Cache for 60 Days
                    purgeOnQuotaError: true,
                }),
            ],
        })
    );

    // 3. Map Tiles (UPDATED FOR OFFLINE STORAGE)
    // Increases limit to 15,000 tiles and duration to 1 year for persistent offline use.
    workbox.routing.registerRoute(
        ({url}) => url.origin.includes('maptiler.com') || 
                   url.origin.includes('openfreemap.org') ||
                   url.origin.includes('tiles.theboiismc.com'),
        new workbox.strategies.CacheFirst({
            cacheName: 'offline-map-tiles',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200],
                }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 15000, 
                    maxAgeSeconds: 365 * 24 * 60 * 60, // Keep tiles for 1 Year
                    purgeOnQuotaError: true, // Delete tiles if phone needs space
                }),
            ],
        })
    );

    // 4. Images/Fonts
    workbox.routing.registerRoute(
        ({request}) => request.destination === 'image' || request.destination === 'font',
        new workbox.strategies.CacheFirst({
            cacheName: 'images-fonts',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 50,
                    maxAgeSeconds: 30 * 24 * 60 * 60,
                }),
            ],
        })
    );

} else {
    console.log(`Workbox failed to load`);
}
