const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 20],
  zoom: 2
});

// Add map controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-right');

// Elements
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info');
let marker;

// Handle input
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

// On select
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

// Enter key selects first suggestion
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && suggestionsBox.firstChild) {
    suggestionsBox.firstChild.click();
  }
});
