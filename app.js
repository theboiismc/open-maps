// Initialize MapLibre map
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
});

// Satellite Layer Setup
let satelliteLayerAdded = false;
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');

const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    });
    map.addLayer({
      id: 'sat-layer',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.8 },
    });
    satelliteLayerAdded = true;
  }
};

const switchToSatellite = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'visible');
  satelliteToggle.classList.add('active');
  regularToggle.classList.remove('active');
  satelliteToggle.setAttribute('aria-pressed', 'true');
  regularToggle.setAttribute('aria-pressed', 'false');
};

const switchToRegular = () => {
  map.setLayoutProperty('sat-layer', 'visibility', 'none');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
  regularToggle.setAttribute('aria-pressed', 'true');
  satelliteToggle.setAttribute('aria-pressed', 'false');
};

map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();

  // Add empty route source and line layer for routing
  map.addSource('route', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#1E90FF',
      'line-width': 5,
    },
  });
});

satelliteToggle.onclick = switchToSatellite;
regularToggle.onclick = switchToRegular;

// Search and suggestions
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const sidebar = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const placeInfo = document.getElementById('place-info');

function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, results) {
  clearSuggestions(container);
  if (results.length === 0) return;
  results.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.tabIndex = 0;
    div.dataset.lon = place.lon;
    div.dataset.lat = place.lat;
    div.dataset.idx = i;
    container.appendChild(div);
  });
}

// Use OpenFreeMap Nominatim API (keyless, CORS allowed)
async function nominatimSearch(query) {
  if (!query) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&limit=5&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) throw new Error('Network response not ok');
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

searchInput.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) {
    clearSuggestions(suggestionsBox);
    return;
  }
  const results = await nominatimSearch(q);
  renderSuggestions(suggestionsBox, results);
});

// When user clicks on suggestion
suggestionsBox.addEventListener('click', (e) => {
  if (!e.target.classList.contains('suggestion')) return;
  selectPlace(e.target);
});

// Keyboard accessibility for suggestions
suggestionsBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
    selectPlace(e.target);
  }
});

function selectPlace(target) {
  const lon = parseFloat(target.dataset.lon);
  const lat = parseFloat(target.dataset.lat);
  const name = target.textContent;
  searchInput.value = name;
  clearSuggestions(suggestionsBox);

  // Fly to location
  map.flyTo({ center: [lon, lat], zoom: 14, speed: 1.6 });

  // Show sidebar with info
  placeInfo.textContent = name;
  sidebar.classList.add('open');
  sidebar.hidden = false;

  // Save selected place coords for directions default destination
  destinationInput.value = name;
  destinationInput.dataset.lon = lon;
  destinationInput.dataset.lat = lat;

  // Clear origin inputs for new directions
  originInput.value = '';
  delete originInput.dataset.lon;
  delete originInput.dataset.lat;

  // Clear route if any
  clearRoute();

  // Focus directions toggle button
  directionsToggle.setAttribute('aria-pressed', 'false');
  directionsForm.classList.remove('visible');
}

// Sidebar close
sidebarCloseBtn.onclick = () => {
  sidebar.classList.remove('open');
  sidebar.hidden = true;
  clearRoute();
};

// Directions form controls
const directionsToggle = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeSummary = document.getElementById('route-summary');

// Toggle directions form visibility
directionsToggle.onclick = () => {
  const isVisible = directionsForm.classList.toggle('visible');
  directionsToggle.setAttribute('aria-pressed', isVisible ? 'true' : 'false');

  // Pre-fill origin if empty with current map center
  if (isVisible && !originInput.value) {
    originInput.value = 'Current Location';
    originInput.dataset.lon = map.getCenter().lng.toFixed(6);
    originInput.dataset.lat = map.getCenter().lat.toFixed(6);
  }
};

// Simple geocode for origin/destination inputs on blur
async function geocodeInput(input) {
  const val = input.value.trim();
  if (!val) {
    delete input.dataset.lon;
    delete input.dataset.lat;
    return;
  }
  if (val.toLowerCase() === 'current location') {
    // Use map center as origin if user types "Current Location"
    const c = map.getCenter();
    input.dataset.lon = c.lng.toFixed(6);
    input.dataset.lat = c.lat.toFixed(6);
    return;
  }
  // Query Nominatim for input
  const results = await nominatimSearch(val);
  if (results.length > 0) {
    input.dataset.lon = results[0].lon;
    input.dataset.lat = results[0].lat;
  } else {
    alert(`Address "${val}" not found`);
    delete input.dataset.lon;
    delete input.dataset.lat;
  }
}

originInput.addEventListener('change', () => geocodeInput(originInput));
destinationInput.addEventListener('change', () => geocodeInput(destinationInput));

// Clear route function
function clearRoute() {
  map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  routeSummary.textContent = '';
  originInput.value = '';
  destinationInput.value = '';
  delete originInput.dataset.lon;
  delete originInput.dataset.lat;
  delete destinationInput.dataset.lon;
  delete destinationInput.dataset.lat;
}

// Fetch and draw route from OSRM public server
async function fetchRoute(osrmUrl) {
  try {
    const res = await fetch(osrmUrl);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      alert('Route not found');
      return;
    }
    // OSRM polyline decoding using 'polyline' npm package logic (or decode yourself)
    // We'll use 'polyline' decode from maplibre-gl since it has it built-in.
    const routeGeojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: decodePolyline(data.routes[0].geometry),
          properties: {},
        },
      ],
    };

    map.getSource('route').setData(routeGeojson);

    // Fit bounds to route
    const coords = routeGeojson.features[0].geometry.coordinates;
    const bounds = coords.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 40 });

    // Show summary
    const distKm = (data.routes[0].distance / 1000).toFixed(1);
    const durationMin = Math.round(data.routes[0].duration / 60);
    routeSummary.textContent = `Distance: ${distKm} km • Duration: ${durationMin} min`;
  } catch (err) {
    alert('Failed to fetch route');
    console.error(err);
  }
}

// Polyline decoder for OSRM polyline (encoded with precision=5)
function decodePolyline(str, precision = 5) {
  let index = 0,
    lat = 0,
    lng = 0,
    coordinates = [],
    shift = 0,
    result = 0,
    byte = null,
    latitude_change,
    longitude_change,
    factor = Math.pow(10, precision);

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude_change = (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude_change = (result & 1) ? ~(result >> 1) : result >> 1;

    lat += latitude_change;
    lng += longitude_change;

    coordinates.push([lng / factor, lat / factor]);
  }
  return {
    type: 'LineString',
    coordinates,
  };
}

// On get route button click
getRouteBtn.onclick = async () => {
  await geocodeInput(originInput);
  await geocodeInput(destinationInput);

  const oLon = originInput.dataset.lon;
  const oLat = originInput.dataset.lat;
  const dLon = destinationInput.dataset.lon;
  const dLat = destinationInput.dataset.lat;

  if (!oLon || !oLat || !dLon || !dLat) {
    alert('Please enter valid origin and destination.');
    return;
  }

  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=polyline`;
  fetchRoute(url);
};

// On clear route button click
clearRouteBtn.onclick = () => {
  clearRoute();
};
