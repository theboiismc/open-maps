const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95, 39],
  zoom: 4
});

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'bottom-right');

const $ = id => document.getElementById(id);
const search = $('search');
const suggestions = $('suggestions');
const searchIcon = $('search-icon');
const directionsIcon = $('directions-icon');
const sidePanel = $('side-panel');
const closePanel = $('close-side-panel');
const placeName = $('place-name');
const placeDescription = $('place-description');
const placeWeather = $('place-weather');
const directionsBtn = $('directions-btn');
const directionsForm = $('directions-form');
const origin = $('origin');
const destination = $('destination');
const swapBtn = $('swap-locations');
const getRoute = $('get-route');

function showPanel() {
  sidePanel.classList.add('open');
}

function hidePanel() {
  sidePanel.classList.remove('open');
  directionsForm.style.display = 'none';
  $('place-info').style.display = 'block';
}

closePanel.addEventListener('click', hidePanel);

search.addEventListener('input', debounce(async () => {
  const q = search.value.trim();
  if (!q) return suggestions.innerHTML = '';
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
  const json = await res.json();
  suggestions.innerHTML = '';
  json.features.forEach(f => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = `${f.properties.name}, ${f.properties.state || ''}, ${f.properties.country || ''}`;
    div.addEventListener('click', async () => {
      search.value = div.textContent;
      suggestions.innerHTML = '';
      const [lon, lat] = f.geometry.coordinates;
      map.flyTo({ center: [lon, lat], zoom: 13 });
      await loadPlaceInfo(f.properties.name, lat, lon);
    });
    suggestions.appendChild(div);
  });
}, 300));

search.addEventListener('blur', () => setTimeout(() => suggestions.innerHTML = '', 200));

searchIcon.addEventListener('click', () => {
  search.dispatchEvent(new Event('input'));
});

directionsIcon.addEventListener('click', () => {
  showPanel();
  directionsForm.style.display = 'flex';
  $('place-info').style.display = 'none';
});

directionsBtn.addEventListener('click', () => {
  directionsForm.style.display = 'flex';
  $('place-info').style.display = 'none';
});

swapBtn.addEventListener('click', () => {
  const o = origin.value;
  origin.value = destination.value;
  destination.value = o;
});

getRoute.addEventListener('click', async () => {
  const o = origin.value;
  const d = destination.value;
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(o)};${encodeURIComponent(d)}?overview=full&geometries=geojson`);
  const json = await res.json();
  const route = json.routes[0].geometry;
  if (map.getSource('route')) map.removeLayer('route'), map.removeSource('route');
  map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#6750a4', 'line-width': 6 } });
});

async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;

  // Fetch an image for the place (Unsplash API)
  try {
    const imageRes = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(name)}&client_id=YOUR_UNSPLASH_API_KEY`);
    const imageData = await imageRes.json();
    const imageUrl = imageData[0]?.urls?.regular;
    if (imageUrl) {
      const img = document.getElementById('place-image');
      img.src = imageUrl;
    } else {
      console.log('No image found for this place.');
    }
  } catch (error) {
    console.log('Error fetching image:', error);
  }

  // Fetch weather info
  try {
    const weather = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await weather.json();
    const w = data.current_weather;
    const weatherCondition = w.weathercode === 1 ? 'Clear' : w.weathercode === 2 ? 'Cloudy' : 'Rainy';
    placeWeather.textContent = `${weatherCondition} - ${w.temperature}°F`;
  } catch {
    placeWeather.textContent = 'Weather unavailable.';
  }

  // Fetch place description (Wikipedia)
  try {
    const wiki = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    const w = await wiki.json();
    placeDescription.textContent = w.extract || 'No description available.';
  } catch {
    placeDescription.textContent = 'Description unavailable.';
  }

  showPanel();
}

function debounce(fn, delay) {
  let t; return (...args) => {
    clearTimeout(t); t = setTimeout(() => fn(...args), delay);
  };
}
