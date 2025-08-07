// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    scope: 'openid profile',
    automaticSilentRenew: true,
};
const userManager = new oidc.UserManager(authConfig);
const authService = {
    async login() { return userManager.signinRedirect(); },
    async logout() { return userManager.signoutRedirect(); },
    async getUser() { return userManager.getUser(); },
};


document.addEventListener('DOMContentLoaded', async () => {

    // --- AUTHENTICATION CHECK & UI UPDATE ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileImg = document.getElementById('profile-img');
    const profileIcon = document.getElementById('profile-icon');
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
            
            // Check for profile picture from Authentik and update UI
            if (currentUser.profile.picture) {
                profileImg.src = currentUser.profile.picture;
                profileImg.hidden = false;
                profileIcon.hidden = true;
            } else {
                profileImg.hidden = true;
                profileIcon.hidden = false;
            }
        } else {
            profileImg.hidden = true;
            profileIcon.hidden = false;
        }
    };

    try {
        const user = await authService.getUser();
        updateAuthUI(user);
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
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-authentication-flow/";
    });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });


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
    async function fetchAndSetPlaceImage(query, lon, lat) { const imgEl = document.getElementById('info-image'); imgEl.src = ''; imgEl.style.backgroundColor = '#e0e0e0'; imgEl.alt = 'Loading image...'; imgEl.onerror = null; try { const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`; const res = await fetch(wikipediaUrl); const data = await res.json(); const page = Object.values(data.query.pages)[0]; if (page.thumbnail && page.thumbnail.source) { imgEl.src = page.thumbnail.source; imgEl.alt = `Photograph of ${query}`; return; } else { throw new Error("No image found."); } } catch (e) { console.error("Error fetching image:", e); imgEl.src = `https://placehold.co/800x200/cccccc/333333?text=${query}`; imgEl.alt = 'Image not available'; } }
    async function fetchAndSetWeather(lat, lon) { const weatherEl = document.getElementById('info-weather'); weatherEl.textContent = 'Loading...'; try { const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`); const data = await res.json(); if (data.current_weather) { const { temperature, windspeed, weathercode } = data.current_weather; weatherEl.textContent = `${temperature}°F, ${windspeed} mph wind`; } else { weatherEl.textContent = 'N/A'; } } catch (e) { weatherEl.textContent = 'N/A'; console.error('Weather fetch failed', e); } }
    async function fetchAndSetQuickFacts(query) { const factsEl = document.getElementById('quick-facts-content'); factsEl.innerHTML = 'Loading...'; try { const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exlimit=1&explaintext=1&exintro=1&titles=${encodeURIComponent(query)}`; const res = await fetch(wikipediaUrl); const data = await res.json(); const page = Object.values(data.query.pages)[0]; if (page.extract) { factsEl.textContent = page.extract; } else { factsEl.textContent = 'No quick facts available.'; } } catch (e) { console.error('Quick facts fetch failed', e); factsEl.textContent = 'Error fetching facts.'; } }


    // --- DIRECTIONS & ROUTING LOGIC ---
    document.getElementById('info-directions-btn').addEventListener('click', () => { toInput.value = currentPlace.display_name; toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`; showPanel('directions-panel-redesign'); });
    document.getElementById('back-to-info-btn').addEventListener('click', () => { showPanel('info-panel-redesign'); });
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('swap-btn').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => {
        if ('geolocation' in navigator) {
            fromInput.value = 'My Location';
            geolocateControl.trigger();
            geolocateControl.on('geolocate', (e) => { fromInput.dataset.coords = `${e.coords.longitude},${e.coords.latitude}`; });
        } else { alert('Geolocation is not supported by your browser.'); }
    });

    async function getRoute() {
        if (!fromInput.dataset.coords || !toInput.dataset.coords) { alert("Please enter both a start and end location."); return; }
        const [fromLon, fromLat] = fromInput.dataset.coords.split(',').map(Number);
        const [toLon, toLat] = toInput.dataset.coords.split(',').map(Number);
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                currentRouteData = data.routes[0];
                drawRoute(currentRouteData);
                listRouteSteps(currentRouteData);
                map.fitBounds(turf.bbox(currentRouteData.geometry), { padding: 50 });
                showPanel('route-section');
                startNavigation();
            } else { alert("Could not find a route."); }
        } catch (e) { console.error("Routing error:", e); alert("Failed to get a route."); }
    }

    function drawRoute(route) {
        if (map.getLayer('route')) { map.removeLayer('route'); }
        if (map.getSource('route')) { map.removeSource('route'); }
        if (map.getLayer(highlightedSegmentLayerId)) { map.removeLayer(highlightedSegmentLayerId); }
        if (map.getSource(highlightedSegmentLayerId)) { map.removeSource(highlightedSegmentLayerId); }

        map.addSource('route', { type: 'geojson', data: route.geometry });
        map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 6, 'line-opacity': 0.75 } });
    }

    function listRouteSteps(route) {
        const stepsList = document.getElementById('route-steps');
        stepsList.innerHTML = '';
        route.legs[0].steps.forEach((step, index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}. ${step.maneuver.instruction} (${Math.round(step.distance / 1609.34)} mi)`;
            stepsList.appendChild(li);
        });
    }

    function clearRouteFromMap() {
        if (map.getLayer('route')) { map.removeLayer('route'); }
        if (map.getSource('route')) { map.removeSource('route'); }
        if (map.getLayer(highlightedSegmentLayerId)) { map.removeLayer(highlightedSegmentLayerId); }
        if (map.getSource(highlightedSegmentLayerId)) { map.removeSource(highlightedSegmentLayerId); }
    }


    // --- NAVIGATION LOGIC ---
    function startNavigation() {
        resetNavigationState();
        navigationState.isActive = true;
        navigationState.totalTripTime = currentRouteData.duration;
        navigationStatusPanel.style.display = 'flex';
        endNavigationBtn.addEventListener('click', stopNavigation);
        geolocateControl.on('geolocate', onUserLocationUpdate);
        
        // Initial instruction
        updateNavigationUI(currentRouteData.legs[0].steps[0]);
    }

    function stopNavigation() {
        navigationState.isActive = false;
        navigationStatusPanel.style.display = 'none';
        geolocateControl.off('geolocate', onUserLocationUpdate);
        clearRouteFromMap();
        closePanel();
        speech.synthesis.cancel();
    }
    
    function onUserLocationUpdate(e) {
        if (!navigationState.isActive || navigationState.isRerouting) return;

        const userPoint = turf.point([e.coords.longitude, e.coords.latitude]);
        const currentStep = currentRouteData.legs[0].steps[navigationState.currentStepIndex];
        const stepLine = turf.lineString(currentStep.geometry.coordinates);
        const snapped = turf.pointToLineDistance(userPoint, stepLine, { units: 'miles' });
        
        // Update user speed
        navigationState.userSpeed = Math.round(e.coords.speed * 2.23694) || 0; // m/s to mph
        statSpeedEl.textContent = navigationState.userSpeed;

        // Check if user is off-route
        if (snapped > 0.1 && !navigationState.isWrongWay) { // 0.1 miles off-route
            console.warn("Off-route detected. Initiating re-route.");
            navigationState.isWrongWay = true;
            speech.speak("Recalculating route.", true);
            recalculateRoute(userPoint.geometry.coordinates);
        } else if (snapped <= 0.1 && navigationState.isWrongWay) {
            console.log("Back on route.");
            navigationState.isWrongWay = false;
        }

        // Project user's position onto the route line
        const nearestPointOnRoute = turf.nearestPointOnLine(stepLine, userPoint);
        const progress = nearestPointOnRoute.properties.location;
        const totalDistance = turf.length(stepLine, { units: 'miles' });
        const distanceRemaining = totalDistance - nearestPointOnRoute.properties.dist;
        
        // Update progress bar
        const progressPercentage = (progress / totalDistance) * 100;
        instructionProgressBar.transform = `scaleX(${progressPercentage / 100})`;

        // Check for next maneuver
        const nextManeuverDistance = turf.distance(userPoint, turf.point(currentStep.maneuver.location), { units: 'miles' });
        navigationState.distanceToNextManeuver = nextManeuverDistance;
        
        // Announce turn instructions
        announceManeuver(currentStep, nextManeuverDistance);
        
        // Update time remaining
        updateTimeRemaining(distanceRemaining);

        // Check if maneuver is passed
        if (nextManeuverDistance < 0.05 && navigationState.currentStepIndex < currentRouteData.legs[0].steps.length - 1) {
            navigationState.currentStepIndex++;
            const nextStep = currentRouteData.legs[0].steps[navigationState.currentStepIndex];
            updateNavigationUI(nextStep);
            speech.speak(nextStep.maneuver.instruction, true);
        } else if (navigationState.currentStepIndex === currentRouteData.legs[0].steps.length - 1 && nextManeuverDistance < 0.05) {
            // Reached destination
            speech.speak("You have arrived at your destination.", true);
            stopNavigation();
        }
    }

    function updateNavigationUI(step) {
        navigationInstructionEl.textContent = step.maneuver.instruction;
        instructionProgressBar.transform = 'scaleX(0)';
        highlightCurrentRouteSegment(step.geometry.coordinates);
    }
    
    function highlightCurrentRouteSegment(coords) {
        if (map.getLayer(highlightedSegmentLayerId)) { map.removeLayer(highlightedSegmentLayerId); }
        if (map.getSource(highlightedSegmentLayerId)) { map.removeSource(highlightedSegmentLayerId); }
        
        map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
        map.addLayer({ id: highlightedSegmentLayerId, type: 'line', source: highlightedSegmentLayerId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff4500', 'line-width': 8, 'line-opacity': 1 } });
    }

    function announceManeuver(step, distance) {
        const instruction = step.maneuver.instruction;
        const distances = [1, 0.5, 0.25]; // miles
        
        for (const dist of distances) {
            if (distance < dist && navigationState.lastAnnouncedDistance > dist) {
                speech.speak(`In ${dist} miles, ${instruction}`);
                navigationState.lastAnnouncedDistance = dist;
                return;
            }
        }
    }
    
    function updateTimeRemaining(distance) {
        const averageSpeed = 30; // mph
        const remainingTimeMinutes = Math.round(distance / averageSpeed * 60);
        statTimeRemainingEl.textContent = `${remainingTimeMinutes} min`;
        
        // Update ETA (a bit simplified)
        const now = new Date();
        const eta = new Date(now.getTime() + remainingTimeMinutes * 60000);
        statEtaEl.textContent = eta.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    async function recalculateRoute(userCoords) {
        navigationState.isRerouting = true;
        
        const [toLon, toLat] = toInput.dataset.coords.split(',').map(Number);
        const url = `https://router.project-osrm.org/route/v1/driving/${userCoords[0]},${userCoords[1]};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                currentRouteData = data.routes[0];
                drawRoute(currentRouteData);
                listRouteSteps(currentRouteData);
                navigationState.currentStepIndex = 0;
                navigationState.lastAnnouncedDistance = Infinity;
                updateNavigationUI(currentRouteData.legs[0].steps[0]);
                navigationState.isRerouting = false;
                console.log("Route re-calculated successfully.");
            }
        } catch (e) {
            console.error("Re-routing failed", e);
            navigationState.isRerouting = false;
        }
    }
    

    // --- SETTINGS LOGIC ---
    const settingsMenu = document.getElementById('settings-menu');
    const settingsBtn = document.querySelector('.js-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');

    settingsBtn.addEventListener('click', () => {
        settingsMenu.classList.add('open');
        if (isMobile) { menuOverlay.classList.add('open'); }
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsMenu.classList.remove('open');
        if (isMobile) { menuOverlay.classList.remove('open'); }
    });

    menuOverlay.addEventListener('click', () => {
        settingsMenu.classList.remove('open');
        menuOverlay.classList.remove('open');
    });

    const mapStyleRadios = document.querySelectorAll('input[name="map-style"]');
    mapStyleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const styleName = e.target.value;
            map.setStyle(STYLES[styleName]);
        });
    });

    const mapUnitsRadios = document.querySelectorAll('input[name="map-units"]');
    mapUnitsRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Unit change logic would go here
            // e.g., re-render distances with different units
        });
    });
});
