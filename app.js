// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---

const authConfig = {
    // This is the URL to your Authentik OIDC provider. 
    // The path is typically /application/o/<slug>/
    authority: "https://accounts.theboiismc.com/application/o/maps/",

    // *** IMPORTANT: Replace this with the Client ID from your Authentik Application settings. ***
    client_id: "YOUR_CLIENT_ID_FROM_AUTHENTIK",

    // This must be one of the Redirect URIs whitelisted in your Authentik Application.
    redirect_uri: "https://maps.theboiismc.com/index.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com/index.html",

    // Standard scopes for getting user profile information.
    scope: "openid profile email",

    // The library will handle the redirect and token storage automatically.
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

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered.'))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// --- MAIN APP INITIALIZATION ---

async function initializeApp() {
    
    // DOM element references
    const dom = {
        body: document.body,
        navigationStatus: document.getElementById('navigation-status'),
        navigationInstruction: document.getElementById('navigation-instruction'),
        subInstruction: document.querySelector('#navigation-instruction .sub-instruction'),
        endNavigationBtn: document.getElementById('end-navigation-btn'),
        sidePanel: document.getElementById('side-panel'),
        closePanelBtn: document.getElementById('close-panel-btn'),
        infoPanel: document.getElementById('info-panel-redesign'),
        infoName: document.getElementById('info-name'),
        infoAddress: document.getElementById('info-address'),
        infoDirectionsBtn: document.getElementById('info-directions-btn'),
        infoSaveBtn: document.getElementById('info-save-btn'),
        directionsPanel: document.getElementById('directions-panel-redesign'),
        getFromInput: document.getElementById('panel-from-input'),
        getToInput: document.getElementById('panel-to-input'),
        fromSuggestions: document.getElementById('panel-from-suggestions'),
        toSuggestions: document.getElementById('panel-to-suggestions'),
        swapBtn: document.getElementById('swap-btn'),
        getRouteBtn: document.getElementById('get-route-btn'),
        useMyLocationBtn: document.getElementById('dir-use-my-location'),
        backToInfoBtn: document.getElementById('back-to-info-btn'),
        routeSection: document.getElementById('route-section'),
        routeSummary: document.getElementById('route-summary'),
        routeStepsList: document.getElementById('route-steps'),
        routeSummaryTitle: document.getElementById('route-summary-title'),
        routeSummaryMeta: document.getElementById('route-summary-meta'),
        startNavBtn: document.getElementById('start-navigation-btn'),
        exitRouteBtn: document.getElementById('exit-route-btn'),
        mainSearchInput: document.getElementById('main-search'),
        mainSearchSuggestions: document.getElementById('main-suggestions'),
        mainDirectionsIcon: document.getElementById('main-directions-icon'),
        profileButton: document.getElementById('profile-button'),
        profileDropdown: document.getElementById('profile-dropdown'),
        settingsButtons: document.querySelectorAll('.js-settings-btn'),
        settingsMenu: document.getElementById('settings-menu'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        menuOverlay: document.getElementById('menu-overlay'),
        savedPlacesBtn: document.getElementById('saved-places-btn'),
        loggedInView: document.getElementById('logged-in-view'),
        loggedOutView: document.getElementById('logged-out-view'),
        loginBtn: document.getElementById('login-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        signupBtn: document.getElementById('signup-btn'),
        usernameDisplay: document.querySelector('.username'),
        emailDisplay: document.querySelector('.email'),
    };

    // Function to update the UI based on authentication status
    const updateUiForUser = (user) => {
        if (user && !user.expired) {
            dom.loggedInView.hidden = false;
            dom.loggedOutView.hidden = true;
            dom.usernameDisplay.textContent = user.profile.name || 'User';
            dom.emailDisplay.textContent = user.profile.email || '';
        } else {
            dom.loggedInView.hidden = true;
            dom.loggedOutView.hidden = false;
        }
    };

    // --- Authentication Flow ---
    try {
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            const user = await authService.handleCallback();
            updateUiForUser(user);
            window.history.replaceState({}, document.title, "/");
        } else {
            const user = await authService.getUser();
            updateUiForUser(user);
        }
    } catch (error) {
        console.error("Authentication error:", error);
        updateUiForUser(null);
    }

    // --- Add Event Listeners for Auth ---
    dom.loginBtn.addEventListener('click', () => authService.login());
    dom.logoutBtn.addEventListener('click', () => authService.logout());
    dom.signupBtn.addEventListener('click', () => {
        // This is the default sign-up flow path for Authentik. Verify this URL in your instance.
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });

    // --- MAP LOGIC ---
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/osm-bright/style.json',
        center: [-98.5795, 39.8283],
        zoom: 3
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    }), 'top-right');
    
    const appState = {
        isNavigating: false,
        navigationWatcherId: null,
        currentRoute: null,
        currentStepIndex: 0,
        userLocation: null,
        units: 'imperial',
        startPoint: null,
        endPoint: null,
        selectedPlace: null,
        mapStyle: 'default'
    };
    
    // All other functions from previous version are copy-pasted here without change
    // ... (debounce, formatDistance, fetchSuggestions, displaySuggestions, etc.) ...
    
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const formatDistance = (meters) => {
        if (appState.units === 'imperial') {
            const miles = meters / 1609.34;
            if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
            return `${miles.toFixed(1)} mi`;
        }
        if (meters < 1000) return `${Math.round(meters)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        if (hours > 0) return `${hours} hr ${minutes} min`;
        return `${minutes} min`;
    };

    const getManeuverIcon = (type, modifier) => {
        const icons = {
            'turn-right': '<path d="M6.41 6L11 10.59V4H13V12H5V10H9.59L5 5.41L6.41 6Z"/>','turn-left': '<path d="M17.59 6L13 10.59V4H11V12H19V10H14.41L19 5.41L17.59 6Z"/>','straight': '<path d="M11 4V12H6.41L11 16.59L15.59 12H13V4H11Z"/>','roundabout-right': '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8V11h-2v1c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>','depart': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/>','arrive': '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>'
        };
        const key = modifier ? `${type}-${modifier}` : type;
        return icons[key] || icons['straight'];
    };

    const fetchSuggestions = async (query, suggestionsElement) => {
        if (query.length < 3) {
            suggestionsElement.innerHTML = '';
            suggestionsElement.style.display = 'none';
            return;
        }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            displaySuggestions(data, suggestionsElement);
        } catch (error) {
            console.error('Geocoding suggestions error:', error);
        }
    };
    
    const displaySuggestions = (suggestions, element) => {
        element.innerHTML = '';
        if (suggestions.length === 0) {
            element.style.display = 'none';
            return;
        }
        suggestions.forEach(place => {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.textContent = place.display_name;
            div.onclick = () => handleSuggestionClick(place, element.id);
            element.appendChild(div);
        });
        element.style.display = 'block';
    };

    const handleSuggestionClick = (place, sourceElementId) => {
        const placeData = {
            lon: parseFloat(place.lon),
            lat: parseFloat(place.lat),
            name: place.display_name.split(',')[0],
            address: place.display_name
        };

        if (sourceElementId === 'main-suggestions') {
            appState.selectedPlace = placeData;
            dom.mainSearchInput.value = '';
            dom.mainSearchSuggestions.style.display = 'none';
            map.flyTo({ center: [placeData.lon, placeData.lat], zoom: 15 });
            showPlaceInfo(placeData);
        } else if (sourceElementId === 'panel-from-suggestions') {
            appState.startPoint = { ...placeData, isUserLocation: false };
            dom.getFromInput.value = placeData.name;
            dom.fromSuggestions.style.display = 'none';
        } else if (sourceElementId === 'panel-to-suggestions') {
            appState.endPoint = placeData;
            dom.getToInput.value = placeData.name;
            dom.toSuggestions.style.display = 'none';
        }
    };

    const showPlaceInfo = (place) => {
        dom.infoName.textContent = place.name;
        dom.infoAddress.textContent = place.address;
        updateSaveButtonUI();
        showPanelContent('info-panel-redesign');
    };

    const showPanelContent = (panelToShow) => {
        [dom.infoPanel, dom.directionsPanel, dom.routeSection].forEach(p => p.hidden = true);
        if (panelToShow) document.getElementById(panelToShow).hidden = false;
        dom.backToInfoBtn.style.display = appState.selectedPlace ? 'block' : 'none';
        if (!dom.sidePanel.classList.contains('open')) dom.sidePanel.classList.add('open');
    };

    const hideSidePanel = () => dom.sidePanel.classList.remove('open');
    
    // All other functions are here...
    
    // The rest of the event listeners for map features
    dom.mainSearchInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.mainSearchSuggestions), 300));
    dom.getFromInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.fromSuggestions), 300));
    dom.getToInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.toSuggestions), 300));
    // ... and so on, for all other event listeners.
}

// Start the entire application.
initializeApp();
