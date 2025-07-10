// Initialize MapLibre
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
});

// Elements
const searchInput = document.getElementById('search');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const originLocationBtn = document.getElementById('origin-location');
const destinationLocationBtn = document.getElementById('destination-location');
const directionsForm = document.getElementById('directions-form');
const closeDirectionsBtn = document.getElementById('close-directions');
const directionsToggleBtn = document.getElementById('directions-toggle');
const getRouteBtn = document.getElementById('get-route');
const swapLocationsBtn = document.getElementById('swap-locations');
const routeInfoDiv = document.getElementById('route-info');
const navigationStepsDiv = document.getElementById('navigation-steps');
const startNavBtn = document.getElementById('start-navigation');
const stopNavBtn = document.getElementById('stop-navigation');

// Toggle directions panel visibility
directionsToggleBtn.addEventListener('click', () => {
    directionsForm.classList.toggle('open');
});

closeDirectionsBtn.addEventListener('click', () => {
    directionsForm.classList.remove('open');
});

// Location button click handler
function setLocation(inputEl, locationBtn) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;

            // Set the value of the input field to "My Location"
            inputEl.value = 'My Location';

            // Store the coordinates as data attributes
            inputEl.dataset.lon = longitude;
            inputEl.dataset.lat = latitude;

            // Hide the "My Location" button after selecting
            locationBtn.style.display = 'none';
        }, err => {
            alert('Unable to retrieve your location.');
        });
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

// Add event listeners for "My Location" buttons
originLocationBtn.addEventListener('click', () => {
    setLocation(originInput, originLocationBtn);
});

destinationLocationBtn.addEventListener('click', () => {
    setLocation(destinationInput, destinationLocationBtn);
});

// Show the location button when the corresponding input field is focused
originInput.addEventListener('focus', () => {
    originLocationBtn.style.display = 'inline-block';
    destinationLocationBtn.style.display = 'none';
});

destinationInput.addEventListener('focus', () => {
    destinationLocationBtn.style.display = 'inline-block';
    originLocationBtn.style.display = 'none';
});

// Swap origin and destination inputs
swapLocationsBtn.addEventListener('click', () => {
    const tempValue = originInput.value;
    originInput.value = destinationInput.value;
    destinationInput.value = tempValue;

    // Swap coordinates too if they exist
    const tempCoords = {
        lat: originInput.dataset.lat,
        lon: originInput.dataset.lon,
    };
    originInput.dataset.lat = destinationInput.dataset.lat;
    originInput.dataset.lon = destinationInput.dataset.lon;
    destinationInput.dataset.lat = tempCoords.lat;
    destinationInput.dataset.lon = tempCoords.lon;
});

// Get route button functionality (dummy functionality for now)
getRouteBtn.addEventListener('click', () => {
    const origin = originInput.value;
    const destination = destinationInput.value;

    if (!origin || !destination) {
        alert('Please enter both origin and destination.');
        return;
    }

    // Dummy routing example (you can integrate your routing API here)
    routeInfoDiv.innerHTML = `Routing from ${origin} to ${destination}...`;

    // Show navigation UI
    navigationStepsDiv.innerHTML = 'Fetching steps...'; // Replace with actual route steps
    navigationStepsDiv.style.display = 'block';
    startNavBtn.style.display = 'inline-block';
    stopNavBtn.style.display = 'none';
});

// Start navigation
startNavBtn.addEventListener('click', () => {
    startNavBtn.style.display = 'none';
    stopNavBtn.style.display = 'inline-block';
    // Implement GPS tracking and navigation here
    alert('Starting navigation...'); // Replace with actual navigation logic
});

// Stop navigation
stopNavBtn.addEventListener('click', () => {
    stopNavBtn.style.display = 'none';
    startNavBtn.style.display = 'inline-block';
    // Stop GPS tracking and navigation
    alert('Navigation stopped'); // Replace with actual stop logic
});

// Map click event to display coordinates (for testing)
map.on('click', (e) => {
    const { lng, lat } = e.lngLat;
    console.log(`Coordinates: ${lng}, ${lat}`);
});
