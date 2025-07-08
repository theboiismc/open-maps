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

// Controls
const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});
document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Layer toggle
let satelliteVisible = false;
let darkVisible = false;

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

  map.addSource('dark', {
    type: 'raster',
    tiles: [
      'https://tiles.stadiamaps.com/tiles/alidade_dark/{z}/{x}/{y}{r}.png',
    ],
    tileSize: 256,
  });

  map.addLayer({
    id: 'dark-layer',
    type: 'raster',
    source: 'dark',
    layout: { visibility: 'none' },
  });
});

// Toggle buttons
document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  map.setLayoutProperty('satellite-layer', 'visibility', satelliteVisible ? 'visible' : 'none');
  if (satelliteVisible) {
    darkVisible = false;
    map.setLayoutProperty('dark-layer', 'visibility', 'none');
  }
  toggleActiveButton();
};

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  darkVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  map.setLayoutProperty('dark-layer', 'visibility', 'none');
  toggleActiveButton();
};

document.getElementById('dark-toggle').onclick = () => {
  darkVisible = !darkVisible;
  map.setLayoutProperty('dark-layer', 'visibility', darkVisible ? 'visible' : 'none');
  if (darkVisible) {
    satelliteVisible = false;
    map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  }
  toggleActiveButton();
};

function toggleActiveButton() {
  document.getElementById('regular-toggle').classList.toggle('active', !satelliteVisible && !darkVisible);
  document.getElementById('satellite-toggle').classList.toggle('active', satelliteVisible);
  document.getElementById('dark-toggle').classList.toggle('active', darkVisible);
}

// Search & Directions
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const directionsSteps = document.getElementById('directions-steps');
const getDirectionsButton = document.getElementById('get-directions');
const clearDirectionsButton = document.getElementById('clear-directions');

let originCoordinates = null;
let destinationCoordinates = null;
const routeLayerId = 'route-line';
let originMarker = null;
let destinationMarker = null;

// Helper: Clear route and UI
function clearRoute() {
  if (map.getLayer(routeLayerId)) {
    map.removeLayer(routeLayerId);
  }
  if (map.getSource(routeLayerId)) {
    map.removeSource(routeLayerId);
  }
  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
  directionsSteps.innerHTML = '';
  originCoordinates = null;
  destinationCoordinates = null;
  directionsUI.style.display = 'none';
  originInput.value = '';
  searchInput.value = '';
  suggestionsBox.innerHTML = '';
  originSuggestionsBox.innerHTML = '';
}

// Search box for destination
searchInput.addEventListener('input', async e => {
  const query = e.target.value.trim();
  if (!query) {
    suggestionsBox.innerHTML = '';
    destinationCoordinates = null;
    return;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    suggestionsBox.innerHTML = data.map(result => 
      `<div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">${result.display_name}</div>`
    ).join('');
    
    document.querySelectorAll('#suggestions .suggestion').forEach(el =>
      el.addEventListener('click', event => {
        const lat = parseFloat(event.target.dataset.lat);
        const lon = parseFloat(event.target.dataset.lon);
        destinationCoordinates = { lat, lon };
        searchInput.value = event.target.textContent;
        suggestionsBox.innerHTML = '';
        map.flyTo({ center: [lon, lat], zoom: 15 });
        directionsUI.style.display = 'flex';
      })
    );
  } catch {
    suggestionsBox.innerHTML = '';
  }
});

// Search box for origin
originInput.addEventListener('input', async e => {
  const query = e.target.value.trim();
  if (!query) {
    originSuggestionsBox.innerHTML = '';
    originCoordinates = null;
    return;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    originSuggestionsBox.innerHTML = data.map(result => 
      `<div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">${result.display_name}</div>`
    ).join('');
    document.querySelectorAll('#origin-suggestions .suggestion').forEach(el =>
      el.addEventListener('click', event => {
        const lat = parseFloat(event.target.dataset.lat);
        const lon = parseFloat(event.target.dataset.lon);
        originCoordinates = { lat, lon };
        originInput.value = event.target.textContent;
        originSuggestionsBox.innerHTML = '';
      })
    );
  } catch {
    originSuggestionsBox.innerHTML = '';
  }
});

// Get Directions
getDirectionsButton.addEventListener('click', async () => {
  if (!originCoordinates || !destinationCoordinates) {
    alert('Please select both origin and destination.');
    return;
  }
  try {
    const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoordinates.lon},${originCoordinates.lat};${destinationCoordinates.lon},${destinationCoordinates.lat}?overview=full&steps=true&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      alert('No route found.');
      return;
    }
    clearRoute();

    const route = data.routes[0];

    // Add origin and destination markers
    originMarker = new maplibregl.Marker({ color: 'green' })
      .setLngLat([originCoordinates.lon, originCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Origin'))
      .addTo(map);
    destinationMarker = new maplibregl.Marker({ color: 'red' })
      .setLngLat([destinationCoordinates.lon, destinationCoordinates.lat])
      .setPopup(new maplibregl.Popup().setText('Destination'))
      .addTo(map);

    // Add route line
    map.addSource(routeLayerId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: route.geometry
      }
    });

    map.addLayer({
      id: routeLayerId,
      type: 'line',
      source: routeLayerId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0078ff',
        'line-width': 5,
        'line-opacity': 0.8
      }
    });

    // Fit map to route bounds with padding
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach(coord => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 50 });

    // Show step-by-step instructions
    directionsSteps.innerHTML = '';
    route.legs[0].steps.forEach((step, i) => {
      const stepDiv = document.createElement('div');
      stepDiv.innerHTML = `<strong>Step ${i + 1}:</strong> ${step.maneuver.instruction} <br><small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>`;
      stepDiv.style.marginBottom = '8px';
      directionsSteps.appendChild(stepDiv);
    });
  } catch (e) {
    alert('Failed to fetch directions: ' + e.message);
  }
});

// Clear directions button
clearDirectionsButton.addEventListener('click', () => {
  clearRoute();
});
