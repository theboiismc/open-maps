// Initialize the map with Liberty style
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty', // Liberty Style URL
  center: [0, 0],
  zoom: 2,
  attributionControl: false // Disable default attribution control
});

// Store the user's location
let userLocation = null;

// When the page loads, try to get the user's current location
navigator.geolocation.getCurrentPosition(position => {
  const { latitude, longitude } = position.coords;
  userLocation = { lat: latitude, lon: longitude };

  // Place a marker for the user's location
  new maplibregl.Marker()
    .setLngLat([longitude, latitude])
    .addTo(map);

  // Zoom out and center the map on user's location without zooming in fully
  map.flyTo({
    center: [longitude, latitude],
    zoom: 4, // Set zoom level to a "zoomed-out" view
    speed: 1.6,
    essential: true
  });
}, error => console.warn('Location access denied', error));

// Add event listener to the Locate Me button
const locateBtn = document.getElementById('locate-btn');
locateBtn.addEventListener('click', () => {
  if (userLocation) {
    map.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom: 14,
      speed: 1.6,
      essential: true
    });
  }
});

// Handle search bar with Photon API
const searchInput = document.getElementById('search');
const suggestionsContainer = document.getElementById('suggestions');
let timeout = null;

searchInput.addEventListener('input', function () {
  const query = searchInput.value.trim();

  if (query.length < 3) {
    suggestionsContainer.innerHTML = ''; // Clear suggestions if input is too short
    return;
  }

  // Show loading indicator
  suggestionsContainer.innerHTML = '<div>Loading...</div>';

  // Clear any previous timeout before making a new request
  clearTimeout(timeout);

  timeout = setTimeout(() => {
    // Fetch suggestions from Photon API
    fetch(`https://photon.komoot.io/api/?q=${query}`)
      .then(response => response.json())
      .then(data => {
        suggestionsContainer.innerHTML = ''; // Clear loading message

        if (data && data.features) {
          data.features.forEach(feature => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = 'suggestion-item';
            suggestionItem.innerText = feature.properties.name;

            suggestionItem.addEventListener('click', () => {
              // Fill the search bar with the selected suggestion
              searchInput.value = feature.properties.name;
              suggestionsContainer.innerHTML = ''; // Clear suggestions

              // Center map on the selected place
              map.flyTo({
                center: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
                zoom: 12,
                speed: 1.6,
                essential: true
              });
            });

            suggestionsContainer.appendChild(suggestionItem);
          });
        }
      })
      .catch(error => {
        suggestionsContainer.innerHTML = '<div>Error loading suggestions</div>';
      });
  }, 300); // Delay to avoid excessive API calls
});

// Handle origin and destination search bars
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const originSuggestionsContainer = document.getElementById('origin-suggestions');
const destinationSuggestionsContainer = document.getElementById('destination-suggestions');

// Function to handle both origin and destination search
function handleSearch(inputElement, suggestionsContainer) {
  let searchTimeout = null;

  inputElement.addEventListener('input', function () {
    const query = inputElement.value.trim();

    if (query.length < 3) {
      suggestionsContainer.innerHTML = ''; // Clear suggestions if input is too short
      return;
    }

    suggestionsContainer.innerHTML = '<div>Loading...</div>'; // Show loading indicator

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${query}`)
        .then(response => response.json())
        .then(data => {
          suggestionsContainer.innerHTML = ''; // Clear loading message

          if (data && data.features) {
            data.features.forEach(feature => {
              const suggestionItem = document.createElement('div');
              suggestionItem.className = 'suggestion-item';
              suggestionItem.innerText = feature.properties.name;

              suggestionItem.addEventListener('click', () => {
                inputElement.value = feature.properties.name;
                suggestionsContainer.innerHTML = ''; // Clear suggestions

                // Center map on the selected place
                map.flyTo({
                  center: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
                  zoom: 12,
                  speed: 1.6,
                  essential: true
                });
              });

              suggestionsContainer.appendChild(suggestionItem);
            });
          }
        })
        .catch(error => {
          suggestionsContainer.innerHTML = '<div>Error loading suggestions</div>';
        });
    }, 300); // Delay to avoid excessive API calls
  });
}

// Initialize origin and destination search functionality
handleSearch(originInput, originSuggestionsContainer);
handleSearch(destinationInput, destinationSuggestionsContainer);

// Handle the directions toggle button
const directionsToggleButton = document.getElementById('directions-toggle');
const directionsForm = document.getElementById('directions-form');
const sidebar = document.getElementById('sidebar');

directionsToggleButton.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Handle the Get Directions button
const getRouteButton = document.getElementById('get-route');
getRouteButton.addEventListener('click', () => {
  const origin = originInput.value.trim();
  const destination = destinationInput.value.trim();

  if (!origin || !destination) {
    alert('Please select both origin and destination');
    return;
  }

  // Get directions (for simplicity, we're using an API that supports directions)
  fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=YOUR_API_KEY&start=${origin}&end=${destination}`)
    .then(response => response.json())
    .then(data => {
      if (data && data.features) {
        const route = data.features[0].geometry.coordinates;

        // Draw the route on the map
        const routeLine = new maplibregl.GeoJSONSource({
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: route
            }
          }
        });

        map.addLayer({
          id: 'route',
          type: 'line',
          source: routeLine,
          paint: {
            'line-color': '#888',
            'line-width': 8
          }
        });

        // Update the route information in the UI
        const routeSummary = document.getElementById('route-summary');
        routeSummary.innerText = `Route: ${origin} → ${destination}`;
      }
    })
    .catch(error => {
      alert('Error fetching directions');
    });
});

// Handle the Clear button
const clearRouteButton = document.getElementById('clear-route');
clearRouteButton.addEventListener('click', () => {
  map.getSource('route') && map.removeLayer('route'); // Remove the route layer
  map.getSource('route') && map.removeSource('route'); // Remove the route source
  originInput.value = '';
  destinationInput.value = '';
  document.getElementById('route-summary').innerText = '';
});

