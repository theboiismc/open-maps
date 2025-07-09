// Map Initialization
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
});

// Satellite Layer Setup
let satelliteLayerAdded = false;
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
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
};

map.on('load', () => {
  addSatelliteLayer();
});

// Photon Search Helper
async function photonSearch(query) {
  if (!query) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const data = await res.json();
    return data.features.map(f => {
      const props = f.properties;
      return {
        display_name:
          (props.name || '') +
          (props.state ? ', ' + props.state : '') +
          (props.country ? ', ' + props.country : ''),
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      };
    });
  } catch (err) {
    console.error('Photon search error:', err);
    return [];
  }
}

// Main Search Bar elements
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');

function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, results) {
  clearSuggestions(container);
  if (!results.length) return;
  results.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0;
    div.dataset.lon = place.lon;
    div.dataset.lat = place.lat;
    container.appendChild(div);
  });
}

// Main Search Input events
searchInput.addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (!query) return clearSuggestions(suggestionsBox);
  const results = await photonSearch(query);
  renderSuggestions(suggestionsBox, results);
});

suggestionsBox.addEventListener('click', (e) => {
  if (!e.target.classList.contains('suggestion')) return;
  const lon = parseFloat(e.target.dataset.lon);
  const lat = parseFloat(e.target.dataset.lat);
  const name = e.target.textContent;
  searchInput.value = name;
  clearSuggestions(suggestionsBox);
  map.flyTo({ center: [lon, lat], zoom: 14 });
});

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    clearSuggestions(suggestionsBox);
  }
});

// Directions UI Elements
const directionsBtn = document.getElementById('directions-btn');
const directionsPanel = document.getElementById('directions-panel');
const originInput = document.getElementById('origin-input');
const destinationInput = document.getElementById('destination-input');
const originSuggestions = document.getElementById('directions-suggestions-origin');
const destinationSuggestions = document.getElementById('directions-suggestions-dest');
const getRouteBtn = document.getElementById('get-route-btn');
const clearRouteBtn = document.getElementById('clear-route-btn');
const routeSummary = document.getElementById('route-summary');

function toggleDirectionsPanel() {
  const isOpen = directionsPanel.classList.toggle('open');
  directionsBtn.setAttribute('aria-expanded', isOpen.toString());
}
directionsBtn.addEventListener('click', toggleDirectionsPanel);

// Photon autocomplete for directions inputs
async function handleDirectionsInput(e, suggestionsContainer) {
  const query = e.target.value.trim();
  if (!query) {
    clearSuggestions(suggestionsContainer);
    return;
  }
  const results = await photonSearch(query);
  clearSuggestions(suggestionsContainer);
  results.forEach(place => {
    const div = document.createElement('div');
    div.className = 'directions-suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0;
    div.dataset.lon = place.lon;
    div.dataset.lat = place.lat;
    suggestionsContainer.appendChild(div);
  });
}

// Fill input with clicked suggestion & clear suggestions
function directionsSuggestionClick(e, inputEl, suggestionsContainer) {
  if (!e.target.classList.contains('directions-suggestion')) return;
  inputEl.value = e.target.textContent;
  inputEl.dataset.lon = e.target.dataset.lon;
  inputEl.dataset.lat = e.target.dataset.lat;
  clearSuggestions(suggestionsContainer);
}

originInput.addEventListener('input', (e) =>
  handleDirectionsInput(e, originSuggestions)
);
destinationInput.addEventListener('input', (e) =>
  handleDirectionsInput(e, destinationSuggestions)
);

originSuggestions.addEventListener('click', (e) =>
  directionsSuggestionClick(e, originInput, originSuggestions)
);
destinationSuggestions.addEventListener('click', (e) =>
  directionsSuggestionClick(e, destinationInput, destinationSuggestions)
);

// Hide directions suggestions on click outside
document.addEventListener('click', (e) => {
  if (
    !originInput.contains(e.target) &&
    !originSuggestions.contains(e.target)
  ) {
    clearSuggestions(originSuggestions);
  }
  if (
    !destinationInput.contains(e.target) &&
    !destinationSuggestions.contains(e.target)
  ) {
    clearSuggestions(destinationSuggestions);
  }
});

// Route Layer Management
let routeLayerId = 'route-line';
function clearRoute() {
  if (map.getLayer(routeLayerId)) {
    map.removeLayer(routeLayerId);
  }
  if (map.getSource(routeLayerId)) {
    map.removeSource(routeLayerId);
  }
  routeSummary.textContent = '';
  originInput.value = '';
  originInput.dataset.lon = '';
  originInput.dataset.lat = '';
  destinationInput.value = '';
  destinationInput.dataset.lon = '';
  destinationInput.dataset.lat = '';
}

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
});

// Get Route from OSRM API
async function getRoute(origin, destination) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch route');
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error('No route found');
    return data.routes[0];
  } catch (err) {
    console.error('Routing error:', err);
    alert('Could not find a route. Please try different locations.');
    return null;
  }
}

function addRouteToMap(geojson) {
  if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
  if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);

  map.addSource(routeLayerId, {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: routeLayerId,
    type: 'line',
    source: routeLayerId,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#6750a4',
      'line-width': 6,
      'line-opacity': 0.8,
    },
  });
}

getRouteBtn.addEventListener('click', async () => {
  const originLon = originInput.dataset.lon;
  const originLat = originInput.dataset.lat;
  const destLon = destinationInput.dataset.lon;
  const destLat = destinationInput.dataset.lat;

  if (!originLon || !originLat || !destLon || !destLat) {
    alert('Please select valid origin and destination from the suggestions.');
    return;
  }
  const origin = { lon: parseFloat(originLon), lat: parseFloat(originLat) };
  const destination = { lon: parseFloat(destLon), lat: parseFloat(destLat) };

  const route = await getRoute(origin, destination);
  if (!route) return;

  addRouteToMap(route.geometry);

  // Zoom to route bounds
  const coords = route.geometry.coordinates;
  const bounds = coords.reduce(
    (b, coord) => b.extend(coord),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 60 });

  // Show summary
  const distKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);
  routeSummary.textContent = `Distance: ${distKm} km, Duration: ${durationMin} min`;
});
