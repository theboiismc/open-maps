// navigation.js
export function initNavigation({ map, isMobile }) {
    let navigationState = { isActive: false, isRerouting: false, currentStepIndex: 0, distanceToNextManeuver: Infinity, userSpeed: 0 };
    let userLocationMarker = null;
    let currentRouteData = null;
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

    // TO DO: add full navigation update functions, startNavigation(), stopNavigation(), handlePositionUpdate()
    // You can export start/stop navigation functions
    return { navigationState, resetNavigationState };
}
