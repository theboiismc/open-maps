import { map, geolocationOptions, addRouteToMap } from './map.js';

// --- ADVANCED NAVIGATION STATE ---
let navigationState = {};

// --- SPEECH SYNTHESIS ---
const speech = {
    synthesis: window.speechSynthesis,
    utterance: new SpeechSynthesisUtterance(),
    speak(text, priority = false) {
        if (priority && this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        if (!this.synthesis.speaking && text) {
            this.utterance.text = text;
            this.synthesis.speak(this.utterance);
        }
    }
};

const navigationStatusPanel = document.getElementById('navigation-status');
const navigationInstructionEl = document.getElementById('navigation-instruction');
const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
const statSpeedEl = document.getElementById('stat-speed');
const statEtaEl = document.getElementById('stat-eta');
const statTimeRemainingEl = document.getElementById('stat-time-remaining');
const highlightedSegmentLayerId = 'highlighted-route-segment';

let userLocationMarker = null;
let navigationWatcherId = null;

function resetNavigationState() {
    navigationState = {
        isActive: false,
        isRerouting: false,
        currentStepIndex: 0,
        progressAlongStep: 0,
        distanceToNextManeuver: Infinity,
        userSpeed: 0,
        estimatedArrivalTime: null,
        totalTripTime: 0,
        lastAnnouncedDistance: Infinity,
        isWrongWay: false
    };
}
resetNavigationState();

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
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

function updateNavigationUI() {
    const remainingTime = (navigationState.totalTripTime / 60).toFixed(0);
    statTimeRemainingEl.textContent = `${remainingTime} min`;
    statEtaEl.textContent = formatEta(navigationState.estimatedArrivalTime);
    statSpeedEl.textContent = navigationState.userSpeed.toFixed(0);
    instructionProgressBar.transform = `scaleX(${1 - navigationState.progressAlongStep})`;
}

function updateHighlightedSegment(step) {
    if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
    if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    if (!step || !step.geometry) return;

    map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: step.geometry });
    map.addLayer({
        id: highlightedSegmentLayerId,
        type: 'line',
        source: highlightedSegmentLayerId,
        paint: { 'line-color': '#0055ff', 'line-width': 9, 'line-opacity': 0.9 }
    }, 'route-line');
}

function startNavigation(routeData) {
    if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");

    resetNavigationState();
    navigationState.isActive = true;
    navigationState.totalTripTime = routeData.routes[0].duration;

    const firstStep = routeData.routes[0].legs[0].steps[0];
    navigationInstructionEl.textContent = firstStep.maneuver.instruction;
    updateHighlightedSegment(firstStep);
    updateNavigationUI();

    navigationStatusPanel.style.display = 'flex';
    speech.speak(`Starting route. ${firstStep.maneuver.instruction}`, true);

    if (!userLocationMarker) {
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
    }

    map.easeTo({ pitch: 60, zoom: 17, duration: 1500 });

    navigationWatcherId = navigator.geolocation.watchPosition((position) => handlePositionUpdate(position, routeData), handlePositionError, geolocationOptions);
}

function stopNavigation() {
    if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
    if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }

    clearRouteFromMap();
    resetNavigationState();

    navigationStatusPanel.style.display = 'none';
    speech.synthesis.cancel();

    map.easeTo({ pitch: 0, bearing: 0 });
}

function handlePositionError(error) {
    console.error("Geolocation Error:", error.message);
    alert(`Geolocation error: ${error.message}. Navigation stopped.`);
    stopNavigation();
}

async function handlePositionUpdate(position, routeData) {
    if (!navigationState.isActive || navigationState.isRerouting) return;

    const { latitude, longitude, heading, speed, accuracy } = position.coords;
    if (accuracy > 40) return;

    const userPoint = turf.point([longitude, latitude]);
    const steps = routeData.routes[0].legs[0].steps;

    // 1. Update State & UI
    navigationState.userSpeed = (speed || 0) * 2.23694;
    const routeLine = turf.lineString(routeData.routes[0].geometry.coordinates);
    const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });

    userLocationMarker.setLngLat(snapped.geometry.coordinates);
    if (heading != null) {
        userLocationMarker.setRotation(heading);
        map.easeTo({ center: snapped.geometry.coordinates, bearing: heading, zoom: 18, duration: 500 });
    } else {
        map.easeTo({ center: snapped.geometry.coordinates, zoom: 18, duration: 500 });
    }

    // 2. Rerouting Logic (Off-route & Wrong Way)
    const currentStep = steps[navigationState.currentStepIndex];
    const stepStartPoint = turf.point(currentStep.geometry.coordinates[0]);
    const stepEndPoint = turf.point(currentStep.geometry.coordinates[currentStep.geometry.coordinates.length - 1]);
    const stepBearing = getBearing(stepStartPoint, stepEndPoint);
    const headingDifference = Math.abs(heading - stepBearing);

    if (snapped.properties.dist > 50) {
        navigationState.isRerouting = true;
        speech.speak("Off route. Recalculating.", true);
        return;
    }

    if (heading != null && headingDifference > 90 && headingDifference < 270 && navigationState.userSpeed > 5 && !navigationState.isWrongWay) {
        navigationState.isWrongWay = true;
        speech.speak("Wrong way. Recalculating.", true);
        return;
    }
    navigationState.isWrongWay = false;

    // 3. Progress Calculation (Map Matching)
    const currentStepLine = turf.lineString(currentStep.geometry.coordinates);
    const totalStepDistance = turf.length(currentStepLine, { units: 'meters' });
    navigationState.distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units: 'meters' });
    navigationState.progressAlongStep = Math.max(0, 1 - (navigationState.distanceToNextManeuver / totalStepDistance));

    const tripDurationSeconds = routeData.routes[0].duration;
    const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
    const remainingTimeSeconds = tripDurationSeconds - timeElapsed;
    navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
    navigationState.totalTripTime = remainingTimeSeconds;

    updateNavigationUI();

    // 4. Audio Cues
    const distanceMiles = navigationState.distanceToNextManeuver * 0.000621371;
    if (distanceMiles > 0.9 && distanceMiles < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
        speech.speak(`In 1 mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 1;
    } else if (distanceMiles > 0.24 && distanceMiles < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
        speech.speak(`In a quarter mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 0.25;
    }

    // 5. Step Advancement Logic
    if (navigationState.distanceToNextManeuver < 50) {
        navigationState.currentStepIndex++;
        if (navigationState.currentStepIndex >= steps.length) {
            speech.speak("You have arrived at your destination.", true);
            stopNavigation();
            return;
        }
        const nextStep = steps[navigationState.currentStepIndex];
        navigationInstructionEl.textContent = nextStep.maneuver.instruction;
        updateHighlightedSegment(nextStep);
        speech.speak(nextStep.maneuver.instruction, true);
        navigationState.lastAnnouncedDistance = Infinity;
    }
}

export { startNavigation, stopNavigation, navigationState };
