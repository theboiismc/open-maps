// --- ADVANCED NAVIGATION FUNCTIONS ---
function toRadians(degrees) { return degrees * Math.PI / 180; }
function toDegrees(radians) { return radians * 180 / Math.PI; }
function getBearing(startPoint, endPoint) {
    const startLat = toRadians(startPoint.geometry.coordinates[1]);
    const startLng = toRadians(startPoint.geometry.coordinates[0]);
    const endLat = toRadians(endPoint.geometry.coordinates[1]);
    const endLng = toRadians(endPoint.geometry.coordinates[0]);
    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    let brng = toDegrees(Math.atan2(y, x));
    return (brng + 360) % 360;
}

function formatEta(date) {
    if (!date) return "--:--";
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0'+minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

function updateNavigationUI() {
    const remainingTime = (navigationState.totalTripTime / 60).toFixed(0);
    const remainingDistance = (navigationState.totalTripDistance / 1000).toFixed(1);
    const units = document.getElementById('units-metric').checked ? 'km' : 'mi';
    
    document.getElementById('distance-remaining').textContent = units === 'mi' ? (remainingDistance * 0.621371).toFixed(1) : remainingDistance;
    document.getElementById('distance-units').textContent = units;
    document.getElementById('eta-time').textContent = formatEta(navigationState.estimatedArrivalTime);
    
    // Update main instruction text
    const currentStep = navigationState.currentRoute.properties.legs[navigationState.currentLegIndex].steps[navigationState.currentStepIndex];
    if (currentStep) {
        document.getElementById('navigation-instruction').textContent = currentStep.instruction.text;
        document.getElementById('navigation-subinstruction').textContent = `Distance: ${currentStep.distance.toFixed(1)} ${units}`;
    }
}

async function getRoute() {
    const fromInput = document.getElementById('from-input');
    const toInput = document.getElementById('to-input');
    
    try {
        showPanel('route-preview-panel');
        document.getElementById('spinner').hidden = false;
        
        const fromCoords = await geocode(fromInput);
        const toCoords = await geocode(toInput);

        const GEOAPIFY_KEY = 'YOUR_GEOAPIFY_API_KEY';
        const trafficValue = document.getElementById('traffic-toggle').checked ? 'approximated' : 'free_flow';
        const units = document.getElementById('units-metric').checked ? 'metric' : 'imperial';
        
        // NEW: Use Geoapify Routing API
        const url = `https://api.geoapify.com/v1/routing?waypoints=${fromCoords[1]},${fromCoords[0]}|${toCoords[1]},${toCoords[0]}&mode=drive&traffic=${trafficValue}&details=route_details,instruction_details&units=${units}&apiKey=${GEOAPIFY_KEY}`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Geoapify API Error: ${res.statusText}`);
        }
        const data = await res.json();
        
        if (data.features && data.features.length > 0) {
            const route = data.features[0];
            const routeSummary = route.properties.legs[0];
            navigationState.currentRoute = route;
            
            const distance = routeSummary.distance;
            const duration = routeSummary.time;
            
            document.getElementById('route-preview-distance').textContent = `${(distance / 1000).toFixed(1)} km / ${(distance * 0.000621371).toFixed(1)} mi`;
            document.getElementById('route-preview-time').textContent = `${(duration / 60).toFixed(0)} min`;
            document.getElementById('spinner').hidden = true;
            
            drawRouteOnMap(route);
        } else {
            throw new Error("No route found.");
        }
    } catch (e) {
        console.error("Routing error:", e);
        document.getElementById('spinner').hidden = true;
        alert("Failed to find a route. Please check the addresses or try again.");
    }
}

function drawRouteOnMap(route) {
    clearRouteFromMap();
    if (map.getSource('route')) {
        map.getSource('route').setData(route);
    } else {
        map.addSource('route', {
            'type': 'geojson',
            'data': route
        });
        map.addLayer({
            'id': 'route',
            'type': 'line',
            'source': 'route',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#00796b',
                'line-width': 8,
                'line-opacity': 0.8
            }
        });
    }
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates[0].forEach(point => {
        bounds.extend(point);
    });
    map.fitBounds(bounds, { padding: 50, duration: 1000 });
}

function clearRouteFromMap() {
    if (map.getLayer('route')) {
        map.removeLayer('route');
    }
    if (map.getSource('route')) {
        map.removeSource('route');
    }
    // Clear the navigation state
    navigationState = {
        currentRoute: null,
        currentLegIndex: 0,
        currentStepIndex: 0,
        distanceToNextManeuver: 0,
        totalTripDistance: 0,
        totalTripTime: 0,
        lastAnnouncedDistance: 99999,
        estimatedArrivalTime: null
    };
    if (navigationInterval) {
        clearInterval(navigationInterval);
        navigationInterval = null;
    }
    if (mapMarker) {
        mapMarker.remove();
        mapMarker = null;
    }
    stopSpeaking();
    document.getElementById('nav-info-redesign').hidden = true;
}

function stopNavigation() {
    clearRouteFromMap();
    showPanel('info-panel-redesign');
}

function startNavigation() {
    if (!navigationState.currentRoute) return;
    
    showPanel('route-section');
    document.getElementById('nav-info-redesign').hidden = false;
    
    // Set initial state
    const firstLeg = navigationState.currentRoute.properties.legs[0];
    const firstStep = firstLeg.steps[0];
    
    navigationState.currentLegIndex = 0;
    navigationState.currentStepIndex = 0;
    navigationState.totalTripTime = firstLeg.time;
    navigationState.totalTripDistance = firstLeg.distance;
    
    speech.speak(`Starting navigation. ${firstStep.instruction.text}`);
    updateNavigationUI();
    
    if (navigator.geolocation) {
        geolocateControl.trigger();
        navigator.geolocation.watchPosition(handlePositionUpdate, (err) => {
            console.error('Geolocation error:', err);
            speech.speak('Failed to get your current location. Navigation will not work.', true);
        }, geolocationOptions);
    }
    
    // Periodically check for new ETA and traffic updates
    navigationInterval = setInterval(async () => {
        if (!navigationState.currentRoute) return;
        
        const fromCoords = map.getCenter();
        const toCoords = navigationState.currentRoute.geometry.coordinates[navigationState.currentRoute.geometry.coordinates.length - 1][0];

        const GEOAPIFY_KEY = 'YOUR_GEOAPIFY_API_KEY';
        const trafficValue = document.getElementById('traffic-toggle').checked ? 'approximated' : 'free_flow';
        const units = document.getElementById('units-metric').checked ? 'metric' : 'imperial';

        const url = `https://api.geoapify.com/v1/routing?waypoints=${fromCoords.lat},${fromCoords.lng}|${toCoords[1]},${toCoords[0]}&mode=drive&traffic=${trafficValue}&details=route_details,instruction_details&units=${units}&apiKey=${GEOAPIFY_KEY}`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("API error fetching live data.");
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const newRoute = data.features[0];
                const newSummary = newRoute.properties.legs[0];
                navigationState.totalTripTime = newSummary.time;
                navigationState.estimatedArrivalTime = new Date(Date.now() + newSummary.time * 1000);
                updateNavigationUI();
            }
        } catch(e) {
            console.error("Live traffic update failed:", e);
        }
    }, 60000); // Update every 60 seconds
}

function handlePositionUpdate(position) {
    if (!navigationState.currentRoute) return;
    const currentLocation = turf.point([position.coords.longitude, position.coords.latitude]);
    const routeLine = turf.lineString(navigationState.currentRoute.geometry.coordinates[0]);
    
    // Snap the current location to the nearest point on the route
    const snapped = turf.nearestPointOnLine(routeLine, currentLocation);

    const steps = navigationState.currentRoute.properties.legs[navigationState.currentLegIndex].steps;
    const currentStep = steps[navigationState.currentStepIndex];
    const nextManeuverCoords = currentStep.location;
    const nextManeuverPoint = turf.point(nextManeuverCoords);
    
    // Calculate distance to the next maneuver
    navigationState.distanceToNextManeuver = turf.distance(currentLocation, nextManeuverPoint, {units: 'meters'});

    // Calculate remaining distance and time
    const tripDistance = navigationState.currentRoute.properties.legs[0].distance;
    const tripDurationSeconds = navigationState.currentRoute.properties.legs[0].time;
    const traveledDistance = turf.length(turf.lineSlice(routeLine.geometry.coordinates[0], snapped.geometry.coordinates, routeLine.geometry.coordinates[0]), { units: 'meters' });
    const remainingDistance = tripDistance - traveledDistance;
    const timeElapsed = tripDurationSeconds * (traveledDistance / tripDistance);
    const remainingTimeSeconds = tripDurationSeconds - timeElapsed;

    navigationState.totalTripDistance = remainingDistance;
    navigationState.totalTripTime = remainingTimeSeconds;
    navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
    updateNavigationUI();

    const distanceUnits = document.getElementById('units-metric').checked ? 'meters' : 'miles';
    let distanceToNextManeuver = navigationState.distanceToNextManeuver;
    if (distanceUnits === 'miles') {
        distanceToNextManeuver *= 0.000621371; // convert to miles
    }

    if (distanceToNextManeuver > 0.9 && distanceToNextManeuver < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
        speech.speak(`In 1 mile, ${currentStep.instruction.text}`);
        navigationState.lastAnnouncedDistance = 1;
    } else if (distanceToNextManeuver > 0.24 && distanceToNextManeuver < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
        speech.speak(`In a quarter mile, ${currentStep.instruction.text}`);
        navigationState.lastAnnouncedDistance = 0.25;
    }

    if (navigationState.distanceToNextManeuver < 50) {
        navigationState.currentStepIndex++;
        if (navigationState.currentStepIndex >= steps.length) {
            speech.speak("You have arrived at your destination.", true);
            stopNavigation();
            return;
        }
        const nextStep = steps[navigationState.currentStepIndex];
        document.getElementById('navigation-instruction').textContent = nextStep.instruction.text;
        updateHighlightedSegment(nextStep);
        speech.speak(nextStep.instruction.text);
    }
}
