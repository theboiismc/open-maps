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

// Add Geolocation Control (without default maplibre controls)
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'bottom-right');

// Satellite Layer Toggle
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

// Handle layer toggle for Satellite view
const satelliteToggle = document.getElementById('satellite-toggle');
satelliteToggle.onclick = () => {
  satVisible = !satVisible;
  map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
  satelliteToggle.classList.toggle('active', satVisible);
};

// Search bar DOM references
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');

// Helper for Nominatim search
async function nominatimSearch(query) {
  if (!query) return [];  // Return empty array if query is empty
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
  return res.json();
}

// Clear the suggestion box
function clearSuggestions(container) {
  container.innerHTML = '';  // Clear all suggestions
}

// Render suggestions in the box
function renderSuggestions(container, results) {
  clearSuggestions(container);
  if (results.length === 0) return;  // Don't show anything if no results
  
  results.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0;  // Make it focusable
    div.dataset.lon = place.lon;  // Store longitude
    div.dataset.lat = place.lat;  // Store latitude
    div.dataset.idx = i;  // Store index for identification
    container.appendChild(div);
  });
}

// Listen for user input in the search field
searchInput.addEventListener('input', async e => {
  const q = e.target.value.trim();  // Trim the input for clean data
  if (!q) {
    clearSuggestions(suggestionsBox);  // Clear suggestions if input is empty
    return;
  }

  const results = await nominatimSearch(q);  // Get suggestions from Nominatim API
  renderSuggestions(suggestionsBox, results);  // Render the suggestions
});

// Handle click event on suggestion
suggestionsBox.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;  // If no suggestion clicked, do nothing
  
  const selectedPlace = e.target.textContent;
  const selectedLatLon = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];

  searchInput.value = selectedPlace;  // Set the selected place to the search input
  map.flyTo({ center: selectedLatLon, zoom: 14 });  // Fly to the selected place on the map
  
  // Optionally, show sidebar with place info (you can modify as needed)
  sidebar.classList.add('open');
  sidebar.hidden = false;
  // Set place info or handle as per your app structure
});

// Close suggestions when clicking outside of them
document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    clearSuggestions(suggestionsBox);
  }
});
