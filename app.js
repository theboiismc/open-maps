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

// Controls
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

const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

const routeActions = document.getElementById('route-actions');
const routeInfoDiv = document.getElementById('route-info');

const directionsInputsDiv = document.getElementById('directions-inputs');

const navigationUIDiv = document.getElementById('navigation-ui');
const navigationStepsDiv = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-navigation');
const stopNavBtn = document.getElementById('stop-navigation');

const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

// Map style toggle vars
let satelliteLayerAdded = false;
let isSatellite = false;

// Add satellite layer once map loads
const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
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
  styleIcon.src = 'satellite_style.png';
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

// Sidebar toggle
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  directionsForm.setAttribute('aria-hidden', 'false');
  routeActions.style.display = 'none';
  navigationUIDiv.style.display = 'none';
  directionsInputsDiv.style.display = 'flex';
  searchInput.parentElement.style.display = 'none';
  styleToggle.style.left = '370px';
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  directionsForm.setAttribute('aria-hidden', 'true');
  searchInput.parentElement.style.display = 'flex';
  styleToggle.style.left = '20px';
  routeActions.style.display = 'none';
  navigationUIDiv.style.display = 'none';
  directionsInputsDiv.style.display = 'flex';
  clearRoute();
}

directionsIcon.addEventListener('click', openDirectionsPanel);
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Photon search
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
      if (originInput.dataset.lon && destinationInput.dataset.lon) {
        routeActions.style.display = 'flex';
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
}

setupSearch(searchInput, searchSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Clear route and UI reset
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
}

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  stopNavigation();
  navigationUIDiv.style.display = 'none';
  directionsInputsDiv.style.display = 'flex';
  routeInfoDiv.textContent = '';
});

// Draw route line on map
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

// Fetch route from OSRM API
async function fetchRoute(originLon, originLat, destLon, destLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch route');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) {
      alert('No route found');
      return null;
    }
    return data.routes[0];
  } catch (e) {
    console.error(e);
    alert('Error fetching route');
    return null;
  }
}

// Navigation state
let currentRoute = null;
let navSteps = [];
let navStepIndex = 0;

function updateNavigationUI() {
  navigationStepsDiv.innerHTML = '';
  navSteps.forEach((step, idx) => {
    const div = document.createElement('div');
    div.className = 'nav-step' + (idx === navStepIndex ? ' current-step' : '');
    div.textContent = step.maneuver.instruction;
    navigationStepsDiv.appendChild(div);
  });
}

function startNavigation() {
  if (!currentRoute) return;
  navStepIndex = 0;
  updateNavigationUI();
  startNavBtn.style.display = 'none';
  stopNavBtn.style.display = 'inline-block';
  directionsInputsDiv.style.display = 'none';
  navigationUIDiv.style.display = 'flex';

  const firstStep = navSteps[0];
  map.flyTo({ center: firstStep.maneuver.location, zoom: 16, speed: 0.7 });

  // (Optional) implement step-by-step navigation logic here
}

function stopNavigation() {
  navStepIndex = 0;
  currentRoute = null;
  navSteps = [];
  updateNavigationUI();
  startNavBtn.style.display = 'inline-block';
  stopNavBtn.style.display = 'none';
  navigationUIDiv.style.display = 'none';
  directionsInputsDiv.style.display = 'flex';
  clearRoute();
}

startNavBtn.addEventListener('click', startNavigation);
stopNavBtn.addEventListener('click', stopNavigation);

// Get Directions button event
getRouteBtn.addEventListener('click', async () => {
  const originLon = parseFloat(originInput.dataset.lon);
  const originLat = parseFloat(originInput.dataset.lat);
  const destLon = parseFloat(destinationInput.dataset.lon);
  const destLat = parseFloat(destinationInput.dataset.lat);

  if (
    isNaN(originLon) || isNaN(originLat) ||
    isNaN(destLon) || isNaN(destLat)
  ) {
    alert('Please select valid origin and destination from suggestions.');
    return;
  }

  const route = await fetchRoute(originLon, originLat, destLon, destLat);
  if (!route) return;

  currentRoute = route;
  navSteps = route.legs[0].steps;
  navStepIndex = 0;

  const routeGeoJSON = {
    type: 'Feature',
    geometry: route.geometry,
  };
  drawRoute(routeGeoJSON);

  routeInfoDiv.textContent = `Distance: ${(route.distance / 1000).toFixed(2)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;

  directionsInputsDiv.style.display = 'none';
  navigationUIDiv.style.display = 'flex';

  startNavBtn.style.display = 'inline-block';
  stopNavBtn.style.display = 'none';

  map.flyTo({ center: [originLon, originLat], zoom: 14 });
});

// Fly to selected location from search bar
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && searchInput.value.trim() !== '') {
    e.preventDefault();
    const lon = parseFloat(searchInput.dataset.lon);
    const lat = parseFloat(searchInput.dataset.lat);
    if (!isNaN(lon) && !isNaN(lat)) {
      map.flyTo({ center: [lon, lat], zoom: 14 });
      clearSuggestions(searchSuggestions);
    }
  }
});
