document.addEventListener('DOMContentLoaded', () => {

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // --- High-accuracy geolocation options ---
    const geolocationOptions = {
        enableHighAccuracy: true, // Request the most accurate location possible (GPS)
        timeout: 20000,           // Give the device 20 seconds to get a location before erroring
        maximumAge: 0             // CRITICAL: Do not use a cached location. Always get a fresh one.
    };

    // --- START: AUTHENTICATION UI LOGIC (omitted for brevity) ---
    // ... all your authentication code is unchanged ...
    // --- END: AUTHENTICATION UI LOGIC ---

    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };

    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });
    
    // --- Add controls with high-accuracy options ---
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true // Also show the direction the user is facing
    }), "bottom-right");

    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');

    let currentPlace = null;
    let currentStyle = 'default';

    // --- NAVIGATION STATE & UI ---
    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    
    let userLocationMarker = null;
    let navigationWatcherId = null;
    let currentRouteData = null;
    let upcomingStepIndex = 0;
    let isNavigating = false;
    let isRerouting = false;
    let lastGoodPosition = null;

    const speech = {
        synthesis: window.speechSynthesis,
        utterance: new SpeechSynthesisUtterance(),
        speak(text) {
            if (this.synthesis.speaking) { this.synthesis.cancel(); }
            if (text) { this.utterance.text = text; this.synthesis.speak(this.utterance); }
        }
    };
    
    // ... all your other element selections and UI functions (showPanel, closePanel, etc.) are unchanged ...

    // --- "Use my location" button with high-accuracy options ---
    document.getElementById('dir-use-my-location').addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(pos => {
            fromInput.value = "Your Location";
            fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        }, () => {
            alert("Could not get your location. Please ensure location is on and set to 'High Accuracy'.");
        }, geolocationOptions);
    });

    // ... other event listeners for search, directions, etc. are unchanged ...

    async function getRouteAndNavigate() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.routes || data.routes.length === 0) return alert("No route found.");
            
            currentRouteData = data;
            const routeGeoJSON = { type: 'Feature', geometry: data.routes[0].geometry };
            
            addRouteToMap(routeGeoJSON);

            const bounds = new maplibregl.LngLatBounds();
            routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
            map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });

            closePanel();
            startNavigation();

        } catch (err) { alert(`Error getting route: ${err.message}`); isRerouting = false; }
    }
    
    document.getElementById('get-route-btn').addEventListener('click', getRouteAndNavigate);

    function startNavigation() {
        if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");
        
        isNavigating = true;
        upcomingStepIndex = 0;
        lastGoodPosition = null; // Reset on new navigation
        navigationStatusPanel.style.display = 'flex';
        updateNavigationInstruction();

        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }

        // --- Use high-accuracy options for watching position ---
        navigationWatcherId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            handlePositionError,
            geolocationOptions
        );
        endNavigationBtn.addEventListener('click', stopNavigation);
    }
    
    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        
        isNavigating = false;
        navigationWatcherId = null;
        currentRouteData = null;
        lastGoodPosition = null;
        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel();
        
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
    }

    function handlePositionError(error) {
        alert(`Geolocation Error: ${error.message}`);
        stopNavigation();
    }
    
    function updateNavigationInstruction() {
        const instruction = currentRouteData?.routes[0].legs[0].steps[upcomingStepIndex]?.maneuver.instruction || "You have arrived.";
        navigationInstructionEl.textContent = instruction;
    }

    // --- New intelligent position update handler ---
    async function handlePositionUpdate(position) {
        if (!isNavigating || !currentRouteData) return;

        const { latitude, longitude, heading, accuracy } = position.coords;
        const userLngLat = [longitude, latitude];

        // --- INTELLIGENT FILTERING ---
        // 1. Ignore inaccurate readings.
        if (accuracy > 75 || (lastGoodPosition && accuracy > lastGoodPosition.coords.accuracy)) {
            console.log(`Ignored position update due to low accuracy: ${accuracy}m`);
            return;
        }

        // 2. Ignore tiny "jitter" movements.
        if (lastGoodPosition) {
            const distanceMoved = turf.distance(
                turf.point([lastGoodPosition.coords.longitude, lastGoodPosition.coords.latitude]),
                turf.point(userLngLat),
                { units: 'meters' }
            );
            if (distanceMoved < 3) { return; }
        }
        
        lastGoodPosition = position;

        userLocationMarker.setLngLat(userLngLat);
        if (heading != null) { userLocationMarker.setRotation(heading); }
        
        // Gently move the map for a smoother experience
        map.easeTo({ center: userLngLat, zoom: Math.max(map.getZoom(), 17), essential: true });

        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const userPoint = turf.point(userLngLat);
        
        // Check for off-route
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
        if (snapped.properties.dist > 50 && !isRerouting) {
            console.log("User is off-route. Rerouting...");
            isRerouting = true;
            speech.speak("Recalculating route.");
            fromInput.value = "Your Location";
            fromInput.dataset.coords = userLngLat.join(',');
            await getRouteAndNavigate();
            isRerouting = false;
            return;
        }

        // Check for upcoming maneuver...
        const steps = currentRouteData.routes[0].legs[0].steps;
        if (upcomingStepIndex >= steps.length) {
            if (turf.distance(userPoint, turf.point(steps[steps.length - 1].maneuver.location)) < 50) {
                speech.speak("You have arrived at your destination.");
                stopNavigation();
            }
            return;
        }
        const nextManeuver = steps[upcomingStepIndex].maneuver;
        const distanceToManeuver = turf.distance(userPoint, turf.point(nextManeuver.location), { units: 'meters' });
        if (distanceToManeuver < 80) {
            speech.speak(nextManeuver.instruction);
            upcomingStepIndex++;
            updateNavigationInstruction();
        }
    }

    // ... all other functions and the rest of the script remain unchanged ...
});
