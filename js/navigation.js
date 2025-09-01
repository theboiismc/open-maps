// navigation.js
export function initNavigation({ map }) {
    let navigationState = {
        isActive: false,
        isRerouting: false,
        currentStepIndex: 0,
        distanceToNextManeuver: Infinity,
        userSpeed: 0,
        totalTripTime: 0,
        lastAnnouncedDistance: Infinity,
        isWrongWay: false,
    };

    let userLocationMarker = null;
    let currentRouteData = null;
    let navigationWatcherId = null;

    // --- Helpers ---
    function resetNavigationState() {
        navigationState = {
            isActive: false,
            isRerouting: false,
            currentStepIndex: 0,
            distanceToNextManeuver: Infinity,
            userSpeed: 0,
            totalTripTime: 0,
            lastAnnouncedDistance: Infinity,
            isWrongWay: false,
        };
        if (userLocationMarker) userLocationMarker.remove();
        userLocationMarker = null;
        currentRouteData = null;
        if (navigationWatcherId !== null) navigator.geolocation.clearWatch(navigationWatcherId);
    }

    function announceDistance(distanceMeters) {
        // Voice alert or console log for now
        if (distanceMeters - navigationState.lastAnnouncedDistance >= 50) {
            console.log(`Distance to next maneuver: ${distanceMeters.toFixed(1)}m`);
            navigationState.lastAnnouncedDistance = distanceMeters;
        }
    }

    function updateNavigationStep(position) {
        if (!currentRouteData || currentRouteData.steps.length === 0) return;

        const step = currentRouteData.steps[navigationState.currentStepIndex];
        const [lat, lng] = [position.coords.latitude, position.coords.longitude];
        const stepDistance = distanceBetween([lat, lng], step.maneuver.location);
        navigationState.distanceToNextManeuver = stepDistance;
        navigationState.userSpeed = position.coords.speed || 0;

        if (stepDistance < 10 && navigationState.currentStepIndex < currentRouteData.steps.length - 1) {
            navigationState.currentStepIndex++;
            navigationState.lastAnnouncedDistance = Infinity;
        }

        announceDistance(stepDistance);
    }

    function distanceBetween([lat1, lng1], [lat2, lng2]) {
        // Haversine formula
        const R = 6371000;
        const toRad = x => x * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function handlePositionUpdate(position) {
        const [lat, lng] = [position.coords.latitude, position.coords.longitude];
        if (!userLocationMarker) {
            userLocationMarker = new maplibregl.Marker({ color: '#00796b' }).setLngLat([lng, lat]).addTo(map);
        } else {
            userLocationMarker.setLngLat([lng, lat]);
        }
        map.easeTo({ center: [lng, lat] });

        if (navigationState.isActive) updateNavigationStep(position);
    }

    // --- Public Methods ---
    function startNavigation(routeData) {
        if (!routeData || !routeData.steps || routeData.steps.length === 0) return;
        currentRouteData = routeData;
        navigationState.isActive = true;
        navigationState.currentStepIndex = 0;
        navigationState.lastAnnouncedDistance = Infinity;

        navigationWatcherId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            err => console.error("Navigation geolocation error:", err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        console.log("Navigation started!");
    }

    function stopNavigation() {
        resetNavigationState();
        console.log("Navigation stopped!");
    }

    return { startNavigation, stopNavigation, handlePositionUpdate, navigationState };
}
