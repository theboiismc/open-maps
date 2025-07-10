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
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

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

const navigationPanel = document.getElementById('navigation-panel');
const navigationStepsDiv = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-nav-btn');
const stopNavBtn = document.getElementById('stop-nav-btn');

const photonUrl = "https://photon.komoot.io/api/?q=";
let satelliteLayerAdded = false;
let isSatellite = false;

let currentRoute = null;
let isNavigating = false;
let navSteps = [];
let navStepIndex = 0;
let voiceUtterance = null;

// ========== SATELLITE LAYER ========== //
const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
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

// ========== STYLE TOGGLE ========== //
styleToggle.addEventListener('click', () => {
  if (isSatellite) switchToRegular();
  else switchToSatellite();
});

// ========== SEARCH (Photon) ========== //
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

function showLoading(container) {
  container.innerHTML = '<div class="loading">Loading…</div>';
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
    div.tabIndex = 0;
    const p = feature.properties;
    div.textContent = `${p.name || ''}${p.state ? ', ' + p.state : ''}${p.country ? ', ' + p.country : ''}`;
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
  const debouncedSearch = debounce(async (query) => {
    if (!query) {
      clearSuggestions(suggestionsEl);
      return;
    }
    showLoading(suggestionsEl);
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results, inputEl);
  }, 250);

  inputEl.addEventListener('input', e => {
    debouncedSearch(e.target.value.trim());
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

setupSearch(searchInput, searchSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// ========== DIRECTIONS PANEL TOGGLE ========== //
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'block';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  hideNavigationPanel();
}

directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) closeDirectionsPanel();
  else openDirectionsPanel();
});

closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) closeDirectionsPanel();
});

// Prevent directions panel closing on click inside or on toggle btn
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    // ignore clicks outside to keep panel open
  }
});

// ========== ROUTING WITH OSRM ========== //
async function fetchRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Routing request failed');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found');
  return data.routes[0];
}

// Clear any existing route from map
function clearRoute() {
  if (map.getLayer('route')) {
    map.removeLayer('route');
  }
  if (map.getSource('route')) {
    map.removeSource('route');
  }
  currentRoute = null;
  routeInfoDiv.textContent = '';
  originInput.value = '';
  destinationInput.value = '';
  originInput.dataset.lat = '';
  originInput.dataset.lon = '';
  destinationInput.dataset.lat = '';
  destinationInput.dataset.lon = '';
  clearSuggestions(originSuggestions);
  clearSuggestions(destinationSuggestions);
  hideNavigationPanel();
  stopNavigation();
}

clearRouteBtn.addEventListener('click', clearRoute);

// Display route on map
function drawRoute(route) {
  if (map.getLayer('route')) {
    map.removeLayer('route');
  }
  if (map.getSource('route')) {
    map.removeSource('route');
  }
  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: route.geometry
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
      'line-color': '#4caf50',
      'line-width': 6
    }
  });
}

// On get directions btn click
getRouteBtn.addEventListener('click', async () => {
  const originLat = parseFloat(originInput.dataset.lat);
  const originLon = parseFloat(originInput.dataset.lon);
  const destLat = parseFloat(destinationInput.dataset.lat);
  const destLon = parseFloat(destinationInput.dataset.lon);
  if (!originLat || !originLon || !destLat || !destLon) {
    alert('Please select both origin and destination from suggestions.');
    return;
  }
  try {
    const route = await fetchRoute([originLon, originLat], [destLon, destLat]);
    currentRoute = route;
    drawRoute(route);
    routeInfoDiv.textContent = `Distance: ${(route.distance/1000).toFixed(2)} km, Duration: ${(route.duration/60).toFixed(0)} mins`;
    openNavigationPanel(route);
  } catch (e) {
    alert('Error fetching route: ' + e.message);
  }
});

// ========== NAVIGATION UI ========== //

function openNavigationPanel(route) {
  navSteps = route.legs[0].steps;
  navStepIndex = 0;
  renderNavSteps();
  navigationPanel.classList.add('open');
  startNavBtn.style.display = 'inline-block';
  stopNavBtn.style.display = 'none';
}

function hideNavigationPanel() {
  navigationPanel.classList.remove('open');
  stopNavigation();
}

// Render navigation steps list (only upcoming steps)
function renderNavSteps() {
  navigationStepsDiv.innerHTML = '';
  navSteps.slice(navStepIndex).forEach((step, idx) => {
    const div = document.createElement('div');
    div.textContent = step.maneuver.instruction;
    if (idx === 0) div.style.fontWeight = 'bold';
    navigationStepsDiv.appendChild(div);
  });
}

// Voice guidance helper
function speak(text) {
  if ('speechSynthesis' in window) {
    if (voiceUtterance) {
      window.speechSynthesis.cancel();
    }
    voiceUtterance = new SpeechSynthesisUtterance(text);
    voiceUtterance.lang = 'en-US';
    window.speechSynthesis.speak(voiceUtterance);
  }
}

let watchId = null;
let lastPosition = null;

// Start navigation logic
function startNavigation() {
  if (!currentRoute) return;
  isNavigating = true;
  startNavBtn.style.display = 'none';
  stopNavBtn.style.display = 'inline-block';

  // Zoom to user location or route start
  geolocateControl.trigger();

  watchId = navigator.geolocation.watchPosition(onPositionUpdate, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 5000
  });

  // Announce first step
  if (navSteps.length) {
    speak(navSteps[navStepIndex].maneuver.instruction);
  }
}

// Stop navigation
function stopNavigation() {
  isNavigating = false;
  startNavBtn.style.display = 'inline-block';
  stopNavBtn.style.display = 'none';
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (voiceUtterance) {
    window.speechSynthesis.cancel();
    voiceUtterance = null;
  }
  navStepIndex = 0;
  renderNavSteps();
}

// Handle position updates during nav
function onPositionUpdate(position) {
  if (!isNavigating) return;

  const { latitude, longitude } = position.coords;

  // Follow user location on map
  map.flyTo({ center: [longitude, latitude], zoom: 16, speed: 0.8, curve: 1 });

  // Check distance to next step maneuver
  const step = navSteps[navStepIndex];
  if (!step) return;

  const maneuverLoc = step.maneuver.location; // [lon, lat]
  const distToStep = getDistanceMeters(latitude, longitude, maneuverLoc[1], maneuverLoc[0]);

  if (distToStep < 20) { // 20 meters threshold to move to next step
    navStepIndex++;
    if (navStepIndex < navSteps.length) {
      speak(navSteps[navStepIndex].maneuver.instruction);
      renderNavSteps();
    } else {
      speak("You have arrived at your destination.");
      alert("Navigation complete!");
      stopNavigation();
    }
  }
}

function onPositionError(err) {
  console.warn("Geolocation error:", err);
}

// Haversine distance helper (meters)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  const R = 6371e3; // Earth radius in meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// Navigation panel button listeners
startNavBtn.addEventListener('click', startNavigation);
stopNavBtn.addEventListener('click', () => {
  stopNavigation();
  alert("Navigation stopped.");
});

// ========== INITIAL CENTERING ========= //
geolocateControl.on('geolocate', (e) => {
  const { latitude, longitude } = e.coords;
  map.flyTo({ center: [longitude, latitude], zoom: 14 });
});

// Optional: Automatically zoom when map loads to last known location
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setCenter([longitude, latitude]);
    map.setZoom(14);
  });
}
