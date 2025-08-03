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

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered.'))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// --- MAIN APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // DOM ELEMENT REFERENCES (COMPLETE)
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
        usernameDisplay: document.querySelector('#logged-in-view .username'),
        emailDisplay: document.querySelector('#logged-in-view .email'),
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

    // Authentication Flow
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

    // Auth Event Listeners
    dom.loginBtn.addEventListener('click', () => authService.login());
    dom.logoutBtn.addEventListener('click', () => authService.logout());
    dom.signupBtn.addEventListener('click', () => {
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });

    // --- MAP LOGIC & STATE ---
    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty/style.json',
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
    
    let userLocationMarker = null;
    let mainSearchPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: true });
    
    // --- ALL HELPER FUNCTIONS (UNABRIDGED) ---
    const debounce = (func, delay) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; };
    const formatDistance = (meters) => { if (appState.units === 'imperial') { const miles = meters / 1609.34; if (miles < 0.1) return `${Math.round(miles * 5280)} ft`; return `${miles.toFixed(1)} mi`; } if (meters < 1000) return `${Math.round(meters)} m`; return `${(meters / 1000).toFixed(1)} km`; };
    const formatDuration = (seconds) => { const hours = Math.floor(seconds / 3600); const minutes = Math.round((seconds % 3600) / 60); if (hours > 0) return `${hours} hr ${minutes} min`; return `${minutes} min`; };
    const getManeuverIcon = (type, modifier) => { const icons = { 'turn-right': '<path d="M6.41 6L11 10.59V4H13V12H5V10H9.59L5 5.41L6.41 6Z"/>','turn-left': '<path d="M17.59 6L13 10.59V4H11V12H19V10H14.41L19 5.41L17.59 6Z"/>','straight': '<path d="M11 4V12H6.41L11 16.59L15.59 12H13V4H11Z"/>','roundabout-right': '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8V11h-2v1c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>','depart': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/>','arrive': '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>' }; const key = modifier ? `${type}-${modifier}` : type; return icons[key] || icons['straight']; };
    const fetchSuggestions = async (query, suggestionsElement) => { if (query.length < 3) { suggestionsElement.innerHTML = ''; suggestionsElement.style.display = 'none'; return; } const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`; try { const response = await fetch(url); const data = await response.json(); displaySuggestions(data, suggestionsElement); } catch (error) { console.error('Geocoding suggestions error:', error); } };
    const displaySuggestions = (suggestions, element) => { element.innerHTML = ''; if (suggestions.length === 0) { element.style.display = 'none'; return; } suggestions.forEach(place => { const div = document.createElement('div'); div.className = 'search-result'; div.textContent = place.display_name; div.onclick = () => handleSuggestionClick(place, element.id); element.appendChild(div); }); element.style.display = 'block'; };
    const handleSuggestionClick = (place, sourceElementId) => { const placeData = { lon: parseFloat(place.lon), lat: parseFloat(place.lat), name: place.display_name.split(',')[0], address: place.display_name }; if (sourceElementId === 'main-suggestions') { appState.selectedPlace = placeData; dom.mainSearchInput.value = ''; dom.mainSearchSuggestions.style.display = 'none'; map.flyTo({ center: [placeData.lon, placeData.lat], zoom: 15 }); showPlaceInfo(placeData); } else if (sourceElementId === 'panel-from-suggestions') { appState.startPoint = { ...placeData, isUserLocation: false }; dom.getFromInput.value = placeData.name; dom.fromSuggestions.style.display = 'none'; } else if (sourceElementId === 'panel-to-suggestions') { appState.endPoint = placeData; dom.getToInput.value = placeData.name; dom.toSuggestions.style.display = 'none'; } };
    const showPlaceInfo = (place) => { dom.infoName.textContent = place.name; dom.infoAddress.textContent = place.address; updateSaveButtonUI(); showPanelContent('info-panel-redesign'); };
    const showPanelContent = (panelToShow) => { [dom.infoPanel, dom.directionsPanel, dom.routeSection].forEach(p => p.hidden = true); if (panelToShow) document.getElementById(panelToShow).hidden = false; dom.backToInfoBtn.style.display = appState.selectedPlace ? 'block' : 'none'; if (!dom.sidePanel.classList.contains('open')) dom.sidePanel.classList.add('open'); };
    const hideSidePanel = () => dom.sidePanel.classList.remove('open');
    const getSavedPlaces = () => JSON.parse(localStorage.getItem('theboiismc-maps-saved-places')) || [];
    const savePlaces = (places) => localStorage.setItem('theboiismc-maps-saved-places', JSON.stringify(places));
    const toggleSavePlace = (place) => { const places = getSavedPlaces(); const existingIndex = places.findIndex(p => p.address === place.address); if (existingIndex > -1) { places.splice(existingIndex, 1); } else { places.push(place); } savePlaces(places); updateSaveButtonUI(); };
    const updateSaveButtonUI = () => { const places = getSavedPlaces(); const saveLabel = dom.infoSaveBtn.querySelector('.btn-label'); if (appState.selectedPlace && places.find(p => p.address === appState.selectedPlace.address)) { saveLabel.textContent = "Saved"; dom.infoSaveBtn.style.opacity = '0.6'; } else { saveLabel.textContent = "Save"; dom.infoSaveBtn.style.opacity = '1'; } };
    const displaySavedPlaces = () => { const places = getSavedPlaces(); dom.routeStepsList.innerHTML = ''; dom.routeSummary.hidden = true; if (places.length === 0) dom.routeStepsList.innerHTML = `<li style="padding: 20px; color: #5f6368;">You have no saved places.</li>`; places.forEach(place => { const li = document.createElement('li'); li.className = 'route-step-item'; li.innerHTML = `<div class="step-details" style="display: block;"><div class="step-instruction">${place.name}</div><div class="step-meta" style="white-space: normal;">${place.address}</div></div>`; li.addEventListener('click', () => { map.flyTo({ center: [place.lon, place.lat], zoom: 15 }); hideSidePanel(); }); dom.routeStepsList.appendChild(li); }); showPanelContent('route-section'); };
    const fetchRoute = async () => { if (!appState.startPoint || !appState.endPoint) { alert("Please set both a start and end point."); return; } const coords = `${appState.startPoint.lon},${appState.startPoint.lat};${appState.endPoint.lon},${appState.endPoint.lat}`; const url = `https://router.project-osrm.org/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=full`; try { const response = await fetch(url); if (!response.ok) throw new Error('Failed to fetch route'); const data = await response.json(); if (data.code === 'Ok' && data.routes.length > 0) { appState.currentRoute = data.routes[0]; displayRouteDetails(appState.currentRoute); drawRouteOnMap(appState.currentRoute.geometry); } else { alert("Could not find a route."); } } catch (error) { console.error("Routing error:", error); alert("Error fetching route."); } };
    const displayRouteDetails = (route) => { dom.routeSummary.hidden = false; showPanelContent('route-section'); const leg = route.legs[0]; dom.routeSummaryTitle.textContent = formatDuration(route.duration); dom.routeSummaryMeta.textContent = `(${formatDistance(route.distance)})`; dom.startNavBtn.style.display = appState.startPoint.isUserLocation ? 'block' : 'none'; dom.routeStepsList.innerHTML = ''; leg.steps.forEach((step, index) => { const li = document.createElement('li'); li.className = 'route-step-item'; const iconSVG = getManeuverIcon(step.maneuver.type, step.maneuver.modifier); li.innerHTML = `<div class="step-icon"><svg viewBox="0 0 24 24" fill="currentColor">${iconSVG}</svg></div><div class="step-details"><div class="step-instruction">${step.maneuver.instruction}</div><div class="step-meta">${formatDistance(step.distance)}</div></div>`; li.addEventListener('click', () => map.flyTo({ center: step.maneuver.location, zoom: 17, pitch: 45 })); dom.routeStepsList.appendChild(li); }); };
    const drawRouteOnMap = (geometry) => { if (mainSearchPopup.isOpen()) mainSearchPopup.remove(); const geojson = { type: 'Feature', geometry: geometry }; if (map.getSource('route')) { map.getSource('route').setData(geojson); } else { map.addSource('route', { type: 'geojson', data: geojson }); map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1a73e8', 'line-width': 7, 'line-opacity': 0.8 } }, 'road-label'); } map.fitBounds(turf.bbox(geojson), { padding: { top: 100, bottom: 250, left: 100, right: 100 } }); };
    const clearRoute = () => { if (map.getLayer('route-line')) map.removeLayer('route-line'); if (map.getSource('route')) map.removeSource('route'); appState.currentRoute = null; };
    const startLiveNavigation = () => { if (!appState.currentRoute || !appState.startPoint.isUserLocation) { alert("Live navigation is only available when starting from your current location."); return; } appState.isNavigating = true; appState.currentStepIndex = 0; hideSidePanel(); dom.body.classList.add('navigating'); dom.navigationStatus.classList.add('visible'); map.easeTo({ pitch: 60, zoom: 18 }); updateNavigationInstruction(appState.currentRoute.legs[0].steps[0]); appState.navigationWatcherId = navigator.geolocation.watchPosition(handleNavigationUpdate, handleNavigationError, { enableHighAccuracy: true }); };
    const endLiveNavigation = () => { if (appState.navigationWatcherId) navigator.geolocation.clearWatch(appState.navigationWatcherId); appState.isNavigating = false; appState.navigationWatcherId = null; dom.body.classList.remove('navigating'); dom.navigationStatus.classList.remove('visible'); map.easeTo({ pitch: 0 }); showPanelContent('route-section'); };
    const handleNavigationUpdate = (position) => { const userCoords = [position.coords.longitude, position.coords.latitude]; appState.userLocation = userCoords; map.panTo(userCoords); const routeLine = turf.lineString(appState.currentRoute.geometry.coordinates); const userPoint = turf.point(userCoords); const distanceToRoute = turf.pointToLineDistance(userPoint, routeLine, { units: 'meters' }); if (distanceToRoute > 50) { dom.navigationInstruction.textContent = 'Recalculating...'; fetchRoute(); return; } const leg = appState.currentRoute.legs[0]; const nextStep = leg.steps[appState.currentStepIndex + 1]; if (!nextStep) { const destination = leg.steps[leg.steps.length - 1].maneuver.location; const distanceToDest = turf.distance(userPoint, turf.point(destination), { units: 'meters' }); if (distanceToDest < 25) { updateNavigationInstruction(leg.steps[leg.steps.length - 1], true); setTimeout(endLiveNavigation, 5000); } return; } const nextManeuverPoint = turf.point(nextStep.maneuver.location); const distanceToNextManeuver = turf.distance(userPoint, nextManeuverPoint, { units: 'meters' }); if (distanceToNextManeuver < 30) { appState.currentStepIndex++; updateNavigationInstruction(leg.steps[appState.currentStepIndex]); } else { dom.subInstruction.textContent = `In ${formatDistance(distanceToNextManeuver)}, ${nextStep.maneuver.instruction}`; } };
    const updateNavigationInstruction = (step, isArriving = false) => { if (isArriving) { dom.navigationInstruction.innerHTML = `You have arrived`; dom.subInstruction.textContent = `at ${appState.endPoint.name}`; } else { dom.navigationInstruction.innerHTML = step.maneuver.instruction; const nextStep = appState.currentRoute.legs[0].steps[appState.currentStepIndex + 1]; dom.subInstruction.textContent = nextStep ? `Then, ${nextStep.maneuver.instruction}` : `You will arrive at your destination.`; } };
    const handleNavigationError = (error) => { console.error(error); alert("Could not get your location. Please enable location services."); endLiveNavigation(); };
    
    // --- ALL EVENT LISTENERS (UNABRIDGED) ---
    dom.mainSearchInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.mainSearchSuggestions), 300));
    dom.getFromInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.fromSuggestions), 300));
    dom.getToInput.addEventListener('input', debounce(e => fetchSuggestions(e.target.value, dom.toSuggestions), 300));
    dom.mainDirectionsIcon.addEventListener('click', () => { showPanelContent('directions-panel-redesign'); if (appState.selectedPlace) { appState.endPoint = appState.selectedPlace; dom.getToInput.value = appState.selectedPlace.name; } });
    dom.infoDirectionsBtn.addEventListener('click', () => { showPanelContent('directions-panel-redesign'); if (appState.selectedPlace) { appState.endPoint = appState.selectedPlace; dom.getToInput.value = appState.selectedPlace.name; } });
    dom.backToInfoBtn.addEventListener('click', () => showPlaceInfo(appState.selectedPlace));
    dom.swapBtn.addEventListener('click', () => { [appState.startPoint, appState.endPoint] = [appState.endPoint, appState.startPoint]; [dom.getFromInput.value, dom.getToInput.value] = [dom.getToInput.value, dom.getFromInput.value]; });
    dom.getRouteBtn.addEventListener('click', fetchRoute);
    dom.exitRouteBtn.addEventListener('click', () => { showPanelContent('directions-panel-redesign'); clearRoute(); });
    dom.useMyLocationBtn.addEventListener('click', () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(position => { const { longitude, latitude } = position.coords; appState.userLocation = [longitude, latitude]; appState.startPoint = { lon: longitude, lat: latitude, name: "Your Location", isUserLocation: true }; dom.getFromInput.value = "Your Location"; }, handleNavigationError); } });
    dom.infoSaveBtn.addEventListener('click', () => { if (appState.selectedPlace) toggleSavePlace(appState.selectedPlace); });
    dom.profileButton.addEventListener('click', (e) => { e.stopPropagation(); dom.profileDropdown.style.display = dom.profileDropdown.style.display === 'block' ? 'none' : 'block'; });
    dom.savedPlacesBtn.addEventListener('click', () => { dom.profileDropdown.style.display = 'none'; displaySavedPlaces(); });
    dom.settingsButtons.forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); dom.settingsMenu.classList.add('open'); if (window.innerWidth <= 768) dom.menuOverlay.classList.add('open'); }));
    const closeSettings = () => { dom.settingsMenu.classList.remove('open'); dom.menuOverlay.classList.remove('open'); };
    dom.closeSettingsBtn.addEventListener('click', closeSettings);
    dom.menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', () => { dom.profileDropdown.style.display = 'none'; dom.mainSearchSuggestions.style.display = 'none'; dom.fromSuggestions.style.display = 'none'; dom.toSuggestions.style.display = 'none'; });
    dom.closePanelBtn.addEventListener('click', hideSidePanel);
    dom.startNavBtn.addEventListener('click', startLiveNavigation);
    dom.endNavigationBtn.addEventListener('click', endLiveNavigation);
    document.querySelectorAll('input[name="map-style"]').forEach(radio => radio.addEventListener('change', (e) => {
        const style = e.target.value;
        appState.mapStyle = style;
        const styleUrl = style === 'satellite' 
            ? { version: 8, sources: { 'arcgis-satellite': { type: 'raster', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'arcgis-satellite' }] } 
            : 'https://tiles.openfreemap.org/styles/liberty/style.json';
        map.setStyle(styleUrl).once('style.load', () => { if (appState.currentRoute) drawRouteOnMap(appState.currentRoute.geometry); });
    }));
    document.querySelectorAll('input[name="map-units"]').forEach(radio => radio.addEventListener('change', (e) => { appState.units = e.target.value; if (appState.currentRoute) displayRouteDetails(appState.currentRoute); }));
});
