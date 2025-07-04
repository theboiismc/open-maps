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
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

// Add navigation and geolocate controls to the map
const navControl = new maplibregl.NavigationControl();
const geoControl = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});

document.getElementById('map-controls').appendChild(navControl.onAdd(map));
document.getElementById('map-controls').appendChild(geoControl.onAdd(map));

// Layer toggle functionality
let satelliteVisible = false;
map.on('load', () => {
  // Satellite layer
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

// Regular layer toggle
document.getElementById('regular-toggle').onclick = () => {
  satelliteVisible = false;
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
  document.getElementById('regular-toggle').classList.toggle('active');
  document.getElementById('satellite-toggle').classList.toggle('active');
};

// Location search box and suggestions
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const directionsUI = document.getElementById('directions-ui');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
const directionsSteps = document.getElementById('directions-steps');
const getDirectionsButton = document.getElementById('get-directions');

let currentSearchResults = [];
let originCoordinates = null; // Track the coordinates for the origin

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
      directionsUI.style.display = 'flex'; // Show directions UI when a location is selected
    })
  );
});

// Handling origin search box for directions
originInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (!query) {
    originSuggestionsBox.innerHTML = '';
    return;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`
  );
  const data = await response.json();

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

// Handle 'Get Directions' button click
getDirectionsButton.addEventListener('click', async () => {
  if (!originCoordinates || !currentSearchResults.length) {
    alert('Please select both origin and destination.');
    return;
  }

  const destination = currentSearchResults[0]; // Use the first search result as destination
  const origin = originCoordinates;
  
  // Construct the routing URL using OpenStreetMap's routing API with polyline encoding
  const routeUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&steps=true&geometries=polyline`;

  try {
    const routeResponse = await fetch(routeUrl);
    const routeData = await routeResponse.json();

    console.log('Route Response:', routeData);  // Log the full API response for debugging

    if (routeData.routes && routeData.routes.length > 0) {
      const route = routeData.routes[0];

      // Check if route has valid polyline geometry
      if (route.geometry) {
        const polylineEncoded = route.geometry;  // This is the polyline string

        // Decode the polyline to get the coordinates
        const coords = polyline.decode(polylineEncoded).map(([lat, lon]) => [lon, lat]);

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

        // Fit map bounds to the route
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 50 });

        // Display directions steps
        const steps = route.legs[0].steps;
        directionsSteps.innerHTML = '';
        steps.forEach((step, i) => {
          const div = document.createElement('div');
          div.innerHTML = `
            <strong>Step ${i + 1}:</strong> ${step.maneuver.instruction} <br/>
            <small>Distance: ${(step.distance / 1000).toFixed(2)} km, Duration: ${Math.round(step.duration)} sec</small>
          `;
          div.style.marginBottom = '8px';
          directionsSteps.appendChild(div);
        });
      } else {
        console.error('Route data does not contain valid polyline geometry');
        alert('Failed to fetch valid route data.');
      }
    } else {
      alert('Failed to fetch directions.');
    }
  } catch (error) {
    console.error('Error fetching directions:', error);
    alert('Failed to fetch directions: ' + error.message);
  }
});
