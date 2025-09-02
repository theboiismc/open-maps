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
        map.getSource('route').setData(route.geometry);
    } else {
        map.addSource('route', {
            type: 'geojson',
            data: route.geometry
        });
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#0d89ec',
                'line-width': 8,
                'line-opacity': 0.7
            }
        });
    }
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach(coord => {
        bounds.extend(coord);
    });
    map.fitBounds(bounds, {
        padding: 50,
        bearing: map.getBearing(),
        pitch: map.getPitch()
    });
    const stepsList = document.getElementById('steps-list');
    stepsList.innerHTML = '';
    route.properties.legs.forEach(leg => {
        leg.steps.forEach(step => {
            const li = document.createElement('li');
            li.className = 'step-item';
            li.innerHTML = `<span class="step-icon material-symbols-outlined">${getManeuverIcon(step.maneuver.type)}</span> ${step.instruction.text}`;
            stepsList.appendChild(li);
        });
    });
}
function startNavigation() {
    if (!currentRouteData) {
        alert("Please get a route first.");
        return;
    }
    showPanel('route-section');
    map.setBearing(getBearing(currentRouteData.routes[0].geometry.coordinates[0], currentRouteData.routes[0].geometry.coordinates[1]));
    navigationState.isActive = true;
    navigationState.currentRoute = currentRouteData;
    navigationState.currentLegIndex = 0;
    navigationState.currentStepIndex = 0;
    document.getElementById('navigation-instruction').textContent = "Starting...";
    updateHighlightedSegment(navigationState.currentRoute.properties.legs[0].steps[0]);
    simulateNavigation();
}
function stopNavigation() {
    navigationState.isActive = false;
    if (navigationInterval) {
        clearInterval(navigationInterval);
        navigationInterval = null;
    }
    if (highlightedSegmentLayerId) {
        map.removeLayer(highlightedSegmentLayerId);
        map.removeSource(highlightedSegmentLayerId);
    }
}
let navigationInterval;
const highlightedSegmentLayerId = 'highlighted-segment';
let navigationState = { isActive: false, currentRoute: null, currentLegIndex: 0, currentStepIndex: 0, lastAnnouncedDistance: 999999, totalTripDistance: 0, totalTripTime: 0, estimatedArrivalTime: null };

function updateHighlightedSegment(step) {
    if (map.getLayer(highlightedSegmentLayerId)) {
        map.removeLayer(highlightedSegmentLayerId);
        map.removeSource(highlightedSegmentLayerId);
    }
    const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: step.geometry }] };
    map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: geojson });
    map.addLayer({ id: highlightedSegmentLayerId, type: 'line', source: highlightedSegmentLayerId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff0000', 'line-width': 10, 'line-opacity': 0.8 } });
}

function simulateNavigation() {
    const routeCoordinates = turf.feature(navigationState.currentRoute.geometry).geometry.coordinates;
    const routeLine = turf.lineString(routeCoordinates);
    let currentPosition = turf.point(routeCoordinates[0]);
    let positionIndex = 0;
    navigationState.totalTripDistance = turf.length(routeLine, {units: 'meters'});
    const tripDurationSeconds = navigationState.currentRoute.properties.legs[0].time;
    navigationState.totalTripTime = tripDurationSeconds;
    navigationState.estimatedArrivalTime = new Date(Date.now() + tripDurationSeconds * 1000);

    navigationInterval = setInterval(() => {
        if (!navigationState.isActive) {
            clearInterval(navigationInterval);
            return;
        }
        positionIndex = (positionIndex + 10) % routeCoordinates.length;
        if (positionIndex === 0) {
            // Reached the end
            clearInterval(navigationInterval);
            return;
        }
        currentPosition = turf.point(routeCoordinates[positionIndex]);
        
        // Find nearest step
        const currentStep = navigationState.currentRoute.properties.legs[navigationState.currentLegIndex].steps[navigationState.currentStepIndex];
        const stepLine = turf.lineString(currentStep.geometry.coordinates);
        const snapped = turf.nearestPointOnLine(stepLine, currentPosition);
        navigationState.distanceToNextManeuver = turf.length(turf.lineSlice(snapped, turf.point(stepLine.geometry.coordinates[stepLine.geometry.coordinates.length - 1])), {units: 'meters'});
        
        const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
        const remainingTimeSeconds = tripDurationSeconds - timeElapsed;
        navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
        navigationState.totalTripTime = remainingTimeSeconds;
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
            navigationState.lastAnnouncedDistance = 999999;
        }
    }, 1000);
}

function getManeuverIcon(type) {
    const icons = { 'turn': 'turn_left', 'depart': 'directions', 'arrive': 'pin_drop', 'merge': 'merge_type', 'fork': 'alt_route', 'roundabout': 'roundabout_right' };
    return icons[type] || 'directions';
}
let speech = window.speechSynthesis;
let speechUtterance = new SpeechSynthesisUtterance();

function speak(text, isFinal = false) {
    if (!speech || !speechUtterance) return;
    speechUtterance.text = text;
    speechUtterance.rate = 1.2;
    speechUtterance.pitch = 1.0;
    speech.speak(speechUtterance);
}
