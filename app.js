const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 20],
  zoom: 3,
  pitch: 0,      // Ensure flat view
  bearing: 0,
  dragRotate: false,         // Disable drag rotation for flat map
  touchZoomRotate: false,    // Disable touch rotation as well
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 2
});

let marker;
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info');

// Add controls in bottom-right (these are not tilt-enabled)
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'bottom-right');

// Handle search input
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
    if (data.features.length) {
      data.features.forEach(feature => {
        const p = feature.properties;
        const label = `${p.name}${p.city ? ', ' + p.city : ''}${p.state ? ', ' + p.state : ''}${p.country ? ', ' + p.country : ''}`;
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = label;
        div.onclick = () => selectPlace(feature, label);
        suggestionsBox.append(div);
      });
    } else {
      suggestionsBox.innerHTML = '<div class="suggestion">No results found</div>';
    }
  } catch {
    suggestionsBox.innerHTML = '<div class="suggestion">Error fetching suggestions</div>';
  }
});

// Fly to selection
function selectPlace(feature, label) {
  const [lon, lat] = feature.geometry.coordinates;
  map.flyTo({ center: [lon, lat], zoom: 12, speed: 1, curve: 1, easing: t => t });
  if (marker) marker.remove();
  marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
  input.value = label;
  suggestionsBox.style.display = 'none';
  const p = feature.properties;
  infoBox.innerHTML = `
    <h2>${p.name}</h2>
    <p><strong>City:</strong> ${p.city || '—'}</p>
    <p><strong>State:</strong> ${p.state || '—'}</p>
    <p><strong>Country:</strong> ${p.country || '—'}</p>
    <p><strong>OSM Type:</strong> ${p.osm_value || '—'}</p>
  `;
  infoBox.style.display = 'block';
}

// Hide suggestions when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.search-bar')) {
    suggestionsBox.style.display = 'none';
  }
});

// Pressing Enter selects the first suggestion
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && suggestionsBox.firstChild) {
    suggestionsBox.firstChild.click();
  }
});
