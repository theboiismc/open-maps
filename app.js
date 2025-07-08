let map = new maplibregl.Map({
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

// Satellite setup
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
  document.getElementById('satellite-toggle').classList.remove('active');
  document.getElementById('regular-toggle').classList.add('active');
};

// UI elements
const destInput = document.getElementById('search');
const destList = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originList = document.getElementById('origin-suggestions');
const directionsUI = document.getElementById('directions-ui');
const getDirectionsBtn = document.getElementById('get-directions');
const routeInfoBox = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');
const closeRouteInfo = document.getElementById('close-route-info');
const mapControls = document.getElementById('map-controls');

let destResults = [];
let originResults = [];
let originCoord = null;
let activeMarkers = [];
let currentRoute = null;
let navWatchId = null;
let spokenSteps = new Set();

// Voice setup
const synth = window.speechSynthesis;

// Utils
function speak(text) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  synth.cancel(); // cancel previous
  synth.speak(utter);
}

function haversineDistance(coord1, coord2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lon - coord1.lon);
  const lat1 = toRad(coord1.lat);
  const lat2 = toRad(coord2.lat);
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  routeSummary.textContent = '';
  routeInfoBox.classList.add('hidden');
  if (navWatchId) {
    navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }
  spokenSteps.clear();
}

// Geocoder
async function nominatimSearch(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

// Search inputs
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
  map.flyTo({ center: [+place.lon, +place.lat], zoom: 14 });
  directionsUI.style.display = 'flex';
  destList.innerHTML = '';
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

originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
});

// Close panel
closeRouteInfo.addEventListener('click', () => {
  routeInfoBox.classList.add('hidden');
});

// Get Directions
getDirectionsBtn.addEventListener('click', async () => {
  if (!originCoord || !destResults.length) {
    alert('Select both origin and destination.');
    return;
  }
  const dest = destResults[0];
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoord.lon},${originCoord.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) {
      alert('No route found.');
      return;
    }

    clearRoute();
    currentRoute = json.routes[0];

    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: currentRoute.geometry
      }
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

    const distKm = (currentRoute.distance / 1000).toFixed(2);
    const durMin = Math.round(currentRoute.duration / 60);
    routeSummary.textContent = `Distance: ${distKm} km · Duration: ${durMin} min`;
    routeInfoBox.classList.remove('hidden');

    const startBtn = document.createElement('button');
    startBtn.id = 'start-navigation';
    startBtn.textContent = 'Start Navigation';
    directionsUI.append(startBtn);

    startBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation not supported.');
        return;
      }

      spokenSteps.clear();
      const steps = currentRoute.legs[0].steps;

      navWatchId = navigator.geolocation.watchPosition(pos => {
        const userCoord = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };

        map.flyTo({ center: [userCoord.lon, userCoord.lat], zoom: 16 });

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const target = {
            lat: step.maneuver.location[1],
            lon: step.maneuver.location[0]
          };
          const dist = haversineDistance(userCoord, target);

          if (dist < 35 && !spokenSteps.has(i)) {
            if (step.maneuver.instruction) {
              speak(step.maneuver.instruction);
              spokenSteps.add(i);
              break;
            }
          }
        }
      }, err => {
        alert('GPS error: ' + err.message);
      }, {
        enableHighAccuracy: true,
        maximumAge: 1000
      });
    });

  } catch (err) {
    alert('Error: ' + err.message);
  }
});
