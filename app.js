// Initialize MapLibre
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
  maxZoom: 18,
  minZoom: 1,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true
});

// Controls
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showAccuracyCircle: false
}), 'bottom-right');

// UI Elements
const searchInput = document.getElementById('search');
const suggestionsEl = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const navigationPanel = document.getElementById('navigation-panel');
const navigationSteps = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-navigation');
const stopNavBtn = document.getElementById('stop-navigation');

// Style toggle
const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');
let isSatellite = false;
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
    paint: { 'raster-opacity': 0.85 }
  });
  satelliteLayerAdded = true;
}
function switchToSatellite() {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  isSatellite = true;
  styleIcon.src = 'satelite_style.png';
  styleLabel.textContent = 'Satellite';
}
function switchToRegular() {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  isSatellite = false;
  styleIcon.src = 'default_style.png';
  styleLabel.textContent = 'Regular';
}
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});
styleToggle.addEventListener('click', () => {
  isSatellite ? switchToRegular() : switchToSatellite();
});

// Recent search handling
function saveRecentSearch(text, lon, lat) {
  const maxItems = 10;
  const newItem = { text, lon, lat };
  let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  recents = recents.filter(item => item.text !== text);
  recents.unshift(newItem);
  if (recents.length > maxItems) recents.pop();
  localStorage.setItem('recentSearches', JSON.stringify(recents));
}
function getRecentSearches() {
  return JSON.parse(localStorage.getItem('recentSearches') || '[]');
}

// Debounce
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Photon search
async function photonSearch(query) {
  if (!query) return [];
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
  const data = await res.json();
  return data.features || [];
}

// Suggestion rendering
function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, results, inputEl) {
  clearSuggestions(container);

  // "Current Location" option
  if (!inputEl.dataset.preventCurrent) {
    const currentDiv = document.createElement('div');
    currentDiv.className = 'suggestion current-location-option';
    currentDiv.textContent = '📍 Current Location';
    currentDiv.tabIndex = 0;
    currentDiv.addEventListener('click', () => {
      navigator.geolocation.getCurrentPosition(pos => {
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        inputEl.value = 'Current Location';
        inputEl.dataset.current = 'true';
        inputEl.dataset.lon = lon;
        inputEl.dataset.lat = lat;
        clearSuggestions(container);
      });
    });
    container.appendChild(currentDiv);
  }

  // Recent searches
  if (inputEl.id === 'search') {
    const recents = getRecentSearches();
    if (recents.length) {
      const label = document.createElement('div');
      label.className = 'suggestion';
      label.style.fontWeight = 'bold';
      label.style.cursor = 'default';
      label.textContent = 'Recent Searches';
      container.appendChild(label);

      recents.forEach(({ text, lon, lat }) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = text;
        div.dataset.lon = lon;
        div.dataset.lat = lat;
        div.addEventListener('click', () => {
          inputEl.value = text;
          inputEl.dataset.lon = lon;
          inputEl.dataset.lat = lat;
          clearSuggestions(container);
          map.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 14 });
        });
        container.appendChild(div);
      });

      const sep = document.createElement('div');
      sep.style.borderTop = '1px solid #ccc';
      sep.style.margin = '4px 0';
      container.appendChild(sep);
    }
  }

  // Photon results
  results.forEach(feature => {
    const label = feature.properties.name +
      (feature.properties.state ? ', ' + feature.properties.state : '') +
      (feature.properties.country ? ', ' + feature.properties.country : '');
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = label;
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];
    div.addEventListener('click', () => {
      inputEl.value = label;
      inputEl.dataset.lon = div.dataset.lon;
      inputEl.dataset.lat = div.dataset.lat;
      delete inputEl.dataset.current;
      clearSuggestions(container);

      if (inputEl.id === 'search') {
        map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
        saveRecentSearch(label, div.dataset.lon, div.dataset.lat);
      }
    });
    container.appendChild(div);
  });
}

function setupSearch(inputEl, suggestionsEl) {
  const search = debounce(async (query) => {
    if (!query) {
      clearSuggestions(suggestionsEl);
      return;
    }
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results, inputEl);
  }, 300);
  inputEl.addEventListener('input', e => search(e.target.value.trim()));
}

setupSearch(searchInput, suggestionsEl);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Toggle directions panel
directionsToggleBtn.addEventListener('click', () => {
  directionsForm.classList.toggle('open');
  navigationPanel.style.display = 'none';
});

// Route drawing
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
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.85
      }
    });
  }
}
function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
}
function isCurrentLocation(el) {
  return el.dataset.current === 'true';
}

// Routing + Navigation
getRouteBtn.addEventListener('click', async () => {
  const oLon = parseFloat(originInput.dataset.lon);
  const oLat = parseFloat(originInput.dataset.lat);
  const dLon = parseFloat(destinationInput.dataset.lon);
  const dLat = parseFloat(destinationInput.dataset.lat);

  if (isNaN(oLon) || isNaN(oLat) || isNaN(dLon) || isNaN(dLat)) {
    alert("Please select valid origin and destination.");
    return;
  }

  clearRoute();

  const coords = `${oLon},${oLat};${dLon},${dLat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];
  drawRoute({ type: 'Feature', geometry: route.geometry });

  if (isCurrentLocation(originInput)) {
    map.flyTo({ center: [oLon, oLat], zoom: 14 });
  }

  navigationSteps.innerHTML = '';
  route.legs[0].steps.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = 'nav-step';
    div.textContent = step.maneuver.instruction;
    navigationSteps.appendChild(div);
  });

  navigationPanel.style.display = 'block';
  directionsForm.classList.remove('open');
});

// Start navigation
let watchId;
startNavBtn.addEventListener('click', () => {
  if (!isCurrentLocation(originInput)) return alert("Turn-by-turn only works with your current location.");
  let stepIndex = 0;
  const steps = navigationSteps.children;

  watchId = navigator.geolocation.watchPosition(pos => {
    const userLoc = [pos.coords.longitude, pos.coords.latitude];
    map.flyTo({ center: userLoc, zoom: 15 });

    if (stepIndex < steps.length) {
      const stepEl = steps[stepIndex];
      stepEl.classList.add('active');
      const instruction = stepEl.textContent;
      const utter = new SpeechSynthesisUtterance(instruction);
      speechSynthesis.speak(utter);
      stepIndex++;
    }
  }, console.error, { enableHighAccuracy: true });
});

// Stop nav
stopNavBtn.addEventListener('click', () => {
  navigator.geolocation.clearWatch(watchId);
  speechSynthesis.cancel();
  navigationPanel.style.display = 'none';
});
