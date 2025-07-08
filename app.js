// ==== INIT MAP & CONTROLS ====
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
  pitch: 0,
  bearing: 0,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1
});

map.addControl(new maplibregl.NavigationControl());
const geo = new maplibregl.GeolocateControl({ trackUserLocation: true, showUserHeading: true });
map.addControl(geo);

// ==== STATE ====
let originCoordinates = null;
let destinationCoordinates = null;
let originMarker = null;
let destinationMarker = null;
const ROUTE_LAYER = 'route-line';

// ==== HELPERS ====
function clearRoute() {
  if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
  if (map.getSource(ROUTE_LAYER)) map.removeSource(ROUTE_LAYER);
  originMarker?.remove();
  destinationMarker?.remove();
  originMarker = destinationMarker = null;
  document.getElementById('directions-steps').innerHTML = '';
  originCoordinates = destinationCoordinates = null;
  document.getElementById('directions-ui').style.display = 'none';
  document.getElementById('search').value = '';
  document.getElementById('origin').value = '';
  document.getElementById('suggestions').innerHTML = '';
  document.getElementById('origin-suggestions').innerHTML = '';
}

geo.on('geolocate', e => {
  if (!originCoordinates) {
    originCoordinates = { lat: e.coords.latitude, lon: e.coords.longitude };
    document.getElementById('origin').value = 'Your Location';
  }
});

// ==== DESTINATION SEARCH & SUGGESTIONS ====
document.getElementById('search').addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    document.getElementById('suggestions').innerHTML = '';
    return;
  }
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`
  );
  const items = await res.json();
  document.getElementById('suggestions').innerHTML = items
    .map(i => `<div class="suggestion" data-lat="${i.lat}" data-lon="${i.lon}">${i.display_name}</div>`)
    .join('');

  document.querySelectorAll('#suggestions .suggestion').forEach(el => {
    el.addEventListener('click', event => {
      // use event.target.closest() to find the .suggestion div
      const tile = event.target.closest('.suggestion');
      if (!tile) return;
      const lat = parseFloat(tile.dataset.lat);
      const lon = parseFloat(tile.dataset.lon);
      destinationCoordinates = { lat, lon };
      document.getElementById('search').value = tile.textContent;
      document.getElementById('suggestions').innerHTML = '';
      map.flyTo({ center: [lon, lat], zoom: 15 });
      document.getElementById('directions-ui').style.display = 'flex';
    });
  });
});

// ==== ORIGIN SEARCH & SUGGESTIONS ====
document.getElementById('origin').addEventListener('input', async e => {
  const q = e.target.value.trim();
  if (!q) {
    document.getElementById('origin-suggestions').innerHTML = '';
    return;
  }
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`
  );
  const items = await res.json();
  document.getElementById('origin-suggestions').innerHTML = items
    .map(i => `<div class="suggestion" data-lat="${i.lat}" data-lon="${i.lon}">${i.display_name}</div>`)
    .join('');

  document.querySelectorAll('#origin-suggestions .suggestion').forEach(el => {
    el.addEventListener('click', event => {
      const tile = event.target.closest('.suggestion');
      if (!tile) return;
      const lat = parseFloat(tile.dataset.lat);
      const lon = parseFloat(tile.dataset.lon);
      originCoordinates = { lat, lon };
      document.getElementById('origin').value = tile.textContent;
      document.getElementById('origin-suggestions').innerHTML = '';
    });
  });
});

// ==== GET & DRAW DIRECTIONS ====
document.getElementById('get-directions').addEventListener('click', async () => {
  if (!originCoordinates || !destinationCoordinates) {
    alert('Please select both origin and destination.');
    return;
  }
  clearRoute();
  const url =
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/' +
    `${originCoordinates.lon},${originCoordinates.lat};${destinationCoordinates.lon},${destinationCoordinates.lat}` +
    '?overview=full&steps=true&geometries=geojson';

  try {
    const res = await fetch(url);
    const { routes } = await res.json();
    if (!routes?.length) {
      alert('No route found.');
      return;
    }
    const route = routes[0];

    // Markers
    originMarker = new maplibregl.Marker({ color: 'green' })
      .setLngLat([originCoordinates.lon, originCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Origin'))
      .addTo(map);

    destinationMarker = new maplibregl.Marker({ color: 'red' })
      .setLngLat([destinationCoordinates.lon, destinationCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Destination'))
      .addTo(map);

    // Route line
    map.addSource(ROUTE_LAYER, {
      type: 'geojson',
      data: { type: 'Feature', geometry: route.geometry }
    });
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_LAYER,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0078ff', 'line-width': 5, 'line-opacity': 0.8 }
    });

    // Fit bounds
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds, { padding: 40 });

    // Text steps
    const stepsEl = document.getElementById('directions-steps');
    stepsEl.innerHTML = '';
    route.legs[0].steps.forEach((s, i) => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>Step ${i + 1}:</strong> ${s.maneuver.instruction}
        <br/><small>Distance: ${(s.distance / 1000).toFixed(2)} km, Duration: ${Math.round(
        s.duration
      )} s</small>`;
      div.style.marginBottom = '6px';
      stepsEl.appendChild(div);
    });
  } catch (err) {
    alert('Error fetching directions: ' + err.message);
  }
});

// ==== CLEAR BUTTON ====
document.getElementById('clear-directions').addEventListener('click', clearRoute);
