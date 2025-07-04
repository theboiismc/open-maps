const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',  // Retaining your original style
  center: [0, 0],
  zoom: 2,
  pitch: 0,
  bearing: 0,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

// Add navigation and geolocate controls to the map
const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});

document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Layer toggle functionality
let satelliteVisible = false;
map.on('load', () => {
  // Satellite layer
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
});

document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  map.setLayoutProperty(
    'satellite-layer',
    'visibility',
    satelliteVisible ? 'visible' : 'none'
  );
  toggleButtonStyle('satellite-toggle', satelliteVisible);
  toggleButtonStyle('regular-toggle', !satelliteVisible);
};

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  toggleButtonStyle('satellite-toggle', false);
  toggleButtonStyle('regular-toggle', true);
};

function toggleButtonStyle(buttonId, isActive) {
  const btn = document.getElementById(buttonId);
  if (isActive) btn.classList.add('active');
  else btn.classList.remove('active');
}

// Search Input and Suggestions
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
let destination = null;

// Search handler (fetching data from Photon API)
input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }

  suggestionsBox.innerHTML = '<div class="suggestion">Searching...</div>';
  suggestionsBox.style.display = 'block';

  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    suggestionsBox.innerHTML = '';
    if (data.features.length > 0) {
      data.features.forEach((feature) => {
        const props = feature.properties;
        const name = props.name;
        const city = props.city || '';
        const state = props.state || '';
        const country = props.country || '';
        const label = `${name}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = label;
        div.onclick = () => selectPlace(feature, label);
        suggestionsBox.appendChild(div);
      });
    } else {
      suggestionsBox.innerHTML = '<div class="suggestion">No results found</div>';
    }
  } catch (err) {
    suggestionsBox.innerHTML = '<div class="suggestion">Error fetching suggestions</div>';
  }
});

function selectPlace(feature, label) {
  const [lon, lat] = feature.geometry.coordinates;
  map.flyTo({
    center: [lon, lat],
    zoom: 12,
    speed: 1,
    curve: 1,
    easing(t) {
      return t;
    },
  });

  destination = { lon, lat };
  input.value = label;
  suggestionsBox.style.display = 'none';
  document.getElementById('directions-ui').style.display = 'flex';
}

// Get Directions functionality (OSRM)
const getDirBtn = document.getElementById('get-directions');
const originInput = document.getElementById('origin');
const directionsSteps = document.getElementById('directions-steps');

// Get directions button click
getDirBtn.addEventListener('click', async () => {
  if (!destination) {
    alert('Pick a destination first');
    return;
  }

  let oLon = parseFloat(originInput.dataset.origLon);
  let oLat = parseFloat(originInput.dataset.origLat);

  if (!oLon || !oLat || originInput.value.toLowerCase() !== 'my location') {
    if (!originInput.value.trim()) {
      alert('Enter an origin or use your location');
      return;
    }

    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(originInput.value.trim())}&limit=1`
      );
      const data = await res.json();
      if (!data.features.length) throw new Error('Origin not found');
      [oLon, oLat] = data.features[0].geometry.coordinates;
    } catch {
      alert('Could not find the origin location');
      return;
    }
  }

  try {
    await drawRoute(oLon, oLat, destination.lon, destination.lat);
  } catch (err) {
    console.error(err);
    alert('Failed to draw route');
  }
});

// Draw route using OSRM
async function drawRoute(oLon, oLat, dLon, dLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&steps=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch route');
  const json = await res.json();
  const coords = json.routes[0].geometry.coordinates;

  map.addSource('route', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
  });

  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': 6, 'line-color': '#0078ff' },
  });

  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 50 });

  const steps = json.routes[0].legs[0].steps;
  directionsSteps.innerHTML = '';
  steps.forEach((step, i) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <strong>Step ${i + 1}:</strong> ${step.maneuver.instruction} <br/>
      <small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>
    `;
    div.style.marginBottom = '8px';
    directionsSteps.appendChild(div);
  });
}
