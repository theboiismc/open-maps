document.addEventListener('DOMContentLoaded', () => {
    // --- SETUP & STATE MANAGEMENT ---
    const isMobile = /Mobi/i.test(navigator.userAgent);
    const STYLES = { /* ... styles from previous step ... */ }; // (Keep this section)
    const STYLE_ICONS = { /* ... style icons from previous step ... */ }; // (Keep this section)

    const map = new maplibregl.Map({ /* ... map initialization ... */ });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    // DOM References
    const navUi = document.getElementById('nav-ui');
    const navInstructionEl = document.getElementById('nav-instruction');
    const navDistanceEl = document.getElementById('nav-distance');
    const exitNavBtn = document.getElementById('exit-nav-btn');
    const shareModalOverlay = document.getElementById('share-modal-overlay');
    const qrCodeCanvas = document.getElementById('qr-code');
    const shareLinkInput = document.getElementById('share-link');
    const mainRouteActionBtn = document.getElementById('main-route-action-btn');
    // ... other existing DOM references ...

    // Navigation State
    let isNavigating = false;
    let currentRoute = null; // Will hold the full route data from OSRM
    let currentStepIndex = 0;
    let locationWatcherId = null;
    let userMarker = null;

    // --- INITIALIZATION ---
    // Check for navigation parameters in the URL on page load
    checkForNavInUrl();


    // --- NAVIGATION ENGINE ---

    function startNavigation() {
        if (!currentRoute || !isMobile) return;

        isNavigating = true;
        currentStepIndex = 0;
        closePanel();
        navUi.classList.add('visible');
        map.flyTo({ zoom: 18, pitch: 60 });

        // Add a marker for the user's location
        if (!userMarker) {
            const el = document.createElement('div');
            el.className = 'user-marker'; // You can style this in CSS if you want
            el.style.background = '#1a73e8';
            el.style.border = '3px solid white';
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
            userMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }
        
        // Start watching the user's GPS position
        locationWatcherId = navigator.geolocation.watchPosition(
            (position) => {
                const userCoords = [position.coords.longitude, position.coords.latitude];
                userMarker.setLngLat(userCoords);
                map.setCenter(userCoords);
                checkStepCompletion(userCoords);
            },
            () => { alert("GPS signal lost. Please ensure location services are enabled."); stopNavigation(); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        updateNavInstruction();
    }
    
    function stopNavigation() {
        if (!isNavigating) return;
        isNavigating = false;
        navUi.classList.remove('visible');
        if (locationWatcherId) {
            navigator.geolocation.clearWatch(locationWatcherId);
            locationWatcherId = null;
        }
        if (userMarker) {
            userMarker.remove();
            userMarker = null;
        }
        map.flyTo({ pitch: 0 }); // Reset map pitch
        speechSynthesis.cancel(); // Stop any ongoing speech
    }
    exitNavBtn.addEventListener('click', stopNavigation);

    function updateNavInstruction() {
        if (!currentRoute || currentStepIndex >= currentRoute.legs[0].steps.length) {
            navInstructionEl.textContent = "You have arrived!";
            navDistanceEl.textContent = "";
            speak("You have arrived at your destination.");
            stopNavigation();
            return;
        }
        const step = currentRoute.legs[0].steps[currentStepIndex];
        navInstructionEl.textContent = step.maneuver.instruction;
        speak(step.maneuver.instruction);
    }
    
    function checkStepCompletion(userCoords) {
        if (!currentRoute) return;
        const step = currentRoute.legs[0].steps[currentStepIndex];
        const nextManeuverCoords = step.maneuver.location;
        
        const distance = getDistance(userCoords, nextManeuverCoords);
        navDistanceEl.textContent = `${distance.toFixed(2)} mi to next turn`;

        // If user is within ~20 meters of the turn, advance to the next step
        if (distance < 0.012) { // approx 20 meters in miles
            currentStepIndex++;
            updateNavInstruction();
        }
    }

    function speak(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel(); // Clear queue
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
        }
    }

    // Haversine distance formula (approximated in miles)
    function getDistance(coords1, coords2) {
        const R = 3959; // Radius of the Earth in miles
        const lat1 = coords1[1] * Math.PI/180;
        const lat2 = coords2[1] * Math.PI/180;
        const dLat = (coords2[1]-coords1[1]) * Math.PI/180;
        const dLon = (coords2[0]-coords1[0]) * Math.PI/180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }


    // --- ROUTING & SHARE LOGIC ---
    
    document.getElementById('get-route-btn').addEventListener('click', async () => {
        // This button's text and function will change, so we check its text
        const action = mainRouteActionBtn.textContent;
        if (action.includes("Share")) {
            showShareModal();
        } else if (action.includes("Start")) {
            startNavigation();
        } else {
             // Default action: Get the route
            if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
            try {
                const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
                fetchAndDisplayRoute(start, end);
            } catch (err) {
                alert(`Error getting route: ${err.message}`);
            }
        }
    });

    async function fetchAndDisplayRoute(startCoords, endCoords) {
        const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.join(',')};${endCoords.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return alert("No route found.");
        
        currentRoute = data.routes[0]; // Store full route data
        const routeGeoJSON = { type: 'Feature', geometry: currentRoute.geometry };
        currentRouteGeoJSON = routeGeoJSON; // For style changes
        addRouteToMap(routeGeoJSON);

        // Update UI
        const bounds = new maplibregl.LngLatBounds();
        currentRoute.geometry.coordinates.forEach(coord => bounds.extend(coord));
        map.fitBounds(bounds, { padding: isMobile ? {top: 50, bottom: 250, left: 50, right: 50} : 100 });
        
        const stepsEl = document.getElementById("route-steps");
        stepsEl.innerHTML = "";
        currentRoute.legs[0].steps.forEach(step => {
            const li = document.createElement("li");
            li.textContent = step.maneuver.instruction;
            stepsEl.appendChild(li);
        });
        
        // Change the button based on platform
        if (isMobile) {
            mainRouteActionBtn.textContent = "Start Navigation";
        } else {
            mainRouteActionBtn.textContent = "Share Route to Phone";
        }
        showPanel('route-section');
    }
    
    function showShareModal() {
        const start = currentRoute.legs[0].steps[0].maneuver.location;
        const end = currentRoute.legs[0].steps[currentRoute.legs[0].steps.length - 1].maneuver.location;
        const navUrl = `${window.location.origin}${window.location.pathname}?nav=${start.join(',')};${end.join(',')}`;
        
        shareLinkInput.value = navUrl;
        new QRious({
            element: qrCodeCanvas,
            value: navUrl,
            size: 200,
            padding: 10
        });
        shareModalOverlay.classList.add('visible');
    }
    shareModalOverlay.addEventListener('click', (e) => {
        if (e.target === shareModalOverlay) {
            shareModalOverlay.classList.remove('visible');
        }
    });

    function checkForNavInUrl() {
        const params = new URLSearchParams(window.location.search);
        const navData = params.get('nav');
        if (navData) {
            const [startStr, endStr] = navData.split(';');
            const startCoords = startStr.split(',').map(Number);
            const endCoords = endStr.split(',').map(Number);
            
            // Set input values for context, even though we use coords directly
            fromInput.value = `Start: ${startCoords.join(', ')}`;
            toInput.value = `Destination: ${endCoords.join(', ')}`;
            
            fetchAndDisplayRoute(startCoords, endCoords);
        }
    }

    // ... (All other functions: geocode, addRouteToMap, layer switcher logic, panel logic, etc. remain here unchanged)

});
