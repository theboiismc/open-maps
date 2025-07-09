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

// Add MapLibre default controls (zoom + rotation + geolocate) bottom right
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
}), 'bottom-right');

// Elements
const styleToggleBtn = document.getElementById('style-toggle');
const styleLabel = document.getElementById('style-label');
const styleToggleImg = styleToggleBtn.querySelector('img');

const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

// Satellite layer flag
let satelliteLayerAdded = false;
const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        // Your local satellite tiles or fallback here if you want
        // For now blank so we rely on ArcGIS server
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

const switchToSatellite = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  styleToggleBtn.setAttribute('aria-pressed', 'true');
  styleLabel.textContent = 'Satellite';
  styleToggleImg.src = 'satellite_style.png';
  styleToggleImg.alt = 'Satellite style';
};

const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  styleToggleBtn.setAttribute('aria-pressed', 'false');
  styleLabel.textContent = 'Regular';
  styleToggleImg.src = 'default_style.png';
  styleToggleImg.alt = 'Regular style';
};

// Setup initial map style on load
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

// Toggle map style on styleToggleBtn click
styleToggleBtn.addEventListener('click', () => {
  const isSatellite = map.getLayoutProperty('sat-layer', 'visibility') === 'visible';
  if (isSatellite) {
    switchToRegular();
  } else {
    switchToSatellite();
  }
});

// Directions panel open/close helpers
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  // Move directions toggle button left to avoid overlap with controls
  directionsToggleBtn.style.right = '310px'; // 320 width + 10px margin
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  directionsToggleBtn.style.right = '20px';
}

// Directions toggle button event
directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

// Close directions panel on close button click
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Close on ESC key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Prevent directions panel from closing on suggestion clicks or form clicks
directionsForm.addEventListener('click', e => {
  e.stopPropagation();
});

// Prevent outside clicks from closing directions panel
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    e.target !== directionsToggleBtn
  ) {
    closeDirectionsPanel();
  }
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

// Setup search inputs
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

async function fetchRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM request failed");
    const data = await res.json();
    if (data.routes && data.routes.length) return data.routes[0];
    throw new Error("No routes found");
  } catch (e) {
    console.error(e);
    return null;
  }
}

getRouteBtn.addEventListener('click', async () => {
  const originInput = document.getElementById('origin');
  const destInput = document.getElementById('destination');
  const start = [parseFloat(originInput.dataset.lon), parseFloat(originInput.dataset.lat)];
  const end = [parseFloat(destInput.dataset.lon), parseFloat(destInput.dataset.lat)];

  if (!start.every(coord => !isNaN(coord)) || !end.every(coord => !isNaN(coord))) {
    alert("Please select valid origin and destination from suggestions.");
    return;
  }

  clearRoute();
  const route = await fetchRoute(start, end);
  if (!route) {
    alert("Route not found.");
    return;
  }

  const routeGeoJSON = {
    type: "Feature",
    geometry: route.geometry
  };

  drawRoute(routeGeoJSON);

  // Zoom map to fit route bounds
  const coords = route.geometry.coordinates;
  const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, { padding: 80 });

  // Show summary info
  const distKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);
  routeInfoDiv.textContent = `Distance: ${distKm} km | Duration: ${durationMin} min`;
});

// Clear route button handler
clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  document.getElementById('origin').value = '';
  document.getElementById('origin').removeAttribute('data-lon');
  document.getElementById('origin').removeAttribute('data-lat');
  document.getElementById('destination').value = '';
  document.getElementById('destination').removeAttribute('data-lon');
  document.getElementById('destination').removeAttribute('data-lat');
  routeInfoDiv.textContent = '';
});

// Prevent closing directions panel on clicks inside it
directionsForm.addEventListener('click', e => e.stopPropagation());

// Prevent closing directions panel on suggestion click inside origin/dest
document.getElementById('origin-suggestions').addEventListener('click', e => e.stopPropagation());
document.getElementById('destination-suggestions').addEventListener('click', e => e.stopPropagation());

// Prevent clicks inside main search suggestions from closing it
document.getElementById('suggestions').addEventListener('click', e => e.stopPropagation());

// Clicking outside closes main search suggestions or directions panel if open
document.addEventListener('click', e => {
  if (!directionsForm.contains(e.target) && e.target !== directionsToggleBtn) {
    if (directionsForm.classList.contains('open')) closeDirectionsPanel();
  }
  // Clear suggestions if click outside inputs
  if (!document.getElementById('search').contains(e.target) &&
      !document.getElementById('suggestions').contains(e.target)) {
    document.getElementById('suggestions').innerHTML = '';
  }
  if (!document.getElementById('origin').contains(e.target) &&
      !document.getElementById('origin-suggestions').contains(e.target)) {
    document.getElementById('origin-suggestions').innerHTML = '';
  }
  if (!document.getElementById('destination').contains(e.target) &&
      !document.getElementById('destination-suggestions').contains(e.target)) {
    document.getElementById('destination-suggestions').innerHTML = '';
  }
});

// Main search input: fly to location on select
document.getElementById('suggestions').addEventListener('click', e => {
  if (!e.target.classList.contains('suggestion')) return;
  const lon = parseFloat(e.target.dataset.lon);
  const lat = parseFloat(e.target.dataset.lat);
  const text = e.target.textContent;
  const input = document.getElementById('search');
  input.value = text;
  input.dataset.lon = lon;
  input.dataset.lat = lat;
  document.getElementById('suggestions').innerHTML = '';
  map.flyTo({ center: [lon, lat], zoom: 14 });
});
