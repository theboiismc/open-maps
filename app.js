// Initialize MapLibre map
const map = new maplibregl.Map({
    container: 'map', // Container id
    style: 'https://tiles.openfreemap.org/styles/liberty', // Default regular style
    center: [0, 0], // Center coordinates
    zoom: 2, // Initial zoom level
    pitch: 0, // Initial pitch
    bearing: 0, // Initial bearing
    dragRotate: true, // Allow map rotation
    touchZoomRotate: true, // Enable touch zoom and rotate
    scrollZoom: true, // Enable scroll zoom
    maxZoom: 18, // Maximum zoom level
    minZoom: 1, // Minimum zoom level
});

// Add navigation controls (zoom + rotation + geolocate) to the bottom right
const navControl = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true,
});
map.addControl(navControl, 'bottom-right');

// Add geolocation control to the bottom right
const geolocateControl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showAccuracyCircle: false,
});
map.addControl(geolocateControl, 'bottom-right');

// Satellite flag
let isSatellite = false;

// Style toggle button functionality
const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

const switchToSatellite = () => {
    map.setStyle('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    isSatellite = true;
    styleIcon.src = 'satelite_style.png'; // Image for satellite view
    styleLabel.textContent = 'Satellite';
    styleToggle.setAttribute('aria-pressed', 'true');
};

const switchToRegular = () => {
    map.setStyle('https://tiles.openfreemap.org/styles/liberty');
    isSatellite = false;
    styleIcon.src = 'default_style.png'; // Image for regular map view
    styleLabel.textContent = 'Regular';
    styleToggle.setAttribute('aria-pressed', 'false');
};

// Set default map style to regular
map.on('load', () => {
    switchToRegular();
});

// Toggle map style on button click
styleToggle.addEventListener('click', () => {
    if (isSatellite) switchToRegular();
    else switchToSatellite();
});

// Directions panel toggle functionality
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

// Open directions panel
function openDirectionsPanel() {
    directionsForm.classList.add('open');
    directionsToggleBtn.setAttribute('aria-pressed', 'true');
}

// Close directions panel
function closeDirectionsPanel() {
    directionsForm.classList.remove('open');
    directionsToggleBtn.setAttribute('aria-pressed', 'false');
}

// Toggle directions panel visibility
directionsToggleBtn.addEventListener('click', () => {
    if (directionsForm.classList.contains('open')) closeDirectionsPanel();
    else openDirectionsPanel();
});

// Close directions panel via close button
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Handle search functionality
const searchInput = document.getElementById('search');
const suggestionsDiv = document.getElementById('suggestions');
const searchIcon = document.getElementById('search-icon');

searchInput.addEventListener('input', function() {
    const query = searchInput.value;

    if (query) {
        // Implement search API (e.g., Nominatim, Photon) here for suggestions
        fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json`)
            .then(response => response.json())
            .then(data => {
                suggestionsDiv.innerHTML = data.map(place => 
                    `<div class="suggestion" data-lat="${place.lat}" data-lon="${place.lon}">${place.display_name}</div>`
                ).join('');
                suggestionsDiv.style.display = 'block';
            });
    } else {
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
    }
});

// Handle suggestion click
suggestionsDiv.addEventListener('click', function(event) {
    const suggestion = event.target;
    if (suggestion.classList.contains('suggestion')) {
        const lat = suggestion.dataset.lat;
        const lon = suggestion.dataset.lon;
        map.flyTo({ center: [lon, lat], zoom: 14 });
        searchInput.value = suggestion.textContent;
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
    }
});

// Handle location button
const locationBtn = document.getElementById('location-btn');
locationBtn.addEventListener('click', function() {
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 14 });
    });
});

// Directions form
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const swapLocationsBtn = document.getElementById('swap-locations');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

// Swap origin and destination inputs
swapLocationsBtn.addEventListener('click', () => {
    const temp = originInput.value;
    originInput.value = destinationInput.value;
    destinationInput.value = temp;
});

// Get route
getRouteBtn.addEventListener('click', () => {
    const origin = originInput.value;
    const destination = destinationInput.value;

    // Call routing API (e.g., OpenRouteService or OSRM)
    fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=YOUR_API_KEY&start=${origin}&end=${destination}`)
        .then(response => response.json())
        .then(data => {
            const route = data.features[0].geometry.coordinates;
            const routeGeoJSON = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: route },
                    properties: { name: 'Route' },
                }]
            };
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#007cbf', 'line-width': 8 },
            });

            // Display route info
            routeInfoDiv.innerHTML = `Estimated Travel Time: ${data.features[0].properties.segments[0].duration} minutes`;
        });
});

// Clear route
clearRouteBtn.addEventListener('click', () => {
    map.removeLayer('route');
    map.removeSource('route');
    routeInfoDiv.innerHTML = '';
});
