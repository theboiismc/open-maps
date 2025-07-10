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
const directionsIcon = document.getElementById('directions-icon');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');
const routeActions = document.getElementById('route-actions');

const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const swapLocationsBtn = document.getElementById('swap-locations');

const directionsInputsDiv = document.getElementById('directions-inputs');
const navigationUIDiv = document.getElementById('navigation-ui');
const navigationStepsDiv = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-navigation');
const stopNavBtn = document.getElementById('stop-navigation');

// Satellite layer flag
let satelliteLayerAdded = false;
let isSatellite = false;

function addSatelliteLayer() {
    if (!satelliteLayerAdded) {
        map.addSource('satellite', {
            type: 'raster',
            tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256
        });

        // Find first symbol layer to place satellite below it
        const layers = map.getStyle().layers;
        let firstSymbolId = null;
        for (const layer of layers) {
            if (layer.type === 'symbol') {
                firstSymbolId = layer.id;
                break;
            }
        }

        map.addLayer({
            id: 'sat-layer',
            type: 'raster',
            source: 'satellite',
            paint: { 'raster-opacity': 0.8 },
            layout: { visibility: 'none' }
        }, firstSymbolId || undefined);

        satelliteLayerAdded = true;
    }
}

function switchToSatellite() {
    if (!satelliteLayerAdded) addSatelliteLayer();
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    isSatellite = true;
    styleIcon.src = 'satelite_style.png';  // make sure this file exists or update path
    styleLabel.textContent = 'Satellite';
    styleToggle.setAttribute('aria-pressed', 'true');
}

function switchToRegular() {
    if (!satelliteLayerAdded) return;
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    isSatellite = false;
    styleIcon.src = 'default_style.png';  // make sure this file exists or update path
    styleLabel.textContent = 'Regular';
    styleToggle.setAttribute('aria-pressed', 'false');
}

map.on('load', () => {
    addSatelliteLayer();
    switchToRegular();
});

// Style toggle button handler
styleToggle.addEventListener('click', () => {
    if (isSatellite) switchToRegular();
    else switchToSatellite();
});

// Directions panel toggle
function openDirectionsPanel() {
    directionsForm.classList.add('open');
    document.querySelector('.search-bar').style.display = 'none';
    styleToggle.style.left = '370px'; // Adjust position based on panel width
}

function closeDirectionsPanel() {
    directionsForm.classList.remove('open');
    document.querySelector('.search-bar').style.display = 'block';
    styleToggle.style.left = '20px';
    directionsInputsDiv.style.display = 'flex';
    routeInfoDiv.textContent = '';
}

directionsIcon.addEventListener('click', openDirectionsPanel);
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
        closeDirectionsPanel();
    }
});

// Photon search setup
const photonUrl = "https://photon.komoot.io/api/?q=";
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

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
    // Hide suggestions on blur with slight delay for click
    inputEl.addEventListener('blur', () => {
        setTimeout(() => clearSuggestions(suggestionsEl), 200);
    });
}

// Setup all search inputs
setupSearch(searchInput, searchSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Swap origin and destination
swapLocationsBtn.addEventListener('click', () => {
    const oVal = originInput.value;
    const dVal = destinationInput.value;
    const oLon = originInput.dataset.lon;
    const oLat = originInput.dataset.lat;
    const dLon = destinationInput.dataset.lon;
    const dLat = destinationInput.dataset.lat;

    originInput.value = dVal || '';
    originInput.dataset.lon = dLon || '';
    originInput.dataset.lat = dLat || '';

    destinationInput.value = oVal || '';
    destinationInput.dataset.lon = oLon || '';
    destinationInput.dataset.lat = oLat || '';
});

// Draw route on map
function drawRoute(routeGeoJSON) {
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', {
            type: 'geojson',
            data: routeGeoJSON
        });
        map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#6750a4',
                'line-width': 6,
                'line-opacity': 0.8
            }
        });
    }
}

// Clear route
function clearRoute() {
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');
    routeInfoDiv.textContent = '';
    routeActions.style.display = 'none'; 
    originInput.value = '';
    destinationInput.value = '';
    delete originInput.dataset.lon;
    delete originInput.dataset.lat;
    delete destinationInput.dataset.lon;
    delete destinationInput.dataset.lat;
    navigationUIDiv.style.display = 'none';
    directionsInputsDiv.style.display = 'flex';
}

// Routing with OSRM
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

let navSteps = [];
let navStepIndex = 0;
let isNavigating = false;
let voiceUtterance = null;
let currentRoute = null;
let watchId = null;

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function speak(text) {
    if (!window.speechSynthesis) return;
    if (voiceUtterance) window.speechSynthesis.cancel();
    voiceUtterance = new SpeechSynthesisUtterance(text);
    voiceUtterance.lang = 'en-US';
    voiceUtterance.rate = 1;
    window.speechSynthesis.speak(voiceUtterance);
}

function renderNavSteps() {
    navigationStepsDiv.innerHTML = '';
    navSteps.forEach((step, i) => {
        const div = document.createElement('div');
        div.className = 'nav-step' + (i === navStepIndex ? ' current-step' : '');
        div.textContent = step.maneuver.instruction || step.name || 'Continue';
        navigationStepsDiv.appendChild(div);
    });
}

function updateNavStep() {
    if (navStepIndex >= navSteps.length) {
        speak("You have arrived at your destination.");
        stopNavigation();
        return;
    }
    renderNavSteps();
    const step = navSteps[navStepIndex];
    speak(step.maneuver.instruction || step.name || 'Continue');
}

function startNavigation() {
    if (!currentRoute) return;
    isNavigating = true;
    startNavBtn.style.display = 'none';
    stopNavBtn.style.display = 'inline-block';
    navStepIndex = 0;
    updateNavStep();

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(position => {
            const { latitude, longitude } = position.coords;
            map.flyTo({ center: [longitude, latitude], zoom: 16 });

            const nextStep = navSteps[navStepIndex];
            if (!nextStep) return;
            const [stepLon, stepLat] = nextStep.maneuver.location || [0, 0];
            const dist = getDistanceMeters(latitude, longitude, stepLat, stepLon);
            if (dist < 30) { // close enough
                navStepIndex++;
                if (navStepIndex < navSteps.length) {
                    updateNavStep();
                } else {
                    speak("You have arrived at your destination.");
                    stopNavigation();
                }
            }
        }, err => {
            console.warn('Geolocation error', err);
        }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

function stopNavigation() {
    isNavigating = false;
    startNavBtn.style.display = 'inline-block';
    stopNavBtn.style.display = 'none';
    if (voiceUtterance) {
        window.speechSynthesis.cancel();
        voiceUtterance = null;
    }
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// Event listeners for route buttons
clearRouteBtn.addEventListener('click', () => {
    clearRoute();
    stopNavigation();
});

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
    navSteps = route.legs[0].steps;
    navStepIndex = 0;

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

startNavBtn.addEventListener('click', startNavigation);
stopNavBtn.addEventListener('click', () => {
    stopNavigation();
    navigationUIDiv.style.display = 'none';
    directionsInputsDiv.style.display = 'flex';
    routeInfoDiv.textContent = '';
    clearRoute();
});

// Optional: click on map to set origin if empty
map.on('click', (e) => {
    if (!originInput.value) {
        originInput.value = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        originInput.dataset.lon = e.lngLat.lng;
        originInput.dataset.lat = e.lngLat.lat;
    }
});

// Hide route actions initially
routeActions.style.display = 'none';
