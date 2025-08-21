// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    automaticSilentRenew: true,
};
const userManager = new oidc.UserManager(authConfig);
const authService = {
    async login() { return userManager.signinRedirect(); },
    async logout() { return userManager.signoutRedirect(); },
    async getUser() { return userManager.getUser(); },
    async handleCallback() { return userManager.signinRedirectCallback(); }
};

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTHENTICATION CHECK & UI UPDATE ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    let currentUser = null;

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        loggedInView.hidden = !currentUser;
        loggedOutView.hidden = currentUser;
        if (currentUser) {
            loggedInView.querySelector('.username').textContent = currentUser.profile.name || 'User';
            loggedInView.querySelector('.email').textContent = currentUser.profile.email || '';
        }
    };

    try {
        if (window.location.pathname.endsWith("callback.html")) {
            await authService.handleCallback();
            window.location.href = "/";
        } else {
            const user = await authService.getUser();
            updateAuthUI(user);
        }
    } catch (error) {
        console.error("Authentication process failed:", error);
        updateAuthUI(null);
    }

    profileButton.addEventListener('click', () => { profileDropdown.style.display = profileDropdown.style.display === 'block' ? 'none' : 'block'; });
    document.addEventListener('click', (e) => { if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) { profileDropdown.style.display = 'none'; } });
    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    // --- MAP INITIALIZATION & CONTROLS ---
    const MAPTILER_KEY = 'YOUR_MAPTILER_API_KEY'; // <-- PASTE YOUR KEY HERE

    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
        hybrid: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });
    
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ positionOptions: geolocationOptions, trackUserLocation: true, showUserHeading: true });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());

    // --- GLOBAL VARIABLES & UI ELEMENTS ---
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closeInfoBtn = document.getElementById('close-info-btn');
    
    let currentPlace = null, currentRouteData = null, userLocationMarker = null, navigationWatcherId = null, clickMarker = null;

    const speech = {
        synthesis: window.speechSynthesis,
        utterance: new SpeechSynthesisUtterance(),
        speak(text, priority = false) {
            if (priority && this.synthesis.speaking) this.synthesis.cancel();
            if (!this.synthesis.speaking && text) {
                this.utterance.text = text;
                this.synthesis.speak(this.utterance);
            }
        }
    };

    let navigationState = {};
    function resetNavigationState() {
        navigationState = { isActive: false, isRerouting: false, currentStepIndex: 0, distanceToNextManeuver: Infinity, userSpeed: 0, estimatedArrivalTime: null, totalTripTime: 0, lastAnnouncedDistance: Infinity };
    }
    resetNavigationState();

    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    
    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    let showPanel = (viewId) => {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
        sidePanel.classList.add('open');
        moveSearchBarToPanel();
    }

    let closePanel = () => {
        sidePanel.classList.remove('open');
        moveSearchBarToTop();
    }
    
    closeInfoBtn.addEventListener('click', closePanel);

    map.on('click', async (e) => {
        if (e.originalEvent.target.closest('.maplibregl-ctrl')) return;
        const { lng, lat } = e.lngLat;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.display_name) {
                if (clickMarker) clickMarker.remove();
                clickMarker = new maplibregl.Marker().setLngLat([data.lon, data.lat]).addTo(map);
                processPlaceResult(data);
            }
        } catch (error) {
            console.error("Reverse geocoding failed:", error);
        }
    });

    function debounce(func, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (!query) { suggestionsEl.style.display = "none"; return; }
            const bounds = map.getBounds();
            const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
            const res = await fetch(url);
            const data = await res.json();
            suggestionsEl.innerHTML = "";
            data.forEach(item => {
                const el = document.createElement("div");
                el.className = "search-result";
                el.textContent = item.display_name;
                el.addEventListener("click", () => onSelect(item));
                suggestionsEl.appendChild(el);
            });
            suggestionsEl.style.display = data.length > 0 ? "block" : "none";
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        document.addEventListener('click', (e) => { if (!suggestionsEl.contains(e.target) && e.target !== inputEl) suggestionsEl.style.display = 'none'; });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.length > 0) onSelect(data[0]);
        else alert("No results found.");
    }

    attachSuggestionListener(document.getElementById("main-search"), document.getElementById("main-suggestions"), processPlaceResult);
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });
    
    const fromInput = document.getElementById('panel-from-input');
    attachSuggestionListener(fromInput, document.getElementById('panel-from-suggestions'), (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
    const toInput = document.getElementById('panel-to-input');
    attachSuggestionListener(toInput, document.getElementById('panel-to-suggestions'), (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        if (clickMarker) { clickMarker.remove(); clickMarker = null; }
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();
        map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
        document.getElementById('info-name').textContent = place.display_name.split(',')[0] || 'Selected Location';
        document.getElementById('info-address').textContent = place.display_name;
        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query, lon, lat) {
        const imgEl = document.getElementById('info-image');
        imgEl.src = ''; imgEl.alt = 'Loading image...';
        try {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            if (page.thumbnail && page.thumbnail.source) {
                imgEl.src = page.thumbnail.source;
                imgEl.alt = `Photograph of ${query}`;
                return;
            }
        } catch (e) { console.log("Wikipedia image failed, using fallback."); }
        imgEl.src = `https://render.openstreetmap.org/cgi-bin/export?bbox=${lon-0.005},${lat-0.005},${lon+0.005},${lat+0.005}&scale=10000&format=png`;
        imgEl.alt = `Map view of ${query}`;
    }

    async function fetchAndSetWeather(lat, lon) {
        const el = document.getElementById('info-weather');
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`);
            const data = await res.json();
            const tempF = Math.round(data.current_weather.temperature);
            const desc = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',61:'Rain',80:'Showers',95:'Thunderstorm'}[data.current_weather.weathercode]||'';
            el.textContent = `${tempF}°F, ${desc}`;
        } catch (e) { el.textContent = "Weather unavailable."; }
    }

    async function fetchAndSetQuickFacts(query) {
        const el = document.getElementById('quick-facts-content');
        try {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            el.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found.";
        } catch (e) { el.textContent = "Could not load facts."; }
    }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => alert(currentUser ? "Save feature not implemented." : "Please log in to save places."));
    document.getElementById('swap-btn').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => navigator.geolocation.getCurrentPosition(p => { fromInput.value = "Your Location"; fromInput.dataset.coords = `${p.coords.longitude},${p.coords.latitude}`; }, handlePositionError, geolocationOptions));
    document.getElementById('back-to-info-btn').addEventListener('click', () => showPanel('info-panel-redesign'));
    document.getElementById('back-to-directions-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));

    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
    }
    
    function displayRoutePreview(route) {
        document.getElementById('route-summary-time').textContent = `${Math.round(route.duration / 60)} min`;
        document.getElementById('route-summary-distance').textContent = `${(route.distance / 1609.34).toFixed(1)} mi`;
        showPanel('route-preview-panel');
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        clearRouteFromMap();
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`);
            const data = await res.json();
            if (!data.routes || !data.routes.length) return alert("A route could not be found.");
            currentRouteData = data;
            const route = data.routes[0];
            const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
            addRouteToMap(routeGeoJSON);
            const bounds = routeGeoJSON.geometry.coordinates.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds());
            map.fitBounds(bounds, { padding: fromInput.value.trim() === "Your Location" ? (isMobile ? {top:150, bottom:250, left:50, right:50} : 100) : (isMobile ? 50 : {top:50, bottom:50, left:450, right:50}) });
            if (fromInput.value.trim() === "Your Location") {
                closePanel(); startNavigation();
            } else {
                displayRoutePreview(route);
            }
        } catch (err) { alert(`Error getting route: ${err.message}`); }
    }
    
    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => { clearRouteFromMap(); showPanel('directions-panel-redesign'); });

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`);
        const data = await res.json();
        if (!data[0]) throw new Error(`Could not find: ${inputEl.value}`);
        return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) map.getSource('route').setData(routeGeoJSON);
        else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
        }
    }

    function startNavigation() {
        resetNavigationState();
        navigationState.isActive = true;
        const firstStep = currentRouteData.routes[0].legs[0].steps[0];
        navigationInstructionEl.textContent = firstStep.maneuver.instruction;
        navigationStatusPanel.style.display = 'flex';
        speech.speak(`Starting route. ${firstStep.maneuver.instruction}`, true);
        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }
        map.easeTo({ pitch: 60, zoom: 17 });
        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation);
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        if (clickMarker) { clickMarker.remove(); clickMarker = null; }
        clearRouteFromMap();
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel();
        map.easeTo({ pitch: 0, bearing: 0 });
    }

    function handlePositionError(error) {
        alert(`Geolocation error: ${error.message}.`);
        stopNavigation();
    }

    async function handlePositionUpdate(position) {
        if (!navigationState.isActive) return;
        const { latitude, longitude, heading, speed, accuracy } = position.coords;
        if (accuracy > 80) return;
        const userPoint = turf.point([longitude, latitude]);
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
        userLocationMarker.setLngLat(snapped.geometry.coordinates);
        map.easeTo({ center: snapped.geometry.coordinates, bearing: heading ?? map.getBearing(), zoom: 18, duration: 500 });
        if (snapped.properties.dist > 50) {
            speech.speak("Off route. Recalculating.", true);
            await getRoute(); return;
        }
        const steps = currentRouteData.routes[0].legs[0].steps;
        const currentStep = steps[navigationState.currentStepIndex];
        const stepEndPoint = turf.point(currentStep.geometry.coordinates[currentStep.geometry.coordinates.length - 1]);
        navigationState.distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units: 'meters' });
        if (navigationState.distanceToNextManeuver < 50) {
            navigationState.currentStepIndex++;
            if (navigationState.currentStepIndex >= steps.length) {
                speech.speak("You have arrived.", true);
                stopNavigation(); return;
            }
            const nextStep = steps[navigationState.currentStepIndex];
            navigationInstructionEl.textContent = nextStep.maneuver.instruction;
            speech.speak(nextStep.maneuver.instruction, true);
        }
    }

    const TRAFFIC_SOURCE_ID = 'maptiler-traffic', TRAFFIC_LAYER_ID = 'traffic-lines';
    const trafficSource = { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` };
    const trafficLayer = { id: TRAFFIC_LAYER_ID, type: 'line', source: TRAFFIC_SOURCE_ID, 'source-layer': 'traffic', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': 2, 'line-color': ['match',['get','congestion'],'low','#30c83a','moderate','#ff9a00','heavy','#ff3d3d','severe','#a00000','#a0a0a0'] } };
    function addTrafficLayer() { if (!map.getSource(TRAFFIC_SOURCE_ID)) { map.addSource(TRAFFIC_SOURCE_ID, trafficSource); map.addLayer(trafficLayer, 'route-line'); } }
    function removeTrafficLayer() { if (map.getSource(TRAFFIC_SOURCE_ID)) { map.removeLayer(TRAFFIC_LAYER_ID); map.removeSource(TRAFFIC_SOURCE_ID); } }

    const settingsMenu = document.getElementById('settings-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) menuOverlay.classList.add('open'); }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) menuOverlay.classList.remove('open'); }

    document.querySelectorAll('.js-settings-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openSettings(); }));
    document.getElementById('close-settings-btn').addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => { if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) closeSettings(); });

    document.querySelectorAll('input[name="map-style"]').forEach(radio => radio.addEventListener('change', () => map.setStyle(STYLES[radio.value])));
    document.getElementById('traffic-toggle').addEventListener('change', (e) => e.target.checked ? addTrafficLayer() : removeTrafficLayer());

    map.on('styledata', () => {
        if (currentRouteData) addRouteToMap({ type: 'Feature', geometry: currentRouteData.routes[0].geometry });
        if (document.getElementById('traffic-toggle').checked) addTrafficLayer();
    });

    if (isMobile) {
        const panelHeader = document.querySelector(".panel-header");
        let panelState = 'closed';
        const snapPoints = { open: window.innerHeight * 0.25, peek: window.innerHeight - 220, closed: window.innerHeight };
        let startY, startTop, lastY, velocity;

        function snapTo(state) {
            sidePanel.style.transition = ''; sidePanel.style.transform = '';
            sidePanel.classList.remove('open', 'peek');
            if (state === 'open') sidePanel.classList.add('open');
            else if (state === 'peek') sidePanel.classList.add('peek');
            panelState = state;
        }

        showPanel = (viewId) => {
            ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
            snapTo('peek');
        };
        closePanel = () => snapTo('closed');
        closeInfoBtn.addEventListener('click', closePanel);

        panelHeader.addEventListener('touchstart', (e) => {
            startY = lastY = e.touches[0].pageY; velocity = 0;
            startTop = new DOMMatrix(getComputedStyle(sidePanel).transform).m42;
            sidePanel.style.transition = 'none';
        }, { passive: true });
        
        panelHeader.addEventListener('touchmove', (e) => {
            if (startY === undefined) return;
            const currentY = e.touches[0].pageY;
            let newTop = startTop + (currentY - startY);
            if (newTop < snapPoints.open) newTop = snapPoints.open;
            sidePanel.style.transform = `translateY(${newTop}px)`;
            velocity = currentY - lastY;
            lastY = currentY;
        }, { passive: true });
        
        panelHeader.addEventListener('touchend', () => {
            if (startY === undefined) return;
            startY = undefined;
            const endTop = new DOMMatrix(getComputedStyle(sidePanel).transform).m42;
            if (Math.abs(velocity) > 5) {
                snapTo(velocity < 0 ? 'open' : (panelState === 'open' ? 'peek' : 'closed'));
                return;
            }
            const distToOpen = Math.abs(endTop - snapPoints.open);
            const distToPeek = Math.abs(endTop - snapPoints.peek);
            const distToClosed = Math.abs(endTop - snapPoints.closed);
            const closest = Math.min(distToOpen, distToPeek, distToClosed);
            if (closest === distToOpen) snapTo('open');
            else if (closest === distToPeek) snapTo('peek');
            else snapTo('closed');
        });
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered'), err => console.log('SW registration failed: ', err));
        });
    }
});
