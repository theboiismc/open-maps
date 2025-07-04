const map = new maplibre-gl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 1.5,
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

let marker;
let directionsBox = document.getElementById('directions-box');
let directionsList = document.getElementById('directions-list');
let originCoordinates = null;
let destinationCoordinates = null;

const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const searchIcon = document.getElementById('search-icon');
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});

document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Search input handler
input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }
  suggestionsBox.innerHTML = '<div class="suggestion">Searching...</div>';
  suggestionsBox.style.display = 'block';
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
    );
    const data = await res.json();
    suggestionsBox.innerHTML = '';
    if (data.features.length > 0) {
      data.features.forEach((feature) => {
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

// Select place and get coordinates
function selectPlace(feature, label) {
  const [lon, lat] = feature.geometry.coordinates;
  map.flyTo({
    center: [lon, lat],
    zoom: 12,
    speed: 1,
    curve: 1,
    easing(t) {
      return t;
    },
  });
  if (marker) marker.remove();
  marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
  input.value = label;
  suggestionsBox.style.display = 'none';

  // Set destination coordinates and show route prompt
  destinationCoordinates = [lon, lat];
  if (originCoordinates) {
    getRoute();
  } else {
    directionsBox.style.display = 'block';
    directionsList.innerHTML = '<li>Use my location or type an origin to get directions</li>';
  }
}

// Handle getting directions
function getRoute() {
  if (!originCoordinates || !destinationCoordinates) return;

  const [lon1, lat1] = originCoordinates;
  const [lon2, lat2] = destinationCoordinates;

  const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&steps=true`;
  
  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const instructions = route.legs[0].steps.map(step => `<li>${step.maneuver.instruction}</li>`).join('');
        directionsList.innerHTML = instructions;
      } else {
        directionsList.innerHTML = '<li>No route found.</li>';
      }
    })
    .catch(() => {
      directionsList.innerHTML = '<li>Error fetching directions.</li>';
    });
}

// Handle origin input
const originInput = document.createElement('input');
originInput.id = 'origin-input';
originInput.placeholder = 'Type origin';
originInput.addEventListener('input', async () => {
  const query = originInput.value.trim();
  if (!query) {
    return;
  }
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
    );
    const data = await res.json();
    if (data.features.length > 0) {
      originCoordinates = data.features[0].geometry.coordinates;
      getRoute();
    }
  } catch (err) {
    console.error('Error fetching origin suggestions');
  }
});

// Add event listener to search icon
searchIcon.addEventListener('click', () => {
  const query = input.value.trim();
  if (query) {
    fetchPlace(query);
  }
});

// Fetch place details from Photon API
async function fetchPlace(query) {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`
    );
    const data = await res.json();
    if (data.features.length > 0) {
      selectPlace(data.features[0], data.features[0].properties.name);
    }
  } catch (err) {
    console.error('Error fetching place:', err);
  }
}

// Close the directions box
function closeDirections() {
  directionsBox.style.display = 'none';
}

// Layer toggle buttons
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
  map.setLayoutProperty(
    'satellite-layer',
    'visibility',
    satelliteVisible ? 'visible' : 'none'
  );
  toggleButtonStyle('satellite-toggle', satelliteVisible);
  toggleButtonStyle('regular-toggle', !satelliteVisible);
};

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  toggleButtonStyle('satellite-toggle', false);
  toggleButtonStyle('regular-toggle', true);
};

function toggleButtonStyle(buttonId, isActive) {
  const btn = document.getElementById(buttonId);
  if (isActive) btn.classList.add('active');
  else btn.classList.remove('active');
}
