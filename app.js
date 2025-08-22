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
    // --- AUTHENTICATION UI ELEMENTS ---
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
            window.location.href = "/"; // redirect after login
        } else {
            const user = await authService.getUser();
            updateAuthUI(user);
        }
    } catch (error) {
        console.error("Authentication process failed:", error);
        updateAuthUI(null);
    }

    profileButton.addEventListener('click', (e) => {
        e.stopPropagation();
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

    // --- MAP INITIALIZATION & CONTROLS ---
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const API_KEY = 'F3cdRiC1r36tcrNrvrcV';

    const STYLES = {
        streets: `https://api.maptiler.com/maps/streets-v2/style.json?key=${API_KEY}`,
        satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${API_KEY}`,
        hybrid: `https://api.maptiler.com/maps/hybrid/style.json?key=${API_KEY}`
    };

    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.streets,
        center: [-95, 39],
        zoom: 4,
        pitch: 0,
        maxPitch: 0,
        bearing: 0,
        dragRotate: false
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: false
    });
    map.addControl(geolocateControl, "bottom-right");

    map.on('load', () => {
        geolocateControl.trigger();
        map.resize();

        // Add traffic layer on map load, but keep it hidden by default
        map.addSource('traffic', {
            type: 'raster',
            tiles: [
                `https://api.maptiler.com/tiles/traffic/{z}/{x}/{y}.png?key=${API_KEY}`
            ],
            tileSize: 256
        });
        map.addLayer({
            id: 'traffic-layer',
            type: 'raster',
            source: 'traffic',
            paint: {
                'raster-opacity': 0.8
            },
            layout: {
                'visibility': 'none'
            }
        });
    });

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
            if (priority && this.synthesis.speaking) this.synthesis.cancel();
            if (!this.synthesis.speaking && text) {
                this.utterance.text = text;
                this.synthesis.speak(this.utterance);
            }
        }
    };

    // --- NAVIGATION STATE ---
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

    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const statSpeedEl = document.getElementById('stat-speed');
    const statEtaEl = document.getElementById('stat-eta');
    const statTimeRemainingEl = document.getElementById('stat-time-remaining');
    const highlightedSegmentLayerId = 'highlighted-route-segment';

    // --- PANEL & SEARCH LOGIC ---
    function moveSearchBarToPanel() {
        if (!isMobile) {
            mainSearchContainer.style.boxShadow = 'none';
            mainSearchContainer.style.borderRadius = '8px';
            panelSearchPlaceholder.hidden = false;
            panelSearchPlaceholder.appendChild(mainSearchContainer);
            topSearchWrapper.style.opacity = '0';
        }
    }

    function moveSearchBarToTop() {
        if (!isMobile) {
            mainSearchContainer.style.boxShadow = '';
            mainSearchContainer.style.borderRadius = '';
            topSearchWrapper.appendChild(mainSearchContainer);
            panelSearchPlaceholder.hidden = true;
            topSearchWrapper.style.opacity = '1';
        }
    }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => {
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
        else {
            sidePanel.classList.remove('open');
            moveSearchBarToTop();
        }
    }

    closePanelBtn.addEventListener('click', closePanel);
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
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&viewbox=${viewbox}&bounded=1&extratags=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'TheBoiisMC Maps' }
            });
            const data = await response.json();
            suggestionsEl.innerHTML = "";
            data.forEach(result => {
                const item = document.createElement("div");
                item.className = "search-result";
                item.innerHTML = `<strong>${result.name || result.address.amenity || result.address.building || result.display_name}</strong><br><small>${result.display_name}</small>`;
                item.onclick = () => { onSelect(result); };
                suggestionsEl.appendChild(item);
            });
            suggestionsEl.style.display = "block";
        };

        inputEl.addEventListener('input', debounce((e) => {
            const query = e.target.value;
            fetchAndDisplaySuggestions(query);
        }, 300));

        inputEl.addEventListener('focus', (e) => {
            const query = e.target.value;
            if (query) fetchAndDisplaySuggestions(query);
        });

        document.addEventListener('click', (e) => {
            if (!suggestionsEl.contains(e.target) && e.target !== inputEl) {
                suggestionsEl.style.display = "none";
            }
        });
    }

    attachSuggestionListener(mainSearchInput, document.getElementById('main-suggestions'), async (place) => {
        const [lon, lat] = [parseFloat(place.lon), parseFloat(place.lat)];
        map.flyTo({ center: [lon, lat], zoom: 15 });
        currentPlace = place;
        showInfoPanel(place);
    });

    const panelFromInput = document.getElementById('panel-from-input');
    const panelToInput = document.getElementById('panel-to-input');
    const panelFromSuggestions = document.getElementById('panel-from-suggestions');
    const panelToSuggestions = document.getElementById('panel-to-suggestions');
    let fromPlace = null;
    let toPlace = null;

    attachSuggestionListener(panelFromInput, panelFromSuggestions, (place) => {
        panelFromInput.value = place.display_name;
        fromPlace = place;
    });

    attachSuggestionListener(panelToInput, panelToSuggestions, (place) => {
        panelToInput.value = place.display_name;
        toPlace = place;
    });

    // --- DIRECTIONS & ROUTING LOGIC ---
    let directionsSource = null;
    let directionsLayer = null;
    const getRouteBtn = document.getElementById('get-route-btn');
    const backToInfoBtn = document.getElementById('back-to-info-btn');
    const routePreviewPanel = document.getElementById('route-preview-panel');
    const routeSummaryTimeEl = document.getElementById('route-summary-time');
    const routeSummaryDistanceEl = document.getElementById('route-summary-distance');
    const startNavigationBtn = document.getElementById('start-navigation-btn');
    const exitRouteBtn = document.getElementById('exit-route-btn');
    const routeStepsList = document.getElementById('route-steps');
    const showRouteStepsBtn = document.getElementById('show-route-steps-btn');
    const backToDirectionsBtn = document.getElementById('back-to-directions-btn');
    const swapBtn = document.getElementById('swap-btn');

    function parseDuration(seconds) {
        if (seconds < 60) return `${Math.round(seconds)} sec`;
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours} hr ${remainingMinutes} min`;
    }

    getRouteBtn.addEventListener('click', async () => {
        if (!fromPlace || !toPlace) {
            alert('Please select a starting point and destination.');
            return;
        }

        const fromCoord = [parseFloat(fromPlace.lon), parseFloat(fromPlace.lat)];
        const toCoord = [parseFloat(toPlace.lon), parseFloat(toPlace.lat)];

        // Use MapTiler Directions API for traffic-aware routing
        const url = `https://api.maptiler.com/directions/v5/mapbox/driving/${fromCoord.join(',')};${toCoord.join(',')}?geometries=geojson&overview=full&steps=true&access_token=${API_KEY}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.routes && data.routes.length > 0) {
                currentRouteData = data;
                const route = data.routes[0];
                const distanceKm = route.distance / 1000;
                const durationSeconds = route.duration;
                routeSummaryTimeEl.textContent = parseDuration(durationSeconds);
                routeSummaryDistanceEl.textContent = `${distanceKm.toFixed(1)} km`;
                showPanel('route-preview-panel');

                // Draw the route on the map
                if (map.getSource('route')) {
                    map.getSource('route').setData(route.geometry);
                } else {
                    map.addSource('route', { type: 'geojson', data: route.geometry });
                    map.addLayer({
                        id: 'route-line',
                        type: 'line',
                        source: 'route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#00796b', 'line-width': 6, 'line-opacity': 0.8 }
                    });
                }
                const bounds = new maplibregl.LngLatBounds();
                route.geometry.coordinates.forEach(coord => bounds.extend(coord));
                map.fitBounds(bounds, { padding: 100, maxZoom: 16 });

                // Populate route steps
                routeStepsList.innerHTML = '';
                route.legs[0].steps.forEach(step => {
                    const li = document.createElement('li');
                    li.textContent = step.maneuver.instruction;
                    routeStepsList.appendChild(li);
                });
            } else {
                alert('Routing failed. Please try a different route.');
            }
        } catch (error) {
            console.error("Routing error:", error);
            alert('An error occurred during routing.');
        }
    });

    startNavigationBtn.addEventListener('click', () => {
        if (!currentRouteData) return;
        resetNavigationState();
        navigationState.isActive = true;
        showPanel('route-section');
        navigationStatusPanel.style.display = 'flex';
        topSearchWrapper.hidden = true;
        sidePanel.style.display = 'none';
        // Add navigation-specific layers/markers
    });

    endNavigationBtn.addEventListener('click', () => {
        navigationState.isActive = false;
        navigationStatusPanel.style.display = 'none';
        topSearchWrapper.hidden = false;
        // Remove navigation-specific layers/markers from map
    });

    // --- MAP SETTINGS & OVERLAY ---
    const settingsBtn = document.querySelector('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const mapStyleRadios = document.querySelectorAll('input[name="map-style"]');
    const trafficToggle = document.getElementById('traffic-toggle');

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('open');
        menuOverlay.classList.toggle('open');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsMenu.classList.remove('open');
        menuOverlay.classList.remove('open');
    });

    menuOverlay.addEventListener('click', () => {
        settingsMenu.classList.remove('open');
        menuOverlay.classList.remove('open');
    });

    mapStyleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const style = e.target.value;
            map.setStyle(STYLES[style]);
        });
    });

    trafficToggle.addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        map.setLayoutProperty('traffic-layer', 'visibility', visibility);
    });

    // --- MOBILE SPECIFIC ---
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    mobileSettingsBtn.addEventListener('click', (e) => {
        settingsMenu.classList.toggle('open');
        menuOverlay.classList.toggle('open');
    });

    // --- WIKIPEDIA & WEATHER LOGIC ---
    async function showInfoPanel(place) {
        if (!place) return;
        document.getElementById('info-name').textContent = place.name || 'Place';
        document.getElementById('info-address').textContent = place.display_name;
        showPanel('info-panel-redesign');
    }
});
