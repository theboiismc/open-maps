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

// Satellite toggle
let satVisible = false;
map.on('load', () => {
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
});

// Layer toggle buttons
const regularToggle = document.getElementById('regular-toggle');
const satelliteToggle = document.getElementById('satellite-toggle');
const darkToggle = document.getElementById('dark-toggle');

regularToggle.onclick = () => {
  satVisible = false;
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
  regularToggle.setAttribute('aria-pressed', 'true');
  satelliteToggle.setAttribute('aria-pressed', 'false');
};

satelliteToggle.onclick = () => {
  satVisible = !satVisible;
  map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
  satelliteToggle.classList.toggle('active', satVisible);
  regularToggle.classList.toggle('active', !satVisible);
  satelliteToggle.setAttribute('aria-pressed', satVisible.toString());
  regularToggle.setAttribute('aria-pressed', (!satVisible).toString());
};

darkToggle.onclick = () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  darkToggle.setAttribute('aria-pressed', isDark.toString());
};

// DOM refs for the search bar and location button
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const placeInfo = document.getElementById('place-info');
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeInfoBox = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');
let destResults = [];
let originResults = [];
let destinationResults = [];
let originCoord = null;
let destinationCoord = null;
let selectedPlace = null;
let activeMarkers = [];

// Nominatim Search helper
async function nominatimSearch(query) {
  if (!query) return [];
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
  return res.json();
}

// Helpers to clear suggestion boxes
function clearSuggestions(container) {
  container.innerHTML = '';
}

// Render suggestions
function renderSuggestions(container, results) {
  clearSuggestions(container);
  results.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0;
    div.dataset.idx = i;
    container.appendChild(div);
  });
}

// Handle search input (main search bar)
searchInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    clearSuggestions(suggestionsBox);
    return;
  }
  destResults = await nominatimSearch(q);
  renderSuggestions(suggestionsBox, destResults);
});

suggestionsBox.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  selectedPlace = destResults[idx];
  clearSuggestions(suggestionsBox);
  searchInput.value = selectedPlace.display_name;
  // Fly to selected place
  map.flyTo({ center: [+selectedPlace.lon, +selectedPlace.lat], zoom: 14 });
  // Show sidebar with place info
  placeInfo.textContent = selectedPlace.display_name;
  sidebar.hidden = false;
  setTimeout(() => sidebar.classList.add('open'), 10);
  // 🔥 Hide search bar when sidebar opens
  searchInput.style.display = 'none';
  // Setup directions toggle and form
  directionsForm.style.display = 'none';
  directionsToggle.textContent = 'Show Directions';
  // Pre-fill origin input with selected place
  originInput.value = selectedPlace.display_name;
  originCoord = { lon: +selectedPlace.lon, lat: +selectedPlace.lat };
  // Clear previous destination input and results
  destinationInput.value = '';
  destinationResults = [];
  destinationCoord = null;
  clearRoute();
});

// Close sidebar
sidebarCloseBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
  setTimeout(() => {
    sidebar.hidden = true;
  }, 300);
  // 🔥 Show search bar again when sidebar closes
  searchInput.style.display = '';
});

// Directions toggle show/hide form
directionsToggle.addEventListener('click', () => {
  if (directionsForm.style.display === 'flex' || directionsForm.style.display === 'block') {
    directionsForm.style.display = 'none';
    directionsToggle.textContent = 'Show Directions';
  } else {
    directionsForm.style.display = 'flex';
    directionsToggle.textContent = 'Hide Directions';
  }
});

// Origin autocomplete
originInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    clearSuggestions(originSuggestions);
    originCoord = null;
    return;
  }
  originResults = await nominatimSearch(q);
  renderSuggestions(originSuggestions, originResults);
});

originSuggestions.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  clearSuggestions(originSuggestions);
});

// Destination autocomplete
destinationInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    clearSuggestions(destinationSuggestions);
    destinationCoord = null;
    return;
  }
  destinationResults = await nominatimSearch(q);
  renderSuggestions(destinationSuggestions, destinationResults);
});

destinationSuggestions.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destinationResults[idx];
  destinationInput.value = place.display_name;
  destinationCoord = { lon: +place.lon, lat: +place.lat };
  clearSuggestions(destinationSuggestions);
});

// Click outside suggestion boxes to close them
document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) clearSuggestions(suggestionsBox);
  if (!originInput.contains(e.target) && !originSuggestions.contains(e.target)) clearSuggestions(originSuggestions);
  if (!destinationInput.contains(e.target) && !destinationSuggestions.contains(e.target)) clearSuggestions(destinationSuggestions);
});

// Hide suggestions on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    clearSuggestions(suggestionsBox);
    clearSuggestions(originSuggestions);
    clearSuggestions(destinationSuggestions);
    searchInput.blur();
    originInput.blur();
    destinationInput.blur();
  }
});

// Clear route from map and UI
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
  }
  if (map.getSource('route-line')) {
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  routeSummary.textContent = '';
  routeInfoBox.classList.remove('visible');
}

// Clear button handler
clearRouteBtn.addEventListener('click', () => {
  clearRoute();
});

// Get route and draw on map
getRouteBtn.addEventListener('click', async () => {
  if (!originCoord) {
    alert('Please select a valid origin from the suggestions.');
    return;
  }
  if (!destinationCoord) {
    alert('Please select a valid destination from the suggestions.');
    return;
  }
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoord.lon},${originCoord.lat};${destinationCoord.lon},${destinationCoord.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) {
      alert('No route found.');
      return;
    }
    clearRoute();
    const route = json.routes[0];
    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: route.geometry
      }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([destinationCoord.lon, destinationCoord.lat]).addTo(map);
    activeMarkers.push(m1, m2);
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeSummary.textContent = `Distance: ${distanceKm} km · Duration: ${durationMin} min`;
    routeInfoBox.classList.add('visible');
    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// Add geolocate button for location tracking
const locationBtn = document.getElementById('location-btn');
locationBtn.addEventListener('click', () => {
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
  });
  map.addControl(geolocate);
  geolocate.trigger();
});
