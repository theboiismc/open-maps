// Initialize MapLibre
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [0, 0],
    zoom: 2,
    pitch: 0,
    bearing: 0,
    dragRotate: true,
    touchZoomRotate: true,
    scrollZoom: true,
    maxZoom: 18,
    minZoom: 1
});

// Regular and Satellite Layer Setup
let satelliteLayerAdded = false; // Track if satellite layer is added
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

// Function to add Satellite Layer
const addSatelliteLayer = () => {
    if (!satelliteLayerAdded) {
        map.addSource('satellite', {
            type: 'raster',
            tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256
        });
        map.addLayer({
            id: 'sat-layer',
            type: 'raster',
            source: 'satellite',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 0.8 }
        });
        satelliteLayerAdded = true;
    }
};

// Switch map to Satellite View
const switchToSatellite = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    satelliteToggle.classList.add('active');
    regularToggle.classList.remove('active');
};

// Switch map to Regular View
const switchToRegular = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    regularToggle.classList.add('active');
    satelliteToggle.classList.remove('active');
};

// Add Satellite Layer when map loads
map.on('load', () => {
    addSatelliteLayer(); // Ensure satellite layer is available
    switchToRegular();   // Default to Regular view on load
});

// Handle Regular and Satellite button clicks
satelliteToggle.onclick = () => { switchToSatellite(); }; // Switch to Satellite view
regularToggle.onclick = () => { switchToRegular(); };   // Switch to Regular view

// Search Bar DOM references
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');

// Helper for Nominatim search
async function nominatimSearch(query) {
    if (!query) return [];
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    return res.json();
}

// Clear the suggestion box
function clearSuggestions(container) {
    container.innerHTML = ''; // Clear all suggestions
}

// Render suggestions in the box
function renderSuggestions(container, results) {
    clearSuggestions(container);
    if (results.length === 0) return; // Don't show anything if no results
    results.forEach((place, i) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = place.display_name;
        div.tabIndex = 0; // Make it focusable
        div.dataset.lon = place.lon; // Store longitude
        div.dataset.lat = place.lat; // Store latitude
        div.dataset.idx = i; // Store index for identification
        container.appendChild(div);
    });
}

// Listen for user input in the search field
searchInput.addEventListener('input', async e => {
    const q = e.target.value.trim(); // Trim the input for clean data
    if (!q) {
        clearSuggestions(suggestionsBox); // Clear suggestions if input is empty
        return;
    }
    const results = await nominatimSearch(q); // Get suggestions from Nominatim API
    renderSuggestions(suggestionsBox, results); // Render the suggestions
});

// Handle click event on suggestions
suggestionsBox.addEventListener('click', e => {
    const idx = e.target.dataset.idx;
    if (idx == null) return; // If no suggestion clicked, do nothing
    const selectedPlace = e.target.textContent;
    const selectedLatLon = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];
    searchInput.value = selectedPlace; // Set the selected place to the search input
    map.flyTo({ center: selectedLatLon, zoom: 14 }); // Fly to the selected place on the map
    sidebar.classList.add('open');
    sidebar.hidden = false; // Optionally, show sidebar with place info
    // Set place info or handle as per your app structure
});

// Close suggestions when clicking outside of them
document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        clearSuggestions(suggestionsBox);
    }
});

// Close sidebar when clicking the close button
sidebarCloseBtn.addEventListener('click', () => {
    sidebar.classList.remove('open');
});

// Directions Panel Toggle
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');

// Toggle Directions Form visibility
directionsToggle.addEventListener('click', () => {
    directionsForm.classList.toggle('hidden');
});

// Directions Handling (Placeholders for route generation)
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

// Handle "Get Route" button click
getRouteBtn.addEventListener('click', () => {
    const origin = originInput.value;
    const destination = destinationInput.value;
    if (origin && destination) {
        console.log(`Get route from ${origin} to ${destination}`);
    }
});

// Clear route information
clearRouteBtn.addEventListener('click', () => {
    originInput.value = '';
    destinationInput.value = '';
    console.log('Route cleared');
});
