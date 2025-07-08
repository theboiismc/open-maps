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
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeSummary = document.getElementById('route-summary');
const routeInfoBox = document.getElementById('route-info');

let destinationResults = [];
let originResults = [];
let originCoord = null;
let destinationCoord = null;
let activeMarkers = [];

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

// Search autocomplete
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

  // Open sidebar with place info and directions toggle
  sidebar.hidden = false;
  setTimeout(() => sidebar.classList.add('open'), 10);

  directionsForm.style.display = 'none';
  directionsToggle.textContent = 'Show Directions';

  clearSuggestions(suggestionsBox);

  // Fly to selected place
  map.flyTo({ center: [destinationCoord.lon, destinationCoord.lat], zoom: 14 });
});

// Sidebar close button
sidebarCloseBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
  setTimeout(() => { sidebar.hidden = true; }, 300);
});

// Directions toggle
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

// Close suggestions on click outside
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

// Clear route function
function clearRoute() {
  if (map.getLayer('route-line')) map.removeLayer('route-line');
  if (map.getSource('route-line')) map.removeSource('route-line');
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  // Removed routeSummary & routeInfoBox UI updates completely
}

// Clear route button
clearRouteBtn.addEventListener('click', () => {
  clearRoute();
});

// Get and draw route
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

    // Removed route summary display here

    // Fly to midpoint
    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});
