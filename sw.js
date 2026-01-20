importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
    console.log(`Workbox is loaded and ready! 🧹`);

    // 1. HTML (App Shell)
    workbox.routing.registerRoute(
        ({request}) => request.mode === 'navigate',
        new workbox.strategies.NetworkFirst({
            cacheName: 'pages-cache',
            plugins: [
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 10,
                    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
                }),
            ],
        })
    );

    // 2. Static Resources (JS/CSS)
    workbox.routing.registerRoute(
        ({url}) => url.origin === 'https://static.theboiismc.com' || 
                   url.pathname.endsWith('.js') || 
                   url.pathname.endsWith('.css'),
        new workbox.strategies.StaleWhileRevalidate({
            cacheName: 'static-resources',
            plugins: [
                new workbox.cacheableResponse.CacheableResponsePlugin({
                    statuses: [0, 200],
                }),
                new workbox.expiration.ExpirationPlugin({
                    maxEntries: 50, 
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                    purgeOnQuotaError: true,
                }),
            ],
        })
    );

    // 3. Map Tiles (OFFLINE STORAGE ENGINE)
    // Critical: Allows storing 15,000 tiles for 1 year.
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
                    maxAgeSeconds: 365 * 24 * 60 * 60, // 1 Year
                    purgeOnQuotaError: true, 
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
                    maxEntries: 100,
                    maxAgeSeconds: 30 * 24 * 60 * 60,
                }),
            ],
        })
    );
} else {
    console.log(`Workbox failed to load`);
}
