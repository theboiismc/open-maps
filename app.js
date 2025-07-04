const map = new maplibregl.Map({
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
  minZoom: 1.5,
});

let currentMarker = null;
let routeLayerId = 'route';

// Your search bar and suggestion elements (already in HTML)
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const directionsUI = document.getElementById('directions-ui');
const getDirBtn = document.getElementById('get-directions');

let destination = null;

// Reuse your existing search logic (not changing it)
async function searchLocations(query) {
  if (!query) return [];
  const url = `https://searxng.theboiismc.com/search?q=${encodeURIComponent(query)}&format=json&categories=geosearch`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results.map(r => ({
      title: r.title,
      lon: r.coordinates[0],
      lat: r.coordinates[1],
    }));
  } catch (e) {
    console.error('Search error:', e);
    return [];
  }
}

// Your existing debounce function for input
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Handle search input (your original behavior)
const handleSearchInput = debounce(async () => {
  const query = searchInput.value.trim();
  if (!query) {
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    directionsUI.style.display = 'none';
    return;
  }
  const results = await searchLocations(query);
  if (!results.length) {
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    directionsUI.style.display = 'none';
    return;
  }
  suggestions.innerHTML = '';
  results.forEach(({ title, lon, lat }) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = title;
    div.onclick = () => {
      map.flyTo({ center: [lon, lat], zoom: 14 });
      if (currentMarker) currentMarker.remove();
      currentMarker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
      searchInput.value = title;
      
      // Show directions UI on selection
      destination = { lon, lat, title };
      directionsUI.style.display = 'flex';
      originInput.value = '';
      originInput.dataset.autofilled = '';
      originInput.dataset.origLon = '';
      originInput.dataset.origLat = '';
    };
    suggestions.appendChild(div);
  });
  suggestions.style.display = 'block';
}, 300);

searchInput.addEventListener('input', handleSearchInput);

document.body.addEventListener('click', e => {
  if (!e.target.closest('.search-bar')) {
    suggestions.style.display = 'none';
  }
});

// Geolocate origin on focus
originInput.addEventListener('focus', () => {
  if (!originInput.dataset.autofilled && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      originInput.value = 'My Location';
      originInput.dataset.autofilled = 'true';
      originInput.dataset.origLon = pos.coords.longitude;
      originInput.dataset.origLat = pos.coords.latitude;
    });
  }
});

// Directions route drawing function
async function drawRoute(oLon, oLat, dLon, dLat) {
  const apiKey = 'YOUR_ORS_API_KEY'; // put your ORS key here
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${oLon},${oLat}&end=${dLon},${dLat}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch route');
  const json = await res.json();
  const coords = json.features[0].geometry.coordinates;

  if (map.getLayer(routeLayerId)) {
    map.removeLayer(routeLayerId);
    map.removeSource(routeLayerId);
  }

  map.addSource(routeLayerId, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
  });

  map.addLayer({
    id: routeLayerId,
    type: 'line',
    source: routeLayerId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': 5, 'line-color': '#0078ff' },
  });

  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 50 });

  const distKm = (json.features[0].properties.summary.distance / 1000).toFixed(1);
  const durMin = Math.round(json.features[0].properties.summary.duration / 60);
  alert(`Route: ${distKm} km, ~${durMin} min`);
}

// Directions button handler
getDirBtn.addEventListener('click', async () => {
  if (!destination) {
    alert('Pick a destination first');
    return;
  }

  let oLon = parseFloat(originInput.dataset.origLon);
  let oLat = parseFloat(originInput.dataset.origLat);

  if (!oLon || !oLat || originInput.value.toLowerCase() !== 'my location') {
    if (!originInput.value.trim()) {
      alert('Enter an origin or use your location');
      return;
    }
    const res = await searchLocations(originInput.value.trim());
    if (!res.length) {
      alert('Could not find the origin location');
      return;
    }
    oLon = res[0].lon;
    oLat = res[0].lat;
  }

  try {
    await drawRoute(oLon, oLat, destination.lon, destination.lat);
  } catch (err) {
    console.error(err);
    alert('Failed to draw route');
  }
});

// Layer toggles
const regularToggle = document.getElementById('regular-toggle');
const satelliteToggle = document.getElementById('satellite-toggle');

regularToggle.onclick = () => {
  map.setStyle('https://tiles.openfreemap.org/styles/liberty.json');
  regularToggle.classList.add('active');
  satelliteToggle.classList.remove('active');
};
satelliteToggle.onclick = () => {
  map.setStyle('https://tiles.stadiamaps.com/styles/alidade_smooth.json');
  satelliteToggle.classList.add('active');
  regularToggle.classList.remove('active');
};

map.on('zoom', () => {
  if (destination) directionsUI.style.display = 'flex';
});
