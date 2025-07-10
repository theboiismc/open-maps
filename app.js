// Initialize the map
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

// Directions icon inside the search bar
const directionsIcon = document.getElementById('directions-icon');
directionsIcon.addEventListener('click', () => {
    if (directionsForm.classList.contains('open')) {
        closeDirectionsPanel();
    } else {
        openDirectionsPanel();
    }
});

// Directions panel toggle
function openDirectionsPanel() {
    directionsForm.classList.add('open');
    document.querySelector('.search-bar').style.display = 'none';
    styleToggle.style.left = '370px'; // Adjust position based on new panel width
}

function closeDirectionsPanel() {
    directionsForm.classList.remove('open');
    document.querySelector('.search-bar').style.display = 'block';
    styleToggle.style.left = '20px';
}

// Directions toggle button inside search bar
const directionsToggleBtn = document.getElementById('directions-toggle');
directionsToggleBtn.addEventListener('click', () => {
    if (directionsForm.classList.contains('open')) closeDirectionsPanel();
    else openDirectionsPanel();
});

// Photon search setup
const photonUrl = "https://photon.komoot.io/api/?q=";

// Debounce function to optimize search input
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// Fetch suggestions from Photon API
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

// Render the suggestions list in the dropdown
function renderSuggestions(container, results, inputEl) {
    container.innerHTML = '';
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
            document.getElementById('suggestions').innerHTML = '';  // Clear suggestions
            map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
        });
        container.appendChild(div);
    });
}

// Set up the search input field to handle search and show suggestions
const searchInput = document.getElementById('search');
const suggestionsContainer = document.getElementById('suggestions');

searchInput.addEventListener('input', debounce(async () => {
    const query = searchInput.value.trim();
    if (!query) {
        suggestionsContainer.innerHTML = '';
        return;
    }
    const results = await photonSearch(query);
    renderSuggestions(suggestionsContainer, results, searchInput);
}, 300)); // Debounce delay of 300ms

// Directions panel setup (side menu) elements
const directionsForm = document.getElementById('directions-form');
const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

// Toggle satellite view
let satelliteLayerAdded = false;
let isSatellite = false;

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
        }, 'road-label');
        satelliteLayerAdded = true;
    }
};

const switchToSatellite = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    isSatellite = true;
    styleIcon.src = 'satelite_style.png';
    styleLabel.textContent = 'Satellite';
    styleToggle.setAttribute('aria-pressed', 'true');
};

const switchToRegular = () => {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    isSatellite = false;
    styleIcon.src = 'default_style.png';
    styleLabel.textContent = 'Regular';
    styleToggle.setAttribute('aria-pressed', 'false');
};

map.on('load', () => {
    addSatelliteLayer();
    switchToRegular();
});

styleToggle.addEventListener('click', () => {
    if (isSatellite) switchToRegular();
    else switchToSatellite();
});

// Swap origin and destination locations (for routing)
const swapLocationsBtn = document.getElementById('swap-locations');
swapLocationsBtn.addEventListener('click', () => {
    const tempValue = originInput.value;
    originInput.value = destinationInput.value;
    destinationInput.value = tempValue;

    const tempLon = originInput.dataset.lon;
    const tempLat = originInput.dataset.lat;
    originInput.dataset.lon = destinationInput.dataset.lon;
    originInput.dataset.lat = destinationInput.dataset.lat;
    destinationInput.dataset.lon = tempLon;
    destinationInput.dataset.lat = tempLat;
});

// Route handling (OSRM)
let currentRoute = null;
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeInfoDiv = document.getElementById('route-info');

async function fetchRoute(originLon, originLat, destLon, destLat) {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Routing failed");
        const json = await res.json();
        if (json.code !== 'Ok' || !json.routes.length) {
            alert("No route found.");
            return null;
        }
        return json.routes[0];
    } catch (e) {
        console.error(e);
        alert("Failed to get route.");
        return null;
    }
}

getRouteBtn.addEventListener('click', async () => {
    const originLon = parseFloat(originInput.dataset.lon);
    const originLat = parseFloat(originInput.dataset.lat);
    const destLon = parseFloat(destinationInput.dataset.lon);
    const destLat = parseFloat(destinationInput.dataset.lat);

    if (isNaN(originLon) || isNaN(originLat) || isNaN(destLon) || isNaN(destLat)) {
        alert("Please select valid origin and destination from suggestions.");
        return;
    }

    const route = await fetchRoute(originLon, originLat, destLon, destLat);
    if (!route) return;

    currentRoute = route;

    // Draw route on the map
    const routeGeoJSON = {
        type: 'Feature',
        geometry: route.geometry
    };
    drawRoute(routeGeoJSON);

    routeInfoDiv.textContent = `Distance: ${(route.distance / 1000).toFixed(2)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;

    directionsInputsDiv.style.display = 'none';
    navigationUIDiv.style.display = 'block';

    startNavBtn.style.display = 'inline-block';
    stopNavBtn.style.display = 'none';

    map.flyTo({ center: [originLon, originLat], zoom: 14 });
});

// Navigation handling
let navSteps = [];
let navStepIndex = 0;
let isNavigating = false;
let voiceUtterance = null;

function startNavigation() {
    if (!currentRoute) return;
    isNavigating = true;
    startNavBtn.style.display = 'none';
    stopNavBtn.style.display = 'inline-block';
    navStepIndex = 0;
    updateNavStep();
}

function stopNavigation() {
    isNavigating = false;
    navStepIndex = 0;
    stopNavBtn.style.display = 'none';
    startNavBtn.style.display = 'inline-block';
}

function updateNavStep() {
    if (!isNavigating) return;

    const step = navSteps[navStepIndex];
    if (!step) return;

    voiceUtterance = new SpeechSynthesisUtterance(step.instruction);
    speechSynthesis.speak(voiceUtterance);

    // Update map and move to the next step
    map.flyTo({ center: [step.lon, step.lat], zoom: 15 });

    // Go to the next step
    navStepIndex++;
    if (navStepIndex < navSteps.length) {
        setTimeout(updateNavStep, 1000);
    }
}

// Event listeners
startNavBtn.addEventListener('click', startNavigation);
stopNavBtn.addEventListener('click', stopNavigation);

// Initialize
map.on('load', () => {
    addSatelliteLayer();
    switchToRegular();
});
