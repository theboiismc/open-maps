const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',  // OpenFreeMap style
  center: [0, 20],
  zoom: 2,
  pitch: 45,  // Start the map with a 45° pitch for 3D look
  bearing: 0, // Default rotation
  dragRotate: true,  // Allow map rotation
  touchZoomRotate: true,  // Enable pinch zoom and rotate on mobile
  scrollZoom: true,  // Enable scroll zoom
});

let marker;
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info');

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
  map.flyTo({ center: [lon, lat], zoom: 12 });

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

// Hide suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-bar')) {
    suggestionsBox.style.display = 'none';
  }
});

// Handle Enter key to select the first suggestion
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && suggestionsBox.firstChild) {
    suggestionsBox.firstChild.click();
  }
});

// Add 3D building layer if available in OpenFreeMap style
map.on('load', function () {
  // Check if OpenFreeMap style has 3D buildings and add them
  if (map.getSource('composite') && map.getSource('composite').getLayer('building')) {
    map.addLayer({
      'id': '3d-buildings',
      'type': 'fill-extrusion',
      'source': 'composite',
      'source-layer': 'building',
      'minzoom': 15,
      'paint': {
        'fill-extrusion-color': '#aaa',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.6
      }
    });
  }
});
