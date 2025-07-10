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

// Add navigation controls (zoom + rotation + geolocate) bottom right
const navControl = new maplibregl.NavigationControl({
  showCompass: true,
  showZoom: true,
  visualizePitch: true,
});
map.addControl(navControl, 'bottom-right');

const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true
  },
  trackUserLocation: true,
  showAccuracyCircle: false,
});
map.addControl(geolocateControl, 'bottom-right');

// Elements
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const routeInfoDiv = document.getElementById('route-info');

const styleToggle = document.getElementById('style-toggle');
const styleIcon = document.getElementById('style-icon');
const styleLabel = document.getElementById('style-label');

const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

const navigationPanel = document.createElement('div');
navigationPanel.id = 'navigation-panel';
navigationPanel.style.position = 'fixed';
navigationPanel.style.bottom = '130px';
navigationPanel.style.right = '20px';
navigationPanel.style.width = '320px';
navigationPanel.style.maxHeight = '400px';
navigationPanel.style.overflowY = 'auto';
navigationPanel.style.background = 'white';
navigationPanel.style.borderRadius = '12px';
navigationPanel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
navigationPanel.style.padding = '12px';
navigationPanel.style.zIndex = 10003;
navigationPanel.style.display = 'none';
document.body.appendChild(navigationPanel);

// Satellite layer flag
let satelliteLayerAdded = false;
let isSatellite = false;

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
  isSatellite = true;
  styleIcon.src = 'satelite_style.png';
  styleLabel.textContent = 'Satellite';
  styleToggle.setAttribute('aria-pressed', 'true');
};

const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  isSatellite = false;
  styleIcon.src = 'default_style.png';
  styleLabel.textContent = 'Regular';
  styleToggle.setAttribute('aria-pressed', 'false');
};

map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

styleToggle.addEventListener('click', () => {
  if (isSatellite) {
    switchToRegular();
  } else {
    switchToSatellite();
  }
});

// Directions panel toggle funcs
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  directionsToggleBtn.setAttribute('aria-pressed', 'true');
  styleToggle.style.left = '100px';
  navigationPanel.style.display = 'none'; // hide nav panel if open
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'block';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  styleToggle.style.left = '20px';
  navigationPanel.style.display = 'none';
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

document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    // ignore outside clicks to keep panel open
  }
});

// Swipe to dismiss on mobile
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

function renderSuggestions(container, results, inputEl) {
  clearSuggestions(container);

  // Show "📍 Current Location" option first for all inputs
  if (!inputEl.dataset.preventCurrent && inputEl.value.trim() === '') {
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

        if (inputEl.id === 'search') {
          map.flyTo({ center: [lon, lat], zoom: 14 });
          saveRecentSearch('Current Location', lon, lat);
        }
      }, () => {
        alert('Unable to access your location.');
      });
    });
    container.appendChild(currentDiv);
  }

  // Recent searches for main search bar
  if (inputEl.id === 'search') {
    const recents = getRecentSearches();
    if (recents.length) {
      const label = document.createElement('div');
      label.className = 'suggestion label';
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
    div.addEventListener('click', () => {
      inputEl.value = div.textContent;
      inputEl.dataset.lon = div.dataset.lon;
      inputEl.dataset.lat = div.dataset.lat;
      clearSuggestions(container);
      if (inputEl.id === 'search') {
        map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
        saveRecentSearch(div.textContent, div.dataset.lon, div.dataset.lat);
      }
    });
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        div.click();
        inputEl.focus();
      }
    });
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
    renderSuggestions(suggestionsEl, results, inputEl);
  }, 250);

  inputEl.addEventListener('input', e => {
    debouncedSearch(e.target.value.trim());
  });

  // Close suggestions if clicking outside input or suggestions
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

setupSearch(searchInput, searchSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// LocalStorage Recent Searches
const RECENT_SEARCHES_KEY = 'tbm_recent_searches';
function getRecentSearches() {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}
function saveRecentSearch(text, lon, lat) {
  if (text === 'Current Location') return; // don't store
  let recents = getRecentSearches();
  recents = recents.filter(r => r.text !== text);
  recents.unshift({ text, lon, lat });
  if (recents.length > 5) recents.pop();
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
}

// Routing with OSRM & Navigation UI
let currentRoute = null;
let currentStepIndex = 0;
let navigationStarted = false;
let watchId = null;
let speechSynthesisUtterance = null;

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
  currentRoute = null;
  currentStepIndex = 0;
  stopNavigation();
}

function showDirectionsPanel() {
  directionsForm.style.display = 'flex';
  navigationPanel.style.display = 'none';
}

function showNavigationPanel() {
  directionsForm.style.display = 'none';
  navigationPanel.style.display = 'block';
}

function buildStepsUI(steps) {
  navigationPanel.innerHTML = '';

  const header = document.createElement('div');
  header.style.fontWeight = '700';
  header.style.fontSize = '18px';
  header.style.marginBottom = '8px';
  header.textContent = 'Navigation';

  const stepsList = document.createElement('ol');
  stepsList.style.paddingLeft = '20px';
  stepsList.style.maxHeight = '320px';
  stepsList.style.overflowY = 'auto';

  steps.forEach((step, idx) => {
    const li = document.createElement('li');
    li.style.marginBottom = '8px';
    li.style.fontWeight = idx === currentStepIndex ? '700' : '400';
    li.style.color = idx === currentStepIndex ? '#6750a4' : '#333';
    li.textContent = step.maneuver.instruction;
    stepsList.appendChild(li);
  });

  navigationPanel.appendChild(header);
  navigationPanel.appendChild(stepsList);

  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop = '12px';
  btnContainer.style.textAlign = 'right';

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop Navigation';
  stopBtn.style.background = '#b3261e';
  stopBtn.style.color = 'white';
  stopBtn.style.border = 'none';
  stopBtn.style.padding = '8px 16px';
  stopBtn.style.borderRadius = '20px';
  stopBtn.style.cursor = 'pointer';
  stopBtn.addEventListener('click', () => {
    stopNavigation();
    showDirectionsPanel();
  });

  btnContainer.appendChild(stopBtn);
  navigationPanel.appendChild(btnContainer);
}

function speak(text) {
  if ('speechSynthesis' in window) {
    if (speechSynthesisUtterance) {
      window.speechSynthesis.cancel();
    }
    speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
    speechSynthesisUtterance.lang = 'en-US';
    window.speechSynthesis.speak(speechSynthesisUtterance);
  }
}

function startNavigation() {
  if (!currentRoute) return;
  navigationStarted = true;
  showNavigationPanel();
  updateStep();
  startWatchingPosition();
}

function stopNavigation() {
  navigationStarted = false;
  currentStepIndex = 0;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (speechSynthesisUtterance) {
    window.speechSynthesis.cancel();
  }
  navigationPanel.style.display = 'none';
}

function updateStep() {
  if (!currentRoute) return;
  const steps = currentRoute.legs[0].steps;
  if (currentStepIndex >= steps.length) {
    speak('You have arrived at your destination');
    stopNavigation();
    return;
  }
  buildStepsUI(steps);

  const step = steps[currentStepIndex];
  speak(step.maneuver.instruction);

  // Zoom/fly to maneuver location
  map.flyTo({ center: step.maneuver.location, zoom: 17 });
}

function startWatchingPosition() {
  if (!('geolocation' in navigator)) return;

  watchId = navigator.geolocation.watchPosition(position => {
    const pos = [position.coords.longitude, position.coords.latitude];
    if (!currentRoute) return;
    const steps = currentRoute.legs[0].steps;

    // Check distance to next maneuver location
    const nextStep = steps[currentStepIndex];
    const dist = distanceBetweenCoords(pos, nextStep.maneuver.location);
    if (dist < 20) { // 20 meters threshold to advance step
      currentStepIndex++;
      updateStep();
    }
  }, error => {
    console.error('Geolocation watch error:', error);
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
}

function distanceBetweenCoords(a, b) {
  const toRad = x => x * Math.PI / 180;
  const R = 6371e3; // Earth radius meters
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const c = 2 * Math.atan2(
    Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
    Math.sqrt(1 - (sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon))
  );

  return R * c;
}

// Get route and show directions + enable navigation UI
getRouteBtn.addEventListener('click', async () => {
  const originLon = parseFloat(originInput.dataset.lon);
  const originLat = parseFloat(originInput.dataset.lat);
  const destinationLon = parseFloat(destinationInput.dataset.lon);
  const destinationLat = parseFloat(destinationInput.dataset.lat);

  if (
    isNaN(originLon) || isNaN(originLat) ||
    isNaN(destinationLon) || isNaN(destinationLat)
  ) {
    alert('Please select valid origin and destination from suggestions or current location.');
    return;
  }

  if (
    originInput.value === destinationInput.value ||
    originInput.value.trim() === '' ||
    destinationInput.value.trim() === ''
  ) {
    alert('Origin and destination must be different and non-empty.');
    return;
  }

  const originIsCurrent = originInput.dataset.current === 'true';
  const destinationIsCurrent = destinationInput.dataset.current === 'true';

  // Use OSRM route service
  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destinationLon},${destinationLat}?overview=full&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing failed');
    const data = await res.json();

    if (data.routes.length === 0) {
      alert('No routes found.');
      return;
    }

    currentRoute = data.routes[0];
    const geojson = {
      type: 'Feature',
      geometry: currentRoute.geometry
    };

    drawRoute(geojson);

    // Show steps or start navigation UI depending on if origin is current location
    if (originIsCurrent && !destinationIsCurrent) {
      // Full nav with voice guidance and pan/zoom following user location
      currentStepIndex = 0;
      openDirectionsPanel();
      directionsForm.style.display = 'none';
      startNavigation();
    } else {
      // Just show steps, no navigation, no voice, no pan/zoom
      navigationStarted = false;
      navigationPanel.style.display = 'block';
      directionsForm.style.display = 'none';

      const steps = currentRoute.legs[0].steps;
      navigationPanel.innerHTML = '<h3>Route Steps</h3><ol>' +
        steps.map(s => `<li>${s.maneuver.instruction}</li>`).join('') +
        '</ol><button id="stop-btn">Clear Route</button>';
      document.getElementById('stop-btn').addEventListener('click', () => {
        clearRoute();
        navigationPanel.style.display = 'none';
        openDirectionsPanel();
      });
    }

  } catch (e) {
    alert('Routing error: ' + e.message);
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  openDirectionsPanel();
});


// Search inputs: clear current location flags on manual input
[searchInput, originInput, destinationInput].forEach(input => {
  input.addEventListener('input', () => {
    delete input.dataset.current;
    delete input.dataset.lon;
    delete input.dataset.lat;
  });
});

// Move directions button up to avoid overlapping controls
directionsToggleBtn.style.position = 'fixed';
directionsToggleBtn.style.bottom = '90px';
directionsToggleBtn.style.right = '20px';
directionsToggleBtn.style.zIndex = '10002';

// Make sure map controls remain visible
// The controls are already bottom-right with some offset

