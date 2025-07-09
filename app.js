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

// Controls
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

const mapStyleToggleBtn = document.getElementById('map-style-toggle');
const mapStyleImg = document.getElementById('map-style-img');
const mapStyleLabel = document.getElementById('map-style-label');

let isSatellite = false;

// Add satellite layer once map loads
function addSatelliteLayer() {
  if (!map.getSource('satellite')) {
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
  }
}

function updateMapStyleUI() {
  if (isSatellite) {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    mapStyleImg.src = 'satellite_style.png';
    mapStyleLabel.textContent = 'Satellite';
    mapStyleToggleBtn.setAttribute('aria-pressed', 'true');
  } else {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    mapStyleImg.src = 'default_style.png';
    mapStyleLabel.textContent = 'Regular';
    mapStyleToggleBtn.setAttribute('aria-pressed', 'false');
  }
}

// Toggle map style on button click
mapStyleToggleBtn.addEventListener('click', () => {
  isSatellite = !isSatellite;
  updateMapStyleUI();
});

// Move style toggle button right when directions panel opens
function setToggleMovedRight(moved) {
  if (moved) {
    mapStyleToggleBtn.classList.add('moved-right');
  } else {
    mapStyleToggleBtn.classList.remove('moved-right');
  }
}

// Directions panel toggle open/close functions
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  setToggleMovedRight(true);
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  setToggleMovedRight(false);
}

// Event listeners for directions panel toggle and close buttons
directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Prevent directions panel from closing when clicking inside it or toggle button
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    closeDirectionsPanel();
  }
});

// Swipe to dismiss directions panel on mobile
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
    inputEl.value = e.target.textContent;
    inputEl.dataset.lon = lon;
    inputEl.dataset.lat = lat;
    clearSuggestions(suggestionsEl);
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

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

  const oLon = parseFloat(originInput.dataset.lon);
  const oLat = parseFloat(originInput.dataset.lat);
  const dLon = parseFloat(destinationInput.dataset.lon);
  const dLat = parseFloat(destinationInput.dataset.lat);

  if (
    isNaN(oLon) || isNaN(oLat) ||
    isNaN(dLon) || isNaN(dLat)
  ) {
    alert('Please select valid origin and destination from suggestions.');
    return;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing request failed');
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      alert('No route found for the selected locations.');
      return;
    }
    const route = data.routes[0];
    drawRoute(route.geometry);

    // Zoom and center to route bounds
    const coordinates = route.geometry.coordinates;
    const bounds = coordinates.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    map.fitBounds(bounds, { padding: 80 });

    // Show route info (distance, duration)
    const distKm = (route.distance / 1000).toFixed(1);
    const durMin = Math.round(route.duration / 60);
    routeInfoDiv.textContent = `Distance: ${distKm} km | Duration: ${durMin} min`;

  } catch (e) {
    alert('Error getting route. Try again.');
    console.error(e);
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  document.getElementById('origin').value = '';
  document.getElementById('origin').dataset.lon = '';
  document.getElementById('origin').dataset.lat = '';
  document.getElementById('destination').value = '';
  document.getElementById('destination').dataset.lon = '';
  document.getElementById('destination').dataset.lat = '';
});

// On map load
map.on('load', () => {
  addSatelliteLayer();
  updateMapStyleUI();

  // Add default navigation controls bottom right
  const nav = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: false
  });
  map.addControl(nav, 'bottom-right');
});
