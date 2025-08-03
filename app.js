// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    // *** IMPORTANT: Replace this placeholder with the Client ID from your Authentik Application settings. ***
    client_id: "YOUR_CLIENT_ID_FROM_AUTHENTIK",
    redirect_uri: "https://maps.theboiismc.com/index.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com/index.html",
    scope: "openid profile email",
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
    const savedPlacesBtn = document.getElementById('saved-places-btn');
    const usernameDisplay = loggedInView.querySelector('.username');
    const emailDisplay = loggedInView.querySelector('.email');

    let currentUser = null;

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser; // Your original code used `isLoggedIn`, we will maintain a version of it.
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
        if (isLoggedIn) {
            usernameDisplay.textContent = currentUser.profile.name || 'User';
            emailDisplay.textContent = currentUser.profile.email || '';
        }
    };

    try {
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            const user = await authService.handleCallback();
            updateAuthUI(user);
            window.history.replaceState({}, document.title, "/");
        } else {
            const user = await authService.getUser();
            updateAuthUI(user);
        }
    } catch (error) {
        console.error("Authentication process failed:", error);
        updateAuthUI(null);
    }

    profileButton.addEventListener('click', (e) => {
        const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
        profileDropdown.style.display = isHidden ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { 
        e.preventDefault(); 
        // This is the default sign-up flow path for Authentik. Verify this URL in your instance.
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    // --- END AUTHENTICATION INTEGRATION ---


    // --- ALL OF YOUR EXISTING STABLE CODE STARTS HERE ---
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 120000, maximumAge: 0 };

    // --- UPDATED MAP STYLE ---
    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty/style.json',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };

    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });
    
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true
    }), "bottom-right");

    // --- THE REST OF YOUR CODE IS PRESERVED EXACTLY ---
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');

    let currentPlace = null;
    let currentStyle = 'default';

    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    
    let userLocationMarker = null;
    let navigationWatcherId = null;
    let currentRouteData = null;
    let upcomingStepIndex = 0;
    let isNavigating = false;
    let isRerouting = false;
    let lastGoodPosition = null;

    const speech = {
        synthesis: window.speechSynthesis,
        utterance: new SpeechSynthesisUtterance(),
        speak(text) {
            if (this.synthesis.speaking) this.synthesis.cancel();
            if (text) { this.utterance.text = text; this.synthesis.speak(this.utterance); }
        }
    };

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
        if (isMobile) sidePanel.classList.remove('open', 'peek');
        else { sidePanel.classList.remove('open'); moveSearchBarToTop(); }
    }
    closePanelBtn.addEventListener('click', closePanel);
    map.on('click', (e) => {
        const targetClasses = e.originalEvent.target.classList;
        if (!targetClasses.contains('maplibregl-ctrl-icon') && !targetClasses.contains('mapboxgl-ctrl-icon')) {
            closePanel();
        }
    });

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (!query) { suggestionsEl.style.display = "none"; return; }
            const bounds = map.getBounds();
            const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
            try {
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
            } catch (e) { console.error("Suggestion fetch failed", e); }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else alert("No results found for your search.");
        } catch (e) { alert("Search failed. Please check your connection."); }
    }

    const mainSuggestions = document.getElementById("main-suggestions");
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });

    const fromInput = document.getElementById('panel-from-input');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });

    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();
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

    async function fetchAndSetPlaceImage(query, lon, lat) {
        const imgEl = document.getElementById('info-image');
        imgEl.src = '';
        imgEl.style.backgroundColor = '#e0e0e0';
        imgEl.alt = 'Loading image...';
        imgEl.onerror = null;

        try {
            const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            
            if (page.thumbnail && page.thumbnail.source) {
                imgEl.src = page.thumbnail.source;
                imgEl.alt = `Photograph of ${query}`;
                return;
            } else {
                throw new Error("No image found on Wikipedia.");
            }
        } catch (e) {
            console.log("Wikipedia image failed:", e.message, "Activating fallback.");
            const offset = 0.005;
            const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
            const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
            imgEl.src = fallbackUrl;
            imgEl.alt = `Map view of ${query}`;
            imgEl.onerror = () => {
                imgEl.style.backgroundColor = '#e0e0e0';
                imgEl.alt = 'Image not available';
            };
        }
    }

    function getWeatherDescription(code) {
        const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail' };
        return descriptions[code] || "Weather data unavailable";
    }

    async function fetchAndSetWeather(lat, lon) {
        const weatherEl = document.getElementById('info-weather');
        weatherEl.textContent = "Loading weather...";
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}¤t_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API returned status ${res.status}`);
            const data = await res.json();
            if (data.current_weather) {
                const tempF = Math.round(data.current_weather.temperature);
                const tempC = Math.round((tempF - 32) * 5 / 9);
                const description = getWeatherDescription(data.current_weather.weathercode);
                weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
            } else { throw new Error("Invalid weather data format."); }
        } catch (e) {
            weatherEl.textContent = "Could not load weather data.";
            console.error("Weather fetch/parse error:", e);
        }
    }

    async function fetchAndSetQuickFacts(query) {
        const factsEl = document.getElementById('quick-facts-content');
        factsEl.textContent = "Loading facts...";
        try {
            const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            factsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found on Wikipedia.";
        } catch (e) {
            factsEl.textContent = "Could not load facts.";
            console.error("Wikipedia API error", e);
        }
    }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = ''; fromInput.dataset.coords = '';
        } else {
            toInput.value = mainSearchInput.value;
            toInput.dataset.coords = '';
            fromInput.value = ''; fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => { if (currentUser) { alert("Feature 'Save Place' not yet implemented!"); } else { alert("Please log in to save places."); } });
    document.getElementById('swap-btn').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => {
        fromInput.value = "Getting your location...";
        navigator.geolocation.getCurrentPosition(
            pos => {
                fromInput.value = "Your Location";
                fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
            },
            handlePositionError,
            geolocationOptions
        );
    });
    document.getElementById('back-to-info-btn').addEventListener('click', () => { if (currentPlace) showPanel('info-panel-redesign'); });
    
    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
    }

    function displayRouteSteps(route) {
        const routeStepsEl = document.getElementById('route-steps');
        routeStepsEl.innerHTML = '';
        const steps = route.legs[0].steps;
        steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step.maneuver.instruction;
            routeStepsEl.appendChild(li);
        });
    }
    
    async function getRoute() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        clearRouteFromMap();
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.routes || data.routes.length === 0) return alert("No route found.");
            currentRouteData = data;
            const route = data.routes[0];
            const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
            addRouteToMap(routeGeoJSON);
            const bounds = new maplibregl.LngLatBounds();
            routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
            if (fromInput.value.trim() === "Your Location") {
                map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });
                closePanel();
                startNavigation();
            } else {
                displayRouteSteps(route);
                showPanel('route-section');
                map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
            }
        } catch (err) { alert(`Error getting route: ${err.message}`); isRerouting = false; }
    }

    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => {
        clearRouteFromMap();
        showPanel('directions-panel-redesign');
    });

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
        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeoJSON);
        } else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0d89ec', 'line-width': 6 } });
        }
    }
    
    function startNavigation() {
        if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");
        isNavigating = true;
        upcomingStepIndex = 0;
        lastGoodPosition = null;
        navigationStatusPanel.style.display = 'flex';
        updateNavigationInstruction();
        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }
        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation);
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        isNavigating = false;
        navigationWatcherId = null;
        currentRouteData = null;
        lastGoodPosition = null;
        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel();
        clearRouteFromMap();
    }

    function handlePositionError(error) {
        let errorMessage = "An unknown geolocation error occurred.";
        switch (error.code) {
            case error.PERMISSION_DENIED: errorMessage = "Geolocation request denied. Please check your browser and site permissions."; break;
            case error.POSITION_UNAVAILABLE: errorMessage = "Location information is unavailable. Try moving to an area with a clearer view of the sky."; break;
            case error.TIMEOUT: errorMessage = "Geolocation request timed out. Could not get a location fix in a reasonable amount of time. Please try again in an area with a clear view of the sky."; break;
        }
        console.error("Geolocation Error Details:", error);
        alert(errorMessage);
        stopNavigation();
    }

    function updateNavigationInstruction() {
        const instruction = currentRouteData?.routes[0].legs[0].steps[upcomingStepIndex]?.maneuver.instruction || "You have arrived.";
        navigationInstructionEl.textContent = instruction;
    }

    async function handlePositionUpdate(position) {
        if (!isNavigating || !currentRouteData) return;
        const { latitude, longitude, heading, accuracy } = position.coords;
        const userLngLat = [longitude, latitude];
        if (accuracy > 75 || (lastGoodPosition && accuracy > lastGoodPosition.coords.accuracy)) { return; }
        if (lastGoodPosition) {
            const distanceMoved = turf.distance(turf.point([lastGoodPosition.coords.longitude, lastGoodPosition.coords.latitude]), turf.point(userLngLat), { units: 'meters' });
            if (distanceMoved < 3) { return; }
        }
        lastGoodPosition = position;
        userLocationMarker.setLngLat(userLngLat);
        if (heading != null) { userLocationMarker.setRotation(heading); }
        map.easeTo({ center: userLngLat, zoom: Math.max(map.getZoom(), 17), essential: true });
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const userPoint = turf.point(userLngLat);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
        if (snapped.properties.dist > 50 && !isRerouting) {
            isRerouting = true;
            speech.speak("Recalculating route.");
            fromInput.value = "Your Location";
            fromInput.dataset.coords = userLngLat.join(',');
            await getRoute();
            isRerouting = false;
            return;
        }
        const steps = currentRouteData.routes[0].legs[0].steps;
        if (upcomingStepIndex >= steps.length) {
            if (turf.distance(userPoint, turf.point(steps[steps.length - 1].maneuver.location)) < 50) {
                speech.speak("You have arrived at your destination.");
                stopNavigation();
            }
            return;
        }
        const nextManeuver = steps[upcomingStepIndex].maneuver;
        const distanceToManeuver = turf.distance(userPoint, turf.point(nextManeuver.location), { units: 'meters' });
        if (distanceToManeuver < 80) {
            speech.speak(nextManeuver.instruction);
            upcomingStepIndex++;
            updateNavigationInstruction();
        }
    }

    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');

    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }

    settingsBtns.forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); if (!isMobile && settingsMenu.classList.contains('open')) { closeSettings(); } else { openSettings(); } }); });
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => { if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) { closeSettings(); } });
    styleRadioButtons.forEach(radio => { radio.addEventListener('change', () => { const newStyle = radio.value; if (newStyle !== currentStyle) { currentStyle = newStyle; map.setStyle(STYLES[currentStyle]); } if (isMobile) { setTimeout(closeSettings, 200); } }); });
    document.querySelectorAll('input[name="map-units"]').forEach(radio => { radio.addEventListener('change', () => { alert(`Unit selection ('${radio.value}') is not implemented yet.`); if (isMobile) { setTimeout(closeSettings, 200); } }); });
    
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
        grabber.addEventListener('touchmove', (e) => { if (startY === undefined) return; const currentY = e.touches[0].pageY; let newBottom = (parseInt(getComputedStyle(sidePanel).bottom, 10) || 0) + (startY - currentY); if (newBottom > 0) newBottom = 0; sidePanel.style.bottom = `${newBottom}px`; startY = currentY; }, { passive: true });
        grabber.addEventListener('touchend', () => { if (startY === undefined) return; startY = undefined; sidePanel.style.transition = ''; const currentBottom = parseInt(sidePanel.style.bottom, 10); const panelHeight = sidePanel.clientHeight; const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek')); if (currentBottom > (-1 * panelHeight) / 2) { sidePanel.classList.remove('peek'); sidePanel.classList.add('open'); } else { sidePanel.classList.remove('open', 'peek'); } sidePanel.style.bottom = ''; });
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => { console.log('SW registered: ', registration.scope); }, err => { console.log('SW registration failed: ', err); });
      });
    }
});
