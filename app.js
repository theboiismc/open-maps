// app.js

// 1. Initialize map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
  maxZoom: 18,
  minZoom: 1
});
map.addControl(new maplibregl.NavigationControl(), 'top-left');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-left');

// 2. Sat toggle
let satOn = false;
map.on('load', () => {
  map.addSource('sat', {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    tileSize: 256
  });
  map.addLayer({
    id: 'sat',
    type: 'raster',
    source: 'sat',
    layout: { visibility: 'none' }
  });
});
document.getElementById('satellite-toggle').onclick = () => {
  satOn = !satOn;
  map.setLayoutProperty('sat', 'visibility', satOn ? 'visible' : 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};
document.getElementById('regular-toggle').onclick = () => {
  satOn = false;
  map.setLayoutProperty('sat', 'visibility', 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

// 3. DOM refs & state
const originInput = document.getElementById('origin');
const originList  = document.getElementById('origin-suggestions');
const destInput   = document.getElementById('search');
const destList    = document.getElementById('suggestions');
const getBtn      = document.getElementById('get-directions');

let originCoord = null;
let destCoord   = null;
let activeMarkers = [];

// 4. Nominatim helper
async function nominatim(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`
  );
  return res.json();
}

// 5. Autocomplete handlers
originInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  originList.innerHTML = '';
  originCoord = null;
  if (!q) return;
  const results = await nominatim(q);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.idx = i;
    div.textContent = r.display_name;
    originList.append(div);
  }
});

destInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  destList.innerHTML = '';
  destCoord = null;
  if (!q) return;
  const results = await nominatim(q);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.idx = i;
    div.textContent = r.display_name;
    destList.append(div);
  }
});

// 6. Click-to-select (delegated)
originList.addEventListener('click', async (e) => {
  if (!e.target.matches('.suggestion')) return;
  const idx = e.target.dataset.idx;
  const data = await nominatim(originInput.value.trim());
  const place = data[idx];
  originCoord = { lon: +place.lon, lat: +place.lat };
  originInput.value = place.display_name;
  originList.innerHTML = '';
  map.flyTo({ center: [originCoord.lon, originCoord.lat], zoom: 13 });
  checkReady();
});

destList.addEventListener('click', async (e) => {
  if (!e.target.matches('.suggestion')) return;
  const idx = e.target.dataset.idx;
  const data = await nominatim(destInput.value.trim());
  const place = data[idx];
  destCoord = { lon: +place.lon, lat: +place.lat };
  destInput.value = place.display_name;
  destList.innerHTML = '';
  map.flyTo({ center: [destCoord.lon, destCoord.lat], zoom: 13 });
  checkReady();
});

// 7. Enable button only when both coords set
function checkReady() {
  getBtn.disabled = !(originCoord && destCoord);
}

// 8. Clear old route & markers
function clearRoute() {
  if (map.getLayer('route-line')) {
    map.removeLayer('route-line');
    map.removeSource('route-line');
  }
  activeMarkers.forEach(m => m.remove());
  activeMarkers = [];
}

// 9. Draw the route
getBtn.addEventListener('click', async () => {
  if (!originCoord || !destCoord) return;
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/` +
              `${originCoord.lon},${originCoord.lat};${destCoord.lon},${destCoord.lat}` +
              `?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) {
      alert('No route found.');
      return;
    }
    clearRoute();
    const geom = json.routes[0].geometry;

    // add line
    map.addSource('route-line', {
      type: 'geojson',
      data: { type: 'Feature', geometry: geom }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 6 }
    });

    // add markers
    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([destCoord.lon, destCoord.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    // center on midpoint
    const coords = geom.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 12 });

  } catch (err) {
    alert('Route fetch error: ' + err.message);
  }
});

// disable until ready
getBtn.disabled = true;
