// Initialize MapLibre map
const map = new maplibre.gl.Map({
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

// Photon search setup for suggestions
const photonUrl = "https://photon.komoot.io/api/?q=";

async function photonSearch(query) {
    if (!query) return [];
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

// Helper function to render suggestions
function clearSuggestions(container) {
    container.innerHTML = '';
}

function renderSuggestions(container, results, inputEl) {
    clearSuggestions(container);
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
            inputEl.value = div.textContent;
            inputEl.dataset.lon = div.dataset.lon;
            inputEl.dataset.lat = div.dataset.lat;
            clearSuggestions(container);
            if (inputEl.id === 'search') {
                map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
            }
            // After selecting, check if both fields have values to show the route button
            if(originInput.dataset.lon && destinationInput.dataset.lon) {
                routeActions.style.display = 'block';
            }
        });
        div.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                div.click();
                inputEl.focus();
            }
        });
        container.appendChild(div);
    });
}

// Debounce for search input to limit API calls
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// Setup search input for suggestions
function setupSearch(inputEl, suggestionsEl) {
    inputEl.addEventListener('input', debounce(async () => {
        const query = inputEl.value.trim();
        if (!query) {
            clearSuggestions(suggestionsEl);
            return;
        }
        const results = await photonSearch(query);
        renderSuggestions(suggestionsEl, results, inputEl);
    }, 300));
}

// Elements for search bars
const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

// Initialize search for all input fields
setupSearch(searchInput, searchSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Handle location button
const locationBtn = document.getElementById('location-btn');
locationBtn.addEventListener('click', function() {
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 14 });
    });
});

// Directions form
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
    const originLon = parseFloat(originInput.dataset.lon);
    const originLat = parseFloat(originInput.dataset.lat);
    const destLon = parseFloat(destinationInput.dataset.lon);
    const destLat = parseFloat(destinationInput.dataset.lat);

    if (isNaN(originLon) || isNaN(originLat) || isNaN(destLon) || isNaN(destLat)) {
        alert("Please select valid origin and destination from suggestions.");
        return;
    }

    // Call routing API (e.g., OpenRouteService or OSRM)
    fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=YOUR_API_KEY&start=${originLon},${originLat}&end=${destLon},${destLat}`)
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
