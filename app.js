const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2
});

map.addControl(new maplibregl.NavigationControl(), 'top-left');

let destinationCoord = null;
let originCoord = null;
let destinationResults = [];
let originResults = [];
let activeMarkers = [];

const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const destinationInput = document.getElementById('destination');
const originInput = document.getElementById('origin');
const getRouteBtn = document.getElementById('get-route');

// Sidebar toggle
toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Nominatim search
async function searchNominatim(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
  return res.json();
}

// Show suggestions
searchInput.addEventListener('input', async () => {
  const q = searchInput.value.trim();
  suggestionsBox.innerHTML = '';
  if (!q) return;
  destinationResults = await searchNominatim(q);
  destinationResults.forEach((place, i) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = place.display_name;
    div.dataset.idx = i;
    suggestionsBox.appendChild(div);
  });
});

// Select suggestion
suggestionsBox.addEventListener('click', e => {
  const idx = e.target.dataset.idx;
  if (idx == null) return;
  const place = destinationResults[idx];

  const lon = +place.lon;
  const lat = +place.lat;

  destinationCoord = { lon, lat };
  destinationInput.value = place.display_name;
  searchInput.value = place.display_name;

  suggestionsBox.innerHTML = '';
  sidebar.classList.add('open');
  map.flyTo({ center: [lon, lat], zoom: 14 });
});

// Origin autocomplete
originInput.addEventListener('input', async () => {
  const q = originInput.value.trim();
  if (!q) return;
  originResults = await searchNominatim(q);
  if (originResults.length) {
    const o = originResults[0];
    originCoord = { lon: +o.lon, lat: +o.lat };
  }
});

// Routing
getRouteBtn.addEventListener('click', async () => {
  if (!originCoord || !destinationCoord) {
    alert('Set both origin and destination!');
    return;
  }

  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originCoord.lon},${originCoord.lat};${destinationCoord.lon},${destinationCoord.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes || !json.routes.length) throw new Error('No route');

    const route = json.routes[0];

    // Remove existing
    if (map.getLayer('route-line')) {
      map.removeLayer('route-line');
      map.removeSource('route-line');
    }
    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: route.geometry
      }
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-line',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });

    const m1 = new maplibregl.Marker().setLngLat([originCoord.lon, originCoord.lat]).addTo(map);
    const m2 = new maplibregl.Marker().setLngLat([destinationCoord.lon, destinationCoord.lat]).addTo(map);
    activeMarkers.push(m1, m2);

    const coords = route.geometry.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    map.flyTo({ center: mid, zoom: 13 });

  } catch (err) {
    alert('Routing error: ' + err.message);
  }
});
