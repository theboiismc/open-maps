const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2
});

// Add satellite layer
let satelliteLayerAdded = false;
function addSatelliteLayer() {
  if (satelliteLayerAdded) return;
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

// Handle map style toggle
const styleToggle = document.getElementById('style-toggle');
const styleImage = document.getElementById('style-image');
const styleLabel = document.getElementById('style-label');

let isSatellite = false;
const satelliteThumbnail = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Satellite_image_example.jpg/240px-Satellite_image_example.jpg';
const regularThumbnail = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/OpenStreetMap_project_logo.svg/240px-OpenStreetMap_project_logo.svg.png';

function updateStyleToggleUI() {
  styleImage.src = isSatellite ? satelliteThumbnail : regularThumbnail;
  styleLabel.textContent = isSatellite ? 'Satellite' : 'Regular';
  styleToggle.setAttribute('aria-label', isSatellite ? 'Switch to Regular map' : 'Switch to Satellite map');
}

styleToggle.addEventListener('click', () => {
  isSatellite = !isSatellite;
  map.setLayoutProperty('sat-layer', 'visibility', isSatellite ? 'visible' : 'none');
  updateStyleToggleUI();
});

// Directions menu logic
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');

function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  styleToggle.classList.add('shifted');
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'block';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  styleToggle.classList.remove('shifted');
}

directionsToggleBtn.addEventListener('click', () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
});

closeDirectionsBtn.addEventListener('click', closeDirectionsPanel);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && directionsForm.classList.contains('open')) {
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

function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, results, inputEl) {
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
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results, inputEl);
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

setupSearch(document.getElementById('search'), createSuggestionsBox('search'));
setupSearch(document.getElementById('origin'), createSuggestionsBox('origin'));
setupSearch(document.getElementById('destination'), createSuggestionsBox('destination'));

function createSuggestionsBox(baseId) {
  const input = document.getElementById(baseId);
  const box = document.createElement('div');
  box.className = 'suggestions';
  input.insertAdjacentElement('afterend', box);
  return box;
}

// Routing
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeInfoDiv = document.getElementById('route-info');

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
  ['origin', 'destination'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.dataset.lat = '';
    el.dataset.lon = '';
  });
});

// Add location button
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
