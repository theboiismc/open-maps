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
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
        if (isLoggedIn) {
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
    } catch (error) { console.error("Authentication process failed:", error); updateAuthUI(null); }

    profileButton.addEventListener('click', () => { profileDropdown.style.display = profileDropdown.style.display === 'block' ? 'none' : 'block'; });
    document.addEventListener('click', (e) => { if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) { profileDropdown.style.display = 'none'; } });
    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    // --- MAP INITIALIZATION & CONTROLS ---
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: 'https://tiles.theboiismc.com/styles/basic-preview/style.json',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };

    const map = new maplibregl.Map({ container: "map", style: STYLES.default, center: [-95, 39], zoom: 4 });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ positionOptions: geolocationOptions, trackUserLocation: true, showUserHeading: true });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());

    // --- GLOBAL VARIABLES & UI ELEMENTS ---
    const sidePanel = document.getElementById("side-panel");
    const panelContent = sidePanel.querySelector('.panel-content');
    const mainSearchInput = document.getElementById("main-search");
    let currentPlace = null;
    let currentRouteData = null;
    let userLocationMarker = null;
    let navigationWatcherId = null;

    // ===================================================================
    // HTML TEMPLATES FOR EACH DYNAMIC PANEL STATE
    // ===================================================================
    const panelViews = {
        default: () => `
            <div class="panel-section">
                <h2>Directions</h2>
                <div class="icon-grid">
                    <div class="icon-item" id="default-drive-btn"><div class="icon-circle" style="background-color: #4285F4;"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div><span>Drive</span></div>
                </div>
            </div>
            <div class="panel-section">
                <h2>Nearby Places</h2>
                <div class="icon-grid">
                    <div class="icon-item" data-search-query="restaurants"><div class="icon-circle" style="background-color: #EA4335;"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg></div><span>Restaurants</span></div>
                    <div class="icon-item" data-search-query="gas stations"><div class="icon-circle" style="background-color: #4285F4;"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 3c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2s2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14.2c-2.49 0-4.5-2.01-4.5-4.5s2.01-4.5 4.5-4.5 4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zM8.5 20v-2.5C7.02 16.99 6 15.64 6 14H4c0 2.21 1.79 4 4 4v2.5h-1V22h6v-1.5h-1V20h-3.5z"/></svg></div><span>Gas stations</span></div>
                </div>
            </div>
        `,
        info: (data) => `
            <div id="info-panel-redesign">
                <div class="header-image-container"><img class="header-image" id="info-image" src="${data.image || ''}" alt="Image of the location"/><button id="close-info-btn" aria-label="Back"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button></div>
                <h3>${data.name || ''}</h3>
                <div class="address">${data.address || ''}</div>
                <div class="weather" id="info-weather">${data.weather || 'Loading...'}</div>
                <div class="action-buttons"><div class="btn-wrapper" id="info-directions-btn"><div class="icon-circle"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M21.5 15.6l-7.1-7.1C13.9 8.35 13.5 8 13 8h-2c-.5 0-1 .4-1 .85l-7 7.1c-.4.4-1.2.1-1.2.6v.9c0 .5.7.8 1.1.4l6.5-6.5c.5-.5.8-.8 1.4-.8h.8c.6 0 .9 .3 1.4 .8l6.5 6.5c.4.4 1.1.1 1.1-.4v-.9c0-.5-.7-.8-1.1-.4z"/></svg></div><div class="btn-label">Directions</div></div><div class="btn-wrapper" id="info-save-btn"><div class="icon-circle"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg></div><div class="btn-label">Save</div></div></div>
                <div id="quick-facts"><h4>Quick facts</h4><p id="quick-facts-content">${data.facts || 'Loading...'}</p></div>
            </div>
        `,
        directions: (data) => `
            <div id="directions-panel-redesign">
                <div class="dir-input-group">
                    <div class="dir-input-wrapper"><span class="material-symbols-outlined"><!-- From Icon --></span><input type="text" id="panel-from-input" placeholder="Choose starting point" value="${data.fromName || ''}" autocomplete="off"/></div>
                    <div id="panel-from-suggestions" class="suggestions-dropdown"></div>
                    <div class="dir-input-wrapper"><span class="material-symbols-outlined"><!-- To Icon --></span><input type="text" id="panel-to-input" placeholder="Choose destination" value="${data.toName || ''}" autocomplete="off"/></div>
                    <div id="panel-to-suggestions" class="suggestions-dropdown"></div>
                    <button id="swap-btn" aria-label="Swap locations"><!-- Swap Icon --></button>
                </div>
                <div class="dir-quick-select" id="dir-use-my-location">Your location</div>
                <button id="get-route-btn">Get Route</button>
                <button id="back-to-info-btn">Back</button>
            </div>
        `,
        routePreview: (data) => `
            <div id="route-preview-panel">
                <div class="route-summary"><h3>${data.duration}</h3><div>${data.distance}</div></div>
                <div class="action-buttons"><div class="btn-wrapper" id="start-navigation-btn"><div class="icon-circle"><!-- Nav Icon --></div><div class="btn-label">Start Trip</div></div><div class="btn-wrapper" id="share-route-btn"><div class="icon-circle"><!-- Share Icon --></div><div class="btn-label">Share</div></div></div>
                <button id="back-to-directions-btn">Back</button>
            </div>
        `
    };

    // ===================================================================
    // CENTRALIZED EVENT LISTENER ATTACHMENT
    // ===================================================================
    function attachPanelListeners() {
        // Default Panel
        document.getElementById('default-drive-btn')?.addEventListener('click', () => setPanelState('directions'));
        panelContent.querySelectorAll('.icon-item[data-search-query]').forEach(item => {
            item.addEventListener('click', () => {
                mainSearchInput.value = item.dataset.searchQuery;
                performSmartSearch(mainSearchInput, processPlaceResult);
            });
        });

        // Info Panel
        document.getElementById('close-info-btn')?.addEventListener('click', () => setPanelState('default'));
        document.getElementById('info-directions-btn')?.addEventListener('click', () => {
            const toName = currentPlace ? currentPlace.display_name : '';
            setPanelState('directions', { toName });
        });
        document.getElementById('info-save-btn')?.addEventListener('click', () => { /* Save logic */ });

        // Directions Panel
        const fromInput = document.getElementById('panel-from-input');
        const toInput = document.getElementById('panel-to-input');
        if (fromInput && toInput) {
            attachSuggestionListener(fromInput, document.getElementById('panel-from-suggestions'), (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
            attachSuggestionListener(toInput, document.getElementById('panel-to-suggestions'), (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });
            if (currentPlace && toInput.value) { toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`; }
        }
        document.getElementById('get-route-btn')?.addEventListener('click', () => getRoute(fromInput, toInput));
        document.getElementById('back-to-info-btn')?.addEventListener('click', () => { if (currentPlace) processPlaceResult(currentPlace); else setPanelState('default'); });
        document.getElementById('swap-btn')?.addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
        document.getElementById('dir-use-my-location')?.addEventListener('click', () => { fromInput.value = "Your Location"; /* Geolocation logic */ });

        // Route Preview
        document.getElementById('start-navigation-btn')?.addEventListener('click', () => { /* Start Nav Logic */ });
        document.getElementById('back-to-directions-btn')?.addEventListener('click', () => setPanelState('directions', { fromName: fromInput.value, toName: toInput.value }));
    }

    // ===================================================================
    // REFACTORED setPanelState with Dynamic Rendering
    // ===================================================================
    function setPanelState(newState, data = {}) {
        const viewGenerator = panelViews[newState] || panelViews.default;
        panelContent.innerHTML = viewGenerator(data);
        attachPanelListeners();

        if (isMobile) {
            if (newState === 'default') { sidePanel.classList.add('peek'); sidePanel.classList.remove('open'); }
            else if (newState !== 'hidden') { sidePanel.classList.add('open'); sidePanel.classList.remove('peek'); }
            else { sidePanel.classList.remove('open', 'peek'); }
        } else {
            if (newState !== 'hidden' && newState !== 'default') { sidePanel.classList.add('open'); }
            else { sidePanel.classList.remove('open'); }
        }
    }

    // --- REFACTORED CORE FUNCTIONS ---
    async function performSmartSearch(inputEl, onSelect) { /* ... same as before ... */ }
    function debounce(func, delay) { /* ... same as before ... */ }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { /* ... same as before ... */ }

    // Refactored data fetching functions to return data instead of manipulating DOM
    async function fetchPlaceImage(query, lon, lat) { /* ... fetches and returns image URL string ... */ }
    async function fetchWeather(lat, lon) { /* ... fetches and returns weather string ... */ }
    async function fetchQuickFacts(query) { /* ... fetches and returns facts string ... */ }

    function processPlaceResult(place) {
        currentPlace = place;
        // stopNavigation(); clearRouteFromMap();
        map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
        
        setPanelState('info', { name: place.display_name.split(',')[0], address: place.display_name });

        Promise.all([
            fetchPlaceImage(place.display_name.split(',')[0], place.lon, place.lat),
            fetchWeather(place.lat, place.lon),
            fetchQuickFacts(place.display_name.split(',')[0])
        ]).then(([image, weather, facts]) => {
            setPanelState('info', { name: place.display_name.split(',')[0], address: place.display_name, image, weather, facts });
        });
    }

    function displayRoutePreview(route) {
        setPanelState('routePreview', {
            duration: `${Math.round(route.duration / 60)} min`,
            distance: `${(route.distance / 1609.34).toFixed(1)} mi`
        });
    }

    async function getRoute(fromInput, toInput) { /* ... same getRoute logic, but using the passed input elements ... */ }
    
    // Attach listeners to static elements
    attachSuggestionListener(mainSearchInput, document.getElementById('main-suggestions'), processPlaceResult);
    document.getElementById('main-directions-icon').addEventListener('click', () => setPanelState('directions'));

    // --- ALL OTHER FUNCTIONS (Navigation, Settings, etc.) remain unchanged ---
    // ...

    // --- INITIAL PANEL STATE ---
    setPanelState('default');
});
