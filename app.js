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
    const savedPlacesBtn = document.getElementById('saved-places-btn');
    const usernameDisplay = loggedInView.querySelector('.username');
    const emailDisplay = loggedInView.querySelector('.email');
    let currentUser = null;

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
        if (isLoggedIn) {
            usernameDisplay.textContent = currentUser.profile.name || 'User';
            emailDisplay.textContent = currentUser.profile.email || '';
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
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    // --- END AUTHENTICATION ---

    // --- MAP INITIALIZATION & CONTROLS ---
    // NEW: Add your MapTiler API Key here
    const MAPTILER_KEY = 'YOUR_MAPTILER_API_KEY';

    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
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
    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());
    // --- GLOBAL VARIABLES & UI ELEMENTS ---
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const closeInfoBtn = document.getElementById('close-info-btn');
    
    let currentPlace = null;
    let currentRouteData = null;
    let userLocationMarker = null;
    let navigationWatcherId = null;

    const speech = {
        synthesis: window.speechSynthesis,
        utterance: new SpeechSynthesisUtterance(),
        speak(text, priority = false) {
            if (priority && this.synthesis.speaking) {
                this.synthesis.cancel();
            }
            if (!this.synthesis.speaking && text) {
                this.utterance.text = text;
                this.synthesis.speak(this.utterance);
            }
        }
    };
    
    // NEW: Toast Notification Function
    function showToast(message, type = 'info', duration = 3000) {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            console.error("Toast container not found.");
            return;
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            // Remove after animation completes
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }


    // --- ADVANCED NAVIGATION STATE ---
    let navigationState = {};
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
    resetNavigationState();

    // --- NAVIGATION UI ELEMENTS ---
    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const statSpeedEl = document.getElementById('stat-speed');
    const statEtaEl = document.getElementById('stat-eta');
    const statTimeRemainingEl = document.getElementById('stat-time-remaining');
    const highlightedSegmentLayerId = 'highlighted-route-segment';
    
    // --- CORE PANEL & SEARCH LOGIC ---
    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
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
        else {
            sidePanel.classList.remove('open');
            moveSearchBarToTop();
        }
    }

    if(closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
    closeInfoBtn.addEventListener('click', closePanel);

    map.on('click', (e) => {
        const target = e.originalEvent.target;
        if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) {
            closePanel();
        }
    });

    function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (!query) { suggestionsEl.style.display = "none"; return; }
            const bounds = map.getBounds();
            const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
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
            } catch (e) {
                console.error("Suggestion fetch failed", e);
            }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => {
            setTimeout(() => { suggestionsEl.style.display = "none"; }, 200);
        });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else showToast("No results found for your search.", 'error');
        } catch (e) {
            showToast("Search failed. Please check your connection.", 'error');
        }
    }

    const mainSuggestions = document.getElementById("main-suggestions");
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult);
    });

    const fromInput = document.getElementById('panel-from-input');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    attachSuggestionListener(fromInput, fromSuggestions, (place) => {
        fromInput.value = place.display_name;
        fromInput.dataset.coords = `${place.lon},${place.lat}`;
    });

    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => {
        toInput.value = place.display_name;
        toInput.dataset.coords = `${place.lon},${place.lat}`;
    });

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
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API returned status ${res.status}`);
            const data = await res.json();
            if (data.current_weather) {
                const tempF = Math.round(data.current_weather.temperature);
                const tempC = Math.round((tempF - 32) * 5 / 9);
                const description = getWeatherDescription(data.current_weather.weathercode);
                weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
            } else {
                throw new Error("Invalid weather data format.");
            }
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
            fromInput.value = '';
            fromInput.dataset.coords = '';
        } else {
            toInput.value = mainSearchInput.value;
            toInput.dataset.coords = '';
            fromInput.value = '';
            fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => {
        if (currentUser) {
            showToast("Feature 'Save Place' not yet implemented!", 'info');
        } else {
            showToast("Please log in to save places.", 'info');
        }
    });

    document.getElementById('swap-btn').addEventListener('click', () => {
        [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
        [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords];
    });

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

    document.getElementById('back-to-info-btn').addEventListener('click', () => {
        if (currentPlace) showPanel('info-panel-redesign');
    });

    document.getElementById('back-to-directions-btn').addEventListener('click', () => {
        showPanel('directions-panel-redesign');
    });

    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    }

    function displayRoutePreview(route) {
        const durationMinutes = Math.round(route.duration / 60);
        const distanceMiles = (route.distance / 1609.34).toFixed(1);
        document.getElementById('route-summary-time').textContent = `${durationMinutes} min`;
        document.getElementById('route-summary-distance').textContent = `${distanceMiles} mi`;
        showPanel('route-preview-panel');
    }
    
    // NEW: Function to check if coordinates are valid
    function areCoordsValid(coords) {
        if (!coords) return false;
        const [lon, lat] = coords.split(',').map(Number);
        return !isNaN(lon) && !isNaN(lat);
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) {
            showToast("Please fill both start and end points.", 'info');
            return;
        }
        
        // Use existing coords or geocode if necessary
        let fromCoords = fromInput.dataset.coords;
        let toCoords = toInput.dataset.coords;

        if (!areCoordsValid(fromCoords)) {
            const place = await geocode(fromInput.value);
            if (!place) {
                showToast("Could not find a valid start point.", 'error');
                return;
            }
            fromCoords = `${place.lon},${place.lat}`;
            fromInput.dataset.coords = fromCoords;
        }

        if (!areCoordsValid(toCoords)) {
            const place = await geocode(toInput.value);
            if (!place) {
                showToast("Could not find a valid end point.", 'error');
                return;
            }
            toCoords = `${place.lon},${place.lat}`;
            toInput.dataset.coords = toCoords;
        }

        const [fromLon, fromLat] = fromCoords.split(',');
        const [toLon, toLat] = toCoords.split(',');
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;

        try {
            const res = await fetch(routeUrl);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes.length > 0) {
                currentRouteData = data;
                displayRoutePreview(currentRouteData.routes[0]);
                addRouteToMap(currentRouteData.routes[0].geometry);
            } else {
                showToast("A route could not be found. Please try a different location.", 'error');
            }
        } catch (e) {
            console.error("Routing error:", e);
            showToast("Error getting route...", 'error');
        }
    }
    
    document.getElementById('get-route-btn').addEventListener('click', getRoute);

    async function geocode(query) {
        if (!query) return null;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) return data[0];
            return null;
        } catch (e) {
            console.error("Geocoding failed:", e);
            return null;
        }
    }

    function addRouteToMap(routeGeoJSON) {
        clearRouteFromMap();
        map.addSource('route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: routeGeoJSON
            }
        });
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00796b', 'line-width': 8, 'line-opacity': 0.75 }
        });
        const bounds = new maplibregl.LngLatBounds();
        routeGeoJSON.coordinates.forEach(c => bounds.extend(c));
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
    }

    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);

    function startNavigation() {
        if (!currentRouteData) {
            showToast("Please get a route first.", 'info');
            return;
        }
        showPanel('route-section');
        navigationState.isActive = true;
        navigationState.currentStepIndex = 0;
        
        updateNavigationUI();

        // Start watching user's position
        navigationWatcherId = navigator.geolocation.watchPosition(
            updateNavigation,
            handlePositionError,
            geolocationOptions
        );
        navigationStatusPanel.style.display = 'flex';
        map.flyTo({ zoom: 16 });
    }

    function handlePositionError(error) {
        console.error("Geolocation Error:", error);
        switch(error.code) {
            case error.PERMISSION_DENIED:
                showToast("Geolocation permission denied.", 'error');
                break;
            case error.POSITION_UNAVAILABLE:
                showToast("Location information is unavailable.", 'error');
                break;
            case error.TIMEOUT:
                showToast("The request to get user location timed out.", 'error');
                break;
            case error.UNKNOWN_ERROR:
                showToast("An unknown geolocation error occurred.", 'error');
                break;
        }
    }

    function stopNavigation() {
        if (navigationWatcherId) {
            navigator.geolocation.clearWatch(navigationWatcherId);
            navigationWatcherId = null;
        }
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        clearHighlightedSegment();
    }
    
    endNavigationBtn.addEventListener('click', stopNavigation);
    
    function clearHighlightedSegment() {
        if (map.getLayer(highlightedSegmentLayerId)) {
            map.removeLayer(highlightedSegmentLayerId);
        }
        if (map.getSource(highlightedSegmentLayerId)) {
            map.removeSource(highlightedSegmentLayerId);
        }
    }

    function updateHighlightedSegment(step) {
        clearHighlightedSegment();
        const stepCoords = step.geometry.coordinates;
        const geojson = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: turf.lineString(stepCoords)
                }
            ]
        };
        
        map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: geojson });
        map.addLayer({
            id: highlightedSegmentLayerId,
            type: 'line',
            source: highlightedSegmentLayerId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ff0000', 'line-width': 10 }
        });
    }

    function updateNavigation(position) {
        if (navigationState.isRerouting) return;
        const userPoint = turf.point([position.coords.longitude, position.coords.latitude]);
        map.panTo(userPoint.geometry.coordinates);
        
        const route = currentRouteData.routes[0];
        const currentStep = route.legs[0].steps[navigationState.currentStepIndex];
        const stepLine = turf.lineString(currentStep.geometry.coordinates);
        const snapped = turf.pointOnLine(stepLine, userPoint);
        
        navigationState.progressAlongStep = snapped.properties.location / turf.length(stepLine, {units: 'meters'});
        instructionProgressBar.width = `${navigationState.progressAlongStep * 100}%`;

        // Check for next step
        const distanceToNextStep = turf.distance(userPoint, snapped, { units: 'meters' });
        if (distanceToNextStep > 100 && navigationState.currentStepIndex < route.legs[0].steps.length - 1) {
            navigationState.currentStepIndex++;
            updateNavigationUI();
        }

        // Rerouting logic
        const routeLine = turf.lineString(route.geometry.coordinates);
        const distanceToRoute = turf.distance(userPoint, turf.pointOnLine(routeLine, userPoint), {units: 'meters'});
        if (distanceToRoute > 200) {
            reroute(userPoint.geometry.coordinates);
        }

        // Update UI
        statSpeedEl.textContent = Math.round(position.coords.speed * 2.237); // m/s to mph
        updateETA(route.duration, position.coords.speed, turf.distance(userPoint, routeLine, {units: 'meters'}));
    }
    
    function updateNavigationUI() {
        if (!navigationState.isActive || !currentRouteData) return;
        const route = currentRouteData.routes[0];
        const step = route.legs[0].steps[navigationState.currentStepIndex];
        navigationInstructionEl.textContent = step.maneuver.instruction;
        updateHighlightedSegment(step);
    }
    
    async function reroute(userCoords) {
        if (navigationState.isRerouting) return;
        navigationState.isRerouting = true;
        showToast("Rerouting...", 'info', 5000);
        
        const [toLon, toLat] = currentRouteData.routes[0].geometry.coordinates.slice(-1)[0];
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${userCoords[0]},${userCoords[1]};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
        
        try {
            const res = await fetch(routeUrl);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes.length > 0) {
                currentRouteData = data;
                navigationState.currentStepIndex = 0;
                updateNavigationUI();
                addRouteToMap(currentRouteData.routes[0].geometry);
            } else {
                showToast("Rerouting failed. Please try again.", 'error');
            }
        } catch(e) {
            showToast("Rerouting failed. Please try again.", 'error');
        } finally {
            navigationState.isRerouting = false;
        }
    }
    
    function updateETA(totalTimeSeconds, speedMph, distanceToRouteMeters) {
        const remainingTimeSeconds = totalTimeSeconds * (1 - navigationState.progressAlongStep);
        const eta = new Date(Date.now() + remainingTimeSeconds * 1000);
        statEtaEl.textContent = eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statTimeRemainingEl.textContent = Math.round(remainingTimeSeconds / 60);
    }

    document.getElementById('route-link-btn').addEventListener('click', () => {
        if (!currentRouteData) {
            showToast("Please get a route first.", 'info');
            return;
        }
        const encodedLink = btoa(JSON.stringify(currentRouteData));
        const url = `${window.location.origin}?route=${encodedLink}`;
        navigator.clipboard.writeText(url)
            .then(() => showToast("Route link copied to clipboard!", 'success'))
            .catch(() => showToast("Could not copy link...", 'error'));
    });

    // NEW: Handle incoming route links
    const urlParams = new URLSearchParams(window.location.search);
    const routeData = urlParams.get('route');
    if (routeData) {
        try {
            currentRouteData = JSON.parse(atob(routeData));
            if (currentRouteData && currentRouteData.routes && currentRouteData.routes.length > 0) {
                addRouteToMap(currentRouteData.routes[0].geometry);
                displayRoutePreview(currentRouteData.routes[0]);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {
            console.error("Failed to parse route data from URL.", e);
        }
    }

    // --- SETTINGS MENU ---
    const settingsMenu = document.getElementById('settings-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    const desktopSettingsBtn = document.querySelector('.js-settings-btn');
    const trafficToggle = document.getElementById('traffic-toggle');
    
    function openSettings() {
        if (isMobile) {
            settingsMenu.classList.add('open');
            menuOverlay.classList.add('open');
        } else {
            settingsMenu.style.display = 'block';
            menuOverlay.style.display = 'block';
        }
    }

    function closeSettings() {
        if (isMobile) {
            settingsMenu.classList.remove('open');
            menuOverlay.classList.remove('open');
        } else {
            settingsMenu.style.display = 'none';
            menuOverlay.style.display = 'none';
        }
    }

    desktopSettingsBtn.addEventListener('click', openSettings);
    if (mobileSettingsBtn) mobileSettingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    
    function addTrafficLayer() {
        if (map.getLayer('traffic')) {
            map.removeLayer('traffic');
        }
        if (map.getSource('traffic')) {
            map.removeSource('traffic');
        }
        
        map.addSource('traffic', {
            type: 'vector',
            tiles: ['https://tiles.openfreemap.org/traffic/{z}/{x}/{y}.pbf'],
            maxzoom: 14,
        });

        map.addLayer({
            id: 'traffic',
            type: 'line',
            source: 'traffic',
            'source-layer': 'traffic',
            paint: {
                'line-color': [
                    'match',
                    ['get', 'speed'],
                    'slow', '#ff0000',
                    'medium', '#ffff00',
                    'fast', '#00ff00',
                    '#808080' // default
                ],
                'line-width': 4,
                'line-opacity': 0.8
            }
        });
    }

    function removeTrafficLayer() {
        if (map.getLayer('traffic')) {
            map.removeLayer('traffic');
        }
        if (map.getSource('traffic')) {
            map.removeSource('traffic');
        }
    }
    
    // NEW: Event listener for the traffic toggle
    trafficToggle.addEventListener('change', () => {
        if (trafficToggle.checked) {
            addTrafficLayer();
        } else {
            removeTrafficLayer();
        }
        if (isMobile) {
            setTimeout(closeSettings, 200);
        }
    });

    // NEW: Handle map style changes
    document.querySelectorAll('input[name="map-style"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newStyle = e.target.value;
            map.setStyle(STYLES[newStyle]);
            if (isMobile) {
                setTimeout(closeSettings, 200);
            }
        });
    });

    document.querySelectorAll('input[name="map-units"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (isMobile) {
                setTimeout(closeSettings, 200);
            }
        });
    });

    map.on('styledata', () => {
        if (navigationState.isActive && currentRouteData) {
            const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
            addRouteToMap(routeGeoJSON);
            updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]);
        }
        // NEW: Re-add traffic layer if it was enabled when map style changes
        if (trafficToggle.checked) {
            addTrafficLayer();
        }
    });

    if (isMobile) {
        // Mobile panel drag logic...
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration.scope);
            }, err => {
                console.log('SW registration failed: ', err);
            });
        });
    }
});
