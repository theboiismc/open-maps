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

// Controls elements
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');
const darkToggle = document.getElementById('dark-toggle');
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
  satelliteToggle.classList.add('active');
  regularToggle.classList.remove('active');
  satelliteToggle.setAttribute('aria-pressed', 'true');
  regularToggle.setAttribute('aria-pressed', 'false');
};

const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
  regularToggle.setAttribute('aria-pressed', 'true');
  satelliteToggle.setAttribute('aria-pressed', 'false');
};

// Dark mode toggle
darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  darkToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
});

// On map load setup
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

satelliteToggle.onclick = switchToSatellite;
regularToggle.onclick = switchToRegular;

// Directions panel toggle helpers
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
}

// Toggle directions panel button
directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

// Close button inside directions panel
closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

// Close on ESC key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  }
});

// Close on click outside directions panel — fixed to ignore clicks inside suggestion containers
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target) &&
    !document.getElementById('origin-suggestions').contains(e.target) &&
    !document.getElementById('destination-suggestions').contains(e.target)
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
    if (!res.ok) throw new Error("Routing request failed");
    const data = await res.json();

    if (data.routes.length === 0) {
      routeInfoDiv.textContent = 'No route found';
      return;
    }

    const route = data.routes[0];
    const geojson = {
      type: "Feature",
      geometry: route.geometry
    };

    drawRoute(geojson);

    const durationMin = Math.round(route.duration / 60);
    const distanceKm = (route.distance / 1000).toFixed(1);

    routeInfoDiv.textContent = `Distance: ${distanceKm} km, Duration: ${durationMin} min`;
  } catch (e) {
    console.error(e);
    routeInfoDiv.textContent = "Error fetching route";
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  document.getElementById('origin').value = '';
  document.getElementById('destination').value = '';
  delete document.getElementById('origin').dataset.lon;
  delete document.getElementById('origin').dataset.lat;
  delete document.getElementById('destination').dataset.lon;
  delete document.getElementById('destination').dataset.lat;
  routeInfoDiv.textContent = '';
});

// BONUS: Add location button on map controls (optional)
const locationBtn = document.createElement('button');
locationBtn.id = 'location-btn';
locationBtn.title = 'Find My Location';
locationBtn.innerHTML = '📍';
locationBtn.style.fontSize = '20px';

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const coords = [pos.coords.longitude, pos.coords.latitude];
    map.flyTo({ center: coords, zoom: 15 });
  }, err => {
    alert('Unable to retrieve your location.');
  });
});

document.querySelector('.map-controls').appendChild(locationBtn);
