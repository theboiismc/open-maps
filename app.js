// === Map Initialization ===
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

map.addControl(new maplibregl.NavigationControl(), 'top-left');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-left');

let satVisible = false;
map.on('load', () => {
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
});

document.getElementById('satellite-toggle').onclick = () => {
  satVisible = !satVisible;
  map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

document.getElementById('regular-toggle').onclick = () => {
  satVisible = false;
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

const destInput = document.getElementById('search');
const destList = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originList = document.getElementById('origin-suggestions');
const directionsUI = document.getElementById('directions-ui');
const getDirectionsBtn = document.getElementById('get-directions');
const clearDirectionsBtn = document.getElementById('clear-directions');
const routeInfoBox = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');
const routeEta = document.getElementById('route-eta');
const closeRouteBtn = document.getElementById('close-route-info');
const darkToggleBtn = document.getElementById('dark-toggle');

let destResults = [];
let originResults = [];
let originCoord = null;
let routeGeoJSON = null;
let activeMarkers = [];
let navigationActive = false;
let currentStepIndex = 0;
let stepMarkers = [];
let voiceSynth = window.speechSynthesis;
let routeSteps = [];

// Dark mode functions
function applyDarkMode(enabled) {
  if(enabled) {
    document.body.classList.add('dark-mode');
    darkToggleBtn.textContent = 'Light Mode';
  } else {
    document.body.classList.remove('dark-mode');
    darkToggleBtn.textContent = 'Dark Mode';
  }
}

// Apply dark mode based on system preference initially
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
applyDarkMode(prefersDark);

darkToggleBtn.addEventListener('click', () => {
  const darkModeOn = document.body.classList.toggle('dark-mode');
  darkToggleBtn.textContent = darkModeOn ? 'Light Mode' : 'Dark Mode';
});

// Nominatim search helper
async function nominatimSearch(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`
  );
  return res.json();
}

// Destination autocomplete
destInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  destList.innerHTML = '';
  if (!q) return;
  destResults = await nominatimSearch(q);
  destResults.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;
    div.dataset.idx = i;
    destList.append(div);
  });
});

// Destination click
destList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destResults[idx];
  destInput.value = place.display_name;
  map.flyTo({ center: [+place.lon, +place.lat], zoom: 14 });
  directionsUI.style.display = 'flex';
});

// Origin autocomplete
originInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  originList.innerHTML = '';
  if (!q) return;
  originResults = await nominatimSearch(q);
  originResults.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;
    div.dataset.idx = i;
    originList.append(div);
  });
});

// Origin click
originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
});

// Clear old route & markers
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  stepMarkers.forEach(m => m.remove());
  stepMarkers = [];
  routeSteps = [];
  currentStepIndex = 0;
  navigationActive = false;
  routeGeoJSON = null;
  routeSummary.textContent = '';
  routeEta.textContent = '';
  routeInfoBox.classList.add('hidden');
  removeStartNavigationBtn();
}

// Format ETA time
function formatETA(durationSeconds) {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Insert Start Navigation button
function createStartNavigationBtn() {
  if(document.getElementById('start-navigation')) return; // Already exists
  const btn = document.createElement('button');
  btn.id = 'start-navigation';
  btn.textContent = 'Start Navigation';
  btn.addEventListener('click', startNavigation);
  directionsUI.appendChild(btn);
}

function removeStartNavigationBtn() {
  const btn = document.getElementById('start-navigation');
  if (btn) btn.remove();
}

// Show step on map with marker & flyTo
function showStep(step) {
  if(stepMarkers.length > 0) {
    stepMarkers.forEach(m => m.remove());
    stepMarkers = [];
  }
  const coords = step.maneuver.location;
  const marker = new maplibregl.Marker({ color: '#f59e0b' })
    .setLngLat(coords)
    .addTo(map);
  stepMarkers.push(marker);
  map.flyTo({ center: coords, zoom: 16 });
  speakText(step.maneuver.instruction);
  updateRouteInfo(`Step: ${step.maneuver.instruction}`, `Distance: ${(step.distance/1000).toFixed(2)} km`);
}

// Text-to-Speech helper
function speakText(text) {
  if (!voiceSynth) return;
  if (voiceSynth.speaking) voiceSynth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  voiceSynth.speak(utter);
}

// Update route info panel text
function updateRouteInfo(summary, etaText) {
  routeSummary.textContent = summary;
  routeEta.textContent = etaText || '';
  routeInfoBox.classList.remove('hidden');
}

// Navigation control
function startNavigation() {
  if (!routeSteps.length) return;
  navigationActive = true;
  currentStepIndex = 0;
  showStep(routeSteps[currentStepIndex]);
  getDirectionsBtn.disabled = true;
  destInput.disabled = true;
  originInput.disabled = true;
}

// Move to next step, return false if done
function nextStep() {
  if (!navigationActive) return false;
  currentStepIndex++;
  if (currentStepIndex >= routeSteps.length) {
    finishNavigation();
    return false;
  }
  showStep(routeSteps[currentStepIndex]);
  return true;
}

// Finish navigation cleanup
function finishNavigation() {
  navigationActive = false;
  getDirectionsBtn.disabled = false;
  destInput.disabled = false;
  originInput.disabled = false;
  updateRouteInfo('You have arrived!', '');
  stepMarkers.forEach(m => m.remove());
  stepMarkers = [];
}

// When user clicks "Get Directions"
getDirectionsBtn.addEventListener('click', async () => {
  if (!originCoord) {
    alert('Please select origin.');
    return;
  }
  if (!destInput.value.trim()) {
    alert('Please select destination.');
    return;
  }
  const dest = destResults.find(d => d.display_name === destInput.value);
  if (!dest) {
    alert('Please select a valid destination from the suggestions.');
    return;
  }

  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/` +
              `${originCoord.lon},${originCoord.lat};${dest.lon},${dest.lat}` +
              `?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) {
      alert('No route found.');
      return;
    }

    clearRoute();

    const route = json.routes[0];
    routeGeoJSON = route.geometry;
    routeSteps = route.legs[0].steps;

    // Draw route line
    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: routeGeoJSON
      }
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.8 }
    });

    // Markers for origin and destination
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([+dest.lon, +dest.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    // Show summary + ETA
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    updateRouteInfo(`Distance: ${distanceKm} km · Duration: ${durationMin} min`, `ETA: ${formatETA(route.duration)}`);

    // Center map
    const coords = routeGeoJSON.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

    // Show directions UI & add Start Navigation button
    directionsUI.style.display = 'flex';
    createStartNavigationBtn();

  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// Clear directions button
clearDirectionsBtn.addEventListener('click', () => {
  clearRoute();
  originInput.value = '';
  destInput.value = '';
  destList.innerHTML = '';
  originList.innerHTML = '';
  directionsUI.style.display = 'none';
});

// Close route info swipe-to-dismiss & close button
closeRouteBtn.addEventListener('click', () => {
  routeInfoBox.classList.add('hidden');
});

// Swipe-to-dismiss on mobile for route info
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;

routeInfoBox.addEventListener('touchstart', e => {
  if(window.innerWidth > 767) return;
  if(e.touches.length !== 1) return;
  touchStartY = e.touches[0].clientY;
  isDragging = true;
  routeInfoBox.style.transition = '';
});

routeInfoBox.addEventListener('touchmove', e => {
  if(!isDragging) return;
  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;
  if(deltaY > 0) {
    routeInfoBox.style.transform = `translateY(${deltaY}px)`;
  }
});

routeInfoBox.addEventListener('touchend', e => {
  if(!isDragging) return;
  isDragging = false;
  const deltaY = touchCurrentY - touchStartY;
  routeInfoBox.style.transition = 'transform 0.3s ease';
  if(deltaY > 100) {
    routeInfoBox.classList.add('hidden');
    routeInfoBox.style.transform = '';
  } else {
    routeInfoBox.style.transform = '';
  }
});

// Optional: You can add keyboard navigation for next step here
// For demo, listen for right arrow key to go next step when navigating
window.addEventListener('keydown', e => {
  if (navigationActive && e.key === 'ArrowRight') {
    if (!nextStep()) {
      alert('Navigation complete!');
    }
  }
});
