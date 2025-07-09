// Initialize MapLibre
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty', // Default regular style
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

// Regular and Satellite Layer Setup
let satelliteLayerAdded = false;  // Track if satellite layer is added

const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

// Function to add Satellite Layer
const addSatelliteLayer = () => {
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
};

// Switch map to Satellite View
const switchToSatellite = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  satelliteToggle.classList.add('active');
  regularToggle.classList.remove('active');
};

// Switch map to Regular View
const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
};

// Add Satellite Layer when map loads
map.on('load', () => {
  addSatelliteLayer(); // Ensure satellite layer is available
  switchToRegular();   // Default to Regular view on load
});

// Handle Regular and Satellite button clicks
satelliteToggle.onclick = () => {
  switchToSatellite(); // Switch to Satellite view
};

regularToggle.onclick = () => {
  switchToRegular();   // Switch to Regular view
};

// Directions Panel Elements
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const destinationSuggestionsBox = document.getElementById('destination-suggestions');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

// Function to handle Nominatim search
async function nominatimSearch(query) {
  if (!query) return [];
  // Return empty array if query is empty
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
  return res.json();
}

// Render suggestions in the box
function renderSuggestions(container, results) {
  container.innerHTML = ''; // Clear previous suggestions
  if (results.length === 0) return;

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

// Event listener for the origin search input
originInput.addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    originSuggestionsBox.innerHTML = ''; // Clear suggestions if empty
    return;
  }
  const results = await nominatimSearch(query);
  renderSuggestions(originSuggestionsBox, results);
});

// Event listener for the destination search input
destinationInput.addEventListener('input', async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    destinationSuggestionsBox.innerHTML = ''; // Clear suggestions if empty
    return;
  }
  const results = await nominatimSearch(query);
  renderSuggestions(destinationSuggestionsBox, results);
});

// Handle click on suggestions
function handleSuggestionClick(e, inputField, suggestionsBox) {
  const idx = e.target.dataset.idx;
  if (idx == null) return;

  const selectedPlace = e.target.textContent;
  const selectedLatLon = [parseFloat(e.target.dataset.lon), parseFloat(e.target.dataset.lat)];

  inputField.value = selectedPlace;
  map.flyTo({ center: selectedLatLon, zoom: 14 });
  suggestionsBox.innerHTML = ''; // Clear suggestions after selecting

  return selectedLatLon;
}

// Handle clicks on origin suggestions
originSuggestionsBox.addEventListener('click', (e) => {
  const selectedLatLon = handleSuggestionClick(e, originInput, originSuggestionsBox);
  if (selectedLatLon) originLatLon = selectedLatLon;
});

// Handle clicks on destination suggestions
destinationSuggestionsBox.addEventListener('click', (e) => {
  const selectedLatLon = handleSuggestionClick(e, destinationInput, destinationSuggestionsBox);
  if (selectedLatLon) destinationLatLon = selectedLatLon;
});

// Route API Call (Using OpenRouteService as an example)
async function getRoute(originLatLon, destinationLatLon) {
  const [originLng, originLat] = originLatLon;
  const [destinationLng, destinationLat] = destinationLatLon;

  const apiKey = 'YOUR_OPENROUTESERVICE_API_KEY'; // Replace with your API key
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${originLng},${originLat}&end=${destinationLng},${destinationLat}`;

  const res = await fetch(url);
  const data = await res.json();
  return data.routes[0].geometry.coordinates;
}

// Handle "Get Route" button click
getRouteBtn.addEventListener('click', async () => {
  const originLatLon = window.originLatLon; // Stored in global after selection
  const destinationLatLon = window.destinationLatLon; // Stored in global after selection

  if (originLatLon && destinationLatLon) {
    const route = await getRoute(originLatLon, destinationLatLon);
    // Add route to map
    const routeGeoJSON = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route
      }
    };

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
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#6750a4',
          'line-width': 6
        }
      });
    }
  }
});

// Handle "Clear Route" button click
clearRouteBtn.addEventListener('click', () => {
  // Clear the route from the map
  map.removeLayer('route');
  map.removeSource('route');
});
