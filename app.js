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

const navigationPanel = document.getElementById('navigation-panel');
const navigationStepsDiv = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-navigation');
const stopNavBtn = document.getElementById('stop-navigation');

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

// Toggle style on click
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
  // Move style toggle left when directions open
  styleToggle.style.left = '100px';
}

function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'block';
  directionsToggleBtn.setAttribute('aria-pressed', 'false');
  styleToggle.style.left = '20px';
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

// Prevent directions panel from closing when clicking inside it or on suggestions
document.addEventListener('click', e => {
  if (
    directionsForm.classList.contains('open') &&
    !directionsForm.contains(e.target) &&
    !directionsToggleBtn.contains(e.target)
  ) {
    // Do nothing (ignore click outside so panel only closes on X or ESC)
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

// Photon search setup with "Current Location" option
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
      inputEl.dataset.isCurrentLocation = 'false';
      clearSuggestions(container);
      if (inputEl.id === 'search') {
        map.flyTo({ center: [parseFloat(div.dataset.lon), parseFloat(div.dataset.lat)], zoom: 14 });
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

// Add Current Location option to suggestions
function addCurrentLocationOption(container, inputEl) {
  const existing = container.querySelector('.current-location-option');
  if (existing) existing.remove();

  // Check if current location already selected on other input
  const otherInput = inputEl.id === 'origin' ? destinationInput : originInput;
  if (otherInput.dataset.isCurrentLocation === 'true') return;

  const div = document.createElement('div');
  div.className = 'suggestion current-location-option';
  div.textContent = '📍 Use Current Location';
  div.tabIndex = 0;
  div.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser');
      return;
    }
    div.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      inputEl.value = 'Current Location';
      inputEl.dataset.lat = latitude;
      inputEl.dataset.lon = longitude;
      inputEl.dataset.isCurrentLocation = 'true';

      clearSuggestions(container);

      // Disable current location on other input
      otherInput.dataset.isCurrentLocation = 'false';
      otherInput.removeAttribute('disabled');
      addCurrentLocationOption(
        otherInput === originInput ? originSuggestions : destinationSuggestions,
        otherInput
      );

      // Disable selecting current location on the other input while this one has it
      if (inputEl.id === 'origin') {
        destinationInput.dataset.isCurrentLocation = 'false';
        destinationInput.removeAttribute('disabled');
      } else {
        originInput.dataset.isCurrentLocation = 'false';
        originInput.removeAttribute('disabled');
      }
    }, err => {
      alert('Failed to get location: ' + err.message);
      div.textContent = '📍 Use Current Location';
    });
  });
  div.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      div.click();
      inputEl.focus();
    }
  });
  container.prepend(div);
}

function setupSearchWithCurrentLoc(inputEl, suggestionsEl) {
  const debouncedSearch = debounce(async (query) => {
    if (!query) {
      clearSuggestions(suggestionsEl);
      addCurrentLocationOption(suggestionsEl, inputEl);
      return;
    }
    showLoading(suggestionsEl);
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results, inputEl);
    addCurrentLocationOption(suggestionsEl, inputEl);
  }, 250);

  inputEl.addEventListener('input', e => {
    inputEl.dataset.isCurrentLocation = 'false';
    debouncedSearch(e.target.value.trim());
  });

  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) {
      clearSuggestions(suggestionsEl);
      addCurrentLocationOption(suggestionsEl, inputEl);
    }
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

setupSearchWithCurrentLoc(searchInput, searchSuggestions);
setupSearchWithCurrentLoc(originInput, originSuggestions);
setupSearchWithCurrentLoc(destinationInput, destinationSuggestions);

// Routing with OSRM
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
  navigationStepsDiv.innerHTML = '';
  navigationPanel.style.display = 'none';
  stopNavigation();
}

// Navigation state
let navigationActive = false;
let currentStepIndex = 0;
let navigationRoute = null;
let watchId = null;

function startNavigation() {
  if (!navigationRoute) return;

  navigationActive = true;
  currentStepIndex = 0;
  directionsForm.style.display = 'none';
  navigationPanel.style.display = 'block';
  updateNavigationSteps();
  speakStep(navigationRoute.legs[0].steps[0]);

  // If origin or destination is current location, start GPS watch
  const originIsCurrent = originInput.dataset.isCurrentLocation === 'true';
  if (originIsCurrent) {
    watchId = navigator.geolocation.watchPosition(position => {
      const { latitude, longitude } = position.coords;
      map.flyTo({ center: [longitude, latitude], zoom: 16 });
      followNavigation(latitude, longitude);
    }, err => {
      console.error('GPS watch error:', err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    });
  }
}

function stopNavigation() {
  navigationActive = false;
  currentStepIndex = 0;
  navigationRoute = null;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  navigationPanel.style.display = 'none';
  directionsForm.style.display = 'flex';
}

function updateNavigationSteps() {
  if (!navigationRoute) return;
  const steps = navigationRoute.legs[0].steps;
  navigationStepsDiv.innerHTML = '';
  steps.forEach((step, idx) => {
    const div = document.createElement('div');
    div.className = 'nav-step';
    if (idx === currentStepIndex) div.classList.add('active');
    div.textContent = step.maneuver.instruction;
    navigationStepsDiv.appendChild(div);
  });
}

function speakStep(step) {
  if (!step || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(step.maneuver.instruction);
  utterance.lang = 'en-US';
  window.speechSynthesis.cancel(); // Cancel any ongoing speech
  window.speechSynthesis.speak(utterance);
}

function followNavigation(lat, lon) {
  if (!navigationActive || !navigationRoute) return;
  const steps = navigationRoute.legs[0].steps;
  if (currentStepIndex >= steps.length) {
    stopNavigation();
    alert('Navigation complete');
    return;
  }
  const step = steps[currentStepIndex];
  const [stepLon, stepLat] = step.maneuver.location;
  const distance = getDistance(lat, lon, stepLat, stepLon);

  // If within 30 meters of step, move to next step
  if (distance < 30) {
    currentStepIndex++;
    if (currentStepIndex < steps.length) {
      updateNavigationSteps();
      speakStep(steps[currentStepIndex]);
    } else {
      stopNavigation();
      alert('You have arrived at your destination');
    }
  }
}

function getDistance(lat1, lon1, lat2, lon2) {
  // Haversine formula
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c;
  return d;
}

// Route request and handling
getRouteBtn.addEventListener('click', async () => {
  const originLon = parseFloat(originInput.dataset.lon);
  const originLat = parseFloat(originInput.dataset.lat);
  const destinationLon = parseFloat(destinationInput.dataset.lon);
  const destinationLat = parseFloat(destinationInput.dataset.lat);

  if (
    Number.isNaN(originLon) || Number.isNaN(originLat) ||
    Number.isNaN(destinationLon) || Number.isNaN(destinationLat)
  ) {
    alert("Yo, select both origin and destination from suggestions or current location.");
    return;
  }

  // Enforce current location exclusivity
  if (
    originInput.dataset.isCurrentLocation === 'true' &&
    destinationInput.dataset.isCurrentLocation === 'true'
  ) {
    alert("Origin and destination can't both be current location.");
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
    navigationRoute = route;

    drawRoute({
      type: 'Feature',
      geometry: route.geometry
    });

    map.fitBounds([
      [originLon, originLat],
      [destinationLon, destinationLat]
    ], { padding: 60 });

    routeInfoDiv.textContent = `Distance: ${(route.distance / 1000).toFixed(1)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;

    // Show navigation panel with steps & start button
    navigationStepsDiv.innerHTML = '';
    route.legs[0].steps.forEach(step => {
      const div = document.createElement('div');
      div.className = 'nav-step';
      div.textContent = step.maneuver.instruction;
      navigationStepsDiv.appendChild(div);
    });
    navigationPanel.style.display = 'block';

  } catch (e) {
    routeInfoDiv.textContent = 'Failed to get route.';
    console.error(e);
  }
});

// Start navigation button
startNavBtn.addEventListener('click', () => {
  // If origin or destination is current location, enable full navigation
  const originIsCurrent = originInput.dataset.isCurrentLocation === 'true';
  const destIsCurrent = destinationInput.dataset.isCurrentLocation === 'true';

  if (originIsCurrent || destIsCurrent) {
    startNavigation();
  } else {
    alert('Navigation only available when origin or destination is your current location.');
  }
});

// Stop navigation button
stopNavBtn.addEventListener('click', stopNavigation);

// Clear route button
clearRouteBtn.addEventListener('click', clearRoute);
