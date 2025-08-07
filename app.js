```javascript
// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    // *** IMPORTANT: Remember to replace this with your actual Client ID from Authentik. ***
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    scope: "openid profile email",
    response_type: 'code',
    automaticSilentRenew: true,
};
const userManager = new oidc.UserManager(authConfig);
const authService = {
    async login() { return userManager.signinRedirect(); },
    async logout() { return userManager.signoutRedirect(); },
    async getUser() { return userManager.getUser(); },
    async handleCallback() { return userManager.signinRedirectCallback(); },
    async signup() { return userManager.signinRedirect({ extraQueryParams: { prompt: 'create' } }); }
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
            window.location.href = "/"; // Redirect to the main page after successful login
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
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); authService.signup(); });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    // --- END AUTHENTICATION ---


    // --- MAP INITIALIZATION & CONTROLS ---
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
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
    resetNavigationState(); // Initialize

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
    function showPanel(viewId) { ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => { document.getElementById(id).hidden = id !== viewId; }); if (!sidePanel.classList.contains('open')) { if (isMobile) { if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek'); } else { sidePanel.classList.add('open'); moveSearchBarToPanel(); } } }
    function closePanel() { if (isMobile) sidePanel.classList.remove('open', 'peek'); else { sidePanel.classList.remove('open'); moveSearchBarToTop(); } }
    closePanelBtn.addEventListener('click', closePanel);
    map.on('click', (e) => { const target = e.originalEvent.target; if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) { closePanel(); } });
    function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { const fetchAndDisplaySuggestions = async (query) => { if (!query) { suggestionsEl.style.display = "none"; return; } const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`; const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`; try { const res = await fetch(url); const data = await res.json(); suggestionsEl.innerHTML = ""; data.forEach(item => { const el = document.createElement("div"); el.className = "search-result"; el.textContent = item.display_name; el.addEventListener("click", () => onSelect(item)); suggestionsEl.appendChild(el); }); suggestionsEl.style.display = data.length > 0 ? "block" : "none"; } catch (e) { console.error("Suggestion fetch failed", e); } }; const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300); inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim())); inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); }); }
    async function performSmartSearch(inputEl, onSelect) { const query = inputEl.value.trim(); if (!query) return; const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`; const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`; try { const res = await fetch(url); const data = await res.json(); if (data.length > 0) onSelect(data[0]); else alert("No results found for your search."); } catch (e) { alert("Search failed. Please check your connection."); } }
    const mainSuggestions = document.getElementById("main-suggestions"); attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult); document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult)); mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });
    const fromInput = document.getElementById('panel-from-input'); const fromSuggestions = document.getElementById('panel-from-suggestions'); attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
    const toInput = document.getElementById('panel-to-input'); const toSuggestions = document.getElementById('panel-to-suggestions'); attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });
    function processPlaceResult(place) { currentPlace = place; stopNavigation(); clearRouteFromMap(); map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 }); mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(','); document.getElementById('info-name').textContent = place.display_name.split(',')[0]; document.getElementById('info-address').textContent = place.display_name; const locationName = place.display_name.split(',')[0]; fetchAndSetPlaceImage(locationName, place.lon, place.lat); fetchAndSetWeather(place.lat, place.lon); fetchAndSetQuickFacts(locationName); showPanel('info-panel-redesign'); }
    async function fetchAndSetPlaceImage(query, lon, lat) { const imgEl = document.getElementById('info-image'); imgEl.src = ''; imgEl.style.backgroundColor = '#e0e0e0'; imgEl.alt = 'Loading image...'; imgEl.onerror = null; try { const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`; const res = await fetch(wikipediaUrl); const data = await res.json(); const page = Object.values(data.query.pages)[0]; if (page.thumbnail && page.thumbnail.source) { imgEl.src = page.thumbnail.source; imgEl.alt = `Photograph of ${query}`; return; } else { throw new Error("No image found on Wikipedia."); } } catch (e) { console.log("Wikipedia image failed:", e.message, "Activating fallback."); const offset = 0.005; const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`; const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`; imgEl.src = fallbackUrl; imgEl.alt = `Map view of ${query}`; imgEl.onerror = () => { imgEl.style.backgroundColor = '#e0e0e0'; imgEl.alt = 'Image not available'; }; }; }
    async function fetchAndSetWeather(lat, lon) { const weatherEl = document.getElementById('info-weather'); weatherEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#3c4043"/></svg>Loading weather...`; try { const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`; const res = await fetch(url); const data = await res.json(); if (data.current) { const temp = data.current.temperature_2m; const code = data.current.weather_code; const wind = data.current.wind_speed_10m; const desc = getWeatherDescription(code); weatherEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#3c4043"/></svg>${temp}°C, ${desc}, ${wind} km/h Wind`; } else { throw new Error("Weather data not available."); } } catch (e) { weatherEl.innerHTML = `Weather data unavailable.`; } }
    async function fetchAndSetQuickFacts(query) { const factsEl = document.getElementById('quick-facts-content'); factsEl.textContent = 'Loading quick facts...'; try { const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro=&explaintext=&redirects=1&titles=${encodeURIComponent(query)}`; const res = await fetch(url); const data = await res.json(); const page = Object.values(data.query.pages)[0]; if (page.extract) { factsEl.textContent = page.extract.substring(0, 300) + '...'; } else { throw new Error("No summary found on Wikipedia."); } } catch (e) { factsEl.textContent = 'Quick facts unavailable.'; } }
    function showDirectionsPanel() { showPanel('directions-panel-redesign'); if (currentPlace) { document.getElementById('panel-to-input').value = currentPlace.display_name; document.getElementById('panel-to-input').dataset.coords = `${currentPlace.lon},${currentPlace.lat}`; } }
    function showRouteSteps() { showPanel('route-section'); }
    function clearRouteFromMap() { if (map.getLayer('route')) map.removeLayer('route'); if (map.getSource('route')) map.removeSource('route'); if (map.getLayer('route-points')) map.removeLayer('route-points'); if (map.getSource('route-points')) map.removeSource('route-points'); if (map.getLayer('highlighted-route-segment')) map.removeLayer('highlighted-route-segment'); if (map.getSource('highlighted-route-segment')) map.removeSource('highlighted-route-segment'); }
    document.getElementById('info-directions-btn').addEventListener('click', showDirectionsPanel);
    document.getElementById('back-to-info-btn').addEventListener('click', () => { showPanel('info-panel-redesign'); });
    document.getElementById('exit-route-btn').addEventListener('click', () => { showDirectionsPanel(); });
    document.getElementById('swap-btn').addEventListener('click', () => { const from = fromInput.value; const fromCoords = fromInput.dataset.coords; fromInput.value = toInput.value; fromInput.dataset.coords = toInput.dataset.coords; toInput.value = from; toInput.dataset.coords = fromCoords; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => { if (userLocationMarker) { const coords = userLocationMarker.getLngLat(); fromInput.value = "Your location"; fromInput.dataset.coords = `${coords.lng},${coords.lat}`; } else { alert("Could not get your current location."); } });
    async function fetchRoute() {
        const fromCoordsStr = fromInput.dataset.coords;
        const toCoordsStr = toInput.dataset.coords;
        if (!fromCoordsStr || !toCoordsStr) { alert("Please select both a start and end point."); return; }
        const [fromLon, fromLat] = fromCoordsStr.split(',');
        const [toLon, toLat] = toCoordsStr.split(',');
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes && data.routes[0]) {
                currentRouteData = data.routes[0];
                drawRouteOnMap(currentRouteData.geometry);
                displayRouteSteps(currentRouteData.legs[0].steps);
                showRouteSteps();
            } else {
                alert("Could not find a route.");
            }
        } catch (e) {
            alert("Failed to fetch route.");
        }
    }
    document.getElementById('get-route-btn').addEventListener('click', fetchRoute);
    function drawRouteOnMap(routeGeoJSON) {
        clearRouteFromMap();
        map.addSource('route', { 'type': 'geojson', 'data': routeGeoJSON });
        map.addLayer({ 'id': 'route', 'type': 'line', 'source': 'route', 'layout': { 'line-join': 'round', 'line-cap': 'round' }, 'paint': { 'line-color': '#00796b', 'line-width': 6, 'line-opacity': 0.75 } });
        const bounds = new maplibregl.LngLatBounds();
        for (const coord of routeGeoJSON.coordinates) { bounds.extend(coord); }
        map.fitBounds(bounds, { padding: 100 });
    }
    function displayRouteSteps(steps) {
        const stepsEl = document.getElementById('route-steps');
        stepsEl.innerHTML = '';
        if (steps) {
            steps.forEach((step, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${step.maneuver.instruction}</strong><br><small>${(step.distance / 1000).toFixed(1)} km / ${(step.duration / 60).toFixed(1)} min</small>`;
                li.addEventListener('click', () => { map.flyTo({ center: step.maneuver.location, zoom: 16 }); });
                stepsEl.appendChild(li);
            });
        }
    }
    function startNavigation() {
        if (!currentRouteData) { alert('No route to navigate.'); return; }
        resetNavigationState();
        navigationState.isActive = true;
        navigationStatusPanel.style.display = 'flex';
        closePanel();
        if (navigator.geolocation) {
            navigationWatcherId = navigator.geolocation.watchPosition(updateNavigation, (err) => console.error("Navigation error: ", err), geolocationOptions);
        }
        endNavigationBtn.addEventListener('click', stopNavigation);
    }
    function stopNavigation() {
        navigationState.isActive = false;
        navigationStatusPanel.style.display = 'none';
        if (navigationWatcherId !== null) { navigator.geolocation.clearWatch(navigationWatcherId); navigationWatcherId = null; }
        clearRouteFromMap();
        map.flyTo({ center: [-95, 39], zoom: 4 });
    }
    document.getElementById('get-route-btn').addEventListener('click', () => {
        fetchRoute().then(() => {
            startNavigation();
        });
    });
    // Function to calculate distance between two coordinates
    function getDistance(coord1, coord2) {
        const toRad = (x) => x * Math.PI / 180;
        const R = 6371; // Earth's radius in km
        const dLat = toRad(coord2[1] - coord1[1]);
        const dLon = toRad(coord2[0] - coord1[0]);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(coord1[1])) * Math.cos(toRad(coord2[1])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c * 1000; // Return distance in meters
    }
    function updateNavigation(position) {
        if (!navigationState.isActive || !currentRouteData) return;
        const userLngLat = [position.coords.longitude, position.coords.latitude];
        const routeCoordinates = currentRouteData.geometry.coordinates;

        const { closestPoint, closestIndex } = findClosestPointOnRoute(userLngLat, routeCoordinates);

        // Update user location marker on map
        if (userLocationMarker) { userLocationMarker.setLngLat(userLngLat); } else { userLocationMarker = new maplibregl.Marker({ color: "#1a73e8" }).setLngLat(userLngLat).addTo(map); }

        // Find current step
        let currentStep = null;
        let distanceToNextManeuver = Infinity;
        let totalDistanceToDestination = 0;
        let accumulatedDistance = 0;
        let currentStepIndex = -1;

        for (let i = 0; i < currentRouteData.legs[0].steps.length; i++) {
            const step = currentRouteData.legs[0].steps[i];
            const startCoord = step.maneuver.location;
            const endCoord = step.geometry.coordinates[step.geometry.coordinates.length - 1];

            const distanceToStartOfStep = getDistance(userLngLat, startCoord);
            const distanceToEndOfStep = getDistance(userLngLat, endCoord);

            if (distanceToEndOfStep < step.distance) { // We are within this step
                currentStep = step;
                currentStepIndex = i;
                distanceToNextManeuver = distanceToEndOfStep;
                totalDistanceToDestination = currentRouteData.distance - accumulatedDistance;
                break;
            }
            accumulatedDistance += step.distance;
        }

        if (currentStep) {
            navigationState.currentStepIndex = currentStepIndex;
            navigationState.distanceToNextManeuver = distanceToNextManeuver;
            navigationState.userSpeed = position.coords.speed !== null ? position.coords.speed * 3.6 * 0.621371 : 0; // Convert m/s to mph
            navigationState.totalTripTime = currentRouteData.duration;

            const timeRemaining = (currentRouteData.duration - (currentRouteData.distance - totalDistanceToDestination) / (currentRouteData.distance / currentRouteData.duration));
            const etaDate = new Date(Date.now() + timeRemaining * 1000);
            navigationState.estimatedArrivalTime = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Update UI
            navigationInstructionEl.textContent = currentStep.maneuver.instruction;
            statSpeedEl.textContent = navigationState.userSpeed.toFixed(0);
            statEtaEl.textContent = navigationState.estimatedArrivalTime;
            statTimeRemainingEl.textContent = `${Math.ceil(timeRemaining / 60)} min`;

            // Progress bar
            const stepLength = currentStep.distance;
            const progress = (stepLength - distanceToNextManeuver) / stepLength;
            instructionProgressBar.transform = `scaleX(${progress})`;

            // Announce new instruction
            if (distanceToNextManeuver < 100 && navigationState.lastAnnouncedDistance > 100) {
                speech.speak(currentStep.maneuver.instruction, true);
                navigationState.lastAnnouncedDistance = 0; // Reset to prevent re-announcing
            }
            navigationState.lastAnnouncedDistance = distanceToNextManeuver;

            // Highlight current route segment
            highlightRouteSegment(currentStep.geometry.coordinates);

            // Center map on user
            map.flyTo({ center: userLngLat, speed: 0.5, curve: 1, easing: (t) => t });

        } else {
            console.log("Navigation finished or off-route.");
            stopNavigation();
        }
    }
    function findClosestPointOnRoute(userLngLat, routeCoordinates) {
        let minDistance = Infinity;
        let closestPoint = null;
        let closestIndex = -1;

        for (let i = 0; i < routeCoordinates.length; i++) {
            const coord = routeCoordinates[i];
            const distance = getDistance(userLngLat, coord);
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = coord;
                closestIndex = i;
            }
        }
        return { closestPoint, closestIndex };
    }
    function highlightRouteSegment(segmentCoords) {
        const geojson = {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': segmentCoords
            }
        };

        if (map.getLayer(highlightedSegmentLayerId)) {
            map.getSource(highlightedSegmentLayerId).setData(geojson);
        } else {
            map.addSource(highlightedSegmentLayerId, {
                'type': 'geojson',
                'data': geojson
            });

            map.addLayer({
                'id': highlightedSegmentLayerId,
                'type': 'line',
                'source': highlightedSegmentLayerId,
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#ff0000',
                    'line-width': 8,
                    'line-opacity': 1
                }
            });
        }
    }

    // --- PANEL DRAGGING LOGIC (MOBILE) ---
    const panelGrabber = document.getElementById('panel-grabber');
    let isDragging = false;
    let startY = 0;
    let panelHeight = 0;

    if (isMobile) {
        panelGrabber.addEventListener('mousedown', (e) => { isDragging = true; startY = e.clientY; panelHeight = sidePanel.clientHeight; sidePanel.style.transition = 'none'; e.preventDefault(); });
        panelGrabber.addEventListener('touchstart', (e) => { isDragging = true; startY = e.touches[0].clientY; panelHeight = sidePanel.clientHeight; sidePanel.style.transition = 'none'; });

        document.addEventListener('mousemove', (e) => { if (isDragging) { handleDrag(e.clientY); } });
        document.addEventListener('touchmove', (e) => { if (isDragging) { handleDrag(e.touches[0].clientY); } });

        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
    }
    function handleDrag(currentY) {
        const dy = startY - currentY;
        let newHeight = panelHeight + dy;
        const viewportHeight = window.innerHeight;
        const bannerHeight = document.getElementById('top-banner').clientHeight;
        const maxHeight = viewportHeight - bannerHeight;
        const minHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
        if (newHeight > maxHeight) newHeight = maxHeight;
        if (newHeight < minHeight) newHeight = minHeight;
        sidePanel.style.height = `${newHeight}px`;
    }
    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        sidePanel.style.transition = '';
        const currentHeight = sidePanel.clientHeight;
        const viewportHeight = window.innerHeight;
        const peekHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
        if (currentHeight > viewportHeight * 0.7) {
            sidePanel.classList.add('open');
            sidePanel.classList.remove('peek');
        } else if (currentHeight < viewportHeight * 0.3) {
            closePanel();
        } else {
            sidePanel.classList.add('peek');
            sidePanel.classList.remove('open');
        }
        sidePanel.style.height = ''; // Let CSS take over
    }

    // --- SETTINGS MENU LOGIC ---
    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');

    function toggleSettingsMenu() {
        const isOpen = settingsMenu.classList.contains('open');
        if (isOpen) {
            settingsMenu.classList.remove('open');
            if (isMobile) menuOverlay.classList.remove('open');
        } else {
            settingsMenu.classList.add('open');
            if (isMobile) menuOverlay.classList.add('open');
        }
    }
    settingsBtns.forEach(btn => btn.addEventListener('click', toggleSettingsMenu));
    closeSettingsBtn.addEventListener('click', toggleSettingsMenu);
    menuOverlay.addEventListener('click', toggleSettingsMenu);

    // --- MAP STYLE SWITCHER ---
    const mapStyleRadios = document.querySelectorAll('input[name="map-style"]');
    mapStyleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const styleName = e.target.value;
            const newStyle = STYLES[styleName];
            map.setStyle(newStyle);
            if (currentRouteData) {
                map.on('styledata', () => {
                    drawRouteOnMap(currentRouteData.geometry);
                });
            }
        });
    });
});
```
