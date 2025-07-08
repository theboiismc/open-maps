// app.js

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

// Satellite toggle
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
const getDirectionsBtn = document.getElementById('get-directions');

let destResults   = [];
let originResults = [];
let originCoord   = null;
let activeMarkers = [];

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
  destResults.forEach((r,i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;
    div.dataset.idx = i;
    destList.append(div);
  });
});

// Origin autocomplete
originInput.addEventListener('input', async e => {
  const q = e.target.value.trim();
  originList.innerHTML = '';
  if (!q) return;
  originResults = await nominatimSearch(q);
  originResults.forEach((r,i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;
    div.dataset.idx = i;
    originList.append(div);
  });
});

// Click handlers
destList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destResults[idx];
  map.flyTo({ center: [+place.lon, +place.lat], zoom: 14 });
});

originList.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = originResults[idx];
  originInput.value = place.display_name;
  originCoord = { lon: +place.lon, lat: +place.lat };
  originList.innerHTML = '';
});

// Clear previous route & markers
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
}

// Fetch & draw route on click
getDirectionsBtn.addEventListener('click', async () => {
  if (!originCoord || !destResults.length) {
    alert('Select both origin and destination.');
    return;
  }

  const dest = destResults[0];
  const url = 
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/` +
    `${originCoord.lon},${originCoord.lat};${dest.lon},${dest.lat}` +
    `?overview=full&geometries=geojson&steps=false`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) {
      alert('No route found.');
      return;
    }

    clearRoute();
    const route = json.routes[0];

    // Draw the GeoJSON LineString
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

    // Add origin/dest markers
    const m1 = new maplibregl.Marker()
      .setLngLat([originCoord.lon, originCoord.lat])
      .addTo(map);
    const m2 = new maplibregl.Marker()
      .setLngLat([+dest.lon, +dest.lat])
      .addTo(map);
    activeMarkers.push(m1, m2);

    // Center on route midpoint
    const coords = route.geometry.coordinates;
    const mid    = coords[Math.floor(coords.length/2)];
    map.flyTo({ center: mid, zoom: 13 });

  } catch (err) {
    alert('Error fetching route: ' + err.message);
  }
});
