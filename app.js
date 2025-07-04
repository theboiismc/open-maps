const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 1.5,
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

let marker;

const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info'); // If you have an info box

// Add navigation and geolocate controls into #map-controls container
const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});

document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Search input handler
input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }
  suggestionsBox.innerHTML = '<div class="suggestion">Searching...</div>';
  suggestionsBox.style.display = 'block';
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
    );
    const data = await res.json();
    suggestionsBox.innerHTML = '';
    if (data.features.length > 0) {
      data.features.forEach((feature) => {
        const props = feature.properties;
        const name = props.name;
        const city = props.city || '';
        const state = props.state || '';
        const country = props.country || '';
        const label = `${name}${city ? ', ' + city : ''}${
          state ? ', ' + state : ''
        }${country ? ', ' + country : ''}`;
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
  if (marker) marker.remove();
  marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
  input.value = label;
  suggestionsBox.style.display = 'none';
  // Optional: show info box if you have one
  /*
  const props = feature.properties;
  infoBox.innerHTML = `
    <h2>${props.name}</h2>
    <p><strong>City:</strong> ${props.city || '—'}</p>
    <p><strong>State:</strong> ${props.state || '—'}</p>
    <p><strong>Country:</strong> ${props.country || '—'}</p>
    <p><strong>OSM Type:</strong> ${props.osm_value || '—'}</p>
  `;
  infoBox.style.display = 'block';
  */
}

// Layer toggle buttons
let satelliteVisible = false;

map.on('load', () => {
  // Add satellite source & layer
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
