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

// --- Toast Notification Utility ---
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTHENTICATION CHECK & UI UPDATE ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const defaultProfileIcon = profileButton.innerHTML; 
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const dropdownAvatar = document.getElementById('dropdown-avatar'); 
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const savedPlacesBtn = document.getElementById('saved-places-btn');
    const usernameDisplay = loggedInView.querySelector('.username');
    const emailDisplay = loggedInView.querySelector('.email');
    let currentUser = null;

    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closeInfoBtn = document.getElementById('close-info-btn'); 
    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const statSpeedEl = document.getElementById('stat-speed');
    const statEtaEl = document.getElementById('stat-eta');
    const statTimeRemainingEl = document.getElementById('stat-time-remaining');
    const routeStepsList = document.getElementById('route-steps');

    const infoNameEl = document.getElementById('info-name');
    const infoAddressEl = document.getElementById('info-address');
    const infoImageEl = document.getElementById('info-image');
    const infoWeatherEl = document.getElementById('info-weather');
    const quickFactsEl = document.getElementById('quick-facts-content');
    const infoWebsiteBtn = document.getElementById('info-website-btn');
    
    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;

        if (isLoggedIn) {
            const userFirstName = currentUser.profile.name.split(' ')[0];
            usernameDisplay.textContent = currentUser.profile.name || 'User';
            emailDisplay.textContent = currentUser.profile.email || '';
            mainSearchInput.placeholder = `Where to, ${userFirstName}?`;

            if (currentUser.profile.picture) {
                profileButton.innerHTML = `<img class="profile-avatar" src="${currentUser.profile.picture}" alt="User Profile"/>`;
                if(dropdownAvatar) {
                    dropdownAvatar.src = currentUser.profile.picture;
                    dropdownAvatar.hidden = false;
                }
            } else {
                profileButton.innerHTML = defaultProfileIcon;
                if(dropdownAvatar) dropdownAvatar.hidden = true;
            }
        } else {
            profileButton.innerHTML = defaultProfileIcon;
            mainSearchInput.placeholder = 'Search TheBoiisMC Maps';
        }
    };

    if (window.location.pathname.endsWith("callback.html")) {
        try {
            await authService.handleCallback();
            window.location.href = "/";
        } catch (error) {
            console.error("Callback failed:", error);
            window.location.href = "/";
        }
        return;
    }

    userManager.events.addUserLoaded(user => {
        updateAuthUI(user);
        const userFirstName = user.profile.name.split(' ')[0];
        showToast(`Welcome back, ${userFirstName}!`, 'success');
    });

    userManager.events.addUserUnloaded(() => {
        updateAuthUI(null);
    });

    try {
        const user = await authService.getUser();
        updateAuthUI(user);
    } catch (error) {
        console.error("Initial getUser check failed:", error);
        updateAuthUI(null);
    }
    
    profileButton.addEventListener('click', () => {
        profileDropdown.style.display = profileDropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };

    function getInitialViewFromHash() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const parts = hash.split('/');
            if (parts.length === 3) {
                const [zoom, lat, lng] = parts.map(parseFloat);
                if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) {
                    return { center: [lng, lat], zoom: zoom };
                }
            }
        }
        return { center: [-95, 39], zoom: 4 };
    }
    
    const initialView = getInitialViewFromHash();
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: initialView.center,
        zoom: initialView.zoom
    });
    
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");
    
    map.on('load', () => {
        geolocateControl.trigger();
        showPanel('welcome-panel');

        const updateUrlHash = () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            history.replaceState(null, '', `#${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`);
        };
        map.on('moveend', updateUrlHash);
        map.on('zoomend', updateUrlHash);
    });

    document.getElementById('welcome-directions-btn').addEventListener('click', openDirectionsPanel);
    
    let currentPlace = null;
    let currentRouteData = null;
    let userLocationMarker = null;
    let navigationWatcherId = null;
    let clickedLocationMarker = null;

    const speechService = {
        synthesis: window.speechSynthesis,
        voices: {},
        selectedVoice: localStorage.getItem('mapVoice') || 'female',
        isReady: false,
        init() {
            return new Promise((resolve) => {
                const loadVoices = () => {
                    const availableVoices = this.synthesis.getVoices();
                    if (availableVoices.length === 0) return;
                    this.voices.female = availableVoices.find(v => v.lang.startsWith('en') && v.name.includes('Female')) || availableVoices.find(v => v.lang.startsWith('en'));
                    this.voices.male = availableVoices.find(v => v.lang.startsWith('en') && v.name.includes('Male')) || this.voices.female;
                    this.isReady = true;
                    console.log("Speech service ready.", this.voices);
                    resolve();
                };
                this.synthesis.onvoiceschanged = loadVoices;
                loadVoices();
            });
        },
        speak(text, priority = false) {
            if (!this.isReady || !text) return;
            if (priority) this.synthesis.cancel();
            if (this.synthesis.speaking) return;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = this.voices[this.selectedVoice];
            this.synthesis.speak(utterance);
        },
        setVoice(voiceGender) {
            this.selectedVoice = voiceGender;
            localStorage.setItem('mapVoice', voiceGender);
        }
    };

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
            isWrongWay: false,
            // --- MODIFIED FOR SMARTER REROUTING ---
            destinationCoords: null,
            lastDistanceToDestination: Infinity
        };
    }
    resetNavigationState();

    const highlightedSegmentLayerId = 'highlighted-route-segment';
    
    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel', 'welcome-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
        if (isMobile) {
            sidePanel.classList.remove('peek');
            sidePanel.classList.add('open');
        } else {
            sidePanel.classList.add('open');
            moveSearchBarToPanel();
        }
    }

    function closePanel() {
        if (isMobile) sidePanel.classList.remove('open', 'peek');
        else {
            sidePanel.classList.remove('open');
            moveSearchBarToTop();
        }
        if (clickedLocationMarker) {
            clickedLocationMarker.remove();
            clickedLocationMarker = null;
        }
    }

    if(closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);

    map.on('click', async (e) => {
        if (e.originalEvent.target.closest('.maplibregl-ctrl, #side-panel')) return;
        if (map.queryRenderedFeatures(e.point, { layers: ['route-line', 'highlighted-route-segment'] }).length > 0) return;
        
        const poi = map.queryRenderedFeatures(e.point, { layers: ['poi'] })[0];
        if (poi && poi.properties.name) {
            performSmartSearch({ value: poi.properties.name }, processPlaceResult);
        } else {
            await reverseGeocodeAndShowInfo(e.lngLat);
        }
    });

    async function reverseGeocodeAndShowInfo(lngLat) {
        try {
            const res = await fetch(`https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const item = data.features[0];
                processPlaceResult({
                    lon: item.center[0], lat: item.center[1],
                    display_name: item.place_name, bbox: item.bbox
                });
            }
        } catch (error) { console.error("Reverse geocoding failed", error); }
    }

    function debounce(func, delay) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this, a), delay); }; }
    
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchSuggestions = async (query) => {
            if (query.length < 3) { suggestionsEl.style.display = "none"; return; }
            const center = map.getCenter();
            try {
                const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5`);
                const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.features.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "search-result";
                    el.textContent = item.place_name;
                    el.onclick = () => onSelect({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox });
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
            } catch (e) { console.error("Suggestion fetch failed", e); }
        };
        inputEl.oninput = debounce(() => fetchSuggestions(inputEl.value.trim()), 300);
        inputEl.onblur = () => setTimeout(() => suggestionsEl.style.display = "none", 200);
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const center = map.getCenter();
        try {
            const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=1`);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const item = data.features[0];
                onSelect({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox });
            } else {
                showToast("No results found.", "error");
            }
        } catch (e) { showToast("Search failed.", "error"); }
    }

    attachSuggestionListener(document.getElementById("main-search"), document.getElementById("main-suggestions"), processPlaceResult);
    document.getElementById("search-icon-inside").onclick = () => performSmartSearch(document.getElementById("main-search"), processPlaceResult);
    document.getElementById("main-search").onkeydown = (e) => { if (e.key === "Enter") performSmartSearch(document.getElementById("main-search"), processPlaceResult); };

    const fromInput = document.getElementById('panel-from-input');
    attachSuggestionListener(fromInput, document.getElementById('panel-from-suggestions'), (p) => { fromInput.value = p.display_name; fromInput.dataset.coords = `${p.lon},${p.lat}`; });

    const toInput = document.getElementById('panel-to-input');
    attachSuggestionListener(toInput, document.getElementById('panel-to-suggestions'), (p) => { toInput.value = p.display_name; toInput.dataset.coords = `${p.lon},${p.lat}`; });

    function processPlaceResult(place) {
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();

        if (clickedLocationMarker) clickedLocationMarker.remove();
        clickedLocationMarker = new maplibregl.Marker().setLngLat([place.lon, place.lat]).addTo(map);

        if (place.bbox) map.fitBounds(place.bbox, { padding: 100 });
        else map.flyTo({ center: [place.lon, place.lat], zoom: 14 });

        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
        infoNameEl.textContent = place.display_name.split(',')[0];
        infoAddressEl.textContent = place.display_name;

        // Reset UI for new data
        infoImageEl.src = ''; infoImageEl.style.backgroundColor = '#e0e0e0';
        infoWeatherEl.innerHTML = '<div class="skeleton-line"></div>';
        quickFactsEl.innerHTML = '<div class="skeleton-line"></div>';

        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        fetchAndSetWebsite(locationName);
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query) {
        try {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            if (page.thumbnail && page.thumbnail.source) {
                infoImageEl.src = page.thumbnail.source;
            } else { throw new Error("No image found."); }
        } catch (e) {
            infoImageEl.style.backgroundColor = '#d0d0d0';
        }
    }
    
    async function fetchAndSetWebsite(query) {
        infoWebsiteBtn.style.display = 'none';
        try {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageprops|extlinks&titles=${encodeURIComponent(query)}`);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            if (page.extlinks) {
                const websiteLink = page.extlinks.find(link => link['*'].includes('://') && !link['*'].includes('wikipedia'));
                if (websiteLink) {
                    infoWebsiteBtn.style.display = 'flex';
                    infoWebsiteBtn.onclick = () => window.open(websiteLink['*'], '_blank');
                }
            }
        } catch (e) { console.error("Website fetch failed:", e); }
    }

    async function fetchAndSetWeather(lat, lon) {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`);
            const data = await res.json();
            const tempF = Math.round(data.current_weather.temperature);
            const tempC = Math.round((tempF - 32) * 5 / 9);
            infoWeatherEl.textContent = `${tempF}°F / ${tempC}°C`;
        } catch (e) { infoWeatherEl.textContent = "Weather unavailable."; }
    }

    async function fetchAndSetQuickFacts(query) {
        try {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            quickFactsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No facts found.";
        } catch (e) { quickFactsEl.textContent = "Could not load facts."; }
    }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
        }
    }

    document.getElementById('main-directions-icon').onclick = openDirectionsPanel;
    document.getElementById('info-directions-btn').onclick = openDirectionsPanel;
    document.getElementById('info-save-btn').onclick = () => showToast(currentUser ? "Save feature coming soon!" : "Please log in to save places.", "info");
    document.getElementById('swap-btn').onclick = () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, toInput.dataset.coords]; };
    document.getElementById('dir-use-my-location').onclick = () => { fromInput.value = "Getting your location..."; navigator.geolocation.getCurrentPosition(pos => { fromInput.value = "Your Location"; fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`; }, () => showToast("Could not get location.", "error"), geolocationOptions ); };
    document.getElementById('back-to-info-btn').onclick = () => showPanel('info-panel-redesign');
    document.getElementById('back-to-directions-btn').onclick = () => showPanel('directions-panel-redesign');
    document.getElementById('view-steps-btn').onclick = () => { showPanel('route-section'); populateRouteSteps(); };

    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    }
    
    function displayRoutePreview(route) {
        document.getElementById('route-summary-time').textContent = `${Math.round(route.duration / 60)} min`;
        document.getElementById('route-summary-distance').textContent = `${(route.distance / 1609.34).toFixed(1)} mi`;
        showPanel('route-preview-panel');
    }
    
    function populateRouteSteps() {
        routeStepsList.innerHTML = '';
        currentRouteData.routes[0].legs[0].steps.forEach(step => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${formatOsrmInstruction(step)}</span><span class="step-distance">${(step.distance / 1609.34).toFixed(2)} mi</span>`;
            routeStepsList.appendChild(li);
        });
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return showToast("Please fill both start and end points.", "error");
        clearRouteFromMap();
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return showToast("A route could not be found.", "error");
            
            currentRouteData = data;
            const route = data.routes[0];
            const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
            addRouteToMap(routeGeoJSON);
            const bounds = routeGeoJSON.geometry.coordinates.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds());

            if (fromInput.value.trim() === "Your Location") {
                map.fitBounds(bounds, { padding: { top: 150, bottom: 250, left: 50, right: 50 } });
                closePanel();
                startNavigation();
            } else {
                displayRoutePreview(route);
                map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
            }
        } catch (err) {
            showToast(`Error getting route: ${err.message}`, "error");
            if(navigationState.isRerouting) navigationState.isRerouting = false;
        }
    }
    
    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => { clearRouteFromMap(); showPanel('directions-panel-redesign'); });

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?key=${MAPTILER_KEY}&limit=1`);
        const data = await res.json();
        if (!data.features || data.features.length === 0) throw new Error(`Could not find: ${inputEl.value}`);
        const feature = data.features[0];
        inputEl.value = feature.place_name;
        inputEl.dataset.coords = `${feature.center[0]},${feature.center[1]}`;
        return feature.center;
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) { map.getSource('route').setData(routeGeoJSON); } 
        else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
        }
    }
    
    function formatEta(date) {
        if (!date) return "--:--";
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    function updateNavigationUI() {
        statTimeRemainingEl.textContent = `${Math.round(navigationState.totalTripTime / 60)} min`;
        statEtaEl.textContent = formatEta(navigationState.estimatedArrivalTime);
        statSpeedEl.textContent = navigationState.userSpeed.toFixed(0);
        instructionProgressBar.transform = `scaleX(${navigationState.progressAlongStep})`;
    }

    function updateHighlightedSegment(step) {
        if (!step || !step.geometry) return;
        const geojson = { type: 'Feature', geometry: step.geometry };
        if (map.getSource(highlightedSegmentLayerId)) {
            map.getSource(highlightedSegmentLayerId).setData(geojson);
        } else {
            map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: geojson });
            map.addLayer({
                id: highlightedSegmentLayerId,
                type: 'line',
                source: highlightedSegmentLayerId,
                paint: { 'line-color': '#0055ff', 'line-width': 9, 'line-opacity': 0.9 }
            }, 'route-line');
        }
    }

    function formatOsrmInstruction(step) {
        if (!step || !step.maneuver) return 'Continue';
        const { type, modifier } = step.maneuver;
        const name = step.name.split(',')[0];
        const onto = (str) => name ? `${str} onto ${name}` : str;
        const on = (str) => name ? `${str} on ${name}` : str;
    
        switch (type) {
            case 'depart': return `Head ${modifier} ${on('')}`.trim();
            case 'arrive': return `Your destination is on the ${modifier}`;
            case 'turn':
            case 'off ramp': return modifier === 'straight' ? on('Continue straight') : onto(`Turn ${modifier}`);
            case 'fork': return onto(`Keep ${modifier} at the fork`);
            case 'roundabout':
                const exit = step.maneuver.exit || 1;
                const nth = ['st', 'nd', 'rd'][exit - 1] || 'th';
                return onto(`Take the ${exit}${nth} exit`);
            default: return onto(type.replace(/_/g, ' '));
        }
    }

    function startNavigation() {
        if (!navigator.geolocation) return showToast("Geolocation is not supported by your browser.", "error");
        
        resetNavigationState();
        navigationState.isActive = true;
        navigationState.totalTripTime = currentRouteData.routes[0].duration;

        // --- ADDED FOR SMARTER REROUTING ---
        navigationState.destinationCoords = turf.point(toInput.dataset.coords.split(',').map(Number));

        const firstStep = currentRouteData.routes[0].legs[0].steps[0];
        const instruction = formatOsrmInstruction(firstStep);
        navigationInstructionEl.textContent = instruction;
        updateHighlightedSegment(firstStep);
        updateNavigationUI();

        navigationStatusPanel.style.display = 'flex';
        speechService.speak(`Starting route. ${instruction}`, true);
        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([0, 0]).addTo(map);
        }

        map.easeTo({ pitch: 60, zoom: 17, duration: 1500 });

        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.onclick = stopNavigation;
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        clearRouteFromMap();
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        speechService.synthesis.cancel();
        map.easeTo({ pitch: 0, bearing: 0 });
    }

    function handlePositionError(error) {
        console.error("Geolocation Error:", error.message);
        showToast(`Geolocation error: ${error.message}.`, "error");
        stopNavigation();
    }
    
    // --- REPLACED WITH SMARTER NAVIGATION LOGIC ---
    async function handlePositionUpdate(position) {
        if (!navigationState.isActive || navigationState.isRerouting) return;

        const { latitude, longitude, heading, speed, accuracy } = position.coords;

        if (accuracy > 80) return;

        const userPoint = turf.point([longitude, latitude]);
        const steps = currentRouteData.routes[0].legs[0].steps;
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);

        navigationState.userSpeed = (speed || 0) * 2.23694; // Convert m/s to mph

        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });

        userLocationMarker.setLngLat(snapped.geometry.coordinates);
        if (heading != null) {
            userLocationMarker.setRotation(heading);
            map.easeTo({ center: snapped.geometry.coordinates, bearing: heading, zoom: 18, duration: 500 });
        } else {
            map.easeTo({ center: snapped.geometry.coordinates, zoom: 18, duration: 500 });
        }

        // --- NEW, SMARTER REROUTING LOGIC ---
        const distanceFromRoute = snapped.properties.dist;
        const OFF_ROUTE_THRESHOLD = 50; 

        if (distanceFromRoute > OFF_ROUTE_THRESHOLD) {
            const currentDistanceToDestination = turf.distance(userPoint, navigationState.destinationCoords, { units: 'meters' });
            
            // Reroute only if user is moving away from the destination.
            if (currentDistanceToDestination > navigationState.lastDistanceToDestination + 20) {
                console.log("User is off-route and moving away. Rerouting.");
                navigationState.isRerouting = true;
                speechService.speak("Off route. Recalculating.", true);
                await getRoute(); 
                return;
            }
            
            // Update distance but wait, as user is still making progress.
            navigationState.lastDistanceToDestination = Math.min(navigationState.lastDistanceToDestination, currentDistanceToDestination);

        } else {
            // User is on track, update their progress along the official route.
            const remainingRoute = turf.lineSlice(snapped, turf.point(routeLine.coordinates[routeLine.coordinates.length - 1]), routeLine);
            navigationState.lastDistanceToDestination = turf.length(remainingRoute, { units: 'meters' });
        }
        // --- END OF NEW LOGIC ---

        const currentStep = steps[navigationState.currentStepIndex];
        const stepEndPoint = turf.point(currentStep.geometry.coordinates[currentStep.geometry.coordinates.length - 1]);
        
        navigationState.distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units: 'meters' });

        if (navigationState.distanceToNextManeuver < 50) {
            navigationState.currentStepIndex++;
            if (navigationState.currentStepIndex >= steps.length) {
                speechService.speak("You have arrived at your destination.", true);
                stopNavigation();
                return;
            }
            const nextStep = steps[navigationState.currentStepIndex];
            const nextInstruction = formatOsrmInstruction(nextStep);
            navigationInstructionEl.textContent = nextInstruction;
            updateHighlightedSegment(nextStep);
            speechService.speak(nextInstruction, true);
            navigationState.lastAnnouncedDistance = Infinity;
        }

        const totalStepDistance = turf.length(turf.lineString(currentStep.geometry.coordinates), { units: 'meters' });
        navigationState.progressAlongStep = Math.max(0, 1 - (navigationState.distanceToNextManeuver / totalStepDistance));
        
        const tripDurationSeconds = currentRouteData.routes[0].duration;
        const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
        const remainingTimeSeconds = tripDurationSeconds - timeElapsed;
        navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
        navigationState.totalTripTime = remainingTimeSeconds;
        updateNavigationUI();

        const distanceMiles = navigationState.distanceToNextManeuver * 0.000621371;
        const instruction = formatOsrmInstruction(currentStep);
        if (distanceMiles < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
            speechService.speak(`In 1 mile, ${instruction}`);
            navigationState.lastAnnouncedDistance = 1;
        } else if (distanceMiles < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
            speechService.speak(`In a quarter mile, ${instruction}`);
            navigationState.lastAnnouncedDistance = 0.25;
        }
    }

    const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
    const TRAFFIC_LAYER_ID = 'traffic-lines';
    
    function addTrafficLayer() { 
        if (map.getSource(TRAFFIC_SOURCE_ID)) return; 
        map.addSource(TRAFFIC_SOURCE_ID, { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` }); 
        let firstSymbolId = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
        map.addLayer({ id: TRAFFIC_LAYER_ID, type: 'line', source: TRAFFIC_SOURCE_ID, 'source-layer': 'traffic', paint: { 'line-width': 2, 'line-color': [ 'match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0' ] } }, firstSymbolId);
    }
    
    function removeTrafficLayer() { 
        if (map.getLayer(TRAFFIC_LAYER_ID)) map.removeLayer(TRAFFIC_LAYER_ID);
        if (map.getSource(TRAFFIC_SOURCE_ID)) map.removeSource(TRAFFIC_SOURCE_ID); 
    }

    // --- Settings Menu Logic ---
    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }
    
    settingsBtns.forEach(btn => btn.addEventListener('click', openSettings));
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    
    document.querySelectorAll('input[name="map-style"]').forEach(radio => radio.onchange = () => { map.setStyle(STYLES[radio.value]); if (isMobile) closeSettings(); });
    document.getElementById('traffic-toggle').onchange = (e) => { e.target.checked ? addTrafficLayer() : removeTrafficLayer(); if (isMobile) closeSettings(); };
    document.querySelectorAll('input[name="nav-voice"]').forEach(radio => radio.onchange = () => { speechService.setVoice(radio.value); speechService.speak("Voice has been changed.", true); if (isMobile) closeSettings(); });
    
    map.on('styledata', () => { 
        if (navigationState.isActive && currentRouteData) { 
            const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry }; 
            addRouteToMap(routeGeoJSON); 
            updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]); 
        } 
        if (document.getElementById('traffic-toggle').checked) addTrafficLayer(); 
    });
    
    // --- Initialize ---
    speechService.init().then(() => {
        const savedVoice = localStorage.getItem('mapVoice') || 'female';
        speechService.setVoice(savedVoice);
        document.querySelector(`input[name="nav-voice"][value="${savedVoice}"]`).checked = true;
    });

    if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); }); }
});
