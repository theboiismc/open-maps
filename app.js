const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',  // OpenFreeMap style
  center: [0, 20],
  zoom: 3,
  pitch: 0,  // Set pitch to 0 for a flat view (no tilt)
  bearing: 0, // Default rotation (no rotation)
  dragRotate: true,  // Allow map rotation with mouse or touch
  touchZoomRotate: true,  // Allow pinch zoom and rotate on mobile
  scrollZoom: true,  // Enable scroll zoom
  maxZoom: 18,  // Max zoom for Google Maps-like feel
  minZoom: 2,  // Min zoom for Google Maps-like feel
  zoomAnimation: true,  // Enable smooth zooming
  rotationAnimation: true,  // Enable smooth map rotation
});

let marker;
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info');

// Layer visibility flags
let satelliteVisible = false;
let terrainVisible = false;
let trafficVisible = false;

// Add navigation and geolocation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-right');

// Handle input for search functionality
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
      data.features.forEach(feature => {
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

// Select a place from suggestions
function selectPlace(feature, label) {
  const [lon, lat] = feature.geometry.coordinates;
  map.flyTo({
    center: [lon, lat],
    zoom: 12,
    speed: 1,  // Adjust speed for smooth animation
    curve: 1,  // Smooth curve of the animation
    easing(t) {
      return t; // Linear easing for smooth transition
    }
  });

  if (marker) marker.remove();
  marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);

  input.value = label;
  suggestionsBox.style.display = 'none';

  const props = feature.properties;
  infoBox.innerHTML = `
    <h2>${props.name}</h2>
    <p><strong>City:</strong> ${props.city || '—'}</p>
    <p><strong>State:</strong> ${props.state || '—'}</p>
    <p><strong>Country:</strong> ${props.country || '—'}</p>
    <p><strong>OSM Type:</strong> ${props.osm_value || '—'}</p>
  `;
  infoBox.style.display = 'block';
}

// Add layers
map.on('load', function () {
  // Satellite Layer (Using CartoDB Positron for a lighter satellite-like view)
  map.addSource('satellite', {
    'type': 'raster',
    'tiles': [
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', // CartoDB Positron tiles
    ],
    'tileSize': 256
  });

  map.addLayer({
    'id': 'satellite-layer',
    'type': 'raster',
    'source': 'satellite',
    'paint': {
      'raster-opacity': 0.8
    }
  });

  // Terrain Layer (Using Stamen Terrain tiles for topographic view)
  map.addSource('terrain', {
    'type': 'raster',
    'tiles': [
      'https://{s}.tile.stamen.com/terrain/{z}/{x}/{y}.jpg',  // Stamen Terrain tiles
    ],
    'tileSize': 256,
    'minzoom': 1,  // Minimum zoom for terrain detail
    'maxzoom': 18,  // Maximum zoom for terrain detail
  });

  map.addLayer({
    'id': 'terrain-layer',
    'type': 'raster',
    'source': 'terrain',
    'paint': {
      'raster-opacity': 0.7
    }
  });

  // Traffic Layer (Placeholder with GeoJSON, replace with real traffic data if available)
  map.addSource('traffic', {
    'type': 'geojson',
    'data': 'https://raw.githubusercontent.com/YourTrafficDataSource/traffic.geojson', // Example traffic data source (replace it with real data)
  });

  map.addLayer({
    'id': 'traffic-layer',
    'type': 'line',
    'source': 'traffic',
    'paint': {
      'line-color': '#ff0000',
      'line-width': 4,
      'line-opacity': 0.6
    }
  });
});

// Layer toggle functionality
document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
  toggleButtonStyle('satellite-toggle', satelliteVisible);
};

document.getElementById('terrain-toggle').onclick = () => {
  terrainVisible = !terrainVisible;
  map.setLayoutProperty('terrain-layer', 'visibility', terrainVisible ? 'visible' : 'none');
  toggleButtonStyle('terrain-toggle', terrainVisible);
};

document.getElementById('traffic-toggle').onclick = () => {
  trafficVisible = !trafficVisible;
  map.setLayoutProperty('traffic-layer', 'visibility', trafficVisible ? 'visible' : 'none');
  toggleButtonStyle('traffic-toggle', trafficVisible);
};

// Toggle active state of the buttons
function toggleButtonStyle(buttonId, isActive) {
  const button = document.getElementById(buttonId);
  if (isActive) {
    button.classList.add('active');
  } else {
    button.classList.remove('active');
  }
}
