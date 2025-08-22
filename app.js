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
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';

    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
        satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
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
            const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?proximity=${map.getCenter().lng},${map.getCenter().lat}&bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&language=en&autocomplete=true&key=${MAPTILER_KEY}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.features.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "search-result";
                    el.textContent = item.place_name;
                    el.addEventListener("click", () => onSelect(item));
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
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
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?proximity=${map.getCenter().lng},${map.getCenter().lat}&bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&limit=1&language=en&key=${MAPTILER_KEY}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features.length > 0) onSelect(data.features[0]);
            else alert("No results found for your search.");
        } catch (e) {
            alert("Search failed. Please check your connection.");
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
        fromInput.value = place.place_name;
        fromInput.dataset.coords = `${place.geometry.coordinates[0]},${place.geometry.coordinates[1]}`;
    });

    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => {
        toInput.value = place.place_name;
        toInput.dataset.coords = `${place.geometry.coordinates[0]},${place.geometry.coordinates[1]}`;
    });

    function processPlaceResult(place) {
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();
        map.flyTo({ center: place.geometry.coordinates, zoom: 14 });
        mainSearchInput.value = place.text;
        document.getElementById('info-name').textContent = place.text;
        document.getElementById('info-address').textContent = place.place_name;
        const locationName = place.text;
        fetchAndSetPlaceImage(locationName, place.geometry.coordinates[0], place.geometry.coordinates[1]);
        fetchAndSetWeather(place.geometry.coordinates[1], place.geometry.coordinates[0]);
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
            toInput.value = currentPlace.place_name;
            toInput.dataset.coords = `${currentPlace.geometry.coordinates[0]},${currentPlace.geometry.coordinates[1]}`;
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
            alert("Feature 'Save Place' not yet implemented!");
        } else {
            alert("Please log in to save places.");
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

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        clearRouteFromMap();
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://api.maptiler.com/directions/v1/driving/${start.join(',')};${end.join(',')}?key=${MAPTILER_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.routes || data.routes.length === 0 || !data.routes[0].legs || !data.routes[0].legs[0].steps || data.routes[0].legs[0].steps.length === 0) {
                return alert("A route could not be found. Please try a different location.");
            }
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
                displayRoutePreview(route);
                map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
            }
        } catch (err) {
            alert(`Error getting route: ${err.message}`);
            navigationState.isRerouting = false;
        }
    }
    
    const startNavigationBtn = document.getElementById('start-navigation-btn');
    startNavigationBtn.addEventListener('click', startNavigation);

    const shareRouteBtn = document.getElementById('share-route-btn');
    shareRouteBtn.addEventListener('click', async () => {
        const fromName = fromInput.value;
        const toName = toInput.value;
        const fromCoords = fromInput.dataset.coords;
        const toCoords = toInput.dataset.coords;
        const shareText = `Check out this route from ${fromName} to ${toName}!`;
        const url = new URL(window.location.href);
        url.searchParams.set('from', fromCoords);
        url.searchParams.set('to', toCoords);
        url.searchParams.set('fromName', fromName);
        url.searchParams.set('toName', toName);

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'TheBoiisMC Maps Route',
                    text: shareText,
                    url: url.toString()
                });
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            navigator.clipboard.writeText(url.toString()).then(() => {
                alert("Route link copied to clipboard!");
            }).catch(err => {
                console.error('Could not copy link: ', err);
                alert("Could not copy link. Please manually copy the URL from the address bar.");
            });
        }
    });

    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => {
        clearRouteFromMap();
        showPanel('directions-panel-redesign');
    });

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?limit=1&key=${MAPTILER_KEY}`);
        const data = await res.json();
        if (!data.features[0]) throw new Error(`Could not find location: ${inputEl.value}`);
        inputEl.value = data.features[0].place_name;
        inputEl.dataset.coords = `${data.features[0].geometry.coordinates[0]},${data.features[0].geometry.coordinates[1]}`;
        return data.features[0].geometry.coordinates;
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeoJSON);
        } else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
        }
    }

    // --- ADVANCED NAVIGATION FUNCTIONS ---
    function toRadians(degrees) { return degrees * Math.PI / 180; }
    function toDegrees(radians) { return radians * 180 / Math.PI; }
    function getBearing(startPoint, endPoint) {
        const startLat = toRadians(startPoint.geometry.coordinates[1]);
        const startLng = toRadians(startPoint.geometry.coordinates[0]);
        const endLat = toRadians(endPoint.geometry.coordinates[1]);
        const endLng = toRadians(endPoint.geometry.coordinates[0]);
        const dLng = endLng - startLng;
        const y = Math.sin(dLng) * Math.cos(endLat);
        const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
        let brng = toDegrees(Math.atan2(y, x));
        return (brng + 360) % 360;
    }

    function formatEta(date) {
        if (!date) return "--:--";
        let hours = date.getHours();
        let minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0'+minutes : minutes;
        return `${hours}:${minutes} ${ampm}`;
    }

    function updateNavigationUI() {
        const remainingTime = (navigationState.totalTripTime / 60).toFixed(0);
        statTimeRemainingEl.textContent = `${remainingTime} min`;
        statEtaEl.textContent = formatEta(navigationState.estimatedArrivalTime);
        statSpeedEl.textContent = navigationState.userSpeed.toFixed(0);
        instructionProgressBar.transform = `scaleX(${1 - navigationState.progressAlongStep})`;
    }

    function updateHighlightedSegment(step) {
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
        if (!step || !step.geometry) return;
        map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: step.geometry });
        map.addLayer({
            id: highlightedSegmentLayerId,
            type: 'line',
            source: highlightedSegmentLayerId,
            paint: { 'line-color': '#0055ff', 'line-width': 9, 'line-opacity': 0.9 }
        }, 'route-line');
    }

    function startNavigation() {
        if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");
        
        resetNavigationState();
        navigationState.isActive = true;
        navigationState.totalTripTime = currentRouteData.routes[0].duration;

        const firstStep = currentRouteData.routes[0].legs[0].steps[0];
        navigationInstructionEl.textContent = firstStep.maneuver.instruction;
        updateHighlightedSegment(firstStep);
        updateNavigationUI();

        navigationStatusPanel.style.display = 'flex';
        speech.speak(`Starting route. ${firstStep.maneuver.instruction}`, true);
        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }

        map.easeTo({ pitch: 60, zoom: 17, duration: 1500 });

        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation);
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }

        clearRouteFromMap();
        resetNavigationState();

        navigationStatusPanel.style.display = 'none';
        speech.synthesis.cancel();

        map.easeTo({ pitch: 0, bearing: 0 });
    }

    function handlePositionError(error) {
        console.error("Geolocation Error:", error.message);
        alert(`Geolocation error: ${error.message}. Navigation stopped.`);
        stopNavigation();
    }
    
    // --- UTILITY FUNCTIONS FOR NAVIGATION ---
    const bearingTolerance = 25; // degrees
    const rerouteDistance = 250; // meters
    const turnAnnounceDistances = [2000, 1000, 500, 200, 100, 50, 25];

    function calculateRerouteNeeded(userPosition, routeGeoJSON) {
        const userPoint = turf.point([userPosition.coords.longitude, userPosition.coords.latitude]);
        const line = turf.feature(routeGeoJSON.geometry);
        const snapped = turf.pointOnLine(line, userPoint);
        const distanceToRoute = turf.distance(userPoint, snapped, { units: 'meters' });
        if (distanceToRoute > rerouteDistance) {
            return true;
        }
        return false;
    }

    function handlePositionUpdate(position) {
        if (!navigationState.isActive) return;
        const userLngLat = [position.coords.longitude, position.coords.latitude];
        const userHeading = position.coords.heading;
        const userSpeedMps = position.coords.speed || 0;
        navigationState.userSpeed = userSpeedMps * 2.23694; // Convert m/s to mph

        if (userLocationMarker) {
            userLocationMarker.setLngLat(userLngLat);
            map.flyTo({ center: userLngLat, speed: 0.5, curve: 1, easing: (t) => t, essential: true });
        }
        if (userHeading !== null) {
            map.setBearing(userHeading);
        }

        if (!currentRouteData) { stopNavigation(); return; }

        // Rerouting logic
        const routeLine = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
        if (calculateRerouteNeeded(position, routeLine) && !navigationState.isRerouting) {
            navigationState.isRerouting = true;
            speech.speak("Recalculating route.", true);
            alert("Rerouting...");
            getRoute();
            return;
        }
        if (navigationState.isRerouting) return;

        const currentLeg = currentRouteData.routes[0].legs[0];
        const currentStep = currentLeg.steps[navigationState.currentStepIndex];
        
        // Find closest point on current step
        const stepLine = turf.lineString(currentStep.geometry.coordinates);
        const userPoint = turf.point(userLngLat);
        const snappedPoint = turf.pointOnLine(stepLine, userPoint);
        const distanceToManeuver = turf.distance(userPoint, turf.point(currentStep.maneuver.location), { units: 'meters' });
        
        const progressAlongStep = snappedPoint.properties.location / turf.length(stepLine, { units: 'meters' });
        navigationState.progressAlongStep = progressAlongStep;
        
        const remainingStepDistance = turf.length(stepLine, { units: 'meters' }) - snappedPoint.properties.location;
        let remainingRouteDistance = remainingStepDistance;
        for (let i = navigationState.currentStepIndex + 1; i < currentLeg.steps.length; i++) {
            remainingRouteDistance += turf.length(turf.lineString(currentLeg.steps[i].geometry.coordinates), { units: 'meters' });
        }
        
        // Update total time remaining
        const speedKph = userSpeedMps * 3.6;
        if (speedKph > 5) { // Only update if moving
            const timeRemaining = remainingRouteDistance / userSpeedMps;
            const eta = new Date(Date.now() + timeRemaining * 1000);
            navigationState.totalTripTime = timeRemaining;
            navigationState.estimatedArrivalTime = eta;
        }

        // Announce logic
        const announcedDistance = turnAnnounceDistances.find(d => distanceToManeuver <= d);
        if (announcedDistance && announcedDistance < navigationState.lastAnnouncedDistance) {
            speech.speak(currentStep.maneuver.instruction);
            navigationState.lastAnnouncedDistance = announcedDistance;
        }

        // Advance to next step
        if (distanceToManeuver < 20) {
            if (navigationState.currentStepIndex < currentLeg.steps.length - 1) {
                navigationState.currentStepIndex++;
                const nextStep = currentLeg.steps[navigationState.currentStepIndex];
                navigationInstructionEl.textContent = nextStep.maneuver.instruction;
                updateHighlightedSegment(nextStep);
                navigationState.lastAnnouncedDistance = Infinity; // Reset for next turn
                speech.speak(`In ${Math.round(nextStep.distance)} meters, ${nextStep.maneuver.instruction}`);
            } else {
                speech.speak("You have arrived at your destination.");
                navigationInstructionEl.textContent = "You have arrived.";
                stopNavigation();
            }
        }
        
        updateNavigationUI();
    }
    
    // --- SETTINGS MENU LOGIC ---
    const settingsMenu = document.getElementById('settings-menu');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');

    function openSettings() {
        settingsMenu.classList.add('open');
        menuOverlay.classList.add('open');
    }

    function closeSettings() {
        settingsMenu.classList.remove('open');
        menuOverlay.classList.remove('open');
    }

    document.querySelectorAll('.js-settings-btn').forEach(btn => btn.addEventListener('click', openSettings));
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);

    const styleRadios = document.querySelectorAll('input[name="map-style"]');
    styleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const style = e.target.value;
            map.setStyle(STYLES[style]);
            if (isMobile) {
                setTimeout(closeSettings, 200);
            }
        });
    });

    const trafficToggle = document.getElementById('traffic-toggle');
    function addTrafficLayer() {
        if (map.getLayer('traffic-flow-layer')) return;
        map.addSource('traffic-source', {
            type: 'vector',
            url: `https://api.maptiler.com/tiles/v3.json?key=${MAPTILER_KEY}`
        });
        map.addLayer({
            'id': 'traffic-flow-layer',
            'type': 'line',
            'source': 'traffic-source',
            'source-layer': 'transportation',
            'filter': ['==', 'class', 'motorway'],
            'paint': {
                'line-color': ['match', ['get', 'traffic'],
                    'high', '#a00',
                    'medium', '#fa0',
                    'low', '#2a2',
                    '#fff'
                ],
                'line-width': 3
            }
        });
    }

    function removeTrafficLayer() {
        if (map.getLayer('traffic-flow-layer')) {
            map.removeLayer('traffic-flow-layer');
            if (map.getSource('traffic-source')) {
                map.removeSource('traffic-source');
            }
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
        let initialY, currentY;
        let panelState = 'closed';
        const panelPeekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
        const panelHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-height'));
        const handleTouchStart = (e) => {
            initialY = e.touches[0].clientY;
            sidePanel.style.transition = 'none';
        };

        const handleTouchMove = (e) => {
            if (!sidePanel.classList.contains('peek') && !sidePanel.classList.contains('open')) return;

            currentY = e.touches[0].clientY;
            let diffY = currentY - initialY;

            if (panelState === 'open' && diffY < 0) return;
            if (panelState === 'peek' && diffY > 0) return;

            const newBottom = -1 * (panelHeight - panelPeekHeight - diffY);
            if (panelState === 'open') {
                sidePanel.style.transform = `translateY(${diffY}px)`;
            } else { // peek
                if (diffY < 0) { // dragging up
                    sidePanel.style.transform = `translateY(${diffY}px)`;
                } else {
                    sidePanel.style.transform = `translateY(${diffY}px)`;
                }
            }
        };

        const handleTouchEnd = (e) => {
            sidePanel.style.transition = 'bottom 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
            const endY = e.changedTouches[0].clientY;
            const diffY = endY - initialY;

            if (panelState === 'open') {
                if (diffY > 100) {
                    sidePanel.classList.remove('open');
                    sidePanel.classList.add('peek');
                    panelState = 'peek';
                } else if (diffY < -100) {
                    // close completely
                    sidePanel.classList.remove('open', 'peek');
                    panelState = 'closed';
                } else {
                    sidePanel.classList.add('open');
                    sidePanel.style.transform = 'translateY(0)';
                    panelState = 'open';
                }
            } else if (panelState === 'peek') {
                if (diffY < -100) {
                    sidePanel.classList.add('open');
                    sidePanel.classList.remove('peek');
                    panelState = 'open';
                } else if (diffY > 100) {
                    sidePanel.classList.remove('open', 'peek');
                    panelState = 'closed';
                } else {
                    sidePanel.classList.add('peek');
                    sidePanel.style.transform = 'translateY(0)';
                    panelState = 'peek';
                }
            } else { // closed
                if (diffY < -100) {
                    sidePanel.classList.add('peek');
                    panelState = 'peek';
                }
                sidePanel.style.transform = 'translateY(0)';
            }
        };

        sidePanel.addEventListener('touchstart', handleTouchStart);
        sidePanel.addEventListener('touchmove', handleTouchMove);
        sidePanel.addEventListener('touchend', handleTouchEnd);
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
