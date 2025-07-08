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
const closeRouteBtn    = document.getElementById('close-route-info');
const darkToggleBtn    = document.getElementById('dark-toggle');

let destResults   = [];
let originResults = [];
let originCoord   = null;
let activeMarkers = [];

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
  routeSummary.textContent = '';
  routeEta.textContent = '';
  routeInfoBox.classList.add('hidden');
}

// Format ETA time
function formatETA(durationSeconds) {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Get Directions click
getDirectionsBtn.addEventListener('click', async () => {
  if (!originCoord || !destResults.length) {
    alert('Select both origin and destination.');
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

    // Add GeoJSON line
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

    // Add markers
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([+dest.lon, +dest.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    // Show route summary and ETA
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeSummary.textContent = `Distance: ${distanceKm} km · Duration: ${durationMin} min`;

    routeEta.textContent = `ETA: ${formatETA(route.duration)}`;

    routeInfoBox.classList.remove('hidden');

    // Center on midpoint
    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// Clear Directions button
clearDirectionsBtn.addEventListener('click', () => {
  clearRoute();
  originInput.value = '';
  destInput.value = '';
  destList.innerHTML = '';
  originList.innerHTML = '';
  directionsUI.style.display = 'none';
});

// Close route info button
closeRouteBtn.addEventListener('click', () => {
  routeInfoBox.classList.add('hidden');
});

// Swipe-to-dismiss on mobile
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;

routeInfoBox.addEventListener('touchstart', e => {
  if(window.innerWidth > 767) return; // only mobile
  if(e.touches.length !== 1) return;
  touchStartY = e.touches[0].clientY;
  isDragging = true;
  routeInfoBox.style.transition = ''; // cancel transition during drag
});

routeInfoBox.addEventListener('touchmove', e => {
  if(!isDragging) return;
  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;
  if(deltaY > 0) { // only drag down
    routeInfoBox.style.transform = `translateY(${deltaY}px)`;
  }
});

routeInfoBox.addEventListener('touchend', e => {
  if(!isDragging) return;
  isDragging = false;
  const deltaY = touchCurrentY - touchStartY;
  routeInfoBox.style.transition = 'transform 0.3s ease';
  if(deltaY > 100) {
    // swipe down enough to close
    routeInfoBox.classList.add('hidden');
    routeInfoBox.style.transform = '';
  } else {
    // snap back
    routeInfoBox.style.transform = '';
  }
});
