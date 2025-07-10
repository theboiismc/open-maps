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

// Custom user location marker and follow mode
let followMode = false;
const userMarkerEl = document.createElement('div');
userMarkerEl.className = 'user-location-marker';
const userMarker = new maplibregl.Marker({ element: userMarkerEl, rotationAlignment: 'map' });

// Follow mode toggle button
const followToggleBtn = document.getElementById('follow-toggle');
followToggleBtn.addEventListener('click', () => {
  followMode = !followMode;
  followToggleBtn.classList.toggle('active', followMode);
  if (!followMode) {
    userMarker.setRotation(0);
  }
});

// Geolocate control with custom handling to update custom marker & follow mode
const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true
  },
  trackUserLocation: true,
  showAccuracyCircle: false,
});
map.addControl(geolocateControl, 'bottom-right');

geolocateControl.on('geolocate', e => {
  const { latitude, longitude, heading } = e.coords;
  userMarker.setLngLat([longitude, latitude]).addTo(map);

  if (followMode) {
    map.easeTo({
      center: [longitude, latitude],
      bearing: heading || 0,
      duration: 500,
      pitch: 0
    });
    if (heading !== null && !isNaN(heading)) {
      userMarker.setRotation(heading);
    }
  }
});

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

// Elements
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');
const etaInfoDiv = document.getElementById('eta-info');

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

// Directions panel toggle funcs
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  // Move style toggle left when directions open
  styleToggle.style.left = '100px';
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'block';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  styleToggle.style.left = '20px';
}

directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Prevent directions panel from closing when clicking inside it or on suggestions
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    // Do nothing (ignore click outside so panel only closes on X or ESC)
  } else {
    if (directionsForm.classList.contains('open') && !directionsForm.contains(e.target)) {
      closeDirectionsPanel();
    }
  }
});

// Swipe to dismiss directions panel on mobile (improved)
let startX = 0, currentX = 0, isSwiping = false;
directionsForm.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  startX = e.touches[0].clientX;
  isSwiping = true;
  directionsForm.classList.add('swiping');
});
directionsForm.addEventListener('touchmove', e => {
  if (!isSwiping) return;
  currentX = e.touches[0].clientX;
  const deltaX = currentX - startX;
  if (deltaX < 0) directionsForm.style.transform = `translateX(${deltaX}px)`;
});
directionsForm.addEventListener('touchend', () => {
  const deltaX = currentX - startX;
  directionsForm.classList.remove('swiping');
  if (deltaX < -100) {
    closeDirectionsPanel();
  } else {
    directionsForm.style.transform = '';
  }
  isSwiping = false;
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

// Fuzzy search setup using Fuse.js
// We cache last search results from Photon and apply Fuse for fuzzy matching on client
let lastPhotonResults = [];

const fuseOptions = {
  keys: ['properties.name', 'properties.state', 'properties.country'],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
};

const fuse = new Fuse([], fuseOptions);

async function photonSearch(query) {
  if (!query) return [];
  try {
    const res = await fetch(`${photonUrl}${encodeURIComponent(query)}&limit=10`);
    if (!res.ok) throw new Error("Photon request failed");
    const data = await res.json();
    lastPhotonResults = data.features || [];
    fuse.setCollection(lastPhotonResults);
    return lastPhotonResults;
  } catch (e) {
    console.error(e);
    return [];
  }
}

function showLoading(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
}

// Show search suggestions with fuzzy fallback
async function updateSearchSuggestions(query, container, isOrigin = false) {
  if (!query) {
    container.innerHTML = '';
    return;
  }
  showLoading(container);

  let photonResults = await photonSearch(query);

  // Fuse fuzzy search fallback
  const fuseResults = fuse.search(query);

  // Merge and dedupe results prioritizing photon + fuse results
  const combined = [...new Map([...photonResults, ...fuseResults.map(r => r.item)].map(item => [item.properties.osm_id, item])).values()];

  container.innerHTML = '';
  combined.forEach((feature, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.tabIndex = 0;
    const p = feature.properties;
    div.textContent = `${p.name || ''}${p.state ? ', ' + p.state : ''}${p.country ? ', ' + p.country : ''}`;
    div.addEventListener('click', () => {
      if (isOrigin) originInput.value = div.textContent;
      else if (container === destinationSuggestions) destinationInput.value = div.textContent;
      else searchInput.value = div.textContent;
      container.innerHTML = '';
    });
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter') div.click();
    });
    container.appendChild(div);
  });
}

// Debounced input handlers
searchInput.addEventListener('input', debounce(e => updateSearchSuggestions(e.target.value, searchSuggestions), 300));
originInput.addEventListener('input', debounce(e => updateSearchSuggestions(e.target.value, originSuggestions, true), 300));
destinationInput.addEventListener('input', debounce(e => updateSearchSuggestions(e.target.value, destinationSuggestions, false), 300));

// Variables for routing
let currentRoute = null;

// OSRM route fetch function
async function fetchRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get route');
  const data = await res.json();
  if (data.code !== 'Ok' || data.routes.length === 0) throw new Error('No route found');
  return data.routes[0];
}

// Utility: Geocode place name to lat/lon using Photon
async function geocodePlace(name) {
  if (!name) return null;
  const res = await fetch(`${photonUrl}${encodeURIComponent(name)}&limit=1`);
  if (!res.ok) throw new Error('Failed geocoding');
  const data = await res.json();
  if (!data.features.length) return null;
  return data.features[0].geometry.coordinates;
}

// Clear route
function clearRoute() {
  if (currentRoute) {
    if (map.getSource('route')) {
      map.removeLayer('route-line');
      map.removeSource('route');
    }
    routeInfoDiv.textContent = '';
    etaInfoDiv.textContent = '';
    currentRoute = null;
  }
}

// Draw route on map
function drawRoute(route) {
  clearRoute();

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: route.geometry,
    }
  });

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': '#6750a4',
      'line-width': 6,
      'line-opacity': 0.8
    }
  });

  // Fit bounds to route with padding
  const coords = route.geometry.coordinates;
  const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, { padding: 40 });

  // Show distance & duration
  const distKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);

  routeInfoDiv.textContent = `Distance: ${distKm} km — Duration: ${durationMin} min`;

  // Show ETA (current time + duration)
  const now = new Date();
  const etaDate = new Date(now.getTime() + route.duration * 1000);
  etaInfoDiv.textContent = `ETA: ${etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Navigation with voice guidance setup
let voiceUtterance = null;
let navStepIndex = 0;
let navSteps = [];
let isNavigating = false;

// Start navigation function
function startNavigation() {
  if (!currentRoute || !currentRoute.legs.length) return;
  navSteps = currentRoute.legs[0].steps;
  navStepIndex = 0;
  isNavigating = true;
  speakStep(navSteps[navStepIndex]);
}

function speakStep(step) {
  if (!step) {
    stopNavigation();
    return;
  }
  const instruction = step.maneuver.instruction;
  if ('speechSynthesis' in window) {
    if (voiceUtterance) speechSynthesis.cancel();
    voiceUtterance = new SpeechSynthesisUtterance(instruction);
    voiceUtterance.lang = 'en-US';
    speechSynthesis.speak(voiceUtterance);
  }
}

// Update navigation on position change
geolocateControl.on('geolocate', e => {
  if (!isNavigating) return;
  const pos = [e.coords.longitude, e.coords.latitude];
  const currentStep = navSteps[navStepIndex];
  if (!currentStep) return;

  // Simple distance check to next maneuver coord to advance step
  const [stepLng, stepLat] = currentStep.maneuver.location;
  const distanceToManeuver = getDistance(pos[1], pos[0], stepLat, stepLng);

  if (distanceToManeuver < 20) { // 20 meters threshold
    navStepIndex++;
    if (navStepIndex >= navSteps.length) {
      stopNavigation();
    } else {
      speakStep(navSteps[navStepIndex]);
    }
  }
});

// Haversine formula to calculate distance (meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function stopNavigation() {
  isNavigating = false;
  navStepIndex = 0;
  navSteps = [];
  if (voiceUtterance) speechSynthesis.cancel();
}

// Handle Get Directions button
getRouteBtn.addEventListener('click', async () => {
  const originVal = originInput.value.trim();
  const destinationVal = destinationInput.value.trim();
  if (!originVal || !destinationVal) return alert('Please enter both origin and destination.');

  try {
    const originCoords = await geocodePlace(originVal);
    const destinationCoords = await geocodePlace(destinationVal);
    if (!originCoords || !destinationCoords) return alert('Could not find location.');

    const route = await fetchRoute(originCoords, destinationCoords);
    currentRoute = route;
    drawRoute(route);
    openDirectionsPanel();

    // Start real-time nav + voice guidance
    startNavigation();
  } catch (err) {
    alert('Error fetching route: ' + err.message);
  }
});

// Clear route button
clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  stopNavigation();
  originInput.value = '';
  destinationInput.value = '';
  closeDirectionsPanel();
});

// Style toggle logic
styleToggle.addEventListener('click', () => {
  if (isSatellite) {
    switchToRegular();
  } else {
    switchToSatellite();
  }
});

// Search bar logic - just fills input on suggestion click handled in updateSearchSuggestions

// Search icon triggers search input focus
document.getElementById('search-icon').addEventListener('click', () => {
  searchInput.focus();
});

// Search input 'Enter' triggers opening directions panel with destination set
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (searchInput.value.trim()) {
      openDirectionsPanel();
      destinationInput.value = searchInput.value.trim();
      searchSuggestions.innerHTML = '';
      originInput.focus();
    }
  }
});

// Accessibility improvement: trap focus in directions panel when open
directionsForm.addEventListener('keydown', e => {
  if (e.key === 'Tab' && directionsForm.classList.contains('open')) {
    const focusable = directionsForm.querySelectorAll('input, button');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// Initialize map centered on user's location on load if possible
geolocateControl.trigger();

