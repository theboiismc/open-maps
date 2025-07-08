const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
});

map.addControl(new maplibregl.NavigationControl(), 'top-left');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'top-left');

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
    layout: { visibility: 'none' }
  });
});

document.getElementById('satellite-toggle').onclick = () => {
  const vis = map.getLayoutProperty('sat-layer', 'visibility');
  map.setLayoutProperty('sat-layer', 'visibility', vis === 'none' ? 'visible' : 'none');
};

const search = document.getElementById('search');
const origin = document.getElementById('origin');
const suggestions = document.getElementById('suggestions');
const originSuggestions = document.getElementById('origin-suggestions');
const directionsBtn = document.getElementById('get-directions');
const navPanel = document.getElementById('nav-panel');
const navText = document.getElementById('nav-instruction');
const startNavBtn = document.getElementById('start-nav');
const stopNavBtn = document.getElementById('stop-nav');
const etaDisplay = document.getElementById('eta');

let routeSteps = [];
let currentStep = 0;
let routeCoords = [];
let routeWatcher = null;
let speech = window.speechSynthesis;
let routeLine;
let originCoord = null;
let destinationCoord = null;

async function nominatimSearch(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

search.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) return;
  const results = await nominatimSearch(q);
  suggestions.innerHTML = '';
  results.forEach((place) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.onclick = () => {
      destinationCoord = [parseFloat(place.lon), parseFloat(place.lat)];
      search.value = place.display_name;
      suggestions.innerHTML = '';
    };
    suggestions.appendChild(div);
  });
});

origin.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) return;
  const results = await nominatimSearch(q);
  originSuggestions.innerHTML = '';
  results.forEach((place) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.onclick = () => {
      originCoord = [parseFloat(place.lon), parseFloat(place.lat)];
      origin.value = place.display_name;
      originSuggestions.innerHTML = '';
    };
    originSuggestions.appendChild(div);
  });
});

directionsBtn.onclick = async () => {
  if (!originCoord || !destinationCoord) {
    alert("Select both origin and destination.");
    return;
  }

  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoord[0]},${originCoord[1]};${destinationCoord[0]},${destinationCoord[1]}?overview=full&steps=true&geometries=geojson`;
  const res = await fetch(url);
  const json = await res.json();

  if (!json.routes?.length) {
    alert("No route found.");
    return;
  }

  const route = json.routes[0];
  routeSteps = route.legs[0].steps;
  routeCoords = route.geometry.coordinates;

  if (routeLine) {
    map.removeLayer(routeLine);
    map.removeSource(routeLine);
  }

  map.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routeCoords }
    }
  });

  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    paint: { 'line-color': '#0078ff', 'line-width': 6 }
  });

  routeLine = 'route';
  map.fitBounds([originCoord, destinationCoord], { padding: 60 });
  navPanel.style.display = 'block';
  navText.textContent = `Ready to start. ${Math.round(route.distance / 1000)} km – ${Math.round(route.duration / 60)} min`;
  etaDisplay.textContent = "";
};

startNavBtn.onclick = () => {
  if (!routeSteps.length) return;
  currentStep = 0;
  speakStep();
  watchPosition();
};

stopNavBtn.onclick = () => {
  if (routeWatcher) navigator.geolocation.clearWatch(routeWatcher);
  navPanel.style.display = 'none';
  routeSteps = [];
  routeCoords = [];
  if (routeLine) {
    map.removeLayer(routeLine);
    map.removeSource(routeLine);
  }
};

function speakStep() {
  if (!routeSteps[currentStep]) return;
  const instruction = routeSteps[currentStep].maneuver.instruction;
  navText.textContent = instruction;
  const utter = new SpeechSynthesisUtterance(instruction);
  speech.cancel();
  speech.speak(utter);
}

function watchPosition() {
  routeWatcher = navigator.geolocation.watchPosition(pos => {
    const userPos = [pos.coords.longitude, pos.coords.latitude];
    const target = routeSteps[currentStep].maneuver.location;
    const dist = distance(userPos, target);

    map.flyTo({ center: userPos, zoom: 16, bearing: pos.coords.heading || 0 });
    etaDisplay.textContent = `Speed: ${Math.round(pos.coords.speed * 3.6 || 0)} km/h`;

    if (dist < 30 && currentStep < routeSteps.length - 1) {
      currentStep++;
      speakStep();
    }
  }, err => {
    console.error("GPS error:", err);
    alert("GPS not available.");
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

function distance(coord1, coord2) {
  const R = 6371e3;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLon = toRad(coord2[0] - coord1[0]);
  const lat1 = toRad(coord1[1]);
  const lat2 = toRad(coord2[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
