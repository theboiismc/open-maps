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
  minZoom: 1,
});

// Regular and Satellite Layer Setup
let satelliteLayerAdded = false; // Track if satellite layer is added
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

// Function to add Satellite Layer
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

// Switch map to Satellite View
const switchToSatellite = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  satelliteToggle.classList.add('active');
  satelliteToggle.setAttribute('aria-pressed', 'true');
  regularToggle.classList.remove('active');
  regularToggle.setAttribute('aria-pressed', 'false');
};

// Switch map to Regular View
const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  regularToggle.setAttribute('aria-pressed', 'true');
  satelliteToggle.classList.remove('active');
  satelliteToggle.setAttribute('aria-pressed', 'false');
};

// Add Satellite Layer when map loads
map.on('load', () => {
  addSatelliteLayer(); // Ensure satellite layer is available
  switchToRegular(); // Default to Regular view on load
});

// Handle Regular and Satellite button clicks
satelliteToggle.onclick = () => {
  switchToSatellite();
};
regularToggle.onclick = () => {
  switchToRegular();
};

// Search Bar DOM references
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const placeInfo = document.getElementById('place-info');

// Photon Search (OpenStreetMap-based, CORS-friendly)
async function photonSearch(query) {
  if (!query) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const data = await res.json();
    // Map Photon results to a consistent format similar to Nominatim
    return data.features.map((feature) => {
      return {
        display_name:
          feature.properties.name +
          (feature.properties.state ? ', ' + feature.properties.state : '') +
          (feature.properties.country ? ', ' + feature.properties.country : ''),
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
      };
    });
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Clear the suggestion box
function clearSuggestions(container) {
  container.innerHTML = ''; // Clear all suggestions
}

// Render suggestions in the box
function renderSuggestions(container, results) {
  clearSuggestions(container);
  if (results.length === 0) return; // Don't show anything if no results
  results.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0; // Make it focusable
    div.dataset.lon = place.lon; // Store longitude
    div.dataset.lat = place.lat; // Store latitude
    div.dataset.idx = i; // Store index for identification
    container.appendChild(div);
  });
}

// Listen for user input in the search field
searchInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim(); // Trim the input for clean data
  if (!q) {
    clearSuggestions(suggestionsBox); // Clear suggestions if input is empty
    return;
  }
  const results = await photonSearch(q); // Get suggestions from Photon API
  renderSuggestions(suggestionsBox, results); // Render the suggestions
});

// Handle click event on suggestions
suggestionsBox.addEventListener('click', (e) => {
  const idx = e.target.dataset.idx;
  if (idx == null) return; // If no suggestion clicked, do nothing
  const selectedPlace = e.target.textContent;
  const selectedLatLon = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];
  searchInput.value = selectedPlace; // Set the selected place to the search input
  map.flyTo({ center: selectedLatLon, zoom: 14 }); // Fly to the selected place on the map
  sidebar.classList.add('open');
  sidebar.hidden = false;
  placeInfo.textContent = selectedPlace;
});

// Close suggestions when clicking outside of them
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    clearSuggestions(suggestionsBox);
  }
});

// Close sidebar when clicking the close button
sidebarCloseBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// Directions Panel Toggle
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');

// Toggle Directions Form visibility
directionsToggle.addEventListener('click', () => {
  directionsForm.classList.toggle('hidden');
});

// Directions Handling
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeSummary = document.getElementById('route-summary');

// Function to draw route on the map
let routeLayerAdded = false;
function drawRoute(geojson) {
  if (routeLayerAdded) {
    map.getSource('route').setData(geojson);
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: geojson,
    });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#1E90FF',
        'line-width': 6,
        'line-opacity': 0.8,
      },
    });
    routeLayerAdded = true;
  }
}

// Clear route from the map
function clearRoute() {
  if (routeLayerAdded) {
    map.removeLayer('route');
    map.removeSource('route');
    routeLayerAdded = false;
  }
  routeSummary.textContent = '';
}

// Get route from OpenRouteService (keyless, but limited)
// We'll use OpenRouteService's demo endpoint for demo purpose (no key, but limited requests)
// Alternatively, you can swap with any other free routing API that supports CORS.
async function getRoute(originCoords, destinationCoords) {
  const coords = `${originCoords[0]},${originCoords[1]}|${destinationCoords[0]},${destinationCoords[1]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${originCoords[0]},${originCoords[1]};${destinationCoords[0]},${destinationCoords[1]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch route');
    const data = await res.json();
    if (data.code !== 'Ok') throw new Error('Routing error: ' + data.message);
    return data.routes[0];
  } catch (err) {
    console.error(err);
    alert('Failed to get route: ' + err.message);
    return null;
  }
}

// Geocode helper for directions inputs (use Photon)
async function geocode(query) {
  if (!query) return null;
  const results = await photonSearch(query);
  if (results.length === 0) return null;
  return [parseFloat(results[0].lon), parseFloat(results[0].lat)];
}

// Handle "Get Route" button click
getRouteBtn.addEventListener('click', async () => {
  const originQuery = originInput.value.trim();
  const destinationQuery = destinationInput.value.trim();
  if (!originQuery || !destinationQuery) {
    alert('Please enter both origin and destination.');
    return;
  }
  const originCoords = await geocode(originQuery);
  const destinationCoords = await geocode(destinationQuery);
  if (!originCoords || !destinationCoords) {
    alert('Could not find coordinates for one or both locations.');
    return;
  }
  const route = await getRoute(originCoords, destinationCoords);
  if (!route) return;
  const geojson = {
    type: 'Feature',
    geometry: route.geometry,
  };
  drawRoute(geojson);
  // Fly map to route midpoint
  const midPoint = [
    (originCoords[0] + destinationCoords[0]) / 2,
    (originCoords[1] + destinationCoords[1]) / 2,
  ];
  map.flyTo({ center: midPoint, zoom: 12 });
  // Show summary
  const distKm = (route.distance / 1000).toFixed(2);
  const durMin = Math.round(route.duration / 60);
  routeSummary.textContent = `Distance: ${distKm} km, Duration: ${durMin} min`;
});

// Clear route information
clearRouteBtn.addEventListener('click', () => {
  originInput.value = '';
  destinationInput.value = '';
  clearRoute();
});
