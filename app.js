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
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

// Add navigation and geolocate controls bottom right
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }),
  'bottom-right'
);

let marker;

const input = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');

input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }
  suggestionsBox.innerHTML = '<div class="suggestion">Searching...</div>';
  suggestionsBox.style.display = 'block';
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
    );
    const data = await res.json();
    suggestionsBox.innerHTML = '';
    if (data.features.length > 0) {
      data.features.forEach((feature) => {
        const props = feature.properties;
        const name = props.name;
        const city = props.city || '';
        const state = props.state || '';
        const country = props.country || '';
        const label = `${name}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${
          country ? ', ' + country : ''
        }`;
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = label;
        div.onclick = () => selectPlace(feature, label);
        suggestionsBox.appendChild(div);
      });
    } else {
      suggestionsBox.innerHTML = '<div class="suggestion">No results found</div>';
    }
  } catch (err) {
    suggestionsBox.innerHTML = '<div class="suggestion">Error fetching suggestions</div>';
  }
});

function selectPlace(feature, label) {
  const [lon, lat] = feature.geometry.coordinates;
  map.flyTo({
    center: [lon, lat],
    zoom: 12,
    speed: 1,
    curve: 1,
    easing(t) {
      return t;
    },
  });
  if (marker) marker.remove();
  marker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
  input.value = label;
  suggestionsBox.style.display = 'none';
}

let satelliteVisible = false;

map.on('load', () => {
  map.addSource('satellite', {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  });
  map.addLayer({
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    paint: { 'raster-opacity': 1 },
  });
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
});

const regularToggleBtn = document.getElementById('regular-toggle');
const satelliteToggleBtn = document.getElementById('satellite-toggle');

regularToggleBtn.onclick = () => {
  if (satelliteVisible) {
    map.setLayoutProperty('satellite-layer', 'visibility', 'none');
    satelliteVisible = false;
    regularToggleBtn.classList.add('active');
    satelliteToggleBtn.classList.remove('active');
  }
};

satelliteToggleBtn.onclick = () => {
  if (!satelliteVisible) {
    map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
    satelliteVisible = true;
    satelliteToggleBtn.classList.add('active');
    regularToggleBtn.classList.remove('active');
  }
};
