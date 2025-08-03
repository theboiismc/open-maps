document.addEventListener('DOMContentLoaded', () => {
    // --- MAP INITIALIZATION ---
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/osm-bright/style.json',
        center: [-98.5795, 39.8283],
        zoom: 3
    });

    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
    }));

    // --- STATE & CONSTANTS ---
    let appState = {
        fromCoords: null,
        toCoords: null,
        currentMarker: null,
        debounceTimer: null
    };
    const YOUR_LOCATION_TEXT = "Your Location";

    // --- DOM ELEMENTS ---
    const mainSearchInput = document.getElementById('main-search');
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const mainSuggestions = document.getElementById('main-suggestions');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    const toSuggestions = document.getElementById('panel-to-suggestions');
    const mainDirectionsIcon = document.getElementById('main-directions-icon');
    const sidePanel = document.getElementById('side-panel');
    const directionsPanel = document.getElementById('directions-panel-redesign');
    const getRouteBtn = document.getElementById('get-route-btn');
    const useMyLocationBtn = document.getElementById('dir-use-my-location');
    const routeSection = document.getElementById('route-section');
    const routeStepsList = document.getElementById('route-steps');
    const routeSummary = document.getElementById('route-summary');
    const exitRouteBtn = document.getElementById('exit-route-btn');
    const navigationStatus = document.getElementById('navigation-status');
    const navigationInstruction = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const swapBtn = document.getElementById('swap-btn');

    // --- EVENT LISTENERS ---

    // Search input listeners
    mainSearchInput.addEventListener('input', (e) => handleSearchInput(e, mainSuggestions));
    fromInput.addEventListener('input', (e) => handleSearchInput(e, fromSuggestions, 'from'));
    toInput.addEventListener('input', (e) => handleSearchInput(e, toSuggestions, 'to'));

    // UI interaction listeners
    mainDirectionsIcon.addEventListener('click', showDirectionsPanel);
    useMyLocationBtn.addEventListener('click', setFromToMyLocation);
    getRouteBtn.addEventListener('click', handleGetRoute);
    exitRouteBtn.addEventListener('click', exitRouteView);
    endNavigationBtn.addEventListener('click', endNavigation);
    swapBtn.addEventListener('click', swapDirections);

    // Close suggestions when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.suggestions-dropdown') && !e.target.closest('input[type="text"]')) {
            hideAllSuggestions();
        }
    });

    // --- SEARCH & SUGGESTIONS LOGIC ---

    function handleSearchInput(event, suggestionsContainer, type = null) {
        const query = event.target.value;
        clearTimeout(appState.debounceTimer);
        appState.debounceTimer = setTimeout(() => {
            if (query.length < 3) {
                suggestionsContainer.style.display = 'none';
                return;
            }
            fetchSuggestions(query, suggestionsContainer, type);
        }, 300); // Debounce for 300ms
    }

    async function fetchSuggestions(query, container, type) {
        const results = await geocodeAddress(query, 5); // Get up to 5 results
        if (results) {
            container.innerHTML = '';
            results.forEach(result => {
                const div = document.createElement('div');
                div.className = 'search-result';
                div.textContent = result.display_name;
                div.onclick = () => selectSuggestion(result, container, type);
                container.appendChild(div);
            });
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    function selectSuggestion(result, container, type) {
        const coords = [parseFloat(result.lon), parseFloat(result.lat)];
        const displayName = result.display_name;
        container.style.display = 'none';

        if (type === 'from') {
            fromInput.value = displayName;
            appState.fromCoords = coords;
        } else if (type === 'to') {
            toInput.value = displayName;
            appState.toCoords = coords;
        } else {
            // Main search bar case
            mainSearchInput.value = displayName;
            flyToLocation(coords);
            showLocationMarker(coords);
        }
    }

    function hideAllSuggestions() {
        mainSuggestions.style.display = 'none';
        fromSuggestions.style.display = 'none';
        toSuggestions.style.display = 'none';
    }

    // --- ROUTING & NAVIGATION LOGIC ---

    function showDirectionsPanel() {
        directionsPanel.hidden = false;
        routeSection.hidden = true;
        sidePanel.classList.add('open');
        // Pre-fill destination from main search if a location is selected
        if (mainSearchInput.value && appState.currentMarker) {
            toInput.value = mainSearchInput.value;
            appState.toCoords = appState.currentMarker.getLngLat().toArray();
        }
    }

    function setFromToMyLocation() {
        fromInput.value = YOUR_LOCATION_TEXT;
        appState.fromCoords = null; // Mark as "to be determined"
    }

    async function handleGetRoute() {
        hideAllSuggestions();
        const startQuery = fromInput.value.trim();
        const endQuery = toInput.value.trim();

        if (!startQuery || !endQuery) {
            alert("Please provide a starting point and a destination.");
            return;
        }

        getRouteBtn.disabled = true;
        getRouteBtn.textContent = "Calculating...";

        try {
            let startCoords;
            const isNavigatingFromCurrent = (startQuery === YOUR_LOCATION_TEXT);
            
            // Resolve 'To' coordinates first
            if (!appState.toCoords) appState.toCoords = (await geocodeAddress(endQuery))[0].coords;
            if (!appState.toCoords) throw new Error(`Could not find destination: ${endQuery}`);

            // Resolve 'From' coordinates
            if (isNavigatingFromCurrent) {
                startCoords = await getUserLocation();
            } else {
                if (!appState.fromCoords) appState.fromCoords = (await geocodeAddress(startQuery))[0].coords;
                startCoords = appState.fromCoords;
            }
            if (!startCoords) throw new Error(`Could not find starting point: ${startQuery}`);

            const routeData = await fetchRoute(startCoords, appState.toCoords);
            if (!routeData || routeData.routes.length === 0) {
                throw new Error("Could not find a route.");
            }
            
            if (isNavigatingFromCurrent) {
                initializeNavigationMode(routeData);
            } else {
                initializePlanningMode(routeData);
            }

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            getRouteBtn.disabled = false;
            getRouteBtn.textContent = "Get Route";
        }
    }
    
    function initializePlanningMode(data) {
        const route = data.routes[0];
        drawRouteOnMap(route.geometry);
        displayRouteSteps(route);
        directionsPanel.hidden = true;
        routeSection.hidden = false;
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 450, right: 50 }});
    }

    function initializeNavigationMode(data) {
        const route = data.routes[0];
        drawRouteOnMap(route.geometry);
        navigationInstruction.textContent = route.legs[0].steps[0].maneuver.instruction;
        sidePanel.classList.remove('open');
        navigationStatus.style.display = 'flex';
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: { top: 150, bottom: 50, left: 50, right: 50 }});
    }

    function endNavigation() {
        navigationStatus.style.display = 'none';
        clearRouteFromMap();
        showLocationMarker(null); // Clear marker
    }

    function exitRouteView() {
        routeSection.hidden = true;
        directionsPanel.hidden = false;
        clearRouteFromMap();
    }
    
    function swapDirections() {
        // Swap input values
        const tempValue = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = tempValue;
        
        // Swap stored coordinates
        const tempCoords = appState.fromCoords;
        appState.fromCoords = appState.toCoords;
        appState.toCoords = tempCoords;
    }

    function displayRouteSteps(route) {
        const leg = route.legs[0];
        routeSummary.textContent = `Distance: ${(leg.distance / 1000).toFixed(1)} km, Duration: ${Math.round(leg.duration / 60)} min`;
        routeStepsList.innerHTML = '';
        leg.steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step.maneuver.instruction;
            routeStepsList.appendChild(li);
        });
    }

    // --- MAP UTILITY FUNCTIONS ---

    function flyToLocation(coords) {
        map.flyTo({
            center: coords,
            zoom: 14,
            speed: 1.5
        });
    }

    function showLocationMarker(coords) {
        if (appState.currentMarker) {
            appState.currentMarker.remove();
        }
        if (coords) {
            appState.currentMarker = new maplibregl.Marker({ color: '#D83025' })
                .setLngLat(coords)
                .addTo(map);
        }
    }

    function drawRouteOnMap(geometry) {
        clearRouteFromMap();
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: geometry }});
        map.addLayer({
            id: 'route', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00796b', 'line-width': 6, 'line-opacity': 0.8 }
        });
    }
    
    function clearRouteFromMap() {
        if (map.getLayer('route')) map.removeLayer('route');
        if (map.getSource('route')) map.removeSource('route');
    }

    // --- API UTILITY FUNCTIONS ---

    async function geocodeAddress(query, limit = 1) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.length > 0) {
                // Return full data for suggestions, or just coords for single geocode
                return limit > 1 ? data : [{ display_name: data[0].display_name, coords: [parseFloat(data[0].lon), parseFloat(data[0].lat)] }];
            }
            return null;
        } catch (error) { console.error("Geocoding error:", error); return null; }
    }

    function getUserLocation() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                pos => resolve([pos.coords.longitude, pos.coords.latitude]),
                () => reject("Unable to retrieve location.")
            );
        });
    }

    async function fetchRoute(startCoords, endCoords) {
        const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.join(',')};${endCoords.join(',')}?steps=true&geometries=geojson&overview=full`;
        try {
            const response = await fetch(url);
            return await response.json();
        } catch (error) { console.error("Routing error:", error); return null; }
    }
});```
