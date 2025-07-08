// ==== INIT MAP & CONTROLS ====
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
  minZoom: 1,
});

const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});
document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// ==== GLOBAL STATE ====
let originCoordinates = null;
let destinationCoordinates = null;
let originMarker = null;
let destinationMarker = null;
const routeLayerId = 'route-line';
let satelliteVisible = false;
let darkVisible = false;

// ==== ADD SATELLITE & DARK LAYERS ON LOAD ====
map.on('load', () => {
  // Satellite
  map.addSource('satellite', {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  });
  map.addLayer({
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.8 },
  });

  // Dark
  map.addSource('dark', {
    type: 'raster',
    tiles: [
      'https://tiles.stadiamaps.com/tiles/alidade_dark/{z}/{x}/{y}{r}.png',
    ],
    tileSize: 256,
  });
  map.addLayer({
    id: 'dark-layer',
    type: 'raster',
    source: 'dark',
    layout: { visibility: 'none' },
  });
});

// ==== LAYER TOGGLE HANDLERS ====
function updateLayerButtons() {
  document.getElementById('regular-toggle').classList.toggle('active', !satelliteVisible && !darkVisible);
  document.getElementById('satellite-toggle').classList.toggle('active', satelliteVisible);
  document.getElementById('dark-toggle').classList.toggle('active', darkVisible);
}

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = darkVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  map.setLayoutProperty('dark-layer', 'visibility', 'none');
  updateLayerButtons();
};

document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  if (satelliteVisible) darkVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
  map.setLayoutProperty('dark-layer', 'visibility', darkVisible ? 'visible' : 'none');
  updateLayerButtons();
};

document.getElementById('dark-toggle').onclick = () => {
  darkVisible = !darkVisible;
  if (darkVisible) satelliteVisible = false;
  map.setLayoutProperty('dark-layer', 'visibility', darkVisible ? 'visible' : 'none');
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
  updateLayerButtons();
};

// ==== AUTO‑FILL ORIGIN VIA GEOLOCATE ====
geoControl.on('geolocate', (e) => {
  if (!originCoordinates) {
    originCoordinates = { lat: e.coords.latitude, lon: e.coords.longitude };
    document.getElementById('origin').value = 'Your Location';
  }
});

// ==== DOM ELEMENTS ====
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const directionsUI = document.getElementById('directions-ui');
const getBtn = document.getElementById('get-directions');
const clearBtn = document.getElementById('clear-directions');
const stepsContainer = document.getElementById('directions-steps');

// ==== HELPER: CLEAR ROUTE & UI ====
function clearRoute() {
  if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
  if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);
  if (originMarker) originMarker.remove(), originMarker = null;
  if (destinationMarker) destinationMarker.remove(), destinationMarker = null;
  stepsContainer.innerHTML = '';
  originCoordinates = destinationCoordinates = null;
  document.getElementById('search').value = '';
  document.getElementById('origin').value = '';
  suggestionsBox.innerHTML = '';
  originSuggestionsBox.innerHTML = '';
  directionsUI.style.display = 'none';
}

// ==== DESTINATION SEARCH & SUGGESTIONS ====
searchInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) return suggestionsBox.innerHTML = '';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  const data = await res.json();
  suggestionsBox.innerHTML = data.map(r =>
    `<div class="suggestion" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`
  ).join('');
  document.querySelectorAll('#suggestions .suggestion')
    .forEach(el => el.addEventListener('click', evt => {
      const ds = evt.currentTarget.dataset;
      destinationCoordinates = { lat: +ds.lat, lon: +ds.lon };
      searchInput.value = evt.currentTarget.textContent;
      suggestionsBox.innerHTML = '';
      map.flyTo({ center: [destinationCoordinates.lon, destinationCoordinates.lat], zoom: 15 });
      directionsUI.style.display = 'flex';
    }));
});

// ==== ORIGIN SEARCH & SUGGESTIONS ====
originInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) return originSuggestionsBox.innerHTML = '';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  const data = await res.json();
  originSuggestionsBox.innerHTML = data.map(r =>
    `<div class="suggestion" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`
  ).join('');
  document.querySelectorAll('#origin-suggestions .suggestion')
    .forEach(el => el.addEventListener('click', evt => {
      const ds = evt.currentTarget.dataset;
      originCoordinates = { lat: +ds.lat, lon: +ds.lon };
      originInput.value = evt.currentTarget.textContent;
      originSuggestionsBox.innerHTML = '';
    }));
});

// ==== GET & DRAW DIRECTIONS ====
getBtn.addEventListener('click', async () => {
  if (!originCoordinates || !destinationCoordinates) {
    return alert('Please select both origin and destination.');
  }
  const url = [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
    `${originCoordinates.lon},${originCoordinates.lat};${destinationCoordinates.lon},${destinationCoordinates.lat}`,
    '?overview=full&steps=true&geometries=geojson'
  ].join('');

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.length) return alert('No route found.');
    const route = json.routes[0];

    // clear old
    clearRoute();

    // markers
    originMarker = new maplibregl.Marker({ color: 'green' })
      .setLngLat([originCoordinates.lon, originCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Origin'))
      .addTo(map);
    destinationMarker = new maplibregl.Marker({ color: 'red' })
      .setLngLat([destinationCoordinates.lon, destinationCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Destination'))
      .addTo(map);

    // route line
    map.addSource(routeLayerId, {
      type: 'geojson',
      data: { type: 'Feature', geometry: route.geometry }
    });
    map.addLayer({
      id: routeLayerId,
      type: 'line',
      source: routeLayerId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0078ff', 'line-width': 5, 'line-opacity': 0.8 }
    });

    // fit to bounds
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds, { padding: 40 });

    // text steps
    stepsContainer.innerHTML = '';
    route.legs[0].steps.forEach((s, i) => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>Step ${i+1}:</strong> ${s.maneuver.instruction}
        <br/><small>Distance: ${(s.distance/1000).toFixed(2)} km, Duration: ${Math.round(s.duration)} sec</small>`;
      div.style.marginBottom = '6px';
      stepsContainer.appendChild(div);
    });

  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// ==== CLEAR BUTTON ====
clearBtn.addEventListener('click', clearRoute);
