// Initialize MapLibre map with OSM Liberty style
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty/style.json',
  center: [-95.7129, 37.0902], // USA center as default
  zoom: 4,
  pitch: 0,
  bearing: 0,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
});

// Controls on bottom-left
const navControl = new maplibregl.NavigationControl({ showCompass: true, showZoom: true });
const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showAccuracyCircle: false,
});
map.addControl(navControl, 'bottom-left');
map.addControl(geolocateControl, 'bottom-left');

// DOM elements
const searchInput = document.getElementById('search');
const suggestionsDiv = document.getElementById('suggestions');
const searchIcon = document.getElementById('search-icon');
const directionsIcon = document.getElementById('directions-icon');

const sidePanel = document.getElementById('side-panel');
const closeSidePanelBtn = document.getElementById('close-side-panel');

const placeInfoDiv = document.getElementById('place-info');
const placeName = document.getElementById('place-name');
const placeDescription = document.getElementById('place-description');
const placeWeather = document.getElementById('place-weather');
const directionsBtn = document.getElementById('directions-btn');

const directionsFormDiv = document.getElementById('directions-form');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const swapLocationsBtn = document.getElementById('swap-locations');
const getRouteBtn = document.getElementById('get-route');

let currentPlace = null; // Store last selected place for directions

// Debounce helper
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Clear suggestions
function clearSuggestions() {
  suggestionsDiv.innerHTML = '';
  suggestionsDiv.style.display = 'none';
}

// Photon search API call
async function photonSearch(query) {
  if (!query) return [];
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Photon search failed');
    const data = await res.json();
    return data.features || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Wikipedia description fetch
async function fetchPlaceDescription(name) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.extract || null;
  } catch {
    return null;
  }
}

// OpenWeatherMap current weather (you need your own API key here)
async function fetchWeather(lat, lon) {
  try {
    const apiKey = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace with your OpenWeatherMap API key
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const desc = data.weather?.[0]?.description || '';
    const temp = data.main?.temp || '';
    return `Weather: ${desc}, Temp: ${temp}°C`;
  } catch {
    return null;
  }
}

// Render suggestions dropdown
function renderSuggestions(features) {
  clearSuggestions();
  if (!features.length) return;
  for (const feature of features) {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const name = feature.properties.name || '';
    const state = feature.properties.state || '';
    const country = feature.properties.country || '';
    div.textContent = `${name}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];

    div.addEventListener('click', async () => {
      searchInput.value = div.textContent;
      searchInput.dataset.lon = div.dataset.lon;
      searchInput.dataset.lat = div.dataset.lat;

      clearSuggestions();
      await openPlaceInfo(feature);
      flyToLocation(parseFloat(div.dataset.lon), parseFloat(div.dataset.lat));
    });

    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        div.click();
      }
    });

    suggestionsDiv.appendChild(div);
  }
  suggestionsDiv.style.display = 'block';
}

// Fly map to coords
function flyToLocation(lon, lat) {
  map.flyTo({ center: [lon, lat], zoom: 14 });
}

// Show side panel with place info
async function openPlaceInfo(feature) {
  currentPlace = feature;

  placeInfoDiv.style.display = 'block';
  directionsFormDiv.style.display = 'none';
  sidePanel.classList.add('open');

  const name = feature.properties.name || 'Unknown Place';
  placeName.textContent = name;

  const desc = await fetchPlaceDescription(name);
  placeDescription.textContent = desc || 'No description available.';

  const [lon, lat] = feature.geometry.coordinates;
  const weather = await fetchWeather(lat, lon);
  placeWeather.textContent = weather || 'Weather data unavailable.';
}

// Show directions form inside side panel
function openDirectionsForm() {
  placeInfoDiv.style.display = 'none';
  directionsFormDiv.style.display = 'block';

  if (currentPlace) {
    destinationInput.value = currentPlace.properties.name || '';
    destinationInput.dataset.lon = currentPlace.geometry.coordinates[0];
    destinationInput.dataset.lat = currentPlace.geometry.coordinates[1];
  }
}

// Close side panel completely
closeSidePanelBtn.addEventListener('click', () => {
  sidePanel.classList.remove('open');
});

// Clicking search icon flys to place if selected
searchIcon.addEventListener('click', () => {
  const lon = parseFloat(searchInput.dataset.lon);
  const lat = parseFloat(searchInput.dataset.lat);
  if (!lon || !lat) return alert('Please select a valid place from suggestions first.');
  flyToLocation(lon, lat);
  if (currentPlace) openPlaceInfo(currentPlace);
});

// Clicking directions icon opens directions form side panel
directionsIcon.addEventListener('click', () => {
  if (!currentPlace) return alert('Select a place first from the search bar.');
  sidePanel.classList.add('open');
  openDirectionsForm();
});

// Directions button inside place info panel switches to directions form
directionsBtn.addEventListener('click', () => {
  openDirectionsForm();
});

// Swap origin and destination inputs
swapLocationsBtn.addEventListener('click', () => {
  const oVal = originInput.value;
  const dVal = destinationInput.value;

  const oLon = originInput.dataset.lon;
  const oLat = originInput.dataset.lat;
  const dLon = destinationInput.dataset.lon;
  const dLat = destinationInput.dataset.lat;

  originInput.value = dVal;
  originInput.dataset.lon = dLon;
  originInput.dataset.lat = dLat;

  destinationInput.value = oVal;
  destinationInput.dataset.lon = oLon;
  destinationInput.dataset.lat = oLat;
});

// Get route from OSRM and draw on map
async function fetchRoute(originLon, originLat, destLon, destLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing failed');
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes.length) {
      alert('No route found.');
      return null;
    }
    return json.routes[0];
  } catch (e) {
    console.error(e);
    alert('Failed to get route.');
    return null;
  }
}

// Draw route on map
function drawRoute(routeGeoJSON) {
  if (map.getSource('route')) {
    map.getSource('route').setData(routeGeoJSON);
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: routeGeoJSON,
    });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.8,
      },
    });
  }
}

// Clear route from map
function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
}

// Handle get route button click
getRouteBtn.addEventListener('click', async () => {
  const originLon = parseFloat(originInput.dataset.lon);
  const originLat = parseFloat(originInput.dataset.lat);
  const destLon = parseFloat(destinationInput.dataset.lon);
  const destLat = parseFloat(destinationInput.dataset.lat);

  if (isNaN(originLon) || isNaN(originLat) || isNaN(destLon) || isNaN(destLat)) {
    alert('Please select valid origin and destination from suggestions.');
    return;
  }

  const route = await fetchRoute(originLon, originLat, destLon, destLat);
  if (!route) return;

  const routeGeoJSON = {
    type: 'Feature',
    geometry: route.geometry,
  };
  drawRoute(routeGeoJSON);

  flyToLocation(originLon, originLat);
});

// Setup search input event with debounce
searchInput.addEventListener('input', debounce(async () => {
  const query = searchInput.value.trim();
  if (!query) {
    clearSuggestions();
    return;
  }
  const results = await photonSearch(query);
  renderSuggestions(results);
}, 300));

// Close suggestions dropdown on blur, but allow clicks
searchInput.addEventListener('blur', () => {
  setTimeout(clearSuggestions, 200);
});

// Setup origin input search autocomplete same as main search
originInput.addEventListener('input', debounce(async () => {
  const query = originInput.value.trim();
  if (!query) {
    clearOriginSuggestions();
    return;
  }
  const results = await photonSearch(query);
  renderOriginSuggestions(results);
}, 300));

originInput.addEventListener('blur', () => {
  setTimeout(clearOriginSuggestions, 200);
});

const originSuggestionsDiv = document.createElement('div');
originSuggestionsDiv.id = 'origin-suggestions';
originSuggestionsDiv.style.cssText = `
  position: absolute;
  top: 72px;
  left: 16px;
  right: 16px;
  background: #fff;
  max-height: 160px;
  overflow-y: auto;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10020;
  display: none;
`;
directionsFormDiv.appendChild(originSuggestionsDiv);

function clearOriginSuggestions() {
  originSuggestionsDiv.innerHTML = '';
  originSuggestionsDiv.style.display = 'none';
}

function renderOriginSuggestions(features) {
  clearOriginSuggestions();
  if (!features.length) return;
  for (const feature of features) {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const name = feature.properties.name || '';
    const state = feature.properties.state || '';
    const country = feature.properties.country || '';
    div.textContent = `${name}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];

    div.addEventListener('click', () => {
      originInput.value = div.textContent;
      originInput.dataset.lon = div.dataset.lon;
      originInput.dataset.lat = div.dataset.lat;
      clearOriginSuggestions();
    });

    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        div.click();
      }
    });

    originSuggestionsDiv.appendChild(div);
  }
  originSuggestionsDiv.style.display = 'block';
}

// Setup destination input search autocomplete same as origin
destinationInput.addEventListener('input', debounce(async () => {
  const query = destinationInput.value.trim();
  if (!query) {
    clearDestinationSuggestions();
    return;
  }
  const results = await photonSearch(query);
  renderDestinationSuggestions(results);
}, 300));

destinationInput.addEventListener('blur', () => {
  setTimeout(clearDestinationSuggestions, 200);
});

const destinationSuggestionsDiv = document.createElement('div');
destinationSuggestionsDiv.id = 'destination-suggestions';
destinationSuggestionsDiv.style.cssText = `
  position: absolute;
  top: 136px;
  left: 16px;
  right: 16px;
  background: #fff;
  max-height: 160px;
  overflow-y: auto;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10020;
  display: none;
`;
directionsFormDiv.appendChild(destinationSuggestionsDiv);

function clearDestinationSuggestions() {
  destinationSuggestionsDiv.innerHTML = '';
  destinationSuggestionsDiv.style.display = 'none';
}

function renderDestinationSuggestions(features) {
  clearDestinationSuggestions();
  if (!features.length) return;
  for (const feature of features) {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const name = feature.properties.name || '';
    const state = feature.properties.state || '';
    const country = feature.properties.country || '';
    div.textContent = `${name}${state ? ', ' + state : ''}${country ? ', ' + country : ''}`;
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];

    div.addEventListener('click', () => {
      destinationInput.value = div.textContent;
      destinationInput.dataset.lon = div.dataset.lon;
      destinationInput.dataset.lat = div.dataset.lat;
      clearDestinationSuggestions();
    });

    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        div.click();
      }
    });

    destinationSuggestionsDiv.appendChild(div);
  }
  destinationSuggestionsDiv.style.display = 'block';
}
