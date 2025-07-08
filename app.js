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

// Satellite toggle
let satVisible = false;
map.on('load', () => {
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
  document.getElementById('satellite-toggle').classList.remove('active');
  document.getElementById('regular-toggle').classList.add('active');
};

// DOM
const destInput = document.getElementById('search');
const destList = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originList = document.getElementById('origin-suggestions');
const directionsUI = document.getElementById('directions-ui');
const getDirectionsBtn = document.getElementById('get-directions');
const routeInfoBox = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');
const closeRouteInfo = document.getElementById('close-route-info');

let destResults = [];
let originResults = [];
let originCoord = null;
let activeMarkers = [];
let currentRoute = null;
let navStarted = false;

// Voice synth
const synth = window.speechSynthesis;
function speak(text) {
  if (!synth.speaking) {
    const utter = new SpeechSynthesisUtterance(text);
    synth.speak(utter);
  }
}

// Nominatim
async function nominatimSearch(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

// Autocomplete
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

// Select from suggestions
destList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destResults[idx];
  map.flyTo({ center: [+place.lon, +place.lat], zoom: 14 });
  directionsUI.style.display = 'flex';
  destList.innerHTML = '';
});

originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
});

// Hide suggestions on blur or ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    destList.innerHTML = '';
    originList.innerHTML = '';
  }
});
document.addEventListener('click', e => {
  if (!destInput.contains(e.target)) destList.innerHTML = '';
  if (!originInput.contains(e.target)) originList.innerHTML = '';
});

// Clear
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  routeSummary.textContent = '';
  routeInfoBox.classList.add('hidden');
  navStarted = false;
}

// Get directions
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
    currentRoute = route;
    const coords = route.geometry.coordinates;

    map.addSource('route-line', {
      type: 'geojson',
      data: { type: 'Feature', geometry: route.geometry }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.8 }
    });

    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([+dest.lon, +dest.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeSummary.textContent = `Distance: ${distanceKm} km · Duration: ${durationMin} min`;
    routeInfoBox.classList.remove('hidden');

    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

    // Start real-time GPS nav
    if (navigator.geolocation) {
      speak('Navigation started');
      navStarted = true;
      navigator.geolocation.watchPosition(pos => {
        if (!navStarted || !currentRoute) return;
        const { latitude, longitude } = pos.coords;
        const nextStep = currentRoute.legs[0].steps.find(step => {
          return step.maneuver && step.maneuver.location &&
                 distance([longitude, latitude], step.maneuver.location) < 0.05;
        });
        if (nextStep) speak(nextStep.maneuver.instruction);
        map.flyTo({ center: [longitude, latitude], zoom: 15 });
      }, console.error, { enableHighAccuracy: true });
    }
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

closeRouteInfo.addEventListener('click', clearRoute);

// Geo dist helper
function distance([lon1, lat1], [lon2, lat2]) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
