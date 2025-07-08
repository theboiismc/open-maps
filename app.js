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
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});

document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

let satelliteVisible = false;
let darkMode = false;
let originCoordinates = null;
let currentSearchResults = [];

map.on('load', () => {
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
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  document.getElementById('regular-toggle').classList.toggle('active');
  document.getElementById('satellite-toggle').classList.toggle('active');
};

document.getElementById('dark-toggle').onclick = () => {
  darkMode = !darkMode;
  map.setStyle(darkMode
    ? 'https://tiles.openfreemap.org/styles/toner'
    : 'https://tiles.openfreemap.org/styles/liberty'
  );
  document.getElementById('dark-toggle').classList.toggle('active');
};

geoControl.on('geolocate', (e) => {
  if (!originInput.value) {
    originInput.value = 'Your Location';
    originCoordinates = { lat: e.coords.latitude, lon: e.coords.longitude };
  }
});

const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const directionsSteps = document.getElementById('directions-steps');
const getDirectionsButton = document.getElementById('get-directions');
const clearDirectionsButton = document.getElementById('clear-directions');

searchInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) return (suggestionsBox.innerHTML = '');

  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
  const data = await response.json();
  currentSearchResults = data;

  suggestionsBox.innerHTML = data.map(result => `
    <div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">
      ${result.display_name}
    </div>
  `).join('');

  suggestionsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.querySelectorAll('.suggestion').forEach(el =>
    el.addEventListener('click', (event) => {
      const lat = event.target.dataset.lat;
      const lon = event.target.dataset.lon;
      map.flyTo({ center: [lon, lat], zoom: 15 });
      directionsUI.style.display = 'flex';
    })
  );
});

originInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) return (originSuggestionsBox.innerHTML = '');

  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
  const data = await response.json();

  originSuggestionsBox.innerHTML = data.map(result => `
    <div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">
      ${result.display_name}
    </div>
  `).join('');

  document.querySelectorAll('.suggestion').forEach((el) =>
    el.addEventListener('click', (event) => {
      originInput.value = event.target.innerText;
      originCoordinates = {
        lat: event.target.dataset.lat,
        lon: event.target.dataset.lon,
      };
      originSuggestionsBox.innerHTML = '';
    })
  );
});

getDirectionsButton.addEventListener('click', async () => {
  if (!originCoordinates || !currentSearchResults.length) {
    alert('Please select both origin and destination.');
    return;
  }

  const destination = currentSearchResults[0];
  const origin = originCoordinates;
  const routeUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&steps=true&geometries=geojson`;

  try {
    const routeResponse = await fetch(routeUrl);
    const routeData = await routeResponse.json();

    if (routeData.routes?.length > 0) {
      const route = routeData.routes[0];
      const coords = route.geometry.coordinates;

      if (map.getSource('route-line')) map.removeSource('route-line');
      if (map.getLayer('route-line')) map.removeLayer('route-line');

      map.addSource('route-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0078ff',
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });

      new maplibregl.Marker().setLngLat([origin.lon, origin.lat]).setPopup(new maplibregl.Popup().setHTML('Origin')).addTo(map);
      new maplibregl.Marker().setLngLat([destination.lon, destination.lat]).setPopup(new maplibregl.Popup().setHTML('Destination')).addTo(map);

      directionsSteps.innerHTML = '';
      route.legs[0].steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>Step ${i + 1}:</strong> ${step.maneuver.instruction}<br/><small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>`;
        div.style.marginBottom = '8px';
        directionsSteps.appendChild(div);
      });
    } else {
      alert('Failed to fetch directions.');
    }
  } catch (error) {
    alert('Failed to fetch directions: ' + error.message);
  }
});

clearDirectionsButton.addEventListener('click', () => {
  directionsUI.style.display = 'none';
  directionsSteps.innerHTML = '';
  originInput.value = '';
  originCoordinates = null;
  if (map.getSource('route-line')) map.removeSource('route-line');
  if (map.getLayer('route-line')) map.removeLayer('route-line');
});

map.on('click', async (e) => {
  const { lng, lat } = e.lngLat;
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
  const data = await res.json();

  new maplibregl.Popup()
    .setLngLat([lng, lat])
    .setHTML(`<strong>${data.display_name || 'Unknown Location'}</strong><br><small>Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}</small>`)
    .addTo(map);
});
