// Initialize MapLibre map
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

// Add navigation controls (zoom + rotation + geolocate) bottom right
const navControl = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true,
});
map.addControl(navControl, 'bottom-right');

const geolocateControl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showAccuracyCircle: false,
});
map.addControl(geolocateControl, 'bottom-right');

// Elements
const searchInput = document.getElementById('search');
const searchIcon = document.getElementById('search-icon');
const directionsIcon = document.getElementById('directions-icon');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

// Directions toggle
function openDirectionsPanel() {
    directionsForm.classList.add('open');
    styleToggle.style.left = '370px'; // Adjust position based on panel width
}

function closeDirectionsPanel() {
    directionsForm.classList.remove('open');
    styleToggle.style.left = '20px';
}

// Search functionality
async function photonSearch(query) {
    if (!query) return [];
    const photonUrl = "https://photon.komoot.io/api/?q=";
    try {
        const res = await fetch(`${photonUrl}${encodeURIComponent(query)}&limit=5`);
        if (!res.ok) throw new Error("Photon request failed");
        const data = await res.json();
        return data.features || [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

function renderSuggestions(container, results) {
    container.innerHTML = ''; // clear previous suggestions
    if (!results.length) return;
    results.forEach(feature => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = feature.properties.name +
            (feature.properties.state ? ', ' + feature.properties.state : '') +
            (feature.properties.country ? ', ' + feature.properties.country : '');
        div.tabIndex = 0;
        div.dataset.lon = feature.geometry.coordinates[0];
        div.dataset.lat = feature.geometry.coordinates[1];
        div.addEventListener('click', () => {
            searchInput.value = div.textContent;
            searchInput.dataset.lon = div.dataset.lon;
            searchInput.dataset.lat = div.dataset.lat;
            map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
            openDirectionsPanel();
        });
        container.appendChild(div);
    });
}

searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    const results = await photonSearch(query);
    renderSuggestions(document.getElementById('suggestions'), results);
});

// Open directions panel
directionsIcon.addEventListener('click', () => {
    openDirectionsPanel();
});

// Close directions panel
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Map style toggle
let isSatellite = false;

function switchToSatellite() {
    map.setStyle('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    styleIcon.src = 'satelite_style.png';
    styleLabel.textContent = 'Satellite';
    isSatellite = true;
    styleToggle.setAttribute('aria-pressed', 'true');
}

function switchToRegular() {
    map.setStyle('https://tiles.openfreemap.org/styles/liberty');
    styleIcon.src = 'default_style.png';
    styleLabel.textContent = 'Regular';
    isSatellite = false;
    styleToggle.setAttribute('aria-pressed', 'false');
}

styleToggle.addEventListener('click', () => {
    if (isSatellite) switchToRegular();
    else switchToSatellite();
});

// Optional: click on map to set origin if empty
map.on('click', (e) => {
    if (!searchInput.value) {
        searchInput.value = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        searchInput.dataset.lon = e.lngLat.lng;
        searchInput.dataset.lat = e.lngLat.lat;
    }
});

// Add default style layer on map load
map.on('load', () => {
    switchToRegular();
});
