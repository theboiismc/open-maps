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
  minZoom: 1
});

// Layers toggle
let satelliteLayerAdded = false;
const satelliteToggle = document.getElementById('satellite-toggle');
const regularToggle = document.getElementById('regular-toggle');
const darkToggle = document.getElementById('dark-toggle');
const directionsToggleBtn = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const routeInfoDiv = document.getElementById('route-info');

// Add satellite layer
const addSatelliteLayer = () => {
  if (!satelliteLayerAdded) {
    map.addSource('satellite', {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    });
    map.addLayer({
      id: 'sat-layer',
      type: 'raster',
      source: 'satellite',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.8 }
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

// Dark mode toggle
darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  darkToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
});

// Add layers on map load
map.on('load', () => {
  addSatelliteLayer();
  switchToRegular();
});

// Layers buttons
satelliteToggle.onclick = switchToSatellite;
regularToggle.onclick = switchToRegular;

// Directions panel toggle
directionsToggleBtn.addEventListener('click', () => {
  const isVisible = directionsForm.style.display === 'flex';
  const mainSearchInput = document.getElementById('search');

  if (isVisible) {
    // Close directions panel, show search bar
    directionsForm.style.display = 'none';
    mainSearchInput.style.display = 'block';  // Show search bar
    directionsToggleBtn.setAttribute('aria-pressed', 'false');
  } else {
    // Show directions panel, hide search bar
    mainSearchInput.style.display = 'none';  // Hide search bar
    directionsForm.style.display = 'flex';
    directionsToggleBtn.setAttribute('aria-pressed', 'true');
  }
});

// Helper for Photon search with loading indicator and debounce
const photonUrl = "https://photon.komoot.io/api/?q=";
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

async function photonSearch(query) {
  if (!query) return [];
  try {
    const res = await fetch(`${photonUrl}${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) throw new Error("Photon request failed");
    const data = await res.json();
    return data.features || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

// Show loading or clear suggestions
function showLoading(container) {
  container.innerHTML = '<div class="loading">Loading…</div>';
}
function clearSuggestions(container) {
  container.innerHTML = '';
}
function renderSuggestions(container, results) {
  clearSuggestions(container);
  if (!results.length) return;
  results.forEach((feature, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = feature.properties.name + (feature.properties.state ? ', ' + feature.properties.state : '') + (feature.properties.country ? ', ' + feature.properties.country : '');
    div.tabIndex = 0;
    div.dataset.lon = feature.geometry.coordinates[0];
    div.dataset.lat = feature.geometry.coordinates[1];
    div.dataset.idx = i;
    container.appendChild(div);
  });
}

// Setup search inputs
const mainSearchInput = document.getElementById('search');
const mainSuggestions = document.getElementById('suggestions');

const originInput = document.getElementById('origin');
const originSuggestions = document.getElementById('origin-suggestions');

const destinationInput = document.getElementById('destination');
const destinationSuggestions = document.getElementById('destination-suggestions');

// Search input handler with debounce and loading indicator
function setupSearch(inputEl, suggestionsEl) {
  const debouncedSearch = debounce(async (query) => {
    if (!query) {
      clearSuggestions(suggestionsEl);
      return;
    }
    showLoading(suggestionsEl);
    const results = await photonSearch(query);
    renderSuggestions(suggestionsEl, results);
  }, 250);

  inputEl.addEventListener('input', e => {
    const q = e.target.value.trim();
    debouncedSearch(q);
  });

  // Click handler for selecting a suggestion
  suggestionsEl.addEventListener('click', e => {
    if (!e.target.classList.contains('suggestion')) return;
    const lon = parseFloat(e.target.dataset.lon);
    const lat = parseFloat(e.target.dataset.lat);
    const text = e.target.textContent;
    inputEl.value = text;
    inputEl.dataset.lon = lon;
    inputEl.dataset.lat = lat;
    clearSuggestions(suggestionsEl);

    // If main search input, fly to location immediately
    if (inputEl === mainSearchInput) {
      map.flyTo({ center: [lon, lat], zoom: 14 });
    }
  });

  // Keyboard support (enter key)
  suggestionsEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('suggestion')) {
      e.preventDefault();
      e.target.click();
      inputEl.focus();
    }
  });

  // Close suggestions on outside click
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
      clearSuggestions(suggestionsEl);
    }
  });
}

setupSearch(mainSearchInput, mainSuggestions);
setupSearch(originInput, originSuggestions);
setupSearch(destinationInput, destinationSuggestions);

// Routing
const getRouteBtn = document.getElementById('get-route');
const clearRouteBtn = document.getElementById('clear-route');

let currentRouteId = null;

// OpenRouteService API-free route (Using openrouteservice with demo key or fallback to OSRM public server, but since you want no key — let's use OSRM public demo server)
const routeServiceUrl = "https://router.project-osrm.org/route/v1/driving/";

// Draw route on map
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
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#6750a4',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });
  }
}

function clearRoute() {
  if (map.getLayer('route')) {
    map.removeLayer('route');
  }
  if (map.getSource('route')) {
    map.removeSource('route');
  }
  routeInfoDiv.textContent = '';
}

getRouteBtn.addEventListener('click', async () => {
  const originLon = originInput.dataset.lon;
  const originLat = originInput.dataset.lat;
  const destinationLon = destinationInput.dataset.lon;
  const destinationLat = destinationInput.dataset.lat;

  if (!originLon || !originLat || !destinationLon || !destinationLat) {
    alert("Please select both origin and destination from suggestions.");
    return;
  }

  clearRoute();

  const coords = `${originLon},${originLat};${destinationLon},${destinationLat}`;
  const url = `${routeServiceUrl}${coords}?overview=full&geometries=geojson&steps=true`;

  routeInfoDiv.textContent = 'Routing…';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Routing request failed");
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error("No route found");

    const route = data.routes[0];
    drawRoute({
      type: 'Feature',
      geometry: route.geometry
    });

    // Zoom to route bounds
    const coordsArr = route.geometry.coordinates;
    const bounds = coordsArr.reduce(function(bounds, coord) {
      return bounds.extend(coord);
    }, new maplibregl.LngLatBounds(coordsArr[0], coordsArr[0]));
    map.fitBounds(bounds, { padding: 80 });

    // Display summary and steps
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);
    routeInfoDiv.innerHTML = `
      Distance: ${distanceKm} km<br/>
      Duration: ${durationMin} min<br/><br/>
      <strong>Steps:</strong><br/>
      <ol style="padding-left: 18px; margin: 0; max-height: 160px; overflow-y: auto;">
        ${route.legs[0].steps.map(step => `<li>${step.maneuver.instruction}</li>`).join('')}
      </ol>
    `;

  } catch (err) {
    console.error(err);
    routeInfoDiv.textContent = 'Failed to get route. Please try again.';
  }
});

clearRouteBtn.addEventListener('click', () => {
  clearRoute();
  originInput.value = '';
  destinationInput.value = '';
  originInput.removeAttribute('data-lon');
  originInput.removeAttribute('data-lat');
  destinationInput.removeAttribute('data-lon');
  destinationInput.removeAttribute('data-lat');
});

// Optional: Follow user location with GPS (basic example)
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setCenter([longitude, latitude]);
    map.setZoom(14);

    // Optionally add user location marker
    const userMarker = new maplibregl.Marker({ color: '#ff6347' })
      .setLngLat([longitude, latitude])
      .addTo(map);

    // Follow user location continuously (simple watch)
    navigator.geolocation.watchPosition(pos => {
      const { latitude, longitude } = pos.coords;
      userMarker.setLngLat([longitude, latitude]);
      // Optionally update map center or bearing here for navigation
    }, err => {
      console.warn('Geolocation watch failed:', err);
    }, { enableHighAccuracy: true });
  });
}
