const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 20],
  zoom: 2
});

// Controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-right');

// Search logic
const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');

let marker; // Reuse single marker

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
      const name = feature.properties.name;
      const state = feature.properties.state || '';
      const country = feature.properties.country || '';
      const label = `${name}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;

      const div = document.createElement('div');
      div.className = 'suggestion';
      div.textContent = label;
      div.onclick = () => {
        const [lon, lat] = feature.geometry.coordinates;
        map.flyTo({ center: [lon, lat], zoom: 10 });

        if (marker) marker.remove();
        marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);

        input.value = label;
        suggestionsBox.style.display = 'none';
      };

      suggestionsBox.appendChild(div);
    });

    suggestionsBox.style.display = 'block';
  } else {
    suggestionsBox.style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    suggestionsBox.style.display = 'none';
  }
});
