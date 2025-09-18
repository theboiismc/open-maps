/**
 * app.js
 *
 * This file contains the core logic for TheBoiisMC Maps application.
 * It handles user authentication, map rendering and controls, search functionality,
 * routing, turn-by-turn navigation, and various UI interactions like the side panel,
 * settings menu, and the context menu.
 */

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

// --- UTILITY FUNCTIONS ---
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

// --- MAIN APPLICATION INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENT SELECTORS ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const defaultProfileIconSVG = profileButton.innerHTML;
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const dropdownAvatar = document.getElementById('dropdown-avatar');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
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
    let contextMenuLngLat = null;
    let currentPlace = null;
    let currentRouteData = null;
    let clickedLocationMarker = null;
    let navigationWatcherId = null;
    let userLocationMarker = null;
    let searchResultMarkers = [];

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
        default: `https://tiles.theboiismc.com/styles/Default/style.json`,
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery" }] }
    };

    // --- AUTHENTICATION UI LOGIC ---
    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;

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
        updateAuthUI(user);
    } catch (error) {
        console.error("Initial getUser check failed:", error);
        updateAuthUI(null);
    }

    // --- UI EVENT LISTENERS ---
    profileButton.addEventListener('click', () => {
        profileDropdown.style.display = (profileDropdown.style.display === 'block') ? 'none' : 'block';
        servicesDropdown.classList.remove('open');
    });

    appMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        servicesDropdown.classList.toggle('open');
        profileDropdown.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (!profileArea.contains(e.target)) profileDropdown.style.display = 'none';
        if (!appMenuButton.contains(e.target) && !servicesDropdown.contains(e.target)) servicesDropdown.classList.remove('open');
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

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
    
    // --- NEW, UNIFIED SIDE PANEL AND DRAG LOGIC ---
    
    const panelViewIds = ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel', 'welcome-panel', 'search-results-panel'];
    const panelContent = document.querySelector('.panel-content');
    
    let currentPanelState = 'closed';
    const panelPositions = {
        peek: window.innerHeight - 250,
        mid: window.innerHeight * 0.4,
        full: 80,
        closed: window.innerHeight + 50
    };

    function setPanelPosition(state, animate = true) {
        if (!panelPositions[state]) return;
        
        currentPanelState = state;
        const targetY = panelPositions[state];

        sidePanel.style.transition = animate ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
        sidePanel.style.transform = `translateY(${targetY}px)`;
    }

    function showPanel(viewId, state) {
        panelViewIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const targetEl = document.getElementById(viewId);
        if (targetEl) {
            targetEl.style.display = (viewId === 'welcome-panel') ? 'flex' : 'block';
        }
        setPanelPosition(state, true);
    }
    
    function closePanel() {
        showPanel('welcome-panel', 'peek');
        clearSearchResultMarkers();
        if (clickedLocationMarker) {
            clickedLocationMarker.remove();
            clickedLocationMarker = null;
        }
    }
    if (closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);
    
    if (isMobile) {
        let dragState = {
            startY: 0,
            currentY: 0,
            initialPanelY: 0,
            isDragging: false,
            canDrag: true
        };

        sidePanel.addEventListener('touchstart', (e) => {
            if (currentPanelState === 'closed') return;

            let el = e.target;
            let canScrollUp = false;
            while(el && el !== sidePanel) {
                if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
                    canScrollUp = true;
                    break;
                }
                el = el.parentElement;
            }

            dragState.canDrag = !canScrollUp;
            if (!dragState.canDrag) return;

            dragState.isDragging = true;
            dragState.startY = e.touches[0].clientY;
            dragState.initialPanelY = sidePanel.getBoundingClientRect().top;
            sidePanel.style.transition = 'none';

        }, { passive: true });

        sidePanel.addEventListener('touchmove', (e) => {
            if (!dragState.isDragging || !dragState.canDrag) return;

            const isAtScrollTop = panelContent.scrollTop === 0;
            const isScrollingDown = (e.touches[0].clientY - dragState.startY) > 0;

            if (currentPanelState === 'full' && isAtScrollTop && isScrollingDown) {
                // Allow dragging down from the top
            } else if (currentPanelState === 'full' && !isAtScrollTop) {
                return; // Let the browser scroll
            }

            e.preventDefault();

            dragState.currentY = e.touches[0].clientY;
            const deltaY = dragState.currentY - dragState.startY;
            const newPanelY = dragState.initialPanelY + deltaY;
            
            const clampedY = Math.max(newPanelY, panelPositions.full - 50);
            sidePanel.style.transform = `translateY(${clampedY}px)`;

        }, { passive: false });

        sidePanel.addEventListener('touchend', () => {
            if (!dragState.isDragging || !dragState.canDrag) {
                dragState.isDragging = false;
                dragState.canDrag = true;
                return;
            }
            
            dragState.isDragging = false;
            const finalPanelY = sidePanel.getBoundingClientRect().top;
            const deltaY = finalPanelY - dragState.initialPanelY;

            let newState = currentPanelState;

            if (Math.abs(deltaY) > 75) {
                if (deltaY < 0) { // Flick up
                    if (currentPanelState === 'peek') newState = 'mid';
                    else newState = 'full';
                } else { // Flick down
                    if (currentPanelState === 'full') newState = 'mid';
                    else newState = 'peek';
                }
            } else { // No flick, snap to closest
                let closestState = 'peek';
                let minDistance = Infinity;
                for (const state in panelPositions) {
                     if (state === 'closed') continue;
                    const distance = Math.abs(finalPanelY - panelPositions[state]);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestState = state;
                    }
                }
                newState = closestState;
            }
            
            setPanelPosition(newState, true);
        }, { passive: true });
    }
    
    // --- END REBUILT PANEL LOGIC ---

    function clearSearchResultMarkers() {
        searchResultMarkers.forEach(marker => marker.remove());
        searchResultMarkers = [];
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
                item.innerHTML = `<span class="material-symbols-outlined">history</span> <span>${place.display_name}</span>`;
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
        currentPlace = place;
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

        showPanel('info-panel-redesign', 'mid');
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
            showPanel('search-results-panel', 'mid');
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
            const place = { lon: item.lon, lat: item.lat, display_name: displayName };
            
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
                <div class="result-item-icon"><span class="material-symbols-outlined">${getIconForCategory(query)}</span></div>
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
        showPanel('search-results-panel', 'mid');
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
        showPanel('directions-panel-redesign', 'mid');
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
        if (currentPlace) showPanel('info-panel-redesign', 'mid');
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
                showPanel('route-preview-panel', 'mid');
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
    trafficToggle.addEventListener('change', () => { if (trafficToggle.checked) addTrafficLayer(); else removeTrafficLayer(); closeAfterSetting(); }));
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
        setGlobeView(savedGlobeState);
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
            showPanel('welcome-panel', 'peek');
        }
        initializeGlobeView();
    });

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
