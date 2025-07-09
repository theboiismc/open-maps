// INIT MAP
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

// Add Navigation and Geolocation controls
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'bottom-right');

// Elements
const searchInput = document.getElementById('search');
const searchIcon = document.getElementById('search-icon');
const suggestionsEl = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationSuggestions = document.getElementById('destination-suggestions');
const directionsForm = document.getElementById('directions-form');
const routeInfoDiv = document.getElementById('route-info');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const directionsToggleBtn = document.getElementById('directions-toggle');
const closeDirectionsBtn = document.getElementById('close-directions');
const styleToggleBtn = document.getElementById('style-toggle');

// STYLE TOGGLE
let currentStyle = 'regular';
let satelliteLayerAdded = false;
function addSatelliteLayer() {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
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
function switchStyle() {
  if (currentStyle === 'regular') {
    addSatelliteLayer();
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    styleToggleBtn.querySelector('span').textContent = 'Satellite';
    styleToggleBtn.style.backgroundImage = "url('satelite_style.png')";
    currentStyle = 'satellite';
  } else {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    styleToggleBtn.querySelector('span').textContent = 'Regular';
    styleToggleBtn.style.backgroundImage = "url('default_style.png')";
    currentStyle = 'regular';
  }
}
styleToggleBtn.addEventListener('click', switchStyle);
map.on('load', () => {
  addSatelliteLayer();
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
});

// PHOTON SEARCH
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
    if (inputEl.id === 'search') map.flyTo({ center: [lon, lat], zoom: 14 });
  });

  suggestionsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
      e.preventDefault();
      e.target.click();
      inputEl.focus();
    }
  });
}

setupSearch(searchInput, suggestionsEl);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Search icon triggers first suggestion
searchIcon.addEventListener('click', () => {
  const first = document.querySelector('#suggestions .suggestion');
  if (first) first.click();
});

// ROUTING
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
    const route = data.routes[0];
    drawRoute({ type: 'Feature', geometry: route.geometry });
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
  [originInput, destinationInput].forEach(input => {
    input.value = '';
    input.dataset.lon = '';
    input.dataset.lat = '';
  });
});

// DIRECTIONS PANEL LOGIC
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  styleToggleBtn.style.left = '200px';
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  styleToggleBtn.style.left = '20px';
}

directionsToggleBtn.addEventListener('click', () => {
  directionsForm.classList.contains('open') ? closeDirectionsPanel() : openDirectionsPanel();
});
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) closeDirectionsPanel();
});

// Mobile swipe-to-close
let startX = 0, currentX = 0, isSwiping = false;
directionsForm.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  startX = e.touches[0].clientX;
  isSwiping = true;
});
directionsForm.addEventListener('touchmove', e => {
  if (!isSwiping) return;
  currentX = e.touches[0].clientX;
  const deltaX = currentX - startX;
  if (deltaX < 0) directionsForm.style.transform = `translateX(${deltaX}px)`;
});
directionsForm.addEventListener('touchend', () => {
  const deltaX = currentX - startX;
  if (deltaX < -100) closeDirectionsPanel();
  directionsForm.style.transform = '';
  isSwiping = false;
});

// Prevent auto-close on suggestion clicks
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !e.target.closest('#directions-form') &&
    !e.target.closest('#directions-toggle')
  ) {
    // Do not auto-close
  }

  // Hide search suggestions if click outside
  if (!document.querySelector('.search-bar').contains(e.target)) {
    clearSuggestions(suggestionsEl);
  }
});
