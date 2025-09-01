/* ========= INIT ========= */
import { initMap } from './map.js';
import { loadPlaces } from './data.js';
import './theme.js'; // ensure theme loads
import './auth.js';  // load auth config if needed

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadPlaces();
});
