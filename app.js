const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.stadiamaps.com/styles/osm-bright.json',
  center: [0, 20],
  zoom: 2
});

// Add controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-right');

// DOM elements
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const infoBox = document.getElementById('info');
let marker;

input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }

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
      div.onclick = () => {
        const [lon, lat] = feature.geometry.coordinates;
        map.flyTo({ center: [lon, lat], zoom: 12 });

        if (marker) marker.remove();
        marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);

        input.value = label;
        suggestionsBox.style.display = 'none';

        // Update sidebar info
        infoBox.innerHTML = `
          <h2>${name}</h2>
          <p><strong>City:</strong> ${props.city || '—'}</p>
          <p><strong>State:</strong> ${props.state || '—'}</p>
          <p><strong>Country:</strong> ${props.country || '—'}</p>
          <p><strong>OSM Type:</strong> ${props.osm_value || '—'}</p>
        `;
      };

      suggestionsBox.appendChild(div);
    });

    suggestionsBox.style.display = 'block';
  } else {
    suggestionsBox.style.display = 'none';
  }
});

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    suggestionsBox.style.display = 'none';
  }
});
