document.addEventListener('DOMContentLoaded', () => {
    // --- MAP INITIALIZATION ---
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/osm-bright/style.json',
        center: [-98.5795, 39.8283], // Center of the US
        zoom: 3
    });

    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
    }));

    // --- STATE MANAGEMENT ---
    let navigationState = {
        active: false,
        routeData: null,
    };
    // Special constant to identify when user selects their location
    const YOUR_LOCATION_TEXT = "Your Location";

    // --- DOM ELEMENTS ---
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const getRouteBtn = document.getElementById('get-route-btn');
    const sidePanel = document.getElementById('side-panel');
    const directionsPanel = document.getElementById('directions-panel-redesign');
    const routeSection = document.getElementById('route-section');
    const routeStepsList = document.getElementById('route-steps');
    const exitRouteBtn = document.getElementById('exit-route-btn');
    const useMyLocationBtn = document.getElementById('dir-use-my-location');
    const navigationStatus = document.getElementById('navigation-status');
    const navigationInstruction = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const mainDirectionsIcon = document.getElementById('main-directions-icon');

    // --- EVENT LISTENERS ---
    
    // Show directions panel when directions icon is clicked
    mainDirectionsIcon.addEventListener('click', () => {
        sidePanel.classList.add('open');
        // Pre-fill destination if a place was selected (future enhancement)
    });

    // Main "Get Route" button logic
    getRouteBtn.addEventListener('click', handleGetRoute);
    
    // Button to exit route steps and return to input fields
    exitRouteBtn.addEventListener('click', () => {
        routeSection.hidden = true;
        directionsPanel.hidden = false;
        clearRouteFromMap();
    });

    // Button to fill the 'from' input with "Your Location"
    useMyLocationBtn.addEventListener('click', () => {
        fromInput.value = YOUR_LOCATION_TEXT;
    });
    
    // Button to end an active navigation session
    endNavigationBtn.addEventListener('click', endNavigation);


    // --- CORE FUNCTIONS ---

    /**
     * Main handler for the "Get Route" button.
     * Determines whether to start Planning Mode or Navigation Mode.
     */
    async function handleGetRoute() {
        const startQuery = fromInput.value.trim();
        const endQuery = toInput.value.trim();

        if (!startQuery || !endQuery) {
            alert("Please enter a starting point and a destination.");
            return;
        }

        getRouteBtn.disabled = true;
        getRouteBtn.textContent = "Calculating...";

        try {
            let startCoords, endCoords;
            const isNavigatingFromCurrent = (startQuery === YOUR_LOCATION_TEXT);
            
            // Get coordinates for start and end points
            endCoords = await geocodeAddress(endQuery);
            if (!endCoords) throw new Error(`Could not find location: ${endQuery}`);

            if (isNavigatingFromCurrent) {
                startCoords = await getUserLocation();
                if (!startCoords) throw new Error("Could not get your current location.");
            } else {
                startCoords = await geocodeAddress(startQuery);
                if (!startCoords) throw new Error(`Could not find location: ${startQuery}`);
            }

            // Fetch the route data from OSRM
            const routeData = await fetchRoute(startCoords, endCoords);
            if (!routeData || routeData.routes.length === 0) {
                throw new Error("Could not find a route between these locations.");
            }

            // Fork logic based on whether we are navigating or planning
            if (isNavigatingFromCurrent) {
                initializeNavigationMode(routeData);
            } else {
                initializePlanningMode(routeData);
            }

        } catch (error) {
            alert(`Error: ${error.message}`);
            console.error(error);
        } finally {
            getRouteBtn.disabled = false;
            getRouteBtn.textContent = "Get Route";
        }
    }

    /**
     * Enters PLANNING mode. Displays route and step-by-step list in the side panel.
     */
    function initializePlanningMode(routeData) {
        const route = routeData.routes[0];
        console.log("Entering Planning Mode.", route);

        drawRouteOnMap(route.geometry);
        
        // Populate the route steps list
        routeStepsList.innerHTML = ''; // Clear previous steps
        const steps = route.legs[0].steps;
        steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step.maneuver.instruction;
            routeStepsList.appendChild(li);
        });

        // Show the route steps panel
        directionsPanel.hidden = true;
        routeSection.hidden = false;

        // Fit map to the route
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: 50 });
    }

    /**
     * Enters NAVIGATION mode. Hides panel, shows top navigation bar with first instruction.
     */
    function initializeNavigationMode(routeData) {
        const route = routeData.routes[0];
        console.log("Entering Navigation Mode.", route);
        
        navigationState.active = true;
        navigationState.routeData = routeData;

        drawRouteOnMap(route.geometry);

        // **FIX**: Show the FIRST instruction, not "You have arrived".
        const firstStep = route.legs[0].steps[0].maneuver.instruction;
        navigationInstruction.textContent = firstStep;
        
        // Hide the side panel and show the top navigation bar
        sidePanel.classList.remove('open');
        navigationStatus.style.display = 'flex';
        
        // Fit map to the route to start
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: { top: 150, bottom: 50, left: 50, right: 50 } });

        // In a real app, you would now start a geolocation watchPosition()
        // to track the user's progress along navigationState.routeData.
    }
    
    /**
     * Ends the active navigation session and resets the UI.
     */
    function endNavigation() {
        navigationState.active = false;
        navigationState.routeData = null;

        navigationStatus.style.display = 'none';
        clearRouteFromMap();
        
        // Show the main search bar again (optional)
        // document.getElementById('top-search-wrapper').style.display = 'block';
        console.log("Navigation ended.");
    }


    // --- API & MAP UTILITY FUNCTIONS ---

    /**
     * Converts an address string to [lng, lat] coordinates using Nominatim.
     */
    async function geocodeAddress(query) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.length > 0) {
                return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
            }
            return null;
        } catch (error) {
            console.error("Geocoding error:", error);
            return null;
        }
    }

    /**
     * Gets the user's current GPS location as [lng, lat].
     */
    function getUserLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                return reject("Geolocation is not supported by your browser.");
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve([position.coords.longitude, position.coords.latitude]);
                },
                () => {
                    reject("Unable to retrieve your location.");
                }
            );
        });
    }

    /**
     * Fetches route data from Project OSRM.
     */
    async function fetchRoute(startCoords, endCoords) {
        const coordsString = `${startCoords.join(',')};${endCoords.join(',')}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?steps=true&geometries=geojson&overview=full`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Routing error:", error);
            return null;
        }
    }

    /**
     * Clears any existing route from the map.
     */
    function clearRouteFromMap() {
        if (map.getLayer('route')) {
            map.removeLayer('route');
        }
        if (map.getSource('route')) {
            map.removeSource('route');
        }
    }

    /**
     * Draws a route geometry on the map.
     */
    function drawRouteOnMap(geometry) {
        clearRouteFromMap(); // Clear old route first

        map.addSource('route', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': geometry
            }
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
                'line-width': 6,
                'line-opacity': 0.8
            }
        });
    }
});
