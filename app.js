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
let satelliteLayerAdded = false;
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

// Add Satellite Layer
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

const switchToSatellite = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    satelliteToggle.classList.add('active');
    satelliteToggle.setAttribute('aria-pressed', 'true');
    regularToggle.classList.remove('active');
    regularToggle.setAttribute('aria-pressed', 'false');
};

const switchToRegular = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    regularToggle.classList.add('active');
    regularToggle.setAttribute('aria-pressed', 'true');
    satelliteToggle.classList.remove('active');
    satelliteToggle.setAttribute('aria-pressed', 'false');
};

map.on('load', () => {
    addSatelliteLayer();
    switchToRegular();
});

satelliteToggle.onclick = () => { switchToSatellite(); };
regularToggle.onclick = () => { switchToRegular(); };

// Search Inputs and Suggestions
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

// Directions controls
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

directionsToggle.addEventListener('click', () => {
    directionsForm.classList.toggle('hidden');
});

// Debounce helper
function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// Clear suggestions helper
function clearSuggestions(container) {
    container.innerHTML = '';
    container.style.display = 'none';
}

// Show loading message in suggestions container
function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading...</div>';
    container.style.display = 'block';
}

// Show error message in suggestions container
function showError(container, message = 'No results found') {
    container.innerHTML = `<div class="error">${message}</div>`;
    container.style.display = 'block';
}

// Render suggestions in container
function renderSuggestions(results, container, inputElement) {
    clearSuggestions(container);
    if (results.length === 0) {
        showError(container, 'No results found');
        return;
    }
    results.forEach((feature, i) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        const placeName = feature.properties.name || feature.properties.street || 'Unknown place';
        const city = feature.properties.city || feature.properties.town || '';
        const state = feature.properties.state || '';
        const country = feature.properties.country || '';
        // Compose a friendly display name
        const displayName = [placeName, city, state, country].filter(Boolean).join(', ');
        div.textContent = displayName;
        div.tabIndex = 0;
        // Store coordinates as floats
        div.dataset.lon = feature.geometry.coordinates[0];
        div.dataset.lat = feature.geometry.coordinates[1];
        div.dataset.idx = i;
        container.appendChild(div);

        // Keyboard accessibility: allow Enter key to select suggestion
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                div.click();
            }
        });

        // Click handler sets input value and recenters map if main search
        div.addEventListener('click', () => {
            inputElement.value = displayName;
            clearSuggestions(container);

            // If main search input, fly map to location
            if (inputElement === searchInput) {
                map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
            }
        });
    });
    container.style.display = 'block';
}

// Photon search function
async function photonSearch(query) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const json = await res.json();
    return json.features || [];
}

// Debounced handlers for each search input with loading and error handling
const handleMainSearch = debounce(async (e) => {
    const query = e.target.value.trim();
    if (!query) {
        clearSuggestions(suggestionsBox);
        return;
    }
    showLoading(suggestionsBox);
    try {
        const results = await photonSearch(query);
        renderSuggestions(results, suggestionsBox, searchInput);
    } catch (err) {
        showError(suggestionsBox, 'Search failed. Try again.');
        console.error(err);
    }
}, 300);

const handleOriginSearch = debounce(async (e) => {
    const query = e.target.value.trim();
    if (!query) {
        clearSuggestions(originSuggestions);
        return;
    }
    showLoading(originSuggestions);
    try {
        const results = await photonSearch(query);
        renderSuggestions(results, originSuggestions, originInput);
    } catch (err) {
        showError(originSuggestions, 'Search failed. Try again.');
        console.error(err);
    }
}, 300);

const handleDestinationSearch = debounce(async (e) => {
    const query = e.target.value.trim();
    if (!query) {
        clearSuggestions(destinationSuggestions);
        return;
    }
    showLoading(destinationSuggestions);
    try {
        const results = await photonSearch(query);
        renderSuggestions(results, destinationSuggestions, destinationInput);
    } catch (err) {
        showError(destinationSuggestions, 'Search failed. Try again.');
        console.error(err);
    }
}, 300);

// Attach input listeners
searchInput.addEventListener('input', handleMainSearch);
originInput.addEventListener('input', handleOriginSearch);
destinationInput.addEventListener('input', handleDestinationSearch);

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        clearSuggestions(suggestionsBox);
    }
    if (!originInput.contains(e.target) && !originSuggestions.contains(e.target)) {
        clearSuggestions(originSuggestions);
    }
    if (!destinationInput.contains(e.target) && !destinationSuggestions.contains(e.target)) {
        clearSuggestions(destinationSuggestions);
    }
});

// ROUTING

// Variables to hold selected coords
let originCoords = null;
let destinationCoords = null;

// Helper to parse selected suggestion coords
function selectCoordsFromSuggestion(inputElem, suggestionsContainer) {
    let coords = null;
    // Find first suggestion whose text matches input value exactly
    for (const child of suggestionsContainer.children) {
        if (child.textContent === inputElem.value.trim()) {
            const lon = parseFloat(child.dataset.lon);
            const lat = parseFloat(child.dataset.lat);
            if (!isNaN(lon) && !isNaN(lat)) {
                coords = [lon, lat];
                break;
            }
        }
    }
    return coords;
}

// Handle clicks on origin/destination suggestions to set coords
originSuggestions.addEventListener('click', (e) => {
    if (!e.target.dataset.lon || !e.target.dataset.lat) return;
    originCoords = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];
    originInput.value = e.target.textContent;
    clearSuggestions(originSuggestions);
});

destinationSuggestions.addEventListener('click', (e) => {
    if (!e.target.dataset.lon || !e.target.dataset.lat) return;
    destinationCoords = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];
    destinationInput.value = e.target.textContent;
    clearSuggestions(destinationSuggestions);
});

// Also set coords when user manually changes input and presses Enter on suggestion
originInput.addEventListener('blur', () => {
    const coords = selectCoordsFromSuggestion(originInput, originSuggestions);
    if (coords) originCoords = coords;
    else originCoords = null;
});

destinationInput.addEventListener('blur', () => {
    const coords = selectCoordsFromSuggestion(destinationInput, destinationSuggestions);
    if (coords) destinationCoords = coords;
    else destinationCoords = null;
});

// Clear route and markers/layers
function clearRoute() {
    originInput.value = '';
    destinationInput.value = '';
    originCoords = null;
    destinationCoords = null;
    clearSuggestions(originSuggestions);
    clearSuggestions(destinationSuggestions);
    removeRouteLayer();
}

// Remove route layer and source if exists
function removeRouteLayer() {
    if (map.getLayer('route')) {
        map.removeLayer('route');
    }
    if (map.getSource('route')) {
        map.removeSource('route');
    }
    // Clear step markers and UI if you implement those (optional)
    clearStepsUI();
}

// Get route and draw on map
async function getRoute() {
    if (!originCoords || !destinationCoords) {
        alert('Please select both origin and destination from suggestions.');
        return;
    }

    const [oLon, oLat] = originCoords;
    const [dLon, dLat] = destinationCoords;

    const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson&steps=true`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Routing API error');
        const json = await res.json();

        if (json.routes.length === 0) {
            alert('No route found.');
            return;
        }

        const route = json.routes[0];
        drawRoute(route.geometry);
        displaySteps(route.legs[0].steps);
        // Fit map to route bounds
        fitMapToRoute(route.geometry);
    } catch (err) {
        console.error(err);
        alert('Failed to get route. Try again.');
    }
}

// Draw route on map
function drawRoute(geojson) {
    removeRouteLayer();

    map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: geojson
        }
    });

    map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#4287f5',
            'line-width': 6
        }
    });
}

// Fit map viewport to route geometry
function fitMapToRoute(geojson) {
    const coords = geojson.coordinates;
    const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 40 });
}

// Display steps in UI (you'll want to implement this with clean UI)
const stepsContainer = document.getElementById('steps');

function clearStepsUI() {
    if (stepsContainer) stepsContainer.innerHTML = '';
}

function displaySteps(steps) {
    if (!stepsContainer) return;

    clearStepsUI();

    steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.className = 'step';
        div.textContent = `${i + 1}. ${step.maneuver.instruction}`;
        stepsContainer.appendChild(div);
    });
}

// Button handlers
getRouteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    getRoute();
});

clearRouteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearRoute();
});

// Initialize empty steps UI
clearStepsUI();
