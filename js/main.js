import { initAuthUI } from './auth.js';
import { initMap } from './map.js';
import { initSearchPanel } from './searchPanel.js';
import { initSettings } from './settings.js';
import { initMobilePanel } from './mobilePanel.js';

document.addEventListener('DOMContentLoaded', async () => {
    const { currentUser, updateAuthUI } = await initAuthUI();
    const mapStuff = initMap();
    const searchPanel = initSearchPanel(mapStuff);
    initSettings(mapStuff);
    initMobilePanel();

    // TODO: add navigation.js and integrate navigation functions
});
