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

// Add nav + geolocate controls
map.addControl(new maplibregl.NavigationControl(), 'top-left');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-left');

// Satellite toggle setup
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

// Layer toggles
document.getElementById('satellite-toggle').onclick = () => {
  satVisible = !satVisible;
  map.setLayoutProperty('sat-layer', 'visibility', satVisible ? 'visible' : 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};
document.getElementById('regular-toggle').onclick = () => {
  satVisible = false;
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  document.getElementById('satellite-toggle').classList.remove('active');
  document.getElementById('regular-toggle').classList.add('active');
};

// DOM refs
const destInput        = document.getElementById('search');
const destList         = document.getElementById('suggestions');
const originInput      = document.getElementById('origin');
const originList       = document.getElementById('origin-suggestions');
const directionsUI     = document.getElementById('directions-ui');
const getDirectionsBtn = document.getElementById('get-directions');
const clearDirectionsBtn = document.getElementById('clear-directions');
const routeInfoBox     = document.getElementById('route-info');
const routeSummary     = document.getElementById('route-summary');
const routeEta         = document.getElementById('route-eta');

let destResults   = [];
let originResults = [];
let originCoord   = null;
let activeMarkers = [];
let activeRoute   = null;
let navigationActive = false;
let watchId = null;

// Helper: Nominatim search
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
destList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destResults[idx];
  destInput.value = place.display_name;
  destList.innerHTML = '';
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
originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
});

// Clear old route & markers & nav
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  routeSummary.textContent = '';
  routeEta.textContent = '';
  routeInfoBox.classList.add('hidden');
  navigationActive = false;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  // Remove Start Navigation button if exists
  const startNavBtn = document.getElementById('start-navigation');
  if (startNavBtn) {
    startNavBtn.remove();
  }
}

// Calculate ETA formatted string
function formatETA(durationSeconds) {
  const now = new Date();
  const arrival = new Date(now.getTime() + durationSeconds * 1000);
  return `ETA: ${arrival.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

// Get Directions click handler
getDirectionsBtn.addEventListener('click', async () => {
  if (!originCoord) {
    alert('Select or enter origin location.');
    return;
  }
  if (!destResults.length) {
    alert('Select destination.');
    return;
  }
  const dest = destResults[0];

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
    activeRoute = route;

    // Draw route line on map
    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: route.geometry
      }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.8 }
    });

    // Add origin & destination markers
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([+dest.lon, +dest.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    // Show route summary & ETA
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeSummary.textContent = `Distance: ${distanceKm} km · Duration: ${durationMin} min`;
    routeEta.textContent = formatETA(route.duration);
    routeInfoBox.classList.remove('hidden');

    // Center map on midpoint of route
    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

    // Insert Start Navigation button if not exists
    if (!document.getElementById('start-navigation')) {
      const btn = document.createElement('button');
      btn.id = 'start-navigation';
      btn.textContent = 'Start Navigation';
      btn.style.marginTop = '10px';
      btn.style.padding = '10px 14px';
      btn.style.backgroundColor = '#0078ff';
      btn.style.color = 'white';
      btn.style.border = 'none';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = '600';
      btn.style.userSelect = 'none';
      btn.addEventListener('click', startNavigation);
      directionsUI.appendChild(btn);
    }
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// Clear button handler
clearDirectionsBtn.addEventListener('click', () => {
  clearRoute();
  destInput.value = '';
  originInput.value = '';
  destList.innerHTML = '';
  originList.innerHTML = '';
  directionsUI.style.display = 'none';
  originCoord = null;
});

// Start navigation: Voice & GPS follow
function startNavigation() {
  if (!activeRoute) return;
  if (!('speechSynthesis' in window)) {
    alert('Speech Synthesis not supported in your browser.');
    return;
  }
  navigationActive = true;
  let stepIndex = 0;
  const steps = activeRoute.legs[0].steps;

  // Speak next step instructions
  function speakStep() {
    if (!navigationActive || stepIndex >= steps.length) {
      speechSynthesis.speak(new SpeechSynthesisUtterance('Navigation ended.'));
      return;
    }
    const instruction = steps[stepIndex].maneuver.instruction;
    const utter = new SpeechSynthesisUtterance(instruction);
    speechSynthesis.speak(utter);
    stepIndex++;
  }

  speakStep();

  // Geolocation watch to update user position & announce next steps
  watchId = navigator.geolocation.watchPosition(pos => {
    if (!navigationActive) {
      navigator.geolocation.clearWatch(watchId);
      return;
    }
    const userLngLat = [pos.coords.longitude, pos.coords.latitude];
    // Center map on user position
    map.flyTo({ center: userLngLat, zoom: 15 });

    // Check distance to next maneuver point, if close, speak next step
    if (stepIndex < steps.length) {
      const nextCoord = steps[stepIndex].maneuver.location;
      const dist = getDistanceMeters(userLngLat, nextCoord);
      if (dist < 30) { // within 30 meters
        speakStep();
      }
    } else {
      // End navigation once last step reached
      navigationActive = false;
      navigator.geolocation.clearWatch(watchId);
    }
  }, err => {
    alert('Error getting GPS position: ' + err.message);
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
}

// Helper: Haversine formula to get distance between two coords in meters
function getDistanceMeters(coord1, coord2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLon = toRad(coord2[0] - coord1[0]);
  const lat1 = toRad(coord1[1]);
  const lat2 = toRad(coord2[1]);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Close route info button
document.getElementById('close-route-info').onclick = () => {
  routeInfoBox.classList.add('hidden');
};
