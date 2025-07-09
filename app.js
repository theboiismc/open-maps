const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-89.4, 43.07], // Default center (Madison, WI)
  zoom: 12,
  pitch: 0,
  bearing: 0,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
});

const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

const mapStyleToggleBtn = document.getElementById('map-style-toggle');
const mapStyleImg = document.getElementById('map-style-img');
const mapStyleLabel = document.getElementById('map-style-label');

const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');

let isSatellite = false;

function addSatelliteLayer() {
  if (!map.getSource('satellite')) {
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

// Toggle map style on click
mapStyleToggleBtn.addEventListener('click', () => {
  isSatellite = !isSatellite;
  updateMapStyleUI();
});

// Move style toggle right when directions panel opens
function setToggleMovedRight(moved) {
  if (moved) {
    mapStyleToggleBtn.classList.add('moved-right');
  } else {
    mapStyleToggleBtn.classList.remove('moved-right');
  }
}

// Directions panel toggle open/close
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

// Prevent closing directions panel when clicking inside it or directions button
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
let startX = 0,
  currentX = 0,
  isSwiping = false;
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

// Photon search API
const photonUrl = 'https://photon.komoot.io/api/?q=';
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
    if (!res.ok) throw new Error('Photon request failed');
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
    div.textContent =
      feature.properties.name +
      (feature.properties.state ? ', ' + feature.properties.state : '') +
      (feature.properties.country ? ', ' + feature.properties.country : '');
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];
    container.appendChild(div);
  });
}

// Setup search for inputs and suggestion containers
function setupSearch(inputEl, suggestionsEl, onSelect) {
  const debouncedSearch = debounce(async query => {
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
    if (typeof onSelect === 'function') onSelect(lon, lat);
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

// On selecting a main search suggestion, pan and zoom the map
setupSearch(searchInput, searchSuggestions, (lon, lat) => {
  map.flyTo({ center: [lon, lat], zoom: 14, essential: true });
});

// Setup directions origin and destination search without map panning on selection
setupSearch(
  document.getElementById('origin'),
  document.getElementById('origin-suggestions')
);
setupSearch(
  document.getElementById('destination'),
  document.getElementById('destination-suggestions')
);

// Routing with OSRM
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

function drawRoute(routeGeoJSON) {
  if (map.getSource('route')) {
    map.getSource('route').setData(routeGeoJSON);
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: routeGeoJSON,
    });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.8,
      },
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
    isNaN(oLon) ||
    isNaN(oLat) ||
    isNaN(dLon) ||
    isNaN(dLat)
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
    const bounds = coordinates.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );
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
  const originInput = document.getElementById('origin');
  const destinationInput = document.getElementById('destination');
  originInput.value = '';
  originInput.dataset.lon = '';
  originInput.dataset.lat = '';
  destinationInput.value = '';
  destinationInput.dataset.lon = '';
  destinationInput.dataset.lat = '';
});

// Add default nav controls bottom right and keep directions button left to them
map.on('load', () => {
  addSatelliteLayer();
  updateMapStyleUI();

  // Navigation control (zoom + compass)
  const nav = new maplibregl.NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: false,
  });
  map.addControl(nav, 'bottom-right');
});
