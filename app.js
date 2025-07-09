const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-89.4, 43.07],
  zoom: 5,
  maxZoom: 18,
  minZoom: 1
});

// UI Elements
const directionsForm = document.getElementById('directions-form');
const directionsToggleBtn = document.getElementById('directions-toggle');
const closeDirectionsBtn = document.getElementById('close-directions');
const styleToggle = document.getElementById('style-toggle');
const mapStyleImg = document.getElementById('map-style-img');
const mapStyleLabel = document.getElementById('map-style-label');
const routeInfoDiv = document.getElementById('route-info');

// Directions toggle
function openDirectionsPanel() {
  directionsForm.classList.add('open');
  document.querySelector('.search-bar').style.display = 'none';
  styleToggle.style.left = '120px';
}
function closeDirectionsPanel() {
  directionsForm.classList.remove('open');
  document.querySelector('.search-bar').style.display = 'flex';
  styleToggle.style.left = '20px';
}

directionsToggleBtn.onclick = () => {
  if (directionsForm.classList.contains('open')) {
    closeDirectionsPanel();
  } else {
    openDirectionsPanel();
  }
};
closeDirectionsBtn.onclick = closeDirectionsPanel;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDirectionsPanel();
});

// Satellite toggle setup
let satelliteLayerAdded = false;
let isSatellite = false;

function addSatelliteLayer() {
  if (!satelliteLayerAdded) {
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
    satelliteLayerAdded = true;
  }
}

function updateMapStyleUI() {
  if (isSatellite) {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    mapStyleImg.src = 'satelite_style.png';
    mapStyleLabel.textContent = 'Satellite';
  } else {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    mapStyleImg.src = 'default_style.png';
    mapStyleLabel.textContent = 'Regular';
  }
}

styleToggle.onclick = () => {
  isSatellite = !isSatellite;
  updateMapStyleUI();
};

// Photon search
async function photonSearch(query) {
  if (!query) return [];
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
  const data = await res.json();
  return data.features || [];
}

function setupSearch(inputEl, suggestionsEl) {
  inputEl.addEventListener('input', async () => {
    const val = inputEl.value.trim();
    if (!val) return suggestionsEl.innerHTML = '';
    const results = await photonSearch(val);
    suggestionsEl.innerHTML = '';
    results.forEach(f => {
      const div = document.createElement('div');
      div.className = 'suggestion';
      div.textContent = `${f.properties.name}, ${f.properties.city || ''}, ${f.properties.state || ''}`;
      div.dataset.lon = f.geometry.coordinates[0];
      div.dataset.lat = f.geometry.coordinates[1];
      div.onclick = () => {
        inputEl.value = div.textContent;
        inputEl.dataset.lon = div.dataset.lon;
        inputEl.dataset.lat = div.dataset.lat;
        suggestionsEl.innerHTML = '';
        if (inputEl.id === 'search') {
          map.flyTo({ center: [div.dataset.lon, div.dataset.lat], zoom: 14 });
        }
      };
      suggestionsEl.appendChild(div);
    });
  });
}

setupSearch(document.getElementById('search'), document.getElementById('suggestions'));
setupSearch(document.getElementById('origin'), document.getElementById('origin-suggestions'));
setupSearch(document.getElementById('destination'), document.getElementById('destination-suggestions'));

// Route drawing
function drawRoute(geo) {
  if (map.getSource('route')) {
    map.getSource('route').setData(geo);
  } else {
    map.addSource('route', { type: 'geojson', data: geo });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#6750a4', 'line-width': 5 }
    });
  }
}

function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  routeInfoDiv.textContent = '';
}

document.getElementById('get-route').onclick = async () => {
  const o = document.getElementById('origin');
  const d = document.getElementById('destination');
  const oLon = parseFloat(o.dataset.lon), oLat = parseFloat(o.dataset.lat);
  const dLon = parseFloat(d.dataset.lon), dLat = parseFloat(d.dataset.lat);

  if (isNaN(oLon) || isNaN(oLat) || isNaN(dLon) || isNaN(dLat)) {
    alert('Please select valid origin and destination.');
    return;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes.length) throw new Error('No route found.');
    const route = data.routes[0];
    drawRoute(route.geometry);
    const bounds = route.geometry.coordinates.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0]));
    map.fitBounds(bounds, { padding: 80 });
    const dist = (route.distance / 1000).toFixed(1), dur = Math.round(route.duration / 60);
    routeInfoDiv.textContent = `Distance: ${dist} km | Duration: ${dur} min`;
  } catch (e) {
    alert('Error retrieving route.');
    console.error(e);
  }
};

document.getElementById('clear-route').onclick = () => {
  clearRoute();
  ['origin', 'destination'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.dataset.lon = '';
    el.dataset.lat = '';
  });
};

// Controls
map.on('load', () => {
  addSatelliteLayer();
  updateMapStyleUI();
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
});

