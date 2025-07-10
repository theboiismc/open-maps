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
const directionsPanel = $('directions-panel');
const closeDirectionsPanel = $('close-directions-panel');
const placeName = $('place-name');
const placeDescription = $('place-description');
const placeWeather = $('place-weather');
const directionsBtn = $('directions-btn');
const directionsForm = $('directions-form');
const origin = $('origin');
const destination = $('destination');
const swapBtn = $('swap-locations');
const getRoute = $('get-route');
const startNavigation = $('start-navigation');

function showPanel() {
  sidePanel.classList.add('open');
}

function hidePanel() {
  sidePanel.classList.remove('open');
  directionsForm.style.display = 'none';
  $('place-info').style.display = 'block';
}

closePanel.addEventListener('click', hidePanel);

closeDirectionsPanel.addEventListener('click', () => {
  directionsPanel.classList.remove('open');
});

directionsIcon.addEventListener('click', () => {
  directionsPanel.classList.add('open');
  sidePanel.classList.remove('open');
  directionsForm.style.display = 'flex';
  $('place-info').style.display = 'none';
});

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
      sidePanel.classList.add('open');
      directionsPanel.classList.remove('open');
      moveSearchBarToInfoPanel();
    });
    suggestions.appendChild(div);
  });
}, 300));

search.addEventListener('blur', () => setTimeout(() => suggestions.innerHTML = '', 200));

searchIcon.addEventListener('click', () => {
  search.dispatchEvent(new Event('input'));
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

  const resO = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(o)}&limit=1`);
  const resD = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(d)}&limit=1`);
  const jsonO = await resO.json();
  const jsonD = await resD.json();

  const originCoords = jsonO.features[0].geometry.coordinates;
  const destinationCoords = jsonD.features[0].geometry.coordinates;

  const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(originCoords.join(','))};${encodeURIComponent(destinationCoords.join(','))}?overview=full&geometries=geojson`);
  const routeJson = await routeRes.json();
  const route = routeJson.routes[0].geometry;

  if (map.getSource('route')) map.removeLayer('route'), map.removeSource('route');
  map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#6750a4', 'line-width': 6 } });
});

startNavigation.addEventListener('click', () => {
  alert('Navigation started!');
});

async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;

  // Fetch Image
  try {
    const imageRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=url`);
    const imageData = await imageRes.json();
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.imageinfo?.[0]?.url;

    if (imageUrl) {
      const img = document.getElementById('place-image');
      img.src = imageUrl;
    } else {
      document.getElementById('place-image').src = 'default.jpg';
    }
  } catch (error) {
    document.getElementById('place-image').src = 'default.jpg';
  }

  // Fetch Weather info
  try {
    const weather = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await weather.json();
    const w = data.current_weather;
    const weatherCondition = w.weathercode === 1 ? 'Clear' : w.weathercode === 2 ? 'Cloudy' : 'Rainy';
    placeWeather.textContent = `${weatherCondition} - ${w.temperature}°F`;
  } catch {
    placeWeather.textContent = 'Weather unavailable.';
  }

  // Fetch Quick Facts (Wikipedia)
  try {
    const wiki = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    const w = await wiki.json();
    placeDescription.textContent = w.extract || 'No description available.';
  } catch {
    placeDescription.textContent = 'Description unavailable.';
  }

  // Adjust layout for place name and weather
  const weatherText = `${name}          ${placeWeather.textContent}`;
  placeName.textContent = weatherText;

  showPanel();
}

function debounce(fn, delay) {
  let t; return (...args) => {
    clearTimeout(t); t = setTimeout(() => fn(...args), delay);
  };
}

function moveSearchBarToInfoPanel() {
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-bar';
  searchContainer.innerHTML = `
    <input id="search" placeholder="Search a place..." autocomplete="off" />
    <button id="search-icon">🔍</button>
    <button id="directions-icon">➡️</button>
  `;
  const sidePanelContent = document.getElementById('side-panel');
  sidePanelContent.insertBefore(searchContainer, sidePanelContent.firstChild);
  search.style.display = 'none';
}
