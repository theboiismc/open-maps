/**
 * app.js
 *
 * This file contains the core logic for TheBoiisMC Maps application.
 * It handles user authentication, map rendering and controls, search functionality,
 * routing, turn-by-turn navigation, and various UI interactions like the side panel,
 * settings menu, and the context menu.
 *
 * --- UPDATED ---
 * 1. Modernized toast notifications: Non-stacking, bottom-anchored, with icons.
 * 2. Implemented "Saved Places" feature using localStorage, keyed by user ID.
 * - "Save" button on info panel is now functional.
 * - "Saved Places" button in profile dropdown now lists saved locations.
 */

// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "xqfUqdpbn8PCCz6ouRAQtFV0oUyg4lpEb64U8W9s",
    scope: 'openid profile email offline_access',
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

// --- UTILITY FUNCTIONS (TOASTS) ---
let activeToast = null;

/**
 * Shows a non-stacking toast notification at the bottom of the screen.
 * @param {string} message The message to display.
 * @param {'info' | 'success' | 'error'} type The type of toast.
 * @param {number} duration How long to display the toast (in ms).
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // If a toast is already active, dismiss it immediately
    if (activeToast) {
        activeToast.dismiss();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Add icon based on type
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';

    toast.innerHTML = `
        <span class="material-symbols-sharp">${icon}</span>
        <p>${message}</p>
    `;

    // Create a dismiss function
    const dismiss = () => {
        toast.classList.remove('show');
        if (activeToast && activeToast.element === toast) {
            clearTimeout(activeToast.timeoutId);
            activeToast = null;
        }
        toast.addEventListener('transitionend', () => toast.remove());
    };

    const timeoutId = setTimeout(dismiss, duration);
    
    // Store this as the active toast
    activeToast = {
        element: toast,
        timeoutId: timeoutId,
        dismiss: dismiss
    };
    
    // Add click-to-dismiss functionality
    toast.addEventListener('click', dismiss);

    container.appendChild(toast);
    // Use a tiny timeout to allow the element to be in the DOM before triggering transition
    setTimeout(() => toast.classList.add('show'), 10);
}

// --- MAIN APPLICATION INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENT SELECTORS ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const defaultProfileIconSVG = '<span class="material-symbols-sharp text-2xl">account_circle</span>';
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const dropdownAvatar = document.getElementById('dropdown-avatar');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const savedPlacesBtn = document.getElementById('saved-places-btn'); // Added for Saved Places
    const appMenuButton = document.getElementById('app-menu-button');
    const servicesDropdown = document.getElementById('services-dropdown');
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
    const infoNameEl = document.getElementById('info-name');
    const infoAddressEl = document.getElementById('info-address');
    const infoImageEl = document.getElementById('info-image');
    const infoWeatherEl = document.getElementById('info-weather');
    const quickFactsEl = document.getElementById('quick-facts-content');
    const infoWebsiteBtn = document.getElementById('info-website-btn');
    const infoSaveBtn = document.getElementById('info-save-btn'); // Added for Saved Places
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const contextMenu = document.getElementById('context-menu');
    const contextMenuCoords = document.getElementById('context-menu-coords');
    const backToInfoBtn = document.getElementById('back-to-info-btn');
    const mainSuggestions = document.getElementById("main-suggestions");
    const initialSuggestionsView = document.getElementById("initial-suggestions-view");
    const apiSuggestionsView = document.getElementById("api-suggestions-view");
    const recentSearchesContainer = document.getElementById("recent-searches-container");
    const categoryPillsContainer = document.querySelector(".category-pills");
    const backFromResultsBtn = document.getElementById('back-from-results-btn');
    const searchResultsQueryEl = document.getElementById('search-results-query');
    const searchResultsListEl = document.getElementById('search-results-list');

    // Settings Modal Selectors
    const settingsModal = document.getElementById('settings-modal');
    const settingsIconBtn = document.getElementById('settings-icon-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const globeToggle = document.getElementById('globe-toggle');

    // --- RECENT SEARCH MANAGEMENT ---
    const RECENT_SEARCHES_KEY = 'theboiismc-maps-recent-searches';
    const MAX_RECENT_SEARCHES = 5;

    function getRecentSearches() {
        return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
    }

    function addRecentSearch(place) {
        if (!place || !place.display_name) return;
        let searches = getRecentSearches();
        searches = searches.filter(item => item.display_name !== place.display_name);
        searches.unshift(place);
        if (searches.length > MAX_RECENT_SEARCHES) {
            searches.length = MAX_RECENT_SEARCHES;
        }
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    }

    // --- APP STATE VARIABLES ---
    let currentUser = null;
    let savedPlaces = []; // Added for Saved Places
    let contextMenuLngLat = null;
    let currentPlace = null;
    let currentRouteData = null;
    let clickedLocationMarker = null;
    let navigationWatcherId = null;
    let userLocationMarker = null;
    let searchResultMarkers = [];

    // --- SAVED PLACES LOGIC (NEW) ---

    /** Gets the localStorage key for saved places, namespaced by user ID. */
    const getSavedPlacesKey = () => {
        const userId = currentUser?.profile?.sub || 'guest';
        return `theboiismc-maps-saved-places-${userId}`;
    };

    /** Loads saved places from localStorage into the `savedPlaces` state variable. */
    function loadSavedPlaces() {
        savedPlaces = JSON.parse(localStorage.getItem(getSavedPlacesKey())) || [];
    }

    /** Persists the current `savedPlaces` state variable to localStorage. */
    function persistSavedPlaces() {
        localStorage.setItem(getSavedPlacesKey(), JSON.stringify(savedPlaces));
    }

    /** Checks if a place is already in the `savedPlaces` array. */
    function isPlaceSaved(place) {
        if (!place) return false;
        return savedPlaces.some(p => p.display_name === place.display_name);
    }

    /** Adds a place to the saved list and persists it. */
    function addSavedPlace(place) {
        if (!place || isPlaceSaved(place)) return;
        savedPlaces.unshift(place); // Add to the beginning of the list
        persistSavedPlaces();
        showToast("Place saved!", 'success');
        updateSaveButtonState(place);
    }

    /** Removes a place from the saved list and persists the change. */
    function removeSavedPlace(place) {
        if (!place) return;
        savedPlaces = savedPlaces.filter(p => p.display_name !== place.display_name);
        persistSavedPlaces();
        showToast("Place removed.", 'info');
        updateSaveButtonState(place);
    }

    /** Updates the Save button's icon and text based on the place's saved state. */
    function updateSaveButtonState(place) {
        if (!infoSaveBtn) return;
        if (isPlaceSaved(place)) {
            infoSaveBtn.innerHTML = `
                <div class="icon-circle"><span class="material-symbols-sharp">bookmark_added</span></div>
                <div class="btn-label">Saved</div>
            `;
            infoSaveBtn.classList.add('saved'); // You can use this class for styling
        } else {
            infoSaveBtn.innerHTML = `
                <div class="icon-circle"><span class="material-symbols-sharp">bookmark_border</span></div>
                <div class="btn-label">Save</div>
            `;
            infoSaveBtn.classList.remove('saved');
        }
    }

    /** Handles the click event for the main "Save" button on the info panel. */
    infoSaveBtn.addEventListener('click', () => {
        if (!currentPlace) return;

        // Require login to save places
        if (!currentUser) {
            showToast("Please log in to save places.", 'info');
            return;
        }

        if (isPlaceSaved(currentPlace)) {
            removeSavedPlace(currentPlace);
        } else {
            addSavedPlace(currentPlace);
        }
    });

    /** Handles the click event for the "Saved Places" button in the profile dropdown. */
    savedPlacesBtn.addEventListener('click', () => {
        profileDropdown.classList.remove('open'); // Close dropdown
        clearSearchResultMarkers();
        
        searchResultsQueryEl.textContent = "Saved Places";
        searchResultsListEl.innerHTML = ''; // Clear previous results

        if (savedPlaces.length === 0) {
            searchResultsListEl.innerHTML = '<div class="no-results">You have no saved places.</div>';
            showPanel('search-results-panel');
            return;
        }

        savedPlaces.forEach(place => {
            const listItem = document.createElement('div');
            listItem.className = 'search-result-item';
            const address = place.display_name.split(',').slice(1).join(',').trim() || 'Details not available';
            
            listItem.innerHTML = `
                <div class="result-item-icon"><span class="material-symbols-sharp">bookmark</span></div>
                <div class="result-item-details">
                    <h4>${place.display_name.split(',')[0]}</h4>
                    <p>${address}</p>
                </div>
            `;
            listItem.addEventListener('click', () => {
                // When a saved item is clicked, process it like a search result
                processPlaceResult(place);
            });
            searchResultsListEl.appendChild(listItem);
        });

        showPanel('search-results-panel');
    });

    // --- HELPER FUNCTIONS ---
    function formatDuration(totalSeconds) {
        if (totalSeconds < 60) {
            return '< 1 min';
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.round((totalSeconds % 3600) / 60);
        return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
    }

    // --- CONSTANTS ---
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: `https://tiles.openfreemap.org/styles/liberty`,
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery" }] }
    };

    // --- AUTHENTICATION UI LOGIC ---
    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;

        // Load saved places for the current user (or guest)
        loadSavedPlaces();

        if (isLoggedIn) {
            const userFirstName = currentUser.profile.name.split(' ')[0];
            loggedInView.querySelector('.username').textContent = currentUser.profile.name || 'User';
            loggedInView.querySelector('.email').textContent = currentUser.profile.email || '';
            mainSearchInput.placeholder = `Where to, ${userFirstName}?`;

            if (currentUser.profile.picture) {
                profileButton.innerHTML = `<img class="profile-avatar" src="${currentUser.profile.picture}" alt="User Profile"/>`;
                if (dropdownAvatar) { dropdownAvatar.src = currentUser.profile.picture; dropdownAvatar.hidden = false; }
            } else {
                profileButton.innerHTML = defaultProfileIconSVG;
                if (dropdownAvatar) dropdownAvatar.hidden = true;
            }
        } else {
            profileButton.innerHTML = defaultProfileIconSVG;
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
        showToast(`Welcome back, ${user.profile.name.split(' ')[0]}!`, 'success');
    });
    userManager.events.addUserUnloaded(() => updateAuthUI(null));

    try {
        const user = await authService.getUser();
        updateAuthUI(user); // This will also call loadSavedPlaces()
    } catch (error) {
        console.error("Initial getUser check failed:", error);
        updateAuthUI(null); // This will also call loadSavedPlaces() for 'guest'
    }

    // --- UI EVENT LISTENERS ---
    profileButton.addEventListener('click', () => {
        profileDropdown.classList.toggle('open');
        servicesDropdown.classList.remove('open');
    });

    appMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        servicesDropdown.classList.toggle('open');
        profileDropdown.classList.remove('open'); // Close profile dropdown
    });

    document.addEventListener('click', (e) => {
        if (!profileArea.contains(e.target)) profileDropdown.classList.remove('open');
        if (!appMenuButton.contains(e.target) && !servicesDropdown.contains(e.target)) servicesDropdown.classList.remove('open');
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    if (closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);
    document.getElementById('welcome-directions-btn').addEventListener('click', openDirectionsPanel);

    // --- MAP INITIALIZATION ---
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 3,
        pitch: 0,
        dragRotate: true,
        touchPitch: false,
        scrollZoom: true,
        renderWorldCopies: false,
        maxZoom: 18,
        minZoom: 1,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ positionOptions: geolocationOptions, trackUserLocation: true, showUserHeading: true });
    map.addControl(geolocateControl, "bottom-right");

    map.on('load', async () => {
        if (navigator.geolocation && navigator.permissions) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
                if (permissionStatus.state !== 'denied') {
                    geolocateControl.trigger();
                }
            } catch (error) {
                console.error("Error checking geolocation permission on load:", error);
                geolocateControl.trigger();
            }
        } else {
            geolocateControl.trigger();
        }

        if (isMobile) {
            showPanel('welcome-panel');
        }
        initializeGlobeView();
    });

    // --- GLOBE VIEW LOGIC ---
    function setGlobeView(enableGlobe) {
        if (!map || !map.isStyleLoaded()) return;
        try {
            const currentProjection = map.getProjection().name;
            if (enableGlobe && currentProjection !== 'globe') {
                const defaultFog = { "range": [0.8, 8], "color": "rgb(186, 210, 235)", "horizon-blend": 0.05, "high-color": "rgb(220, 225, 235)", "space-color": "rgb(11, 11, 25)", "star-intensity": 0.15 };
                map.setFog(defaultFog);
                map.setProjection('globe');
                map.easeTo({ zoom: 2.5, pitch: 45, duration: 1500 });
            } else if (!enableGlobe && currentProjection === 'globe') {
                map.setFog(null);
                map.setProjection('mercator');
                map.easeTo({ pitch: 0, bearing: 0, duration: 1500 });
            }
        } catch (e) {
            console.error("Error toggling globe view:", e);
            showToast("Could not switch map view.", "error");
        }
    }

    // --- CONTEXT MENU LOGIC ---
    map.on('contextmenu', (e) => {
        e.preventDefault();
        contextMenuLngLat = e.lngLat;
        contextMenuCoords.textContent = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        contextMenu.style.left = `${e.point.x}px`;
        contextMenu.style.top = `${e.point.y}px`;
        contextMenu.style.display = 'block';
    });

    document.getElementById('ctx-directions-from').addEventListener('click', () => {
        openDirectionsPanel();
        fromInput.value = `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}`;
        fromInput.dataset.coords = `${contextMenuLngLat.lng},${contextMenuLngLat.lat}`;
        toInput.value = '';
        toInput.dataset.coords = '';
        toInput.focus();
    });

    document.getElementById('ctx-directions-to').addEventListener('click', () => {
        openDirectionsPanel();
        toInput.value = `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}`;
        toInput.dataset.coords = `${contextMenuLngLat.lng},${contextMenuLngLat.lat}`;
        fromInput.value = '';
        fromInput.dataset.coords = '';
        fromInput.focus();
    });

    document.getElementById('ctx-whats-here').addEventListener('click', () => {
        reverseGeocodeAndShowInfo(contextMenuLngLat);
    });

    map.on('click', async (e) => {
        const target = e.originalEvent.target;
        if (target.closest('.maplibregl-ctrl, #side-panel, #context-menu, .maplibregl-marker')) return;
        if (map.queryRenderedFeatures(e.point, { layers: ['route-line'] }).length > 0) return;
        const poi = map.queryRenderedFeatures(e.point, { layers: ['poi-label'] })[0];
        if (poi?.properties.name) {
            performSmartSearch({ value: poi.properties.name }, processPlaceResult);
        } else {
            await reverseGeocodeAndShowInfo(e.lngLat);
        }
    });

    // --- NAVIGATION STATE & SPEECH SERVICE ---
    let navigationState = {};
    function resetNavigationState() {
        navigationState = {
            isActive: false, isRerouting: false, currentStepIndex: 0,
            destinationCoords: null, lastDistanceToDestination: Infinity
        };
    }
    resetNavigationState();

    const speechService = {
        synthesis: window.speechSynthesis, voices: { male: null, female: null },
        selectedVoice: localStorage.getItem('mapVoice') || 'female', isReady: false,
        init() {
            return new Promise((resolve) => {
                const getVoices = () => {
                    const availableVoices = this.synthesis.getVoices();
                    if (!availableVoices.length) return;
                    this.voices.female = availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Google US English') || v.name.includes('Zira') || v.name.includes('Female'))) || availableVoices.find(v => v.lang.startsWith('en-US') && v.name.includes('Female'));
                    this.voices.male = availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Google UK English Male') || v.name.includes('David') || v.name.includes('Male'))) || availableVoices.find(v => v.lang.startsWith('en-US') && v.name.includes('Male'));
                    this.voices.female = this.voices.female || availableVoices.find(v => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male'));
                    this.voices.male = this.voices.male || availableVoices.find(v => v.lang.startsWith('en')) || this.voices.female;
                    if (this.voices.female || this.voices.male) {
                        this.isReady = true;
                        resolve();
                    }
                };
                this.synthesis.onvoiceschanged = getVoices;
                getVoices();
                setTimeout(() => { if (!this.isReady) { getVoices(); if (this.isReady) resolve(); } }, 1000);
            });
        },
        speak(text, priority = false) {
            if (!this.isReady || !text) return;
            if (priority && this.synthesis.speaking) this.synthesis.cancel();
            setTimeout(() => {
                if (!this.synthesis.speaking) {
                    const utterance = new SpeechSynthesisUtterance(text);
                    const voice = this.voices[this.selectedVoice];
                    if (voice) {
                        utterance.voice = voice;
                        utterance.pitch = 1;
                        utterance.rate = 1;
                    }
                    this.synthesis.speak(utterance);
                }
            }, 50);
        },
        setVoice(voiceGender) {
            if (this.voices[voiceGender]) {
                this.selectedVoice = voiceGender;
                localStorage.setItem('mapVoice', voiceGender);
            }
        }
    };

    // --- SIDE PANEL MANAGEMENT ---
    function clearSearchResultMarkers() {
        searchResultMarkers.forEach(marker => marker.remove());
        searchResultMarkers = [];
    }
    
    function showPanel(viewId) {
        // Updated list to include 'saved-places-panel' if you add one.
        // For now, it re-uses 'search-results-panel'.
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel', 'welcome-panel', 'search-results-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== viewId;
        });
        if (isMobile) {
            sidePanel.classList.toggle('peek', viewId === 'welcome-panel');
            sidePanel.classList.toggle('open', viewId !== 'welcome-panel');
        } else {
            sidePanel.classList.add('open');
            moveSearchBarToPanel();
        }
    }

    function closePanel() {
        clearSearchResultMarkers();
        if (isMobile) {
            sidePanel.classList.remove('open', 'peek');
        } else {
            sidePanel.classList.remove('open');
            moveSearchBarToTop();
        }
        if (clickedLocationMarker) {
            clickedLocationMarker.remove();
            clickedLocationMarker = null;
        }
    }

    function moveSearchBarToPanel() {
        if (!isMobile) {
            panelSearchPlaceholder.appendChild(mainSearchContainer);
            panelSearchPlaceholder.hidden = false;
            topSearchWrapper.style.opacity = '0';
        }
    }

    function moveSearchBarToTop() {
        if (!isMobile) {
            topSearchWrapper.appendChild(mainSearchContainer);
            panelSearchPlaceholder.hidden = true;
            topSearchWrapper.style.opacity = '1';
        }
    }

    // --- SEARCH & GEOCODING ---
    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features.length > 0) {
                const item = data.features[0];
                onSelect({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox });
            } else {
                showToast("No results found.", "error");
            }
        } catch (e) {
            showToast("Search failed.", "error");
        }
    }

    // --- ENHANCED SEARCH LOGIC (Main search bar) ---
    function showInitialSuggestions() {
        recentSearchesContainer.innerHTML = '';
        const recents = getRecentSearches();
        if (recents.length > 0) {
            const header = document.createElement('div');
            header.className = 'suggestions-header';
            header.textContent = 'Recent Searches';
            recentSearchesContainer.appendChild(header);

            recents.forEach(place => {
                const item = document.createElement('div');
                item.className = 'recent-item';
                item.innerHTML = `<span class="material-symbols-sharp">history</span> <span>${place.display_name}</span>`;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    processPlaceResult(place);
                    mainSuggestions.style.display = 'none';
                });
                recentSearchesContainer.appendChild(item);
            });
        }
        initialSuggestionsView.hidden = false;
        apiSuggestionsView.hidden = true;
        mainSuggestions.style.display = 'block';
    }

    const fetchApiSuggestions = debounce(async (query) => {
        if (query.length < 3) return;
        initialSuggestionsView.hidden = true;
        apiSuggestionsView.hidden = false;
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            apiSuggestionsView.innerHTML = "";
            data.features.forEach(item => {
                const el = document.createElement("div");
                el.className = "search-result";
                el.textContent = item.place_name;
                el.addEventListener("mousedown", () => {
                    const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox };
                    processPlaceResult(place);
                    mainSuggestions.style.display = 'none';
                });
                apiSuggestionsView.appendChild(el);
            });
        } catch (e) {
            console.error("Suggestion fetch failed", e);
        }
    }, 300);

    mainSearchInput.addEventListener('focus', showInitialSuggestions);
    mainSearchInput.addEventListener('blur', () => setTimeout(() => { mainSuggestions.style.display = 'none'; }, 200));
    mainSearchInput.addEventListener('input', () => {
        const query = mainSearchInput.value.trim();
        if (query) fetchApiSuggestions(query);
        else showInitialSuggestions();
    });
    mainSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSmartSearch(mainSearchInput, processPlaceResult);
            mainSuggestions.style.display = 'none';
        }
    });
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    
    backFromResultsBtn.addEventListener('click', closePanel);

    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (query.length < 3) { suggestionsEl.style.display = "none"; return; }
            const center = map.getCenter();
            const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.features.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "search-result";
                    el.textContent = item.place_name;
                    el.addEventListener("click", () => onSelect({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox }));
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
            } catch (e) { console.error("Suggestion fetch failed", e); }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => setTimeout(() => { suggestionsEl.style.display = "none"; }, 200));
    }

    attachSuggestionListener(fromInput, document.getElementById('panel-from-suggestions'), (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
    attachSuggestionListener(toInput, document.getElementById('panel-to-suggestions'), (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    async function reverseGeocodeAndShowInfo(lngLat) {
        const url = `https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features?.length > 0) {
                const item = data.features[0];
                const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox };
                processPlaceResult(place);
            }
        } catch (error) { console.error("Reverse geocoding failed", error); }
    }

    function processPlaceResult(place) {
        addRecentSearch(place);
        currentPlace = place; // Set the global `currentPlace`
        stopNavigation();
        clearRouteFromMap();
        clearSearchResultMarkers();

        if (clickedLocationMarker) clickedLocationMarker.remove();

        clickedLocationMarker = new maplibregl.Marker()
            .setLngLat([parseFloat(place.lon), parseFloat(place.lat)])
            .addTo(map);

        if (place.bbox) map.fitBounds(place.bbox, { padding: 100, essential: true });
        else map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });

        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
        infoNameEl.textContent = place.display_name.split(',')[0];
        infoAddressEl.textContent = place.display_name;
        infoImageEl.src = '';
        infoImageEl.style.backgroundColor = 'var(--input-bg)';
        infoWeatherEl.innerHTML = '<div class="skeleton-line"></div>';
        quickFactsEl.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div>';

        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        fetchAndSetWebsite(locationName);

        // Update the save button state for this new place
        updateSaveButtonState(place);

        showPanel('info-panel-redesign');
    }

    // --- CATEGORY SEARCH ---
    function getIconForCategory(query) {
        const q = query.toLowerCase();
        if (q.includes('restaurant')) return 'restaurant';
        if (q.includes('gas') || q.includes('fuel')) return 'local_gas_station';
        if (q.includes('coffee') || q.includes('cafe')) return 'coffee';
        if (q.includes('park')) return 'park';
        return 'place';
    }
    
    function displaySearchResults(features, query, userCoords) {
        clearSearchResultMarkers();
        searchResultsListEl.innerHTML = '';
        searchResultsQueryEl.textContent = query;

        if (!features || features.length === 0) {
            searchResultsListEl.innerHTML = '<div class="no-results">No results found nearby.</div>';
            showPanel('search-results-panel');
            return;
        }

        const userPoint = turf.point(userCoords);
        const featuresWithDistance = features.map(item => {
            const placePoint = turf.point([item.lon, item.lat]);
            item.distance = turf.distance(userPoint, placePoint, { units: 'miles' });
            return item;
        }).sort((a, b) => a.distance - b.distance);
        
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend(userCoords);

        featuresWithDistance.forEach(item => {
            const displayName = item.tags?.name || 'Unnamed Place';
            // Construct a place object compatible with processPlaceResult
            const place = { 
                lon: item.lon, 
                lat: item.lat, 
                display_name: item.tags?.name ? `${item.tags.name}, ${item.tags['addr:city'] || ''}` : 'Unnamed Place'
                // Note: This is a simplified display_name. You might want to enhance it.
            };
            
            const marker = new maplibregl.Marker({ color: '#E53935' })
                .setLngLat([place.lon, place.lat])
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText(displayName))
                .addTo(map);

            marker.getElement().addEventListener('click', (e) => { e.stopPropagation(); processPlaceResult(place) });
            searchResultMarkers.push(marker);
            bounds.extend([place.lon, place.lat]);

            const listItem = document.createElement('div');
            listItem.className = 'search-result-item';
            const address = (item.tags && `${item.tags['addr:street'] || ''} ${item.tags['addr:city'] || ''}`).trim() || 'Address not available';
            
            listItem.innerHTML = `
                <div class="result-item-icon"><span class="material-symbols-sharp">${getIconForCategory(query)}</span></div>
                <div class="result-item-details">
                    <h4>${displayName}</h4>
                    <p>${address}</p>
                </div>
                <div class="result-item-distance">${item.distance.toFixed(1)} mi</div>
            `;
            listItem.addEventListener('click', () => processPlaceResult(place));
            searchResultsListEl.appendChild(listItem);
        });

        map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        showPanel('search-results-panel');
    }
    
    async function performCategorySearch(query, osmTag) {
        if (!navigator.geolocation || !navigator.permissions) {
            return showToast("Location services are not supported by your browser.", "error");
        }

        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (permissionStatus.state === 'denied') {
            return showToast("Location access is denied. Cannot search for nearby places.", "error");
        }
        
        showToast(`Searching for ${query}...`, 'info');
        
        const getLocation = new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions));

        let userCoords;
        try {
            const position = await getLocation;
            userCoords = [position.coords.longitude, position.coords.latitude];
        } catch (error) {
            showToast("Could not get your location. Using map center.", "info");
            const center = map.getCenter();
            userCoords = [center.lng, center.lat];
        }

        const [tagKey, tagValue] = osmTag.split('=');
        const searchRadiusMeters = 10000;
        const overpassQuery = `[out:json];node(around:${searchRadiusMeters},${userCoords[1]},${userCoords[0]})["${tagKey}"="${tagValue}"];out;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Overpass API request failed.");
            const data = await res.json();
            displaySearchResults(data.elements, query, userCoords);
        } catch (e) {
            showToast("Could not find places.", "error");
            console.error("Category search failed:", e);
        }
    }
    
    categoryPillsContainer.addEventListener('mousedown', (e) => {
        const pill = e.target.closest('.category-pill');
        if (pill) {
            e.preventDefault();
            const query = pill.dataset.query;
            const osmTag = pill.dataset.osmTag;
            mainSearchInput.value = '';
            mainSuggestions.style.display = 'none';
            performCategorySearch(query, osmTag);
        }
    });

    // --- DATA FETCHING FOR INFO PANEL ---
    async function fetchAndSetPlaceImage(query, lon, lat) {
        const imgEl = document.getElementById('info-image');
        imgEl.alt = 'Loading image...';
        imgEl.onerror = null;
        try {
            const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            if (page.thumbnail?.source) {
                imgEl.src = page.thumbnail.source;
                imgEl.alt = `Photograph of ${query}`;
                return;
            }
            throw new Error("No image found on Wikipedia.");
        } catch (e) {
            const offset = 0.005;
            const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
            const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
            imgEl.src = fallbackUrl;
            imgEl.alt = `Map view of ${query}`;
            imgEl.onerror = () => { imgEl.style.backgroundColor = 'var(--input-bg)'; imgEl.alt = 'Image not available'; };
        }
    }

    async function fetchAndSetWebsite(query) {
        const websiteBtn = document.getElementById('info-website-btn');
        websiteBtn.style.display = 'none';
        try {
            const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extlinks&titles=${encodeURIComponent(query)}`;
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            const websiteLink = page.extlinks?.find(link => link['*'].includes('://') && !link['*'].includes('wikipedia.org'));
            if (websiteLink) {
                websiteBtn.style.display = 'flex';
                websiteBtn.onclick = () => window.open(websiteLink['*'], '_blank');
            }
        } catch (e) { /* Do nothing */ }
    }

    function getWeatherDescription(code) {
        const descriptions = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 95: 'Thunderstorm' };
        return descriptions[code] || "Weather unavailable";
    }

    async function fetchAndSetWeather(lat, lon) {
        const weatherEl = document.getElementById('info-weather');
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const tempF = Math.round(data.current_weather.temperature);
            const tempC = Math.round((tempF - 32) * 5 / 9);
            const description = getWeatherDescription(data.current_weather.weathercode);
            weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
        } catch (e) {
            weatherEl.textContent = "Could not load weather.";
        }
    }

    async function fetchAndSetQuickFacts(query) {
        const factsEl = document.getElementById('quick-facts-content');
        try {
            const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            factsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found.";
        } catch (e) {
            factsEl.textContent = "Could not load facts.";
        }
    }

    // --- ROUTING & NAVIGATION ---
    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = '';
            fromInput.dataset.coords = '';
        } else {
            toInput.value = '';
            toInput.dataset.coords = '';
            fromInput.value = '';
            fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);

    document.getElementById('dir-use-my-location').addEventListener('click', async () => {
        if (!navigator.geolocation) {
            return showToast("Geolocation is not supported by your browser.", "error");
        }
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
            const setLocationFromPosition = (pos) => {
                fromInput.value = "Your Location";
                fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
            };
            if (permissionStatus.state === 'granted') {
                navigator.geolocation.getCurrentPosition(setLocationFromPosition, handlePositionError, geolocationOptions);
            } else if (permissionStatus.state === 'prompt') {
                navigator.geolocation.getCurrentPosition(setLocationFromPosition, handlePositionError, geolocationOptions);
            } else if (permissionStatus.state === 'denied') {
                showToast("Location access was denied. Please enable it in your browser settings.", "error");
            }
        } catch (error) {
            console.error("Error handling location permission:", error);
            showToast("Could not get your location.", "error");
        }
    });

    backToInfoBtn.addEventListener('click', () => {
        if (currentPlace) showPanel('info-panel-redesign');
        else closePanel();
    });

    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
        if (map.getLayer('highlighted-route-segment')) map.removeLayer('highlighted-route-segment');
        if (map.getSource('highlighted-route-segment')) map.removeSource('highlighted-route-segment');
    }

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?key=${MAPTILER_KEY}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.features.length) throw new Error(`Could not find: ${inputEl.value}`);
        const feature = data.features[0];
        inputEl.value = feature.place_name;
        inputEl.dataset.coords = feature.center.join(',');
        return feature.center;
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeoJSON);
        } else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 }
            });
        }
    }

    function updateHighlightedSegment(step) {
        if (!step || !step.geometry) return;
        const geojson = { type: 'Feature', geometry: step.geometry };
        if (map.getSource('highlighted-route-segment')) {
            map.getSource('highlighted-route-segment').setData(geojson);
        } else {
            map.addSource('highlighted-route-segment', { type: 'geojson', data: geojson });
            map.addLayer({
                id: 'highlighted-route-segment',
                type: 'line',
                source: 'highlighted-route-segment',
                paint: { 'line-color': '#0055ff', 'line-width': 9, 'line-opacity': 0.9 }
            }, 'route-line');
        }
    }

    function formatOsrmInstruction(step) {
        if (!step || !step.maneuver) return 'Continue';
        const { type, modifier } = step.maneuver;
        const name = step.name.split(',')[0];
        const onto = (str) => (name ? `${str} onto ${name}` : str);
        const on = (str) => (name ? `${str} on ${name}` : str);
        switch (type) {
            case 'depart': return `Head ${modifier || ''} ${on('')}`.trim();
            case 'arrive': return `Your destination is on the ${modifier}`;
            case 'turn':
            case 'off ramp': return (modifier === 'straight') ? on('Continue straight') : onto(`Turn ${modifier}`);
            case 'fork': return onto(`Keep ${modifier} at the fork`);
            case 'roundabout':
                const exit = step.maneuver.exit;
                const nth = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(exit);
                const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' }[nth];
                return onto(`Take the ${exit}${suffix} exit`);
            case 'merge': return onto(`Merge ${modifier}`);
            default: return on(`Continue ${modifier || ''}`.trim());
        }
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return showToast("Please fill both start and end points.", "error");
        clearRouteFromMap();
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.code !== "Ok" || !data.routes.length) return showToast(data.message || "A route could not be found.", "error");

            currentRouteData = data;
            const route = data.routes[0];
            addRouteToMap({ type: 'Feature', geometry: route.geometry });

            const bounds = new maplibregl.LngLatBounds();
            route.geometry.coordinates.forEach(coord => bounds.extend(coord));

            if (fromInput.value.trim() === "Your Location") {
                map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });
                closePanel();
                startNavigation();
            } else {
                const durationMinutes = Math.round(route.duration / 60);
                const distanceMiles = (route.distance / 1609.34).toFixed(1);
                document.getElementById('route-summary-time').textContent = `${durationMinutes} min`;
                document.getElementById('route-summary-distance').textContent = `${distanceMiles} mi`;
                showPanel('route-preview-panel');
                map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
            }
        } catch (err) {
            showToast(`Error: ${err.message}`, "error");
        }
    }

    async function reroute(currentUserPoint) {
        if (navigationState.isRerouting) return;
        navigationState.isRerouting = true;

        const start = currentUserPoint.geometry.coordinates;
        const end = navigationState.destinationCoords.geometry.coordinates;
        const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.code !== "Ok" || !data.routes.length) throw new Error("Could not find a new route.");

            currentRouteData = data;
            addRouteToMap({ type: 'Feature', geometry: data.routes[0].geometry });

            navigationState.currentStepIndex = 0;
            const nextStep = currentRouteData.routes[0].legs[0].steps[0];
            const nextInstruction = formatOsrmInstruction(nextStep);
            navigationInstructionEl.textContent = nextInstruction;
            updateHighlightedSegment(nextStep);
            speechService.speak(`Recalculated. ${nextInstruction}`, true);

        } catch (err) {
            showToast("Rerouting failed. Please check your route.", "error");
            stopNavigation();
        } finally {
            navigationState.isRerouting = false;
        }
    }

    async function startNavigation() {
        if (!navigator.geolocation || !navigator.permissions) {
            return showToast("Geolocation is not supported.", "error");
        }
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (permissionStatus.state === 'denied') {
                return showToast("Cannot start navigation. Location access is denied.", "error");
            }
        } catch (error) {
            console.error("Error checking navigation permission:", error)
        }

        resetNavigationState();
        navigationState.isActive = true;
        navigationState.destinationCoords = turf.point(toInput.dataset.coords.split(',').map(Number));

        const firstStep = currentRouteData.routes[0].legs[0].steps[0];
        const instruction = formatOsrmInstruction(firstStep);
        navigationInstructionEl.textContent = instruction;
        updateHighlightedSegment(firstStep);
        navigationStatusPanel.style.display = 'flex';
        speechService.speak(`Starting route. ${instruction}`, true);

        if (!userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            userLocationMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([0, 0]).addTo(map);
        }

        map.easeTo({ pitch: 60, zoom: 17, duration: 1500 });
        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation, { once: true });
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        navigationWatcherId = null;
        if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
        clearRouteFromMap();
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        speechService.synthesis.cancel();
        map.easeTo({ pitch: 0, bearing: 0 });
    }

    function handlePositionError(error) {
        showToast(`Geolocation error: ${error.message}.`, "error");
        stopNavigation();
    }

    function handlePositionUpdate(position) {
        if (!navigationState.isActive || navigationState.isRerouting) return;

        const { latitude, longitude, heading, speed } = position.coords;
        const userPoint = turf.point([longitude, latitude]);
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });

        userLocationMarker.setLngLat(snapped.geometry.coordinates);
        if (heading != null) {
            userLocationMarker.setRotation(heading);
            map.easeTo({ center: snapped.geometry.coordinates, bearing: heading, duration: 500 });
        } else {
            map.easeTo({ center: snapped.geometry.coordinates, duration: 500 });
        }

        const distanceFromRoute = snapped.properties.dist;
        const OFF_ROUTE_THRESHOLD = 50;
        if (distanceFromRoute > OFF_ROUTE_THRESHOLD) {
            speechService.speak("Off route. Recalculating.", true);
            reroute(userPoint);
            return;
        }

        const steps = currentRouteData.routes[0].legs[0].steps;
        const currentStep = steps[navigationState.currentStepIndex];
        const stepEndPoint = turf.point(currentStep.geometry.coordinates.slice(-1)[0]);
        const distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units: 'meters' });

        if (distanceToNextManeuver < 50) {
            navigationState.currentStepIndex++;
            if (navigationState.currentStepIndex >= steps.length) {
                speechService.speak("You have arrived.", true);
                stopNavigation();
                return;
            }
            const nextStep = steps[navigationState.currentStepIndex];
            const nextInstruction = formatOsrmInstruction(nextStep);
            navigationInstructionEl.textContent = nextInstruction;
            updateHighlightedSegment(nextStep);
            speechService.speak(nextInstruction, true);
        }

        statSpeedEl.textContent = ((speed || 0) * 2.23694).toFixed(0);
        const totalStepDistance = turf.length(turf.lineString(currentStep.geometry.coordinates), { units: 'meters' });
        const progressAlongStep = Math.max(0, 1 - (distanceToNextManeuver / totalStepDistance));
        instructionProgressBar.transform = `scaleX(${progressAlongStep})`;

        const tripDurationSeconds = currentRouteData.routes[0].duration;
        const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
        const remainingTime = tripDurationSeconds - timeElapsed;

        statTimeRemainingEl.textContent = formatDuration(remainingTime);
        statEtaEl.textContent = new Date(Date.now() + remainingTime * 1000).toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit' });
    }

    // --- SETTINGS & MAP STYLE ---
    const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
    const trafficToggle = document.getElementById('traffic-toggle');
    const voiceRadioButtons = document.querySelectorAll('input[name="nav-voice"]');
    const themeRadioButtons = document.querySelectorAll('input[name="map-theme"]');

    function openSettings() { settingsModal.classList.add('open'); }
    function closeSettings() { settingsModal.classList.remove('open'); }

    settingsIconBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    modalOverlay.addEventListener('click', closeSettings);

    const closeAfterSetting = () => { if (isMobile) setTimeout(closeSettings, 200); };

    styleRadioButtons.forEach(radio => radio.addEventListener('change', () => { map.setStyle(STYLES[radio.value]); closeAfterSetting(); }));
    trafficToggle.addEventListener('change', () => { if (trafficToggle.checked) addTrafficLayer(); else removeTrafficLayer(); closeAfterSetting(); });
    voiceRadioButtons.forEach(radio => radio.addEventListener('change', () => { speechService.setVoice(radio.value); speechService.speak("Voice has been changed.", true); closeAfterSetting(); }));
    globeToggle.addEventListener('change', () => {
        const isEnabled = globeToggle.checked;
        localStorage.setItem('mapGlobeEnabled', isEnabled);
        setGlobeView(isEnabled);
        closeAfterSetting();
    });

    // --- THEME MANAGEMENT ---
    const systemThemeWatcher = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme(theme) {
        if (theme === 'auto') {
            document.documentElement.setAttribute('data-theme', systemThemeWatcher.matches ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function handleThemeSelection(e) {
        const selectedTheme = e.target.value;
        localStorage.setItem('mapTheme', selectedTheme);
        applyTheme(selectedTheme);
        closeAfterSetting();
    }

    systemThemeWatcher.addEventListener('change', (e) => {
        const savedTheme = localStorage.getItem('mapTheme') || 'auto';
        if (savedTheme === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    themeRadioButtons.forEach(radio => radio.addEventListener('change', handleThemeSelection));

    function initializeTheme() {
        const savedTheme = localStorage.getItem('mapTheme') || 'auto';
        const radioToCheck = document.querySelector(`input[name="map-theme"][value="${savedTheme}"]`);
        if (radioToCheck) radioToCheck.checked = true;
        applyTheme(savedTheme);
    }

    function initializeGlobeView() {
        const savedGlobeState = localStorage.getItem('mapGlobeEnabled') === 'true';
        globeToggle.checked = savedGlobeState;
    }

    const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
    const TRAFFIC_LAYER_ID = 'traffic-lines';
    const trafficSource = { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` };
    const trafficLayer = { id: TRAFFIC_LAYER_ID, type: 'line', source: TRAFFIC_SOURCE_ID, 'source-layer': 'traffic', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': 2, 'line-color': ['match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0'] } };

    function addTrafficLayer() {
        if (!map.getSource(TRAFFIC_SOURCE_ID)) {
            map.addSource(TRAFFIC_SOURCE_ID, trafficSource);
            let firstSymbolId;
            for (const layer of map.getStyle().layers) {
                if (layer.type === 'symbol') { firstSymbolId = layer.id; break; }
            }
            map.addLayer(trafficLayer, firstSymbolId);
        }
    }

    function removeTrafficLayer() {
        if (map.getSource(TRAFFIC_SOURCE_ID)) {
            map.removeLayer(TRAFFIC_LAYER_ID);
            map.removeSource(TRAFFIC_SOURCE_ID);
        }
    }

    map.on('styledata', () => {
        if (navigationState.isActive && currentRouteData) {
            addRouteToMap({ type: 'Feature', geometry: currentRouteData.routes[0].geometry });
            updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]);
        }
        if (trafficToggle.checked) addTrafficLayer();
    });

    // --- MOBILE-SPECIFIC PANEL DRAGGING ---
    if (isMobile) {
        let panelDragState = { isDragging: false, startY: 0, dragOffset: 0 };
        const panelDragStart = (e) => {
            if (e.target.closest('.panel-content')) return;
            panelDragState.isDragging = true;
            panelDragState.startY = e.touches[0].clientY;
            sidePanel.style.transition = 'none';
        };
        const panelDragMove = (e) => {
            if (!panelDragState.isDragging) return;
            panelDragState.dragOffset = e.touches[0].clientY - panelDragState.startY;
            if (panelDragState.dragOffset > 0) sidePanel.style.transform = `translateY(${panelDragState.dragOffset}px)`;
        };
        const panelDragEnd = () => {
            if (!panelDragState.isDragging) return;
            panelDragState.isDragging = false;
            sidePanel.style.transition = '';
            sidePanel.style.transform = '';
            if (panelDragState.dragOffset > sidePanel.offsetHeight / 3) closePanel();
        };
        sidePanel.addEventListener('touchstart', panelDragStart);
        document.addEventListener('touchmove', panelDragMove);
        document.addEventListener('touchend', panelDragEnd);
    }

    // --- INITIALIZATION ON LOAD ---
    function getInitialRouteFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const fromCoords = params.get('from');
        const toCoords = params.get('to');
        if (fromCoords && toCoords) {
            fromInput.dataset.coords = fromCoords;
            toInput.dataset.coords = toCoords;
            fromInput.value = params.get('fromName') || 'Start';
            toInput.value = params.get('toName') || 'Destination';
            getRoute();
        }
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered.'))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }

    speechService.init().then(() => {
        const savedVoice = localStorage.getItem('mapVoice') || 'female';
        speechService.setVoice(savedVoice);
        const radio = document.querySelector(`input[name="nav-voice"][value="${savedVoice}"]`);
        if (radio) radio.checked = true;
    });

    initializeTheme();
    getInitialRouteFromUrl();
});

