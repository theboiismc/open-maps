// Initialize MapLibre map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty', // default style
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

// Add MapLibre default controls (zoom + geolocation)
const nav = new maplibregl.NavigationControl({ showCompass: true });
map.addControl(nav, 'bottom-right');

const geolocate = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
});
map.addControl(geolocate, 'bottom-right');

// DOM elements
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const searchBar = document.querySelector('.search-bar');
const styleToggleBtn = document.getElementById('style-toggle');
const styleToggleImg = document.getElementById('style-toggle-img');

const routeInfoDiv = document.getElementById('route-info');

// Track current style (regular = true, satellite = false)
let isRegularStyle = true;

// Add satellite raster layer flag & setup
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

function switchToRegular() {
  if (satelliteLayerAdded) {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
  }
  styleToggleImg.src = 'default_style.png';
  styleToggleBtn.setAttribute('aria-pressed', 'false');
  isRegularStyle = true;
}

function switchToSatellite() {
  if (!satelliteLayerAdded) addSatelliteLayer();
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  styleToggleImg.src = 'satelite_style.png';
  styleToggleBtn.setAttribute('aria-pressed', 'true');
  isRegularStyle = false;
}

// Toggle map style button click
styleToggleBtn.addEventListener('click', () => {
  if (isRegularStyle) {
    switchToSatellite();
  } else {
    switchToRegular();
  }
});

// On map load, add satellite layer and default to regular style
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

// Directions panel toggle logic
const directionsPanelId = 'directions-form';

// We'll create directions form dynamically to avoid errors (since your HTML only has directions-toggle button)
// So let's build minimal directions panel here:

let directionsPanel = document.getElementById(directionsPanelId);
if (!directionsPanel) {
  directionsPanel = document.createElement('div');
  directionsPanel.id = directionsPanelId;
  directionsPanel.style.position = 'fixed';
  directionsPanel.style.top = '0';
  directionsPanel.style.left = '0';
  directionsPanel.style.width = '320px';
  directionsPanel.style.height = '100%';
  directionsPanel.style.background = '#fff';
  directionsPanel.style.padding = '20px';
  directionsPanel.style.boxShadow = '2px 0 12px rgba(0,0,0,0.15)';
  directionsPanel.style.display = 'none';
  directionsPanel.style.flexDirection = 'column';
  directionsPanel.style.zIndex = '10002';
  directionsPanel.style.borderRadius = '0 0 24px 0';
  directionsPanel.innerHTML = `
    <button id="close-directions" aria-label="Close directions panel" style="font-size:28px; background:none; border:none; cursor:pointer; color:#6750a4; margin-bottom:12px;">×</button>
    <input id="origin" type="text" placeholder="Start" aria-label="Origin" autocomplete="off" spellcheck="false" style="width:100%; padding:12px; margin-bottom:8px; border:1px solid #ddd; border-radius:8px;" />
    <div id="origin-suggestions" role="listbox" tabindex="-1" style="max-height: 150px; overflow-y:auto; margin-bottom:8px;"></div>
    <input id="destination" type="text" placeholder="Destination" aria-label="Destination" autocomplete="off" spellcheck="false" style="width:100%; padding:12px; margin-bottom:8px; border:1px solid #ddd; border-radius:8px;" />
    <div id="destination-suggestions" role="listbox" tabindex="-1" style="max-height: 150px; overflow-y:auto; margin-bottom:8px;"></div>
    <button id="get-route" style="background-color:#6750a4; color:#fff; padding:12px 20px; border-radius:20px; border:none; cursor:pointer; font-weight:500; margin-bottom:8px;">Get Directions</button>
    <button id="clear-route" style="background-color:#b3261e; color:#fff; padding:12px 20px; border-radius:20px; border:none; cursor:pointer; font-weight:500;">Clear</button>
    <div id="route-info" role="region" aria-live="polite" aria-atomic="true" style="margin-top: 8px; font-weight: 500;"></div>
  `;
  document.body.appendChild(directionsPanel);
}

// Show/hide directions panel
function openDirectionsPanel() {
  directionsPanel.style.display = 'flex';
  // Move style toggle left to avoid overlap
  styleToggleBtn.style.transform = 'translateX(70px)';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  // Optionally hide search bar if needed
  searchBar.style.display = 'none';
}

function closeDirectionsPanel() {
  directionsPanel.style.display = 'none';
  styleToggleBtn.style.transform = 'translateX(0)';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  searchBar.style.display = 'block';
}

// Directions toggle button click
directionsToggleBtn.addEventListener('click', () => {
  if (directionsPanel.style.display === 'flex') {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

// Close directions panel on close button click
document.getElementById('close-directions').addEventListener('click', closeDirectionsPanel);

// Close on ESC key press
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsPanel.style.display === 'flex') {
    closeDirectionsPanel();
  }
});

// Prevent directions panel from closing on suggestion clicks
// No click outside close needed, only close with X or ESC

// Photon search setup
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

function setupSearch(inputEl, suggestionsEl) {
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

    // Center map if it's the main search input
    if (inputEl.id === 'search') {
      map.flyTo({ center: [lon, lat], zoom: 14 });
    }
  });

  suggestionsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
      e.preventDefault();
      e.target.click();
      inputEl.focus();
    }
  });

  // Close suggestions when clicking outside input or suggestions
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

// Setup search bars
setupSearch(document.getElementById('search'), document.getElementById('suggestions'));
setupSearch(document.getElementById('origin'), document.getElementById('origin-suggestions'));
setupSearch(document.getElementById('destination'), document.getElementById('destination-suggestions'));

// Routing with OSRM
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

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

getRouteBtn.addEventListener('click', async () => {
  const originInput = document.getElementById('origin');
  const destinationInput = document.getElementById('destination');

  const originLon = originInput.dataset.lon;
  const originLat = originInput.dataset.lat;
  const destinationLon = destinationInput.dataset.lon;
  const destinationLat = destinationInput.dataset.lat;

  if (!originLon || !originLat || !destinationLon || !destinationLat) {
    alert("Please select both origin and destination from suggestions.");
    return;
  }

  clearRoute();

  const coords = `${originLon},${originLat};${destinationLon},${destinationLat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  routeInfoDiv.textContent = 'Routing...';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing request failed');
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found');

    const route = data.routes[0];
    drawRoute({
      type: 'Feature',
      geometry: route.geometry
    });

    map.fitBounds([
      [originLon, originLat],
      [destinationLon, destinationLat]
    ], { padding: 60 });

    routeInfoDiv.textContent = `Distance: ${(route.distance / 1000).toFixed(1)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;

  } catch (e) {
    routeInfoDiv.textContent = 'Failed to get route.';
    console.error(e);
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  const originInput = document.getElementById('origin');
  const destinationInput = document.getElementById('destination');

  originInput.value = '';
  destinationInput.value = '';
  originInput.dataset.lon = '';
  originInput.dataset.lat = '';
  destinationInput.dataset.lon = '';
  destinationInput.dataset.lat = '';
  routeInfoDiv.textContent = '';
});
