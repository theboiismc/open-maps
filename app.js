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

map.addControl(new maplibregl.NavigationControl(), 'top-left');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-left');

// Satellite toggle setup
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

document.getElementById('satellite-toggle').onclick = () => {
  satVisible = !satVisible;
  map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

document.getElementById('regular-toggle').onclick = () => {
  satVisible = false;
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

// DOM refs
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');

const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const sidebarCloseBtn = document.getElementById('sidebar-close');

const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

let originResults = [];
let destinationResults = [];
let originCoord = null;
let destinationCoord = null;
let activeMarkers = [];

const originalParent = searchContainer.parentElement; // where search bar lives initially

// Nominatim search helper
async function nominatimSearch(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, results) {
  clearSuggestions(container);
  results.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;
    div.dataset.idx = i;
    container.append(div);
  });
}

// Search autocomplete (main search input outside sidebar)
searchInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    clearSuggestions(suggestionsBox);
    return;
  }
  destinationResults = await nominatimSearch(q);
  renderSuggestions(suggestionsBox, destinationResults);
});

suggestionsBox.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destinationResults[idx];

  searchInput.value = place.display_name;
  destinationCoord = { lon: +place.lon, lat: +place.lat };

  // Move sidebar and search bar inside it
  openSidebar();

  // Hide suggestions box
  clearSuggestions(suggestionsBox);

  // Fly to selected place on map
  map.flyTo({ center: [destinationCoord.lon, destinationCoord.lat], zoom: 14 });

  // Hide directions form and reset toggle button
  directionsForm.style.display = 'none';
  directionsToggle.textContent = 'Show Directions';

  // Clear origin input + coords for fresh directions
  originInput.value = '';
  originCoord = null;
  clearSuggestions(originSuggestions);
});

// Sidebar open function
function openSidebar() {
  sidebar.hidden = false;
  sidebar.classList.add('open');
  // Move search container inside sidebar content, at top
  sidebarContent.insertBefore(searchContainer, sidebarContent.firstChild);
}

// Sidebar close function
function closeSidebar() {
  sidebar.classList.remove('open');
  // Move search container back to original place
  originalParent.insertBefore(searchContainer, originalParent.firstChild);
  setTimeout(() => {
    sidebar.hidden = true;
  }, 300);
}

sidebarCloseBtn.addEventListener('click', closeSidebar);

// Directions toggle button
directionsToggle.addEventListener('click', () => {
  if (directionsForm.style.display === 'flex' || directionsForm.style.display === 'block') {
    directionsForm.style.display = 'none';
    directionsToggle.textContent = 'Show Directions';
  } else {
    directionsForm.style.display = 'flex';
    directionsToggle.textContent = 'Hide Directions';

    // If destination input is empty in form, prefill with main search selection
    if (!destinationInput.value && destinationCoord) {
      destinationInput.value = searchInput.value;
      // Set destination coords to match
      destinationCoord = { ...destinationCoord };
    }
  }
});

// Origin autocomplete inside directions form
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

// Destination autocomplete inside directions form
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

// Close suggestions on outside click
document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) clearSuggestions(suggestionsBox);
  if (!originInput.contains(e.target) && !originSuggestions.contains(e.target)) clearSuggestions(originSuggestions);
  if (!destinationInput.contains(e.target) && !destinationSuggestions.contains(e.target)) clearSuggestions(destinationSuggestions);
});

// Hide suggestions on ESC key
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

// Clear route function
function clearRoute() {
  if (map.getLayer('route-line')) map.removeLayer('route-line');
  if (map.getSource('route-line')) map.removeSource('route-line');
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
}

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
});

// Get and draw route on map
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

    // Add origin and destination markers
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([destinationCoord.lon, destinationCoord.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    // Fly to midpoint of route
    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});
