// Initialize the map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 2,
});

// Layer toggle functionality
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
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.8 },
  });
});

// Toggle layers between regular and satellite
document.getElementById('satellite-toggle').onclick = () => {
  satelliteVisible = !satelliteVisible;
  map.setLayoutProperty(
    'satellite-layer',
    'visibility',
    satelliteVisible ? 'visible' : 'none'
  );
  document.getElementById('satellite-toggle').classList.toggle('active');
  document.getElementById('regular-toggle').classList.toggle('active');
};

document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  document.getElementById('regular-toggle').classList.toggle('active');
  document.getElementById('satellite-toggle').classList.toggle('active');
};

// Location search logic
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
let currentSearchResults = [];

searchInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) {
    suggestionsBox.innerHTML = '';
    return;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`
  );
  const data = await response.json();
  currentSearchResults = data;

  suggestionsBox.innerHTML = data
    .map(
      (result) => `
      <div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">
        ${result.display_name}
      </div>`
    )
    .join('');

  document.querySelectorAll('.suggestion').forEach((el) =>
    el.addEventListener('click', (event) => {
      const lat = event.target.dataset.lat;
      const lon = event.target.dataset.lon;
      map.flyTo({ center: [lon, lat], zoom: 15 });
      suggestionsBox.innerHTML = ''; // Clear the suggestions
      document.getElementById('directions-ui').style.display = 'flex'; // Show directions UI
    })
  );
});

// Handle origin input for directions
const originInput = document.getElementById('origin');
let originCoordinates = null;

originInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) return;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`
  );
  const data = await response.json();
  const originSuggestionsBox = document.getElementById('origin-suggestions');
  originSuggestionsBox.innerHTML = data
    .map(
      (result) => `
      <div class="suggestion" data-lat="${result.lat}" data-lon="${result.lon}">
        ${result.display_name}
      </div>`
    )
    .join('');

  document.querySelectorAll('.suggestion').forEach((el) =>
    el.addEventListener('click', (event) => {
      originInput.value = event.target.innerText;
      originCoordinates = {
        lat: event.target.dataset.lat,
        lon: event.target.dataset.lon,
      };
      originSuggestionsBox.innerHTML = '';
    })
  );
});

// Get directions logic
document.getElementById('get-directions').addEventListener('click', async () => {
  if (!originCoordinates || !currentSearchResults.length) {
    alert('Please select both origin and destination.');
    return;
  }

  const destination = currentSearchResults[0]; // Use first search result as destination
  const origin = originCoordinates;

  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&steps=true`;

  try {
    const routeResponse = await fetch(routeUrl);
    const routeData = await routeResponse.json();
    if (routeData.routes && routeData.routes.length > 0) {
      const route = routeData.routes[0];
      const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

      // Add route to map
      if (!map.getSource('route')) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          },
        });

        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#0078ff',
            'line-width': 6,
          },
        });
      } else {
        map.getSource('route').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }

      // Fit the map to the route
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 50 });

      // Display directions
      const directionsSteps = document.getElementById('directions-steps');
      directionsSteps.innerHTML = '';
      route.legs[0].steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.innerHTML = `
          <strong>Step ${i + 1}:</strong> ${step.maneuver.instruction} <br/>
          <small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>
        `;
        directionsSteps.appendChild(div);
      });
    } else {
      alert('No valid route found.');
    }
  } catch (error) {
    alert('Failed to fetch directions: ' + error.message);
  }
});
