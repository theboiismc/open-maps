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

// Controls
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
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

// DOM refs
const destInput = document.getElementById('search');
const destList = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originList = document.getElementById('origin-suggestions');
const directionsUI = document.getElementById('directions-ui');
const getDirectionsBtn = document.getElementById('get-directions');
const routeInfoBox = document.getElementById('route-info');
const routeSummary = document.getElementById('route-summary');

let destResults = [], originResults = [];
let originCoord = null;
let activeMarkers = [];
let destSelectedIndex = -1;
let originSelectedIndex = -1;

// Helper: search
async function nominatimSearch(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

// Destination autocomplete
destInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  destList.innerHTML = '';
  destSelectedIndex = -1;
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

destInput.addEventListener('keydown', e => {
  const suggestions = destList.querySelectorAll('.suggestion');
  if (!suggestions.length) return;

  if (e.key === 'Escape') {
    destList.innerHTML = '';
    destSelectedIndex = -1;
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    destSelectedIndex = (destSelectedIndex + 1) % suggestions.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    destSelectedIndex = (destSelectedIndex - 1 + suggestions.length) % suggestions.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (destSelectedIndex >= 0) suggestions[destSelectedIndex].click();
  }

  suggestions.forEach((el, i) => {
    el.style.background = i === destSelectedIndex ? '#e6f0ff' : '';
  });
});

destList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destResults[idx];
  destInput.value = place.display_name;
  map.flyTo({ center: [+place.lon, +place.lat], zoom: 14 });
  directionsUI.style.display = 'flex';
  destList.innerHTML = '';
  destSelectedIndex = -1;
  destInput.blur();
});

// Origin autocomplete
originInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  originList.innerHTML = '';
  originSelectedIndex = -1;
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

originInput.addEventListener('keydown', e => {
  const suggestions = originList.querySelectorAll('.suggestion');
  if (!suggestions.length) return;

  if (e.key === 'Escape') {
    originList.innerHTML = '';
    originSelectedIndex = -1;
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    originSelectedIndex = (originSelectedIndex + 1) % suggestions.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    originSelectedIndex = (originSelectedIndex - 1 + suggestions.length) % suggestions.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (originSelectedIndex >= 0) suggestions[originSelectedIndex].click();
  }

  suggestions.forEach((el, i) => {
    el.style.background = i === originSelectedIndex ? '#e6f0ff' : '';
  });
});

originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
  originSelectedIndex = -1;
  originInput.blur();
});

// Hide suggestions on outside click
document.addEventListener('click', e => {
  if (!destInput.contains(e.target) && !destList.contains(e.target)) destList.innerHTML = '';
  if (!originInput.contains(e.target) && !originList.contains(e.target)) originList.innerHTML = '';
});

// Optional: hide on blur (mobile)
destInput.addEventListener('blur', () => setTimeout(() => destList.innerHTML = '', 150));
originInput.addEventListener('blur', () => setTimeout(() => originList.innerHTML = '', 150));

// Clear route
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
  routeSummary.textContent = '';
  routeInfoBox.classList.add('hidden');
}

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
    const route = json.routes[0];

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

    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([+dest.lon, +dest.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeSummary.textContent = `Distance: ${distanceKm} km · Duration: ${durationMin} min`;
    routeInfoBox.classList.remove('hidden');

    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});
