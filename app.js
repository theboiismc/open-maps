// Config and global vars
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json', // default style (regular)
  center: [-98.5795, 39.8283], // USA center coords
  zoom: 3,
  pitch: 0,
  bearing: 0,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
});

let currentRoute = null;
let directionsLayerId = 'route-line';
let originCoords = null;
let destCoords = null;

const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const getDirectionsBtn = document.getElementById('get-directions');
const clearDirectionsBtn = document.getElementById('clear-directions');
const routeInfoPanel = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');
const routeETA = document.getElementById('route-eta');
const closeRouteInfoBtn = document.getElementById('close-route-info');
const layerToggle = document.querySelector('.layer-toggle');
const regularToggleBtn = document.getElementById('regular-toggle');
const satelliteToggleBtn = document.getElementById('satellite-toggle');
const darkToggleBtn = document.getElementById('dark-toggle');

// Dynamic Start Navigation button
let startNavigationBtn = null;

// Helpers
function clearRoute() {
  if (map.getLayer(directionsLayerId)) {
    map.removeLayer(directionsLayerId);
  }
  if (map.getSource(directionsLayerId)) {
    map.removeSource(directionsLayerId);
  }
  currentRoute = null;
  originCoords = null;
  destCoords = null;
  routeInfoPanel.classList.add('hidden');
  directionsUI.style.display = 'none';
  clearDirectionsBtn.style.display = 'none';
  if (startNavigationBtn) startNavigationBtn.remove();
  startNavigationBtn = null;
}

function showRouteInfo(summary, eta) {
  routeSummary.textContent = summary;
  routeETA.textContent = eta ? `ETA: ${eta}` : '';
  routeInfoPanel.classList.remove('hidden');
}

// Nominatim Search API call helper (free & no key)
async function fetchNominatim(query) {
  if (!query) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TheBoiisMCMap/1.0 (aidan)' } });
    if (!res.ok) throw new Error('Nominatim API error');
    const data = await res.json();
    return data;
  } catch {
    return [];
  }
}

// Show suggestions helper
function showSuggestions(container, places) {
  container.innerHTML = '';
  places.forEach(place => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.dataset.lat = place.lat;
    div.dataset.lon = place.lon;
    container.appendChild(div);
  });
  container.style.display = places.length ? 'block' : 'none';
}

// Clear suggestions container
function clearSuggestions(container) {
  container.innerHTML = '';
  container.style.display = 'none';
}

// Search input handlers
searchInput.addEventListener('input', async () => {
  const query = searchInput.value.trim();
  if (!query) {
    clearSuggestions(suggestions);
    return;
  }
  const results = await fetchNominatim(query);
  showSuggestions(suggestions, results);
});
suggestions.addEventListener('click', (e) => {
  if (!e.target.classList.contains('suggestion')) return;
  const lat = parseFloat(e.target.dataset.lat);
  const lon = parseFloat(e.target.dataset.lon);
  map.flyTo({ center: [lon, lat], zoom: 14 });
  clearSuggestions(suggestions);
  searchInput.value = e.target.textContent;
  // Show directions UI
  directionsUI.style.display = 'flex';
  destCoords = [lon, lat];
});

// Origin input handlers with suggestions
originInput.addEventListener('input', async () => {
  const query = originInput.value.trim();
  if (!query) {
    clearSuggestions(originSuggestions);
    return;
  }
  const results = await fetchNominatim(query);
  showSuggestions(originSuggestions, results);
});
originSuggestions.addEventListener('click', (e) => {
  if (!e.target.classList.contains('suggestion')) return;
  const lat = parseFloat(e.target.dataset.lat);
  const lon = parseFloat(e.target.dataset.lon);
  originCoords = [lon, lat];
  originInput.value = e.target.textContent;
  clearSuggestions(originSuggestions);
});

// Use geolocation for origin on focus if empty
originInput.addEventListener('focus', () => {
  if (originInput.value.trim()) return;
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    originCoords = [pos.coords.longitude, pos.coords.latitude];
    originInput.value = 'My Location';
  });
});

// Directions fetch from OpenRouteService free API (requires key, but here is no-key alternative - fallback on public API)
// I’ll use OpenRouteService public demo API (low quota, but no key required here for testing)
async function fetchRoute(origin, dest) {
  if (!origin || !dest) return null;
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=5b3ce3597851110001cf6248e46207f7ef56fae3c2f5f403d32b42e2&start=${origin[0]},${origin[1]}&end=${dest[0]},${dest[1]}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing API error');
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// Draw route on map
function drawRoute(geojson) {
  // Remove old route if exists
  if (map.getLayer(directionsLayerId)) {
    map.removeLayer(directionsLayerId);
  }
  if (map.getSource(directionsLayerId)) {
    map.removeSource(directionsLayerId);
  }
  map.addSource(directionsLayerId, {
    type: 'geojson',
    data: geojson,
  });
  map.addLayer({
    id: directionsLayerId,
    type: 'line',
    source: directionsLayerId,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#0078ff',
      'line-width': 6,
      'line-opacity': 0.8,
    },
  });
  map.fitBounds([
    [geojson.bbox[0], geojson.bbox[1]],
    [geojson.bbox[2], geojson.bbox[3]],
  ], {
    padding: 50,
  });
}

// Format duration in min/hours
function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins === 0 ? `${hrs} hr` : `${hrs} hr ${mins} min`;
}

// Get directions button handler
getDirectionsBtn.addEventListener('click', async () => {
  if (!destCoords) return alert('Pick a destination first');
  if (!originCoords) return alert('Set origin or allow location');
  routeSummary.textContent = 'Calculating route...';
  routeETA.textContent = '';
  routeInfoPanel.classList.remove('hidden');

  const routeData = await fetchRoute(originCoords, destCoords);
  if (!routeData || !routeData.features?.length) {
    routeSummary.textContent = 'No route found.';
    return;
  }

  currentRoute = routeData.features[0];
  drawRoute(currentRoute.geometry);

  const duration = currentRoute.properties.summary.duration;
  const distance = currentRoute.properties.summary.distance / 1000; // km
  const summary = `Distance: ${distance.toFixed(1)} km`;
  const eta = formatDuration(duration);

  showRouteInfo(summary, eta);

  // Show Clear button and directions UI if hidden
  clearDirectionsBtn.style.display = 'block';
  directionsUI.style.display = 'flex';

  // Add Start Navigation button if not exists
  if (!startNavigationBtn) {
    startNavigationBtn = document.createElement('button');
    startNavigationBtn.id = 'start-navigation';
    startNavigationBtn.textContent = 'Start Route';
    startNavigationBtn.addEventListener('click', () => {
      alert('Navigation started! (Voice guidance coming soon)');
      // Future: implement step-by-step with voice here
    });
    directionsUI.appendChild(startNavigationBtn);
  }
});

// Clear directions handler
clearDirectionsBtn.addEventListener('click', () => {
  clearRoute();
  searchInput.value = '';
  originInput.value = '';
  clearSuggestions(suggestions);
  clearSuggestions(originSuggestions);
});

// Close route info panel
closeRouteInfoBtn.addEventListener('click', () => {
  routeInfoPanel.classList.add('hidden');
});

// Layer toggles
regularToggleBtn.addEventListener('click', () => {
  map.setStyle('https://demotiles.maplibre.org/style.json');
  regularToggleBtn.classList.add('active');
  regularToggleBtn.setAttribute('aria-pressed', 'true');
  satelliteToggleBtn.classList.remove('active');
  satelliteToggleBtn.setAttribute('aria-pressed', 'false');
});
satelliteToggleBtn.addEventListener('click', () => {
  // Use OpenMapTiles satellite style
  map.setStyle('https://tiles.stadiamaps.com/styles/alidade_smooth_satellite.json');
  satelliteToggleBtn.classList.add('active');
  satelliteToggleBtn.setAttribute('aria-pressed', 'true');
  regularToggleBtn.classList.remove('active');
  regularToggleBtn.setAttribute('aria-pressed', 'false');
});
darkToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const enabled = document.body.classList.contains('dark-mode');
  darkToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
});

// Swipe-to-dismiss route info panel on mobile
let startY = 0;
let currentY = 0;
let isDragging = false;

routeInfoPanel.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  startY = e.touches[0].clientY;
  isDragging = true;
  routeInfoPanel.style.transition = 'none';
});
routeInfoPanel.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;
  if (deltaY > 0) { // only drag down
    routeInfoPanel.style.transform = `translateY(${deltaY}px)`;
  }
});
routeInfoPanel.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  routeInfoPanel.style.transition = 'transform 0.3s ease';
  const deltaY = currentY - startY;
  if (deltaY > routeInfoPanel.offsetHeight / 3) {
    routeInfoPanel.classList.add('hidden');
  } else {
    routeInfoPanel.style.transform = 'translateY(0)';
  }
});
routeInfoPanel.addEventListener('touchcancel', () => {
  if (!isDragging) return;
  isDragging = false;
  routeInfoPanel.style.transition = 'transform 0.3s ease';
  routeInfoPanel.style.transform = 'translateY(0)';
});
