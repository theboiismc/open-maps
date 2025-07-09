// Initialize MapLibre
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

// --------------------
// Photon Search Setup
// --------------------

function photonSearch(query) {
  if (!query) return Promise.resolve([]);
  return fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`)
    .then(res => res.json())
    .then(data => data.features || []);
}

function clearSuggestions(container) {
  container.innerHTML = '';
  container.style.display = 'none';
}

function renderSuggestions(features, container, inputEl) {
  clearSuggestions(container);
  if (!features.length) return;
  container.style.display = 'block';
  features.forEach(feature => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.tabIndex = 0;
    div.setAttribute('role', 'option');
    div.textContent = feature.properties.name + (feature.properties.city ? ', ' + feature.properties.city : '');
    div.addEventListener('click', () => {
      inputEl.value = div.textContent;
      inputEl.dataset.lat = feature.geometry.coordinates[1];
      inputEl.dataset.lon = feature.geometry.coordinates[0];
      clearSuggestions(container);
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        div.click();
      }
    });
    container.appendChild(div);
  });
}

// Main Search Bar
const searchInput = document.getElementById('search');
const searchSuggestions = document.getElementById('suggestions');
let mainMarker = null;

searchInput.addEventListener('input', async () => {
  if (!searchInput.value.trim()) {
    clearSuggestions(searchSuggestions);
    return;
  }
  const results = await photonSearch(searchInput.value.trim());
  renderSuggestions(results, searchSuggestions, searchInput);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && searchInput.dataset.lat && searchInput.dataset.lon) {
    const lat = parseFloat(searchInput.dataset.lat);
    const lon = parseFloat(searchInput.dataset.lon);
    setMainMarker([lon, lat]);
    map.flyTo({ center: [lon, lat], zoom: 14, speed: 1.2 });
    clearSuggestions(searchSuggestions);
    searchInput.blur();
  }
});

function setMainMarker(coords) {
  if (mainMarker) mainMarker.remove();
  mainMarker = new maplibregl.Marker({ color: '#6750a4' })
    .setLngLat(coords)
    .addTo(map);
}

// --------------------
// Directions Panel & Routing
// --------------------

const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsPanel = document.getElementById('directions-panel');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');
const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

const currentStepText = document.getElementById('current-step');
const stepsList = document.getElementById('steps-list');

let originCoords = null;
let destinationCoords = null;

directionsToggleBtn.addEventListener('click', () => {
  const expanded = directionsPanel.classList.toggle('active');
  directionsToggleBtn.setAttribute('aria-pressed', expanded);
});

originInput.addEventListener('input', async () => {
  if (!originInput.value.trim()) {
    clearSuggestions(originSuggestions);
    return;
  }
  const results = await photonSearch(originInput.value.trim());
  renderSuggestions(results, originSuggestions, originInput);
});
originInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && originInput.dataset.lat && originInput.dataset.lon) {
    originCoords = [+originInput.dataset.lon, +originInput.dataset.lat];
    clearSuggestions(originSuggestions);
    originInput.blur();
  }
});
originSuggestions.addEventListener('click', () => {
  originCoords = [+originInput.dataset.lon, +originInput.dataset.lat];
});

destinationInput.addEventListener('input', async () => {
  if (!destinationInput.value.trim()) {
    clearSuggestions(destinationSuggestions);
    return;
  }
  const results = await photonSearch(destinationInput.value.trim());
  renderSuggestions(results, destinationSuggestions, destinationInput);
});
destinationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && destinationInput.dataset.lat && destinationInput.dataset.lon) {
    destinationCoords = [+destinationInput.dataset.lon, +destinationInput.dataset.lat];
    clearSuggestions(destinationSuggestions);
    destinationInput.blur();
  }
});
destinationSuggestions.addEventListener('click', () => {
  destinationCoords = [+destinationInput.dataset.lon, +destinationInput.dataset.lat];
});

let routeGeoJSON = null;
let routeLine = null;
let steps = [];
let currentStepIndex = 0;
let watchId = null;
let navigating = false;

// Clean up old route layers
function clearRoute() {
  if (routeLine) {
    map.removeLayer('route');
    map.removeSource('route');
    routeLine = null;
  }
  steps = [];
  currentStepIndex = 0;
  currentStepText.textContent = '';
  stepsList.innerHTML = '';
  originCoords = null;
  destinationCoords = null;
  navigating = false;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  originInput.value = '';
  destinationInput.value = '';
});

async function getRoute() {
  if (!originCoords || !destinationCoords) {
    alert('Please select both origin and destination from suggestions.');
    return;
  }

  clearRoute();

  const url = `https://router.project-osrm.org/route/v1/driving/${originCoords[0]},${originCoords[1]};${destinationCoords[0]},${destinationCoords[1]}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch route');
    const json = await res.json();

    if (json.code !== "Ok" || !json.routes.length) {
      alert('No route found.');
      return;
    }

    const route = json.routes[0];
    routeGeoJSON = {
      type: 'Feature',
      geometry: route.geometry
    };

    map.addSource('route', {
      type: 'geojson',
      data: routeGeoJSON
    });

    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });
    routeLine = true;

    steps = route.legs[0].steps;
    currentStepIndex = 0;

    showStep(currentStepIndex);
    populateStepsList();

    // Start navigation mode
    startNavigation();
  } catch (err) {
    alert('Error fetching route: ' + err.message);
  }
}

getRouteBtn.addEventListener('click', getRoute);

// Display current step instruction and speak it
function showStep(index) {
  if (index >= steps.length) {
    currentStepText.textContent = 'You have arrived at your destination.';
    speak('You have arrived at your destination.');
    navigating = false;
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    return;
  }
  const step = steps[index];
  currentStepText.textContent = step.maneuver.instruction;
  speak(step.maneuver.instruction);
  highlightStep(index);
}

// Fill the steps list UI
function populateStepsList() {
  stepsList.innerHTML = '';
  steps.forEach((step, idx) => {
    const li = document.createElement('li');
    li.textContent = step.maneuver.instruction;
    if (idx === currentStepIndex) li.style.fontWeight = '700';
    stepsList.appendChild(li);
  });
}

// Highlight current step in the list
function highlightStep(index) {
  Array.from(stepsList.children).forEach((li, idx) => {
    li.style.fontWeight = idx === index ? '700' : '400';
    li.style.color = idx === index ? '#6750a4' : '#202124';
  });
}

// Calculate distance between two [lon, lat] points in meters
function distanceBetween([lon1, lat1], [lon2, lat2]) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371e3; // meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Find closest step maneuver to current position
function closestStepIndex(coords) {
  let minDist = Infinity;
  let minIndex = 0;
  for(let i = 0; i < steps.length; i++) {
    const m = steps[i].maneuver.location; // [lon, lat]
    const dist = distanceBetween([coords.longitude, coords.latitude], m);
    if(dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }
  return minIndex;
}

// Start watching user position and advance steps accordingly
function startNavigation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigating = true;
  watchId = navigator.geolocation.watchPosition(position => {
    const coords = position.coords;

    // Center map on user
    map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 16, speed: 0.5, curve: 1 });

    // Advance step if user is close enough (<25m)
    const nextStepIdx = currentStepIndex + 1;
    if (nextStepIdx < steps.length) {
      const nextStep = steps[nextStepIdx];
      const distToNext = distanceBetween([coords.longitude, coords.latitude], nextStep.maneuver.location);
      if (distToNext < 25) {
        currentStepIndex = nextStepIdx;
        showStep(currentStepIndex);
      }
    }

    // Also check if current step is behind user (>50m), jump ahead if needed
    const currentStep = steps[currentStepIndex];
    const distToCurrent = distanceBetween([coords.longitude, coords.latitude], currentStep.maneuver.location);
    if (distToCurrent > 50 && currentStepIndex < steps.length - 1) {
      currentStepIndex++;
      showStep(currentStepIndex);
    }

    highlightStep(currentStepIndex);

  }, err => {
    console.error(err);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
}

// Speak text using Web Speech API
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}
