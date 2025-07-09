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

// Geolocation Control
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'bottom-right');

// Satellite Layer Toggle
let satVisible = false;
map.on('load', () => {
    map.addSource('satellite', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256
    });
    map.addLayer({
        id: 'sat-layer',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.8 }
    });
});

// Handle layer toggle for Satellite view
const satelliteToggle = document.getElementById('satellite-toggle');
satelliteToggle.onclick = () => {
    satVisible = !satVisible;
    map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
    satelliteToggle.classList.toggle('active', satVisible);
};

// Handle layer toggle for Regular view
const regularToggle = document.getElementById('regular-toggle');
regularToggle.onclick = () => {
    map.setStyle('https://tiles.openfreemap.org/styles/liberty');
    regularToggle.classList.add('active');
    satelliteToggle.classList.remove('active');
};

// Dark Mode Toggle
const darkToggle = document.getElementById('dark-toggle');
darkToggle.onclick = () => {
    document.body.classList.toggle('dark-mode');
};

// Search functionality for main search bar
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');

// Helper for Nominatim search
async function nominatimSearch(query) {
    if (!query) return [];
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    return res.json();
}

// Clear suggestions
function clearSuggestions(container) {
    container.innerHTML = '';
}

// Render suggestions
function renderSuggestions(container, results) {
    clearSuggestions(container);
    if (results.length === 0) return;

    results.forEach((place, i) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = place.display_name;
        div.tabIndex = 0;
        div.dataset.lon = place.lon;
        div.dataset.lat = place.lat;
        div.dataset.idx = i;
        container.appendChild(div);
    });
}

// Handle user input in the search field
searchInput.addEventListener('input', async e => {
    const q = e.target.value.trim();
    if (!q) {
        clearSuggestions(suggestionsBox);
        return;
    }
    const results = await nominatimSearch(q);
    renderSuggestions(suggestionsBox, results);
});

// Handle click event on suggestion
suggestionsBox.addEventListener('click', e => {
    const idx = e.target.dataset.idx;
    if (idx == null) return;

    const selectedPlace = e.target.textContent;
    const selectedLatLon = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];
    searchInput.value = selectedPlace;
    map.flyTo({ center: selectedLatLon, zoom: 14 });
    sidebar.classList.add('open');
    sidebar.hidden = false;
});

// Close suggestions when clicking outside
document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        clearSuggestions(suggestionsBox);
    }
});
