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

const directionsUI = document.getElementById('directions-ui');
const directionsButton = document.getElementById('directions-btn');
const cancelDirectionsButton = document.getElementById('cancel-directions');
const getDirectionsButton = document.getElementById('get-directions');
const directionsSteps = document.getElementById('directions-steps');
const searchInput = document.getElementById('search');
const suggestionsBox = document.getElementById('suggestions');
const originInput = document.getElementById('origin');
const originSuggestionsBox = document.getElementById('origin-suggestions');
let currentSearchResults = [];
let originCoordinates = null;

// Directions UI toggle
directionsUI.style.display = 'none';

// Show directions UI when user clicks on "Get Directions"
directionsButton.addEventListener('click', () => {
  directionsUI.style.display = 'flex';  // Show the directions UI
  directionsButton.style.display = 'none'; // Hide the "Get Directions" button
});

// Cancel directions UI
cancelDirectionsButton.addEventListener('click', () => {
  directionsUI.style.display = 'none'; // Hide the directions UI
  directionsButton.style.display = 'block'; // Show the "Get Directions" button again
});

// Handle 'Get Directions' button click
getDirectionsButton.addEventListener('click', async () => {
  if (!originCoordinates || !currentSearchResults.length) {
    alert('Please select both origin and destination.');
    return;
  }

  const destination = currentSearchResults[0]; // Use the first search result as destination
  const origin = originCoordinates;

  // Construct the OpenStreetMap route URL with no geometry (overview=false)
  const routeUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false&steps=true`;

  try {
    const routeResponse = await fetch(routeUrl);
    const routeData = await routeResponse.json();

    if (routeData.routes && routeData.routes.length > 0) {
      const route = routeData.routes[0];

      // Add markers for the origin and destination on the map
      new maplibregl.Marker()
        .setLngLat([origin.lon, origin.lat])
        .setPopup(new maplibregl.Popup().setHTML('Origin'))
        .addTo(map);

      new maplibregl.Marker()
        .setLngLat([destination.lon, destination.lat])
        .setPopup(new maplibregl.Popup().setHTML('Destination'))
        .addTo(map);

      // Display directions steps
      const steps = route.legs[0].steps;
      directionsSteps.innerHTML = '';

      steps.forEach((step, i) => {
        const instruction = step.maneuver && step.maneuver.instruction ? step.maneuver.instruction : 'Instruction unavailable';
        const distance = step.distance ? (step.distance / 1000).toFixed(2) : 'N/A';
        const duration = step.duration ? Math.round(step.duration) : 'N/A';

        const div = document.createElement('div');
        div.innerHTML = `
          <strong>Step ${i + 1}:</strong> ${instruction} <br/>
          <small>Distance: ${distance} km, Duration: ${duration} sec</small>
        `;
        div.style.marginBottom = '8px';
        directionsSteps.appendChild(div);
      });
    } else {
      alert('Failed to fetch directions.');
    }
  } catch (error) {
    alert('Failed to fetch directions: ' + error.message);
  }
});

// Location search box and suggestions
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
      directionsButton.style.display = 'none'; // Hide the Get Directions button
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
