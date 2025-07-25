document.addEventListener('DOMContentLoaded', () => {
    // --- SETUP & STATE MANAGEMENT ---
    const isMobile = /Mobi/i.test(navigator.userAgent);
    const STYLES = { default: 'https://tiles.openfreemap.org/styles/liberty', satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery" }] } };
    const STYLE_ICONS = { default: { src: 'satelite_style.png', alt: 'Switch to Satellite' }, satellite: { src: 'default_style.png', alt: 'Switch to Default' } };
    const map = new maplibregl.Map({ container: "map", style: STYLES.default, center: [-95, 39], zoom: 4 });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    // DOM References
    const sidePanel = document.getElementById('side-panel');
    const mainSearchInput = document.getElementById('main-search');
    const mainSearchIcon = document.getElementById('main-search-icon');
    const mainDirectionsIcon = document.getElementById('main-directions-icon');
    const mainSuggestions = document.getElementById('main-suggestions');
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const getRouteBtn = document.getElementById('get-route-btn');
    const infoDirectionsBtn = document.getElementById('info-directions-btn');
    const startNavBtn = document.getElementById('start-nav-btn');
    const shareRouteBtn = document.getElementById('share-route-btn');
    const backToDirectionsBtn = document.getElementById('back-to-directions-btn');
    const navUi = document.getElementById('nav-ui');
    const exitNavBtn = document.getElementById('exit-nav-btn');
    const shareModalOverlay = document.getElementById('share-modal-overlay');
    
    // State
    let currentPlace = null; // For info panel
    let currentRoute = null; // For navigation
    let currentRouteGeoJSON = null; // For redrawing on style change
    let isNavigating = false;
    let locationWatcherId = null;
    let userMarker = null;

    // --- INITIALIZATION ---
    checkForNavInUrl();

    // --- UI & PANEL MANAGEMENT ---
    function showPanelView(panelId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => {
            document.getElementById(id).classList.toggle('hidden', id !== panelId);
        });
        sidePanel.classList.add('open');
    }

    // --- EVENT LISTENERS ---
    mainSearchIcon.addEventListener('click', () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSmartSearch(mainSearchInput, processPlaceResult); });
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    
    mainDirectionsIcon.addEventListener('click', () => openDirectionsPanel());
    infoDirectionsBtn.addEventListener('click', () => openDirectionsPanel());
    
    getRouteBtn.addEventListener('click', getRoute);
    startNavBtn.addEventListener('click', startNavigation);
    shareRouteBtn.addEventListener('click', showShareModal);
    exitNavBtn.addEventListener('click', stopNavigation);
    
    backToDirectionsBtn.addEventListener('click', () => showPanelView('directions-panel-redesign'));
    shareModalOverlay.addEventListener('click', (e) => { if (e.target === shareModalOverlay) shareModalOverlay.classList.remove('visible'); });

    // --- CORE LOGIC: Place Discovery ---
    function processPlaceResult(place) {
        currentPlace = place;
        map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
        document.getElementById('info-name').textContent = place.display_name.split(',')[0];
        document.getElementById('info-address').textContent = place.display_name;
        fetchAndSetPlaceImage(place.display_name.split(',')[0]);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(place.display_name.split(',')[0]);
        mainSuggestions.style.display = 'none';
        showPanelView('info-panel-redesign');
    }

    // --- CORE LOGIC: Directions & Routing ---
    function openDirectionsPanel() {
        showPanelView('directions-panel-redesign');
        fromInput.value = ''; // Always clear start
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
        } else {
            toInput.value = '';
        }
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        try {
            const [start, end] = await Promise.all([geocode(fromInput.value), geocode(toInput.value)]);
            fetchAndDisplayRoute(start, end);
        } catch (err) { alert(`Error getting route: ${err.message}`); }
    }

    async function fetchAndDisplayRoute(startCoords, endCoords) {
        const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.join(',')};${endCoords.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return alert("No route found.");
        
        currentRoute = data.routes[0];
        currentRouteGeoJSON = { type: 'Feature', geometry: currentRoute.geometry };
        addRouteToMap(currentRouteGeoJSON);

        const bounds = new maplibregl.LngLatBounds();
        currentRoute.geometry.coordinates.forEach(coord => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 100 });
        
        const stepsEl = document.getElementById("route-steps");
        stepsEl.innerHTML = "";
        currentRoute.legs[0].steps.forEach(step => {
            const li = document.createElement("li");
            li.textContent = step.maneuver.instruction;
            stepsEl.appendChild(li);
        });
        
        showPanelView('route-section');
        startNavBtn.classList.toggle('hidden', !isMobile);
        shareRouteBtn.classList.toggle('hidden', isMobile);
    }
    
    // --- CORE LOGIC: Navigation Engine ---
    function startNavigation() { /* ... function from previous step ... */ }
    function stopNavigation() { /* ... function from previous step ... */ }
    // ... all other navigation helper functions (updateNavInstruction, checkStepCompletion, speak, getDistance) ...

    // --- UTILITIES & HELPERS ---
    // All helper functions (geocode, fetchAndSetWeather, fetchAndSetPlaceImage, etc.) go here...
    async function geocode(query) { /* ... same as before ... */ }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { /* ... same as before ... */ }
    async function performSmartSearch(inputEl, onSelect) { /* ... same as before ... */ }
    async function fetchAndSetPlaceImage(query) { /* ... same as before ... */ }
    async function fetchAndSetWeather(lat, lon) { /* ... same as before ... */ }
    async function fetchAndSetQuickFacts(query) { /* ... same as before ... */ }
    function showShareModal() { /* ... same as before ... */ }
    function checkForNavInUrl() { /* ... same as before ... */ }
    function addRouteToMap(routeGeoJSON) { /* ... same as before ... */ }

    // Layer Switcher Logic
    const layerSwitcher = document.getElementById('layer-switcher');
    const layerSwitcherIcon = document.getElementById('layer-switcher-icon');
    let currentStyle = 'default';
    layerSwitcher.addEventListener('click', () => {
        currentStyle = (currentStyle === 'default') ? 'satellite' : 'default';
        map.setStyle(STYLES[currentStyle]);
        const newIcon = STYLE_ICONS[currentStyle];
        layerSwitcherIcon.src = newIcon.src;
        layerSwitcherIcon.alt = newIcon.alt;
    });
    map.on('styledata', () => { if (currentRouteGeoJSON) addRouteToMap(currentRouteGeoJSON); });
});
