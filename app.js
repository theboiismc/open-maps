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

// Directions panel toggle using transform for smooth slide
function openDirectionsPanel() {
    directionsForm.classList.add('open');
    document.querySelector('.search-bar').style.display = 'none';
    styleToggle.style.left = '370px'; // Adjust position based on new panel width
}

function closeDirectionsPanel() {
    directionsForm.classList.remove('open');
    document.querySelector('.search-bar').style.display = 'block';
    styleToggle.style.left = '20px';
    directionsInputsDiv.style.display = 'flex';
    routeInfoDiv.textContent = '';
}

directionsIcon.addEventListener('click', () => {
    openDirectionsPanel();
});

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
    inputEl.addEventListener('blur', () => {
        setTimeout(() => clearSuggestions(suggestionsEl), 200);
    });
}

// Setup search bars
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

// Routing (basic demo using openrouteservice.org or similar — placeholder)
async function getRoute() {
    if (!originInput.dataset.lon || !originInput.dataset.lat || !destinationInput.dataset.lon || !destinationInput.dataset.lat) {
        routeInfoDiv.textContent = "Please set both origin and destination from suggestions.";
        return;
    }
    routeInfoDiv.textContent = "Calculating route...";
    // You would replace this with your routing service API call, for demo just fly between points:
    const origin = [parseFloat(originInput.dataset.lon), parseFloat(originInput.dataset.lat)];
    const destination = [parseFloat(destinationInput.dataset.lon), parseFloat(destinationInput.dataset.lat)];

    // For now, just fly to destination:
    map.fitBounds([origin, destination], { padding: 60 });
    routeInfoDiv.textContent = `Route from ${originInput.value} to ${destinationInput.value} displayed.`;
}

getRouteBtn.addEventListener('click', getRoute);

clearRouteBtn.addEventListener('click', () => {
    originInput.value = '';
    destinationInput.value = '';
    originInput.dataset.lon = '';
    originInput.dataset.lat = '';
    destinationInput.dataset.lon = '';
    destinationInput.dataset.lat = '';
    routeInfoDiv.textContent = '';
    routeActions.style.display = 'none';
});

// Optional: click on map to set origin if origin empty
map.on('click', (e) => {
    if (!originInput.value) {
        originInput.value = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        originInput.dataset.lon = e.lngLat.lng;
        originInput.dataset.lat = e.lngLat.lat;
    }
});

// Hide route actions initially
routeActions.style.display = 'none';

