/* ========= INIT ========= */
import { initMap } from './map.js';
import { loadPlaces } from './data.js';

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadPlaces();
});

