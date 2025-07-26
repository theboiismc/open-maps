document.addEventListener('DOMContentLoaded', () => {

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // --- START: AUTHENTICATION UI LOGIC ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const savedPlacesBtn = document.getElementById('saved-places-btn');
    let isLoggedIn = false;
    const updateAuthUI = () => {
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
    };
    profileButton.addEventListener('click', (e) => {
        const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
        profileDropdown.style.display = isHidden ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });
    loginBtn.addEventListener('click', (e) => { e.preventDefault(); alert("Redirecting to login page... (Simulation)"); isLoggedIn = true; updateAuthUI(); profileDropdown.style.display = 'none'; });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); alert("Redirecting to sign-up page... (Simulation)"); profileDropdown.style.display = 'none'; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); isLoggedIn = false; updateAuthUI(); profileDropdown.style.display = 'none'; alert("You have been logged out. (Simulation)"); });
    savedPlacesBtn.addEventListener('click', (e) => { e.preventDefault(); alert("Feature 'Saved Places' not yet implemented!"); profileDropdown.style.display = 'none'; });
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
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');

    let currentPlace = null;
    let currentStyle = 'default';

    // --- START: NAVIGATION STATE & UI ---
    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    
    let userLocationMarker = null;
    let navigationWatcherId = null;
    let currentRouteData = null; // To store the full OSRM route object
    let upcomingStepIndex = 0;
    let isNavigating = false;
    let isRerouting = false;

    // Web Speech API for voice guidance
    const speech = {
        synthesis: window.speechSynthesis,
        utterance: new SpeechSynthesisUtterance(),
        speak(text) {
            if (this.synthesis.speaking) {
                this.synthesis.cancel(); // Cancel current speech to speak the new one
            }
            if (text) {
                this.utterance.text = text;
                this.synthesis.speak(this.utterance);
            }
        }
    };
    // --- END: NAVIGATION STATE & UI ---

    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => {
            document.getElementById(id).hidden = id !== viewId;
        });
        if (!sidePanel.classList.contains('open')) {
            if (isMobile) {
                if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek');
            } else {
                sidePanel.classList.add('open');
                moveSearchBarToPanel();
            }
        }
    }

    function closePanel() {
        if (isMobile) { sidePanel.classList.remove('open', 'peek'); }
        else { sidePanel.classList.remove('open'); moveSearchBarToTop(); }
    }
    closePanelBtn.addEventListener('click', closePanel);
    map.on('click', (e) => {
        const targetClasses = e.originalEvent.target.classList;
        if (!targetClasses.contains('maplibregl-ctrl-icon') && !targetClasses.contains('mapboxgl-ctrl-icon')) {
            closePanel();
        }
    });

    function debounce(func, delay) { let timeout; return function(...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; }

    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (!query) { suggestionsEl.style.display = "none"; return; }
            const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
            try {
                const res = await fetch(url); const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.forEach(item => {
                    const el = document.createElement("div"); el.className = "search-result"; el.textContent = item.display_name;
                    el.addEventListener("click", () => onSelect(item));
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.length > 0 ? "block" : "none";
            } catch (e) { console.error("Suggestion fetch failed", e); }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim(); if (!query) return;
        const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url); const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else alert("No results found for your search.");
        } catch (e) { alert("Search failed. Please check your connection."); }
    }

    const mainSuggestions = document.getElementById("main-suggestions");
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });

    const fromInput = document.getElementById('panel-from-input'), fromSuggestions = document.getElementById('panel-from-suggestions');
    attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });

    const toInput = document.getElementById('panel-to-input'), toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        currentPlace = place;
        stopNavigation(); // Stop any active navigation when searching for a new place
        if (map.getLayer('route-line')) { map.removeLayer('route-line'); }
        if (map.getSource('route')) { map.removeSource('route'); }
        map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
        document.getElementById('info-name').textContent = place.display_name.split(',')[0];
        document.getElementById('info-address').textContent = place.display_name;
        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query, lon, lat) { /* ... (no changes) ... */ }
    function getWeatherDescription(code) { /* ... (no changes) ... */ }
    async function fetchAndSetWeather(lat, lon) { /* ... (no changes) ... */ }
    async function fetchAndSetQuickFacts(query) { /* ... (no changes) ... */ }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = ''; fromInput.dataset.coords = '';
        } else {
            toInput.value = mainSearchInput.value; toInput.dataset.coords = '';
            fromInput.value = ''; fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => { if (isLoggedIn) { alert("Feature 'Save Place' not yet implemented!"); } else { alert("Please log in to save places."); } });
    document.getElementById('swap-btn').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => { navigator.geolocation.getCurrentPosition(pos => { fromInput.value = "Your Location"; fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`; }, () => alert("Could not get your location.")); });
    document.getElementById('back-to-info-btn').addEventListener('click', () => { if (currentPlace) showPanel('info-panel-redesign'); });
    document.getElementById('exit-route-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`);
        const data = await res.json();
        if (!data[0]) throw new Error(`Could not find location: ${inputEl.value}`);
        inputEl.value = data[0].display_name;
        inputEl.dataset.coords = `${data[0].lon},${data[0].lat}`;
        return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) { map.getSource('route').setData(routeGeoJSON); }
        else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0d89ec', 'line-width': 6 } });
        }
    }
    
    async function getRouteAndNavigate() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.routes || data.routes.length === 0) return alert("No route found.");
            
            currentRouteData = data; // Store the full route data
            const routeGeoJSON = { type: 'Feature', geometry: data.routes[0].geometry };
            
            addRouteToMap(routeGeoJSON);

            const bounds = new maplibregl.LngLatBounds();
            routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
            map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });

            // Hide side panel and start navigation
            closePanel();
            startNavigation();

        } catch (err) { alert(`Error getting route: ${err.message}`); isRerouting = false; }
    }
    
    document.getElementById('get-route-btn').addEventListener('click', getRouteAndNavigate);

    // --- START: NAVIGATION CORE FUNCTIONS ---

    function startNavigation() {
        if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");
        
        isNavigating = true;
        upcomingStepIndex = 0;
        navigationStatusPanel.style.display = 'flex';
        updateNavigationInstruction();

        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }

        navigationWatcherId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            handlePositionError,
            { enableHighAccuracy: true }
        );
        endNavigationBtn.addEventListener('click', stopNavigation);
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        
        isNavigating = false;
        navigationWatcherId = null;
        currentRouteData = null;
        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel(); // Stop any ongoing speech
        
        // Optionally, remove the route line from the map
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

    async function handlePositionUpdate(position) {
        if (!isNavigating || !currentRouteData) return;

        const { latitude, longitude, heading } = position.coords;
        const userLngLat = [longitude, latitude];

        userLocationMarker.setLngLat(userLngLat);
        if (heading != null) {
             userLocationMarker.setRotation(heading);
        }
        map.flyTo({ center: userLngLat, zoom: Math.max(map.getZoom(), 17), bearing: heading || map.getBearing() });

        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const userPoint = turf.point(userLngLat);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
        
        // 1. Check for off-route
        if (snapped.properties.dist > 50 && !isRerouting) { // 50 meters tolerance
            console.log("User is off-route. Rerouting...");
            isRerouting = true; // Set flag to prevent spamming
            speech.speak("Recalculating route.");
            fromInput.value = "Your Location";
            fromInput.dataset.coords = userLngLat.join(',');
            await getRouteAndNavigate();
            isRerouting = false; // Reset flag after rerouting attempt
            return;
        }

        // 2. Check for upcoming maneuver
        const steps = currentRouteData.routes[0].legs[0].steps;
        if (upcomingStepIndex >= steps.length) {
            // Reached destination
            if (turf.distance(userPoint, turf.point(steps[steps.length-1].maneuver.location)) < 50) {
                 speech.speak("You have arrived at your destination.");
                 stopNavigation();
            }
            return;
        }

        const nextManeuver = steps[upcomingStepIndex].maneuver;
        const distanceToManeuver = turf.distance(userPoint, turf.point(nextManeuver.location), { units: 'meters' });

        // Announce turn when user is within 80 meters
        if (distanceToManeuver < 80) {
            speech.speak(nextManeuver.instruction);
            upcomingStepIndex++;
            updateNavigationInstruction();
        }
    }
    // --- END: NAVIGATION CORE FUNCTIONS ---


    // --- START: SETTINGS MENU LOGIC (FIXED) ---
    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');

    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }

    settingsBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isMobile && settingsMenu.classList.contains('open')) { closeSettings(); }
            else { openSettings(); }
        });
    });
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => { if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) { closeSettings(); } });

    styleRadioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            const newStyle = radio.value;
            if (newStyle !== currentStyle) { currentStyle = newStyle; map.setStyle(STYLES[currentStyle]); }
            if (isMobile) { setTimeout(closeSettings, 200); }
        });
    });
    document.querySelectorAll('input[name="map-units"]').forEach(radio => {
        radio.addEventListener('change', () => {
            alert(`Unit selection ('${radio.value}') is not implemented yet.`);
             if (isMobile) { setTimeout(closeSettings, 200); }
        });
    });
    // --- END: SETTINGS MENU LOGIC ---
    
    map.on('styledata', () => {
        if (isNavigating && currentRouteData) {
            const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
            addRouteToMap(routeGeoJSON);
        }
    });

    if (isMobile) {
        const grabber = document.getElementById("panel-grabber");
        let startY;
        grabber.addEventListener('touchstart', (e) => { startY = e.touches[0].pageY; sidePanel.style.transition = 'none'; }, { passive: true });
        grabber.addEventListener('touchmove', (e) => {
            if (startY === undefined) return;
            const currentY = e.touches[0].pageY;
            let newBottom = (parseInt(getComputedStyle(sidePanel).bottom, 10) || 0) + (startY - currentY);
            if (newBottom > 0) newBottom = 0;
            sidePanel.style.bottom = `${newBottom}px`;
            startY = currentY;
        }, { passive: true });
        grabber.addEventListener('touchend', () => {
            if (startY === undefined) return;
            startY = undefined;
            sidePanel.style.transition = '';
            const currentBottom = parseInt(sidePanel.style.bottom, 10);
            const panelHeight = sidePanel.clientHeight;
            const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
            if (currentBottom > (-1 * panelHeight) / 2) {
                sidePanel.classList.remove('peek');
                sidePanel.classList.add('open');
            } else {
                sidePanel.classList.remove('open', 'peek');
            }
            sidePanel.style.bottom = '';
        });
    }

    updateAuthUI();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered!', reg), err => console.log('SW registration failed: ', err));
      });
    }
});
