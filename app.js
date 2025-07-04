// Initialize the map
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json', // Default MapLibre style
  center: [0, 0], // Default center
  zoom: 2,
});

// Setup map controls
map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.GeolocateControl());

// Search and Suggestions
const searchInput = document.getElementById('search');
const suggestionsContainer = document.getElementById('suggestions');
const locationInfo = document.getElementById('location-info');
const locationName = document.querySelector('#location-info h3');
const locationAddress = document.getElementById('location-address');
const getDirectionsBtn = document.getElementById('get-directions-btn');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestionsContainer = document.getElementById('origin-suggestions');
const getDirectionsBtn = document.getElementById('get-directions');

// Handle search input
searchInput.addEventListener('input', async () => {
  const query = searchInput.value;
  if (!query) return (suggestionsContainer.innerHTML = '');

  // Fetch search results from Photon API
  const response = await fetch(`https://photon.komoot.io/api/?q=${query}`);
  const data = await response.json();
  suggestionsContainer.innerHTML = data.features.map((feature) => 
    `<div class="suggestion" data-lat="${feature.geometry.coordinates[1]}" data-lon="${feature.geometry.coordinates[0]}">${feature.properties.name}</div>`
  ).join('');

  // Handle suggestion clicks
  document.querySelectorAll('.suggestion').forEach((suggestion) => {
    suggestion.addEventListener('click', () => {
      const lat = suggestion.dataset.lat;
      const lon = suggestion.dataset.lon;
      map.flyTo({
        center: [lon, lat],
        zoom: 14
      });

      // Update location info panel
      locationName.textContent = suggestion.textContent;
      locationAddress.textContent = `Address: ${suggestion.textContent}`;
      locationInfo.style.display = 'block';

      // Set directions UI visibility
      getDirectionsBtn.addEventListener('click', () => {
        directionsUI.style.display = 'block';
      });
    });
  });
});

// Get Directions (OSRM integration)
getDirectionsBtn.addEventListener('click', async () => {
  const origin = originInput.value;
  const destination = locationName.textContent;

  // Fetch OSRM route data
  const originCoordinates = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${origin}`).then(res => res.json());
  const destinationCoordinates = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destination}`).then(res => res.json());

  const routeData = await fetch(`https://router.project-osrm.org/route/v1/driving/${originCoordinates[0].lon},${originCoordinates[0].lat};${destinationCoordinates[0].lon},${destinationCoordinates[0].lat}?overview=false`).then(res => res.json());

  // Display route on map
  const route = routeData.routes[0];
  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: route.geometry.coordinates,
    },
  };

  if (map.getSource('route')) {
    map.getSource('route').setData(geojson);
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: geojson,
    });

    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#0078ff',
        'line-width': 5,
      },
    });
  }

  // Display directions
  const steps = route.legs[0].steps;
  const directionsSteps = document.getElementById('directions-steps');
  directionsSteps.innerHTML = steps.map(step => `<p>${step.maneuver.instruction}</p>`).join('');
});

