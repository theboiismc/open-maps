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

// Add built-in controls: zoom and geolocate, bottom right
const navControl = new maplibregl.NavigationControl({ showCompass: false });
map.addControl(navControl, 'bottom-right');
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});
map.addControl(geoControl, 'bottom-right');

// Elements
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');
const searchInput = document.getElementById('search');
const suggestionsDiv = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

// Satellite layer setup (optional) - remove if you dropped those buttons
let satelliteLayerAdded = false;
function addSatelliteLayer() {
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
}

// Directions panel toggle functions
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
}

// Toggle directions panel button
directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

// Close directions panel button inside form
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Close directions panel on ESC key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Prevent closing panel on clicks inside directions form or suggestions
directionsForm.addEventListener('click', e => e.stopPropagation());
originSuggestions.addEventListener('click', e => e.stopPropagation());
destinationSuggestions.addEventListener('click', e => e.stopPropagation());
suggestionsDiv.addEventListener('click', e => e.stopPropagation());

// Click outside closes directions panel (only on clicking outside toggle btn and directions panel)
document.addEventListener('click', e => {
  if (!directionsForm.contains(e.target) && e.target !== directionsToggleBtn) {
    if (directionsForm.classList.contains('open')) closeDirectionsPanel();
  }
  // Clear suggestions if clicking outside inputs & suggestions
  if (!searchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
    suggestionsDiv.innerHTML = '';
  }
  if (!originInput.contains(e.target) && !originSuggestions.contains(e.target)) {
    originSuggestions.innerHTML = '';
  }
  if (!destinationInput.contains(e.target) && !destinationSuggestions.contains(e.target)) {
    destinationSuggestions.innerHTML = '';
  }
});

// Photon search API
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

// Setup search with photon for input + suggestions container
function setupSearch(inputEl, suggestionsEl, onSelect) {
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
    if (onSelect) onSelect(lon, lat);
  });

  suggestionsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
      e.preventDefault();
      e.target.click();
      inputEl.focus();
    }
  });
}

// Main search: fly to selected location
setupSearch(searchInput, suggestionsDiv, (lon, lat) => {
  map.flyTo({ center: [lon, lat], zoom: 14 });
});

// Origin and destination inputs, no fly, just set data for routing
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Routing with OSRM
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

function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  routeInfoDiv.textContent = '';
}

async function fetchRoute(start, end) {
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing request failed');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found');
    return data.routes[0];
  } catch (e) {
    console.error(e);
    return null;
  }
}

getRouteBtn.addEventListener('click', async () => {
  const start = [
    parseFloat(originInput.dataset.lon),
    parseFloat(originInput.dataset.lat)
  ];
  const end = [
    parseFloat(destinationInput.dataset.lon),
    parseFloat(destinationInput.dataset.lat)
  ];

  if (!start.every(coord => !isNaN(coord)) || !end.every(coord => !isNaN(coord))) {
    alert("Please select valid origin and destination from suggestions.");
    return;
  }

  clearRoute();
  const route = await fetchRoute(start, end);
  if (!route) {
    alert("Route not found.");
    return;
  }

  drawRoute({
    type: "Feature",
    geometry: route.geometry
  });

  // Zoom map to fit route bounds
  const coords = route.geometry.coordinates;
  const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, { padding: 80 });

  // Show summary info
  const distKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);
  routeInfoDiv.textContent = `Distance: ${distKm} km | Duration: ${durationMin} min`;
});

// Clear route button handler
clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  originInput.value = '';
  originInput.removeAttribute('data-lon');
  originInput.removeAttribute('data-lat');
  destinationInput.value = '';
  destinationInput.removeAttribute('data-lon');
  destinationInput.removeAttribute('data-lat');
  routeInfoDiv.textContent = '';
});
