document.addEventListener('DOMContentLoaded', () => {
    // --- MAP INITIALIZATION ---
    // This style URL is from your original code's Content Security Policy.
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/osm-bright/style.json',
        center: [-98.5795, 39.8283],
        zoom: 3,
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
        debounceTimer: null,
    };
    const YOUR_LOCATION_TEXT = "Your Location";

    // --- DOM ELEMENT CACHING ---
    const mainSearchInput = document.getElementById('main-search');
    const mainSuggestions = document.getElementById('main-suggestions');
    const fromInput = document.getElementById('panel-from-input');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');

    const sidePanel = document.getElementById('side-panel');
    const mainDirectionsIcon = document.getElementById('main-directions-icon');
    const directionsPanel = document.getElementById('directions-panel-redesign');
    const infoPanel = document.getElementById('info-panel-redesign');
    const routeSection = document.getElementById('route-section');

    const useMyLocationBtn = document.getElementById('dir-use-my-location');
    const getRouteBtn = document.getElementById('get-route-btn');
    const swapBtn = document.getElementById('swap-btn');
    const exitRouteBtn = document.getElementById('exit-route-btn');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    
    const routeSummary = document.getElementById('route-summary');
    const routeStepsList = document.getElementById('route-steps');
    const navigationStatus = document.getElementById('navigation-status');
    const navigationInstruction = document.getElementById('navigation-instruction');

    // --- EVENT LISTENERS ---
    mainSearchInput.addEventListener('input', (e) => onDebouncedInput(e, mainSuggestions));
    fromInput.addEventListener('input', (e) => onDebouncedInput(e, fromSuggestions, fromInput));
    toInput.addEventListener('input', (e) => onDebouncedInput(e, toSuggestions, toInput));

    mainDirectionsIcon.addEventListener('click', showDirectionsPanel);
    useMyLocationBtn.addEventListener('click', setFromToMyLocation);
    swapBtn.addEventListener('click', swapDirections);
    getRouteBtn.addEventListener('click', handleGetRoute);
    exitRouteBtn.addEventListener('click', exitRouteView);
    endNavigationBtn.addEventListener('click', endNavigation);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.suggestions-dropdown, input')) {
            hideAllSuggestions();
        }
    });

    // --- SEARCH & SUGGESTIONS ---
    function onDebouncedInput(event, suggestionsContainer, inputElement = null) {
        clearTimeout(appState.debounceTimer);
        appState.debounceTimer = setTimeout(() => {
            const query = event.target.value;
            if (query.length < 3) {
                suggestionsContainer.style.display = 'none';
                return;
            }
            fetchAndDisplaySuggestions(query, suggestionsContainer, inputElement);
        }, 300);
    }

    async function fetchAndDisplaySuggestions(query, container, inputElement) {
        const results = await geocode(query, 5);
        container.innerHTML = '';
        if (results && results.length > 0) {
            results.forEach(result => {
                const div = document.createElement('div');
                div.className = 'search-result';
                div.textContent = result.display_name;
                div.onclick = () => onSuggestionClick(result, container, inputElement);
                container.appendChild(div);
            });
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }
    
    function onSuggestionClick(result, container, inputElement) {
        const coords = [parseFloat(result.lon), parseFloat(result.lat)];
        const displayName = result.display_name;
        container.style.display = 'none';
        container.innerHTML = '';
        
        if (inputElement) { // We are in the directions panel
            inputElement.value = displayName;
            if (inputElement.id === 'panel-from-input') {
                appState.fromCoords = coords;
            } else {
                appState.toCoords = coords;
            }
        } else { // We are in the main search bar
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

    // --- DIRECTIONS & ROUTING ---
    function showDirectionsPanel() {
        infoPanel.hidden = true;
        routeSection.hidden = true;
        directionsPanel.hidden = false;
        sidePanel.classList.add('open');
        if (mainSearchInput.value && appState.currentMarker) {
            toInput.value = mainSearchInput.value;
            appState.toCoords = appState.currentMarker.getLngLat().toArray();
        }
    }
    
    function setFromToMyLocation() {
        fromInput.value = YOUR_LOCATION_TEXT;
        appState.fromCoords = null;
    }
    
    function swapDirections() {
        [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
        [appState.fromCoords, appState.toCoords] = [appState.toCoords, appState.fromCoords];
    }
    
    async function handleGetRoute() {
        const startQuery = fromInput.value.trim();
        const endQuery = toInput.value.trim();
        if (!startQuery || !endQuery) return alert("Please set a start and end point.");

        getRouteBtn.disabled = true;
        getRouteBtn.textContent = "Calculating...";

        try {
            let startCoords, endCoords;

            if (startQuery === YOUR_LOCATION_TEXT) {
                startCoords = await getUserLocation();
            } else {
                // Use stored coords if available, otherwise geocode
                startCoords = appState.fromCoords || (await geocode(startQuery, 1))[0].coords;
            }

            endCoords = appState.toCoords || (await geocode(endQuery, 1))[0].coords;
            
            // **THE BUG FIX IS HERE**: Robustly check if coordinates were found
            if (!startCoords) throw new Error(`Could not find location: "${startQuery}"`);
            if (!endCoords) throw new Error(`Could not find location: "${endQuery}"`);

            const routeData = await fetchRoute(startCoords, endCoords);
            if (!routeData || routeData.routes.length === 0) throw new Error("Could not find a route.");

            if (startQuery === YOUR_LOCATION_TEXT) {
                initializeNavigationMode(routeData);
            } else {
                initializePlanningMode(routeData);
            }
        } catch (error) {
            alert(error.message);
            console.error("Routing Error:", error);
        } finally {
            getRouteBtn.disabled = false;
            getRouteBtn.textContent = "Get Route";
        }
    }

    function initializePlanningMode(data) {
        const route = data.routes[0];
        displayRouteDetails(route);
        directionsPanel.hidden = true;
        routeSection.hidden = false;
        sidePanel.classList.add('open');
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 450, right: 50 } });
    }

    function initializeNavigationMode(data) {
        const route = data.routes[0];
        displayRouteDetails(route); // Still useful to have the data
        navigationInstruction.textContent = route.legs[0].steps[0].maneuver.instruction;
        sidePanel.classList.remove('open');
        navigationStatus.style.display = 'flex';
        const bounds = turf.bbox(turf.feature(route.geometry));
        map.fitBounds(bounds, { padding: { top: 150, bottom: 50, left: 50, right: 50 } });
    }

    function displayRouteDetails(route) {
        clearRouteFromMap();
        drawRouteOnMap(route.geometry);
        const leg = route.legs[0];
        routeSummary.textContent = `Distance: ${(leg.distance / 1609.34).toFixed(1)} mi, Duration: ${Math.round(leg.duration / 60)} min`;
        routeStepsList.innerHTML = '';
        leg.steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step.maneuver.instruction;
            routeStepsList.appendChild(li);
        });
    }

    function exitRouteView() {
        clearRouteFromMap();
        routeSection.hidden = true;
        directionsPanel.hidden = false;
    }

    function endNavigation() {
        clearRouteFromMap();
        navigationStatus.style.display = 'none';
    }

    // --- MAP & API UTILITIES ---
    function flyToLocation(coords) {
        map.flyTo({ center: coords, zoom: 14, speed: 1.5 });
    }

    function showLocationMarker(coords) {
        if (appState.currentMarker) appState.currentMarker.remove();
        appState.currentMarker = new maplibregl.Marker({ color: '#D83025' }).setLngLat(coords).addTo(map);
    }
    
    function drawRouteOnMap(geometry) {
        if (map.getSource('route')) {
            map.getSource('route').setData({ type: 'Feature', geometry: geometry });
        } else {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: geometry }});
            map.addLayer({
                id: 'route', type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#00796b', 'line-width': 6, 'line-opacity': 0.8 }
            });
        }
    }

    function clearRouteFromMap() {
        if (map.getLayer('route')) map.removeLayer('route');
        if (map.getSource('route')) map.removeSource('route');
    }

    async function geocode(query, limit = 1) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network response was not ok.");
            const data = await response.json();
            // This is the fix: return full data for suggestions, and wrap single result in an array.
            return data.map(item => ({...item, coords: [parseFloat(item.lon), parseFloat(item.lat)] }));
        } catch (error) {
            console.error("Geocoding error:", error);
            return null;
        }
    }

    function getUserLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Geolocation is not supported."));
            navigator.geolocation.getCurrentPosition(
                pos => resolve([pos.coords.longitude, pos.coords.latitude]),
                () => reject(new Error("Unable to retrieve your location."))
            );
        });
    }

    async function fetchRoute(start, end) {
        const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?steps=true&geometries=geojson&overview=full`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch route.");
        return await response.json();
    }
});
