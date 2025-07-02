// Initialize MapLibre map (no API key)
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 20],
  zoom: 2
});

// Add zoom & rotation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add location tracking button
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'top-right');

// Handle search
const input = document.getElementById('search');
input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    const query = encodeURIComponent(input.value.trim());
    if (!query) return;

    fetch(`https://photon.komoot.io/api/?q=${query}&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data.features.length > 0) {
          const [lon, lat] = data.features[0].geometry.coordinates;
          map.flyTo({ center: [lon, lat], zoom: 10 });

          // Add marker
          new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
        } else {
          alert("No location found.");
        }
      })
      .catch(err => {
        console.error('Search error:', err);
        alert("Failed to search. Try again.");
      });
  }
});
