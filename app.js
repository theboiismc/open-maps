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
const sidePanel = $('side-panel');
const closeSidePanel = $('close-side-panel');
const placeName = $('place-name');
const placeDescription = $('place-description');
const placeWeather = $('place-weather');
const placeImage = $('place-image');

function openPanel() {
  sidePanel.classList.add('open');
}

function closePanel() {
  sidePanel.classList.remove('open');
}

closeSidePanel.addEventListener('click', closePanel);

search.addEventListener('input', debounce(async () => {
  const query = search.value.trim();
  if (!query) return suggestions.innerHTML = '';

  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
  const json = await res.json();
  suggestions.innerHTML = '';

  json.features.forEach(f => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = `${f.properties.name}, ${f.properties.state || ''}, ${f.properties.country || ''}`;
    div.addEventListener('click', () => {
      search.value = div.textContent;
      suggestions.innerHTML = '';
      const [lon, lat] = f.geometry.coordinates;
      loadPlaceInfo(f.properties.name, lat, lon);
      openPanel();
    });
    suggestions.appendChild(div);
  });
}, 300));

async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;

  try {
    const imageRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=url`);
    const imageData = await imageRes.json();
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.imageinfo?.[0]?.url;
    placeImage.src = imageUrl || 'default.jpg';
  } catch {
    placeImage.src = 'default.jpg';
  }

  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    const wikiData = await wikiRes.json();
    placeDescription.textContent = wikiData.extract || 'No description available.';
  } catch {
    placeDescription.textContent = 'No description available.';
  }

  placeWeather.textContent = 'Weather info would be here'; // Placeholder
}

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
