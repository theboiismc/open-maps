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

// Navigation + geolocation controls
const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});
document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Satellite layer toggle
let satelliteVisible = false;
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

// DOM elements
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const directionsSteps = document.getElementById('directions-steps');
const getDirectionsButton = document.getElementById('get-directions');

let currentSearchResults = [];
let originCoordinates = null;

// Search input for destination
searchInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) {
    suggestionsBox.innerHTML = '';
    return;
  }

  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
  const data = await response.json();
  currentSearchResults = data;

  suggestionsBox.innerHTML = data.map(result => `
    <div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">
      ${result.display_name}
    </div>
  `).join('');

  document.querySelectorAll('.suggestion').forEach(el =>
    el.addEventListener('click', (event) => {
      const lat = event.target.dataset.lat;
      const lon = event.target.dataset.lon;
      map.flyTo({ center: [lon, lat], zoom: 15 });
      directionsUI.style.display = 'flex';
    })
  );
});

// Origin input for directions
originInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) {
    originSuggestionsBox.innerHTML = '';
    return;
  }

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

// Get Directions button
getDirectionsButton.addEventListener('click', async () => {
  if (!originCoordinates || !currentSearchResults.length) {
    alert('Please select both origin and destination.');
    return;
  }

  const destination = currentSearchResults[0];
  const origin = originCoordinates;

  const routeUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const routeResponse = await fetch(routeUrl);
    const routeData = await routeResponse.json();

    if (routeData.routes && routeData.routes.length > 0) {
      const route = routeData.routes[0];

      // Remove existing route
      if (map.getSource('route-line')) {
        map.removeLayer('route-line');
        map.removeSource('route-line');
      }

      // Draw the route
      map.addSource('route-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: route.geometry.coordinates
          }
        }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff7e5f',
          'line-width': 5,
          'line-opacity': 0.8
        }
      });

      // Add markers
      new maplibregl.Marker()
        .setLngLat([origin.lon, origin.lat])
        .setPopup(new maplibregl.Popup().setHTML('Origin'))
        .addTo(map);

      new maplibregl.Marker()
        .setLngLat([destination.lon, destination.lat])
        .setPopup(new maplibregl.Popup().setHTML('Destination'))
        .addTo(map);

      // Show steps
      const steps = route.legs[0].steps;
      directionsSteps.innerHTML = '';
      steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.innerHTML = `
          <strong>Step ${i + 1}:</strong> ${step.maneuver.instruction} <br/>
          <small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>
        `;
        div.style.marginBottom = '8px';
        directionsSteps.appendChild(div);
      });

    } else {
      alert('No route found.');
    }
  } catch (err) {
    alert('Failed to fetch directions: ' + err.message);
  }
});
