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

    const speech = { /* ... same as before ... */ };
    let navigationState = {};
    function resetNavigationState() { /* ... same as before ... */ }
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

    // --- CLICK ON MAP TO GET INFO ---
    map.on('click', async (e) => {
        // Prevent click logic from firing if a map control was clicked
        if (e.originalEvent.target.closest('.maplibregl-ctrl')) return;

        const { lng, lat } = e.lngLat;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.display_name) {
                if (clickMarker) {
                    clickMarker.remove();
                }
                clickMarker = new maplibregl.Marker()
                    .setLngLat([data.lon, data.lat])
                    .addTo(map);

                // We can reuse the same function as our search!
                processPlaceResult(data);
            }
        } catch (error) {
            console.error("Reverse geocoding failed:", error);
        }
    });

    function debounce(func, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { /* ... same as before ... */ }
    async function performSmartSearch(inputEl, onSelect) { /* ... same as before ... */ }

    attachSuggestionListener(document.getElementById("main-search"), document.getElementById("main-suggestions"), processPlaceResult);
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });
    
    const fromInput = document.getElementById('panel-from-input');
    attachSuggestionListener(fromInput, document.getElementById('panel-from-suggestions'), (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
    const toInput = document.getElementById('panel-to-input');
    attachSuggestionListener(toInput, document.getElementById('panel-to-suggestions'), (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        // Clear previous click marker when a new search is performed
        if (clickMarker) {
            clickMarker.remove();
            clickMarker = null;
        }

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

    async function fetchAndSetPlaceImage(query, lon, lat) { /* ... same as before ... */ }
    async function fetchAndSetWeather(lat, lon) { /* ... same as before ... */ }
    async function fetchAndSetQuickFacts(query) { /* ... same as before ... */ }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = ''; fromInput.dataset.coords = '';
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
    
    function displayRoutePreview(route) { /* ... same as before ... */ }
    async function getRoute() { /* ... same as before ... */ }
    
    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => { clearRouteFromMap(); showPanel('directions-panel-redesign'); });

    async function geocode(inputEl) { /* ... same as before ... */ }
    function addRouteToMap(routeGeoJSON) { /* ... same as before ... */ }

    function startNavigation() { /* ... same as before ... */ }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        
        // Clear click marker when ending navigation
        if (clickMarker) { clickMarker.remove(); clickMarker = null; }

        clearRouteFromMap();
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel();
        map.easeTo({ pitch: 0, bearing: 0 });
    }

    function handlePositionError(error) { /* ... same as before ... */ }
    async function handlePositionUpdate(position) { /* ... same as before ... */ }

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
        // ... (Mobile panel logic is identical to the previous version)
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
