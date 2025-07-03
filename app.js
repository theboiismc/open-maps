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
  map.addSource('satellite', {
    'type': 'raster',
    'url': 'mapbox://mapbox.satellite',
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

  map.addSource('terrain', {
    'type': 'raster',
    'url': 'mapbox://mapbox.terrain-rgb',
    'tileSize': 256
  });

  map.addLayer({
    'id': 'terrain-layer',
    'type': 'raster',
    'source': 'terrain',
    'paint': {
      'raster-opacity': 0.7
    }
  });

  map.addSource('traffic', {
    'type': 'vector',
    'url': 'mapbox://mapbox.mapbox-traffic-v1'
  });

  map.addLayer({
    'id': 'traffic-layer',
    'type': 'line',
    'source': 'traffic',
    'source-layer': 'traffic',
    'paint': {
      'line-color': '#ff0000',
      'line-width': 4,
      'line-opacity': 0.6
    }
  });
});

// Layer toggling functionality
document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
};

document.getElementById('terrain-toggle').onclick = () => {
  terrainVisible = !terrainVisible;
  map.setLayoutProperty('terrain-layer', 'visibility', terrainVisible ? 'visible' : 'none');
};

document.getElementById('traffic-toggle').onclick = () => {
  trafficVisible = !trafficVisible;
  map.setLayoutProperty('traffic-layer', 'visibility', trafficVisible ? 'visible' : 'none');
};
