import { initMap } from './map.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize map
    const mapStuff = initMap();

    // Example: traffic toggle (optional)
    // mapStuff.addTrafficLayer();
    // mapStuff.removeTrafficLayer();

    console.log("Map initialized:", mapStuff.map);
});
