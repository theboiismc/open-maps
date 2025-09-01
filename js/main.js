import { initAuthUI } from './auth.js';
import { initMap } from './map.js';
import { initSearchPanel } from './searchPanel.js';
import { initSettings } from './settings.js';
import { initMobilePanel } from './mobilePanel.js';
import { initNavigation } from './navigation.js';

document.addEventListener('DOMContentLoaded', async () => {
    const { currentUser, updateAuthUI } = await initAuthUI();
    const mapStuff = initMap();
    const searchPanel = initSearchPanel(mapStuff);
    initSettings(mapStuff);
    initMobilePanel();

    const navigation = initNavigation({ map: mapStuff.map });

    // Example usage: start a route (replace with actual route data)
    const sampleRoute = {
        steps: [
            { maneuver: { location: [39.0, -95.0] } },
            { maneuver: { location: [39.1, -94.9] } },
        ]
    };
    // navigation.startNavigation(sampleRoute);

    // Stop navigation: navigation.stopNavigation();
});
