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

// Add MapLibre geolocate control bottom right
const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true,
  },
  trackUserLocation: true,
  showUserHeading: true,
});
map.addControl(geolocateControl, 'bottom-right');

// Controls elements
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

// Style toggle button elements
const styleToggleBtn = document.getElementById('style-toggle');
const styleImage = document.getElementById('style-image');
const styleLabel = document.getElementById('style-label');

// Satellite layer flag
let satelliteLayerAdded = false;
let currentStyle = 'regular';

const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        // Use your self-hosted satellite tiles or public ones here
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
  styleToggleBtn.setAttribute('aria-pressed', 'true');
  styleImage.src = '/satellite_style.png';
  styleLabel.textContent = 'Satellite';
  currentStyle = 'satellite';
};

const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  styleToggleBtn.setAttribute('aria-pressed', 'false');
  styleImage.src = '/default_style.png';
  styleLabel.textContent = 'Regular';
  currentStyle = 'regular';
};

// On map load setup
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

// Style toggle button click
styleToggleBtn.addEventListener('click', () => {
  if (currentStyle === 'regular') {
    switchToSatellite();
  } else {
    switchToRegular();
  }
});

// Directions panel toggle helpers
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  document.querySelector('.map-controls').classList.add('shifted');
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  document.querySelector('.map-controls').classList.remove('shifted');
}

// Directions toggle button
directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

// Close button inside directions panel
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Close on ESC key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Close on click outside directions panel (ignore clicks inside panel or toggle)
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    // Do NOT close panel here per your request to only close on X or ESC
  }
});

// Swipe to dismiss directions panel on mobile (optional)
let startX = 0, currentX = 0, isSwiping = false;
directionsForm.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  startX = e.touches[0].clientX;
  isSwiping = true;
});
directionsForm.addEventListener('touchmove', e => {
  if (!isSwiping) return;
  currentX = e.touches[0].clientX;
  const deltaX = currentX - startX;
  if (deltaX < 0) directionsForm.style.transform = `translateX(${deltaX}px)`;
});
directionsForm.addEventListener('touchend', () => {
  const deltaX = currentX - startX;
  if (deltaX < -100) closeDirectionsPanel();
  directionsForm.style.transform = '';
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
function renderSuggestions(container, results) {
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
    container.appendChild(div);
  });
}

// Setup search inputs
function setupSearch(inputEl, suggestionsEl) {
  const debouncedSearch = debounce(async (query) => {
    if (!query) {
      clearSuggestions(suggestionsEl);
      return;
    }
    showLoading(suggestionsEl);
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results);
  }, 250);

  inputEl.addEventListener('input', e => {
    debouncedSearch(e.target.value.trim());
  });

  suggestionsEl.addEventListener('click', e => {
    if (!e.target.classList.contains('suggestion')) return;
    const lon = parseFloat(e.target.dataset.lon);
    const lat = parseFloat(e.target.dataset.lat);
    const text = e.target.textContent;
    inputEl.value = text;
    inputEl.dataset.lon = lon;
    inputEl.dataset.lat = lat;
    clearSuggestions(suggestionsEl);
    if (inputEl.id === 'search') {
      map.flyTo({ center: [lon, lat], zoom: 14 });
    }
  });

  suggestionsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
      e.preventDefault();
      e.target.click();
      inputEl.focus();
    }
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

setupSearch(document.getElementById('search'), document.getElementById('suggestions'));
setupSearch(document.getElementById('origin'), document.getElementById('origin-suggestions'));
setupSearch(document.getElementById('destination'), document.getElementById('destination-suggestions'));

// Routing with OSRM
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

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
      paint: { 'line-color': '#6750a4', 'line-width': 6 }
    });
  }
}

function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  routeInfoDiv.textContent = '';
}

async function fetchRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM request failed");
    const data = await res.json();
    if (data.routes && data.routes.length) return data.routes[0];
    throw new Error("No routes found");
  } catch (e) {
    console.error(e);
    return null;
  }
}

getRouteBtn.addEventListener('click', async () => {
  const originInput = document.getElementById('origin');
  const destinationInput = document.getElementById('destination');

  const startLon = parseFloat(originInput.dataset.lon);
  const startLat = parseFloat(originInput.dataset.lat);
  const endLon = parseFloat(destinationInput.dataset.lon);
  const endLat = parseFloat(destinationInput.dataset.lat);

  if (
    isNaN(startLon) || isNaN(startLat) ||
    isNaN(endLon) || isNaN(endLat)
  ) {
    routeInfoDiv.textContent = 'Please select valid start and destination from suggestions.';
    return;
  }

  routeInfoDiv.textContent = 'Routing...';
  const route = await fetchRoute([startLon, startLat], [endLon, endLat]);
  if (!route) {
    routeInfoDiv.textContent = 'Route not found.';
    return;
  }
  drawRoute(route.geometry);
  routeInfoDiv.textContent = `Distance: ${(route.distance / 1000).toFixed(1)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;
  map.fitBounds([
    [Math.min(startLon, endLon), Math.min(startLat, endLat)],
    [Math.max(startLon, endLon), Math.max(startLat, endLat)]
  ], { padding: 40 });
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  document.getElementById('origin').value = '';
  document.getElementById('destination').value = '';
  document.getElementById('origin').removeAttribute('data-lon');
  document.getElementById('origin').removeAttribute('data-lat');
  document.getElementById('destination').removeAttribute('data-lon');
  document.getElementById('destination').removeAttribute('data-lat');
  routeInfoDiv.textContent = '';
});

