document.addEventListener('DOMContentLoaded', () => {
    // --- MAP & APP STATE INITIALIZATION ---
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/osm-bright/style.json',
        center: [-98.5795, 39.8283],
        zoom: 3
    });

    const appState = {
        isNavigating: false,
        navigationWatcherId: null,
        currentRoute: null,
        currentStepIndex: 0,
        userLocation: null,
        units: 'imperial', // or 'metric'
        startPoint: null,
        endPoint: null,
    };

    const dom = { // Centralized DOM element references
        navigationStatus: document.getElementById('navigation-status'),
        navigationInstruction: document.getElementById('navigation-instruction'),
        subInstruction: document.querySelector('#navigation-instruction .sub-instruction'),
        endNavigationBtn: document.getElementById('end-navigation-btn'),
        sidePanel: document.getElementById('side-panel'),
        infoPanel: document.getElementById('info-panel-redesign'),
        directionsPanel: document.getElementById('directions-panel-redesign'),
        routeSection: document.getElementById('route-section'),
        routeStepsList: document.getElementById('route-steps'),
        routeSummaryTitle: document.getElementById('route-summary-title'),
        routeSummaryMeta: document.getElementById('route-summary-meta'),
        startNavBtn: document.getElementById('start-navigation-btn'),
        exitRouteBtn: document.getElementById('exit-route-btn'),
        getFromInput: document.getElementById('panel-from-input'),
        getToInput: document.getElementById('panel-to-input'),
        getRouteBtn: document.getElementById('get-route-btn'),
        useMyLocationBtn: document.getElementById('dir-use-my-location'),
    };
    
    let userLocationMarker = null;

    // --- UTILITY FUNCTIONS ---

    const formatDistance = (meters) => {
        if (appState.units === 'imperial') {
            const miles = meters / 1609.34;
            if (miles < 0.1) {
                return `${Math.round(miles * 5280)} ft`;
            }
            return `${miles.toFixed(1)} mi`;
        } else {
            if (meters < 1000) {
                return `${Math.round(meters)} m`;
            }
            return `${(meters / 1000).toFixed(1)} km`;
        }
    };

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours} hr ${minutes} min`;
        }
        return `${minutes} min`;
    };

    const getManeuverIcon = (type, modifier) => {
        // A simple mapping from OSRM maneuver types to SVG icons (example using path data)
        const icons = {
            'turn-right': '<path d="M6.41 6L11 10.59V4H13V12H5V10H9.59L5 5.41L6.41 6Z"/>',
            'turn-left': '<path d="M17.59 6L13 10.59V4H11V12H19V10H14.41L19 5.41L17.59 6Z"/>',
            'straight': '<path d="M11 4V12H6.41L11 16.59L15.59 12H13V4H11Z"/>',
            'roundabout-right': '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8V11h-2v1c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>',
            'roundabout-left': '<path d="M6.35 6.35C7.8 4.9 9.79 4 12 4c4.42 0 8 3.58 8 8s-3.58 8-8 8-8-3.58-8-8V11h2v1c0 3.31 2.69 6 6 6s6-2.69 6-6-2.69-6-6-6c-1.66 0-3.14.69-4.22 1.78L11 11H4V4l2.35 2.35z"/>',
            'depart': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/>',
            'arrive': '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>'
        };
        const key = modifier ? `${type}-${modifier}` : type;
        return icons[key] || icons['straight']; // Default to straight
    };

    // --- UI/PANEL MANAGEMENT ---

    const showPanelContent = (panelToShow) => {
        [dom.infoPanel, dom.directionsPanel, dom.routeSection].forEach(panel => {
            panel.hidden = (panel.id !== panelToShow);
        });
        dom.sidePanel.classList.add('open');
    };
    
    const hideSidePanel = () => {
        dom.sidePanel.classList.remove('open');
    };

    const toggleUIVisibility = (visible) => {
        document.body.classList.toggle('navigating', !visible);
        const elementsToToggle = document.querySelectorAll('.hidden-during-nav');
        elementsToToggle.forEach(el => {
            el.style.opacity = visible ? '1' : '0';
            el.style.pointerEvents = visible ? 'auto' : 'none';
        });
        dom.navigationStatus.classList.toggle('visible', !visible);
    };

    // --- API & DATA HANDLING ---

    const fetchRoute = async () => {
        if (!appState.startPoint || !appState.endPoint) {
            alert("Please set both a start and end point.");
            return;
        }

        const coords = `${appState.startPoint.lon},${appState.startPoint.lat};${appState.endPoint.lon},${appState.endPoint.lat}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=full`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch route');
            const data = await response.json();
            
            if (data.code === 'Ok' && data.routes.length > 0) {
                appState.currentRoute = data.routes[0];
                displayRouteDetails(appState.currentRoute);
                drawRouteOnMap(appState.currentRoute.geometry);
            } else {
                alert("Could not find a route.");
            }
        } catch (error) {
            console.error("Routing error:", error);
            alert("Error fetching route.");
        }
    };
    
    const geocode = async (query) => {
        // Implement your Nominatim search logic here
        // This is a placeholder for brevity
    };

    // --- ROUTE & NAVIGATION DISPLAY ---

    const displayRouteDetails = (route) => {
        showPanelContent('route-section');
        const leg = route.legs[0];

        // Populate summary
        dom.routeSummaryTitle.textContent = formatDuration(route.duration);
        dom.routeSummaryMeta.textContent = `via ${leg.summary || 'selected route'} (${formatDistance(route.distance)})`;
        dom.startNavBtn.style.display = appState.startPoint.isUserLocation ? 'block' : 'none';

        // Populate steps
        dom.routeStepsList.innerHTML = '';
        leg.steps.forEach((step, index) => {
            const li = document.createElement('li');
            li.className = 'route-step-item';
            li.dataset.stepIndex = index;

            const iconSVG = getManeuverIcon(step.maneuver.type, step.maneuver.modifier);
            
            li.innerHTML = `
                <div class="step-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">${iconSVG}</svg>
                </div>
                <div class="step-details">
                    <div class="step-instruction">${step.maneuver.instruction}</div>
                    <div class="step-meta">${formatDistance(step.distance)}</div>
                </div>
            `;
            li.addEventListener('click', () => {
                map.flyTo({
                    center: step.maneuver.location,
                    zoom: 16
                });
            });
            dom.routeStepsList.appendChild(li);
        });
    };

    const drawRouteOnMap = (geometry) => {
        if (map.getSource('route')) {
            map.getSource('route').setData(geometry);
        } else {
            map.addSource('route', { type: 'geojson', data: geometry });
            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#1a73e8', 'line-width': 7, 'line-opacity': 0.8 }
            });
        }
        
        map.fitBounds(turf.bbox(geometry), {
            padding: { top: 50, bottom: 50, left: 50, right: 50 }
        });
    };

    const clearRoute = () => {
        if (map.getSource('route')) {
            map.removeLayer('route-line');
            map.removeSource('route');
        }
        appState.currentRoute = null;
    };


    // --- LIVE NAVIGATION CORE LOGIC ---

    const startLiveNavigation = () => {
        if (!appState.currentRoute || !appState.startPoint.isUserLocation) {
            alert("Live navigation is only available when starting from your current location.");
            return;
        }

        appState.isNavigating = true;
        appState.currentStepIndex = 0;
        
        hideSidePanel();
        toggleUIVisibility(false);

        map.easeTo({ pitch: 60, zoom: 18, bearing: map.getBearing() });
        updateNavigationInstruction(appState.currentRoute.legs[0].steps[0]);

        appState.navigationWatcherId = navigator.geolocation.watchPosition(
            handleNavigationUpdate,
            handleNavigationError,
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    };

    const endLiveNavigation = () => {
        if (appState.navigationWatcherId) {
            navigator.geolocation.clearWatch(appState.navigationWatcherId);
        }
        appState.isNavigating = false;
        appState.navigationWatcherId = null;
        
        toggleUIVisibility(true);
        map.easeTo({ pitch: 0, zoom: map.getZoom() }); // Reset pitch
        showPanelContent('route-section'); // Show the route steps again
    };

    const handleNavigationUpdate = (position) => {
        const userCoords = [position.coords.longitude, position.coords.latitude];
        appState.userLocation = userCoords;

        // Update user marker on map
        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat(userCoords).addTo(map);
        } else {
            userLocationMarker.setLngLat(userCoords);
        }

        map.panTo(userCoords);
        
        // --- Off-route detection ---
        const routeLine = appState.currentRoute.geometry;
        const userPoint = turf.point(userCoords);
        const distanceToRoute = turf.pointToLineDistance(userPoint, routeLine, { units: 'meters' });

        if (distanceToRoute > 50) { // More than 50 meters off-route
            console.log("User is off route. Recalculating...");
            dom.navigationInstruction.textContent = 'Recalculating...';
            fetchRoute(); // Re-fetch route from new location
            return; // Stop processing this update
        }

        // --- Step progression logic ---
        const leg = appState.currentRoute.legs[0];
        const nextStep = leg.steps[appState.currentStepIndex + 1];
        if (!nextStep) { // This is the last step
             const destination = leg.steps[leg.steps.length - 1].maneuver.location;
             const distanceToDest = turf.distance(userPoint, turf.point(destination), { units: 'meters' });
             if(distanceToDest < 25) {
                updateNavigationInstruction(leg.steps[leg.steps.length - 1], true);
                setTimeout(endLiveNavigation, 5000); // End nav after 5s
             }
             return;
        }
        
        const nextManeuverPoint = turf.point(nextStep.maneuver.location);
        const distanceToNextManeuver = turf.distance(userPoint, nextManeuverPoint, { units: 'meters' });

        if (distanceToNextManeuver < 30) { // Within 30 meters of the next turn
            appState.currentStepIndex++;
            updateNavigationInstruction(leg.steps[appState.currentStepIndex]);
        } else {
            // Update the distance in the sub-instruction
            dom.subInstruction.textContent = `In ${formatDistance(distanceToNextManeuver)}, ${nextStep.maneuver.instruction}`;
        }
    };

    const updateNavigationInstruction = (step, isArriving = false) => {
        if (isArriving) {
            dom.navigationInstruction.innerHTML = `You have arrived`;
            dom.subInstruction.textContent = `at ${appState.endPoint.name}`;
        } else {
            dom.navigationInstruction.innerHTML = step.maneuver.instruction;
            const nextStep = appState.currentRoute.legs[0].steps[appState.currentStepIndex + 1];
            if(nextStep){
                 dom.subInstruction.textContent = `Then, ${nextStep.maneuver.instruction}`;
            } else {
                 dom.subInstruction.textContent = `You will arrive at your destination.`;
            }
        }
    };
    
    const handleNavigationError = (error) => {
        console.error("Geolocation Error:", error);
        alert("Could not get your location. Please enable location services.");
        endLiveNavigation();
    };

    // --- EVENT LISTENERS ---

    dom.getRouteBtn.addEventListener('click', fetchRoute);
    
    dom.startNavBtn.addEventListener('click', startLiveNavigation);
    
    dom.endNavigationBtn.addEventListener('click', endLiveNavigation);

    dom.exitRouteBtn.addEventListener('click', () => {
        showPanelContent('directions-panel-redesign');
        clearRoute();
    });
    
    dom.useMyLocationBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { longitude, latitude } = position.coords;
                appState.userLocation = [longitude, latitude];
                appState.startPoint = {
                    lon: longitude,
                    lat: latitude,
                    name: "Your Location",
                    isUserLocation: true
                };
                dom.getFromInput.value = "Your Location";
                dom.getFromInput.style.fontWeight = 'bold';
            }, handleNavigationError);
        }
    });

    // TODO: Add event listeners for search, settings, profile, etc.
    // Example for setting destination from a search result
    // This needs to be hooked up to your actual search implementation
    const onSearchResultClick = (result) => {
        appState.endPoint = {
            lon: result.lon,
            lat: result.lat,
            name: result.display_name,
            isUserLocation: false
        };
        dom.getToInput.value = result.display_name.split(',')[0];
        showPanelContent('directions-panel-redesign');
    };
    
    // Wire up inputs to set state (simplified)
    dom.getFromInput.addEventListener('change', (e) => {
        // In a real app, you'd geocode this value
        // For now, we clear the 'Your Location' state if user types something else
        if(e.target.value !== "Your Location") {
            appState.startPoint.isUserLocation = false;
        }
    });


    // Initialize the map with user's location
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    }));
});
