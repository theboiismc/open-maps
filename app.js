const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95, 39],
  zoom: 4
});

// Ensure the map is initialized correctly
map.on('load', () => {
  console.log('Map loaded');
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

// Open panel
function openPanel() {
  sidePanel.classList.add('open');
}

// Close panel
function closePanel() {
  sidePanel.classList.remove('open');
}

// Close the panel when the close button is clicked
closeSidePanel.addEventListener('click', closePanel);

// Search input logic for fetching suggestions
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
      loadPlaceInfo(f.properties.name, lat, lon); // Populate panel and show it
      openPanel();
    });
    suggestions.appendChild(div);
  });
}, 300));

// Fetch dynamic content for the panel
async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;

  // Fetch Image from Wikipedia
  try {
    const imageRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=url`);
    const imageData = await imageRes.json();
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.imageinfo?.[0]?.url;
    placeImage.src = imageUrl || 'default.jpg';
  } catch (error) {
    placeImage.src = 'default.jpg';
  }

  // Fetch Wikipedia Description
  const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
  const wikiData = await wikiRes.json();
  placeDescription.textContent = wikiData.extract || 'No description available.';

  // Optionally, fetch weather or other info here
  placeWeather.textContent = 'Weather info would be here'; // Placeholder
}

// Debounce function for search
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
