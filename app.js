// == Initialization ==
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty', // no .json
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

// Controls bottom right
const navControl = new maplibregl.NavigationControl({
  showCompass: true,
  showZoom: true,
  visualizePitch: true,
});
map.addControl(navControl, 'bottom-right');

const geolocateControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showAccuracyCircle: false,
});
map.addControl(geolocateControl, 'bottom-right');

// Elements
const searchInput = document.getElementById('search');
const searchIcon = document.getElementById('search-icon');
const directionsIcon = document.getElementById('directions-icon');
const suggestionsEl = document.getElementById('suggestions');

const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebar-close');
const sidebarContent = document.getElementById('sidebar-content');

const directionsPanel = document.getElementById('directions-panel');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const swapBtn = document.getElementById('swap-btn');
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');
const routeInfo = document.getElementById('route-info');

// === Helpers ===

// Format place name for Wikipedia title URL
function formatPlaceForWiki(place) {
  if (!place) return '';
  return place
    .replace(/\s*\(.*?\)\s*/g, '')    // remove parentheticals like (city)
    .replace(/,\s*/g, '_')             // commas to underscores
    .replace(/\s+/g, '_')              // spaces to underscores
    .replace(/__+/g, '_')              // no double underscores
    .trim();
}

// Fetch Wikipedia summary + image, with disambiguation fallback
async function fetchWikiDescriptionAndImage(feature) {
  if (!feature?.properties) return { description: null, imageUrl: null };

  const name = feature.properties.name || '';
  const state = feature.properties.state || '';
  const country = feature.properties.country || '';

  let query = state ? `${name}, ${state}` : `${name}, ${country}`;
  query = formatPlaceForWiki(query);

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Wiki API failed');
    const data = await res.json();

    if (data.type === 'disambiguation') {
      // fallback just city name
      const fallbackQuery = formatPlaceForWiki(name);
      const fallbackUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fallbackQuery)}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) throw new Error('Wiki fallback failed');
      const fallbackData = await fallbackRes.json();
      if (fallbackData.type !== 'disambiguation') {
        return {
          description: fallbackData.extract || null,
          imageUrl: fallbackData.thumbnail?.source || fallbackData.originalimage?.source || null
        };
      }
      return { description: null, imageUrl: null };
    }

    return {
      description: data.extract || null,
      imageUrl: data.thumbnail?.source || data.originalimage?.source || null
    };

  } catch (e) {
    console.warn('Wiki fetch error:', e);
    return { description: null, imageUrl: null };
  }
}

// Fetch weather from Open-Meteo (free, keyless, privacy focused)
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API failed');
    const data = await res.json();
    return data.current_weather || null;
  } catch (e) {
    console.warn('Weather fetch error:', e);
    return null;
  }
}

// Photon search (limit 5)
const photonUrl = "https://photon.komoot.io/api/?limit=5&q=";
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Clear suggestions
function clearSuggestions() {
  suggestionsEl.innerHTML = '';
  suggestionsEl.style.display = 'none';
}

// Render Photon suggestions
function renderSuggestions(features) {
  clearSuggestions();
  if (!features.length) return;
  features.forEach(feature => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const { name, state, country } = feature.properties;
    div.textContent = name +
      (state ? ', ' + state : '') +
      (country ? ', ' + country : '');
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];
    div.dataset.feature = JSON.stringify(feature);
    div.addEventListener('click', async () => {
      // Put clicked text in input
      searchInput.value = div.textContent;
      clearSuggestions();

      // Fly map
      const lon = parseFloat(div.dataset.lon);
      const lat = parseFloat(div.dataset.lat);
      map.flyTo({ center: [lon, lat], zoom: 14 });

      // Open sidebar with place info + weather + directions btn
      const feature = JSON.parse(div.dataset.feature);
      await openPlaceSidebar(feature);
    });
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        div.click();
      }
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = 'block';
}

// Debounced Photon search handler
const handleSearchInput = debounce(async () => {
  const query = searchInput.value.trim();
  if (!query) {
    clearSuggestions();
    return;
  }
  try {
    const res = await fetch(photonUrl + encodeURIComponent(query));
    if (!res.ok) throw new Error('Photon search failed');
    const data = await res.json();
    renderSuggestions(data.features || []);
  } catch (e) {
    console.warn(e);
    clearSuggestions();
  }
}, 300);

// Open sidebar with place info
async function openPlaceSidebar(feature) {
  // Hide directions panel, show sidebar content area
  directionsPanel.style.display = 'none';
  sidebarContent.style.display = 'block';

  // Get description + image
  const { description, imageUrl } = await fetchWikiDescriptionAndImage(feature);

  // Get weather
  const [lon, lat] = feature.geometry.coordinates;
  const weather = await fetchWeather(lat, lon);

  // Build sidebar content HTML
  sidebarContent.innerHTML = `
    ${imageUrl ? `<img id="place-image" src="${imageUrl}" alt="Image of ${feature.properties.name}">` : ''}
    <p>${description || 'No description available.'}</p>
    ${weather ? `
      <p><strong>Weather:</strong> ${weather.temperature}°C, ${weather.weathercode === 0 ? 'Clear' : weather.weathercode}</p>
    ` : ''}
    <button id="directions-btn">Directions</button>
  `;

  // Show sidebar
  sidebar.classList.add('open');

  // Directions button listener
  document.getElementById('directions-btn').onclick = () => {
    openDirectionsSidebar(feature);
  };
}

// Open sidebar directions inputs
function openDirectionsSidebar(feature) {
  sidebarContent.style.display = 'none';
  directionsPanel.style.display = 'flex';

  // Reset inputs
  originInput.value = '';
  originInput.dataset.lon = '';
  originInput.dataset.lat = '';
  destinationInput.value = '';
  destinationInput.dataset.lon = '';
  destinationInput.dataset.lat = '';

  // Set destination to selected place coords & name
  const [lon, lat] = feature.geometry.coordinates;
  destinationInput.value = feature.properties.name + (feature.properties.state ? ', ' + feature.properties.state : '');
  destinationInput.dataset.lon = lon;
  destinationInput.dataset.lat = lat;
}

// Sidebar close button
sidebarClose.addEventListener('click', () => {
  sidebar.classList.remove('open');
  clearRoute();
});

// Search & directions icons in search bar
searchIcon.addEventListener('click', () => {
  // Do a search fly to first suggestion or do nothing
  if (searchInput.value.trim()) {
    handleSearchInput(); // refresh suggestions
  }
});

directionsIcon.addEventListener('click', () => {
  // Open sidebar directions panel, destination empty
  sidebar.classList.add('open');
  sidebarContent.style.display = 'none';
  directionsPanel.style.display = 'flex';
});

// Search input handlers
searchInput.addEventListener('input', () => {
  handleSearchInput();
});

searchInput.addEventListener('blur', () => {
  // Delay to allow click event on suggestion
  setTimeout(() => {
    clearSuggestions();
  }, 150);
});

// === ROUTING & MAP ===

// Route layer & source management
function drawRoute(routeGeoJSON) {
  if (map.getSource('route')) {
    map.getSource('route').setData(routeGeoJSON);
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: routeGeoJSON
    });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });
  }
}

// Clear route
function clearRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  routeInfo.textContent = '';
  originInput.value = '';
  destinationInput.value = '';
  delete originInput.dataset.lon;
  delete originInput.dataset.lat;
  delete destinationInput.dataset.lon;
  delete destinationInput.dataset.lat;
}

// Swap origin/destination
swapBtn.addEventListener('click', () => {
  const oVal = originInput.value;
  const oLon = originInput.dataset.lon;
  const oLat = originInput.dataset.lat;
  originInput.value = destinationInput.value;
  originInput.dataset.lon = destinationInput.dataset.lon;
  originInput.dataset.lat = destinationInput.dataset.lat;
  destinationInput.value = oVal;
  destinationInput.dataset.lon = oLon;
  destinationInput.dataset.lat = oLat;
});

// Get directions button
getRouteBtn.addEventListener('click', async () => {
  if (!originInput.value || !destinationInput.value) {
    alert('Please enter both origin and destination');
    return;
  }
  if (!originInput.dataset.lon || !destinationInput.dataset.lon) {
    alert('Please select valid places from the suggestions');
    return;
  }
  const start = [parseFloat(originInput.dataset.lon), parseFloat(originInput.dataset.lat)];
  const end = [parseFloat(destinationInput.dataset.lon), parseFloat(destinationInput.dataset.lat)];

  // Use free routing API (OpenRouteService or similar keyless routing service)
  // For now we use openrouteservice.org free demo API - but requires API key
  // Instead we use openmaptiles.org demo routing with no key, or fallback to openrouteservice with key (but user must add key)
  // Here we use openrouteservice with your current keyless API - replace the URL with your current routing API

  const routingUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(routingUrl);
    if (!res.ok) throw new Error('Routing API error');
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) throw new Error('No route found');

    const route = data.routes[0];
    const routeGeoJSON = {
      type: 'Feature',
      geometry: route.geometry
    };
    drawRoute(routeGeoJSON);
    routeInfo.textContent = `Distance: ${(route.distance / 1000).toFixed(2)} km | Duration: ${(route.duration / 60).toFixed(0)} mins`;
    // Zoom map to route bounds
    const coords = route.geometry.coordinates;
    const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 60 });

  } catch (e) {
    alert('Error getting route: ' + e.message);
  }
});

// Autocomplete for directions origin and destination inputs using Photon
async function searchPhoton(query) {
  if (!query) return [];
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Photon API fail');
    const data = await res.json();
    return data.features || [];
  } catch (e) {
    return [];
  }
}

// Show suggestions for directions inputs
function renderDirectionSuggestions(inputEl, containerId, features) {
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.className = 'suggestions-box';
    container.style.position = 'absolute';
    container.style.background = '#fff';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    container.style.maxHeight = '180px';
    container.style.overflowY = 'auto';
    container.style.zIndex = 10004;
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  if (!features.length) {
    container.style.display = 'none';
    return;
  }
  features.forEach(f => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    const { name, state, country } = f.properties;
    div.textContent = name + (state ? ', ' + state : '') + (country ? ', ' + country : '');
    div.tabIndex = 0;
    div.addEventListener('click', () => {
      inputEl.value = div.textContent;
      inputEl.dataset.lon = f.geometry.coordinates[0];
      inputEl.dataset.lat = f.geometry.coordinates[1];
      container.style.display = 'none';
    });
    container.appendChild(div);
  });

  // Position container below input
  const rect = inputEl.getBoundingClientRect();
  container.style.top = `${rect.bottom + window.scrollY}px`;
  container.style.left = `${rect.left + window.scrollX}px`;
  container.style.width = `${rect.width}px`;
  container.style.display = 'block';
}

// Directions origin input autocomplete
originInput.addEventListener('input', debounce(async () => {
  const q = originInput.value.trim();
  if (!q) return;
  const results = await searchPhoton(q);
  renderDirectionSuggestions(originInput, 'origin-suggestions', results);
}, 300));

// Directions destination input autocomplete
destinationInput.addEventListener('input', debounce(async () => {
  const q = destinationInput.value.trim();
  if (!q) return;
  const results = await searchPhoton(q);
  renderDirectionSuggestions(destinationInput, 'destination-suggestions', results);
}, 300));

// Hide directions suggestions on blur
originInput.addEventListener('blur', () => {
  setTimeout(() => {
    const el = document.getElementById('origin-suggestions');
    if (el) el.style.display = 'none';
  }, 150);
});
destinationInput.addEventListener('blur', () => {
  setTimeout(() => {
    const el = document.getElementById('destination-suggestions');
    if (el) el.style.display = 'none';
  }, 150);
});

// Also hide main suggestions if input loses focus (handled above)

// Keyboard support for suggestions handled on suggestion divs

// Fly to search result on pressing Enter in main search input
searchInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Use first suggestion if exists
    const firstSuggestion = suggestionsEl.querySelector('.suggestion');
    if (firstSuggestion) {
      firstSuggestion.click();
    }
  }
});
