// Map initialization
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
});

// Layers toggle
let satelliteLayerAdded = false;
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

function addSatelliteLayer() {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    });
    map.addLayer({
      id: 'sat-layer',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.8 },
    });
    satelliteLayerAdded = true;
  }
}

function switchToSatellite() {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  satelliteToggle.classList.add('active');
  regularToggle.classList.remove('active');
}

function switchToRegular() {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
}

map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

satelliteToggle.addEventListener('click', switchToSatellite);
regularToggle.addEventListener('click', switchToRegular);

// DOM references
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

// Photon-based search
async function photonSearch(q) {
  if (!q) return [];
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
  const json = await res.json();
  return json.features || [];
}

// Helpers
function clearSuggestions() {
  suggestionsBox.innerHTML = '';
}

function renderSuggestions(features) {
  clearSuggestions();
  features.forEach((feature, idx) => {
    const d = feature.geometry.coordinates;
    const name = feature.properties.name || feature.properties.osm_value || feature.properties.street || 'Unknown';
    const item = document.createElement('div');
    item.className = 'suggestion';
    item.textContent = name;
    item.tabIndex = 0;
    item.dataset.lon = d[0];
    item.dataset.lat = d[1];
    item.dataset.idx = idx;
    suggestionsBox.appendChild(item);
  });
}

// Search input
searchInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) { clearSuggestions(); return; }
  const hits = await photonSearch(q);
  renderSuggestions(hits);
});

// Handle suggestion clicks
suggestionsBox.addEventListener('click', (e) => {
  const lon = +e.target.dataset.lon;
  const lat = +e.target.dataset.lat;
  if (isNaN(lon) || isNaN(lat)) return;
  searchInput.value = e.target.textContent;
  map.flyTo({ center: [lon, lat], zoom: 14 });
  sidebar.hidden = false;
  sidebar.classList.add('open');
  document.getElementById('place-info').textContent = `📍 ${e.target.textContent}`;
  clearSuggestions();
});

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    clearSuggestions();
  }
});

// Sidebar close
sidebarCloseBtn.addEventListener('click', () => {
  sidebar.hidden = true;
  sidebar.classList.remove('open');
});

// Toggle directions
directionsToggle.addEventListener('click', () => {
  directionsForm.classList.toggle('hidden');
});

// Route buttons
getRouteBtn.addEventListener('click', () => {
  const o = originInput.value.trim();
  const dest = destinationInput.value.trim();
  if (o && dest) console.log(`Route from ${o} to ${dest}`);
});
clearRouteBtn.addEventListener('click', () => {
  originInput.value = '';
  destinationInput.value = '';
  console.log('Route cleared');
});
