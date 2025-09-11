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
    async login() {
        return userManager.signinRedirect();
    },
    async logout() {
        return userManager.signoutRedirect();
    },
    async getUser() {
        return userManager.getUser();
    },
    async handleCallback() {
        return userManager.signinRedirectCallback();
    }
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
    const mainSuggestions = document.getElementById("main-suggestions");
    const mainDirectionsIcon = document.getElementById("main-directions-icon");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
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
    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const contextMenu = document.getElementById('context-menu');
    const contextMenuCoords = document.getElementById('context-menu-coords');
    const globeToggleBtn = document.getElementById('globe-toggle-btn');
    const panelBackButton = document.getElementById('panel-back-btn');
    const searchResultsTitle = document.getElementById('search-results-title');
    const searchResultsList = document.getElementById('search-results-list');

    // --- APP STATE VARIABLES ---
    let currentUser = null;
    let contextMenuLngLat = null;
    let currentPlace = null;
    let currentRouteData = null;
    let clickedLocationMarker = null;
    let navigationWatcherId = null;
    let userLocationMarker = null;
    let panelHistory = [];
    let categoryMarkers = [];

    // --- CONSTANTS & CONFIG ---
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };
    const STYLES = {
        default: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
        satellite: {
            version: 8,
            sources: {
                "esri-world-imagery": {
                    type: "raster",
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    tileSize: 256,
                    attribution: 'Tiles © Esri'
                }
            },
            layers: [{
                id: "satellite-layer",
                type: "raster",
                source: "esri-world-imagery"
            }]
        }
    };
    const CATEGORIES = [{
        name: 'Gas',
        icon: 'local_gas_station',
        term: 'gas station'
    }, {
        name: 'Dining',
        icon: 'restaurant',
        term: 'restaurant'
    }, {
        name: 'Shopping',
        icon: 'shopping_bag',
        term: 'shopping'
    }, {
        name: 'Parks',
        icon: 'park',
        term: 'park'
    }, {
        name: 'Groceries',
        icon: 'local_grocery_store',
        term: 'grocery store'
    }, {
        name: 'Coffee',
        icon: 'coffee',
        term: 'coffee'
    }, ];
    const MAX_RECENT_SEARCHES = 4;

    // --- HELPER FUNCTIONS ---
    function formatDuration(totalSeconds) {
        if (totalSeconds < 60) return '< 1 min';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.round((totalSeconds % 3600) / 60);
        if (hours > 0) return `${hours} hr ${minutes} min`;
        return `${minutes} min`;
    }

    // --- AUTHENTICATION & UI ---
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
                if (dropdownAvatar) {
                    dropdownAvatar.src = currentUser.profile.picture;
                    dropdownAvatar.hidden = false;
                }
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

    // --- GENERAL UI EVENT LISTENERS ---
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
        if (!mainSearchContainer.contains(e.target)) mainSuggestions.style.display = 'none';
        if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
    });
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authService.login();
    });
    signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authService.logout();
    });
    document.querySelectorAll('.js-back-btn').forEach(btn => btn.addEventListener('click', goBack));

    // --- MAP INITIALIZATION ---
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 3,
        pitch: 0,
        dragRotate: true,
        touchPitch: true,
        scrollZoom: true,
        renderWorldCopies: false,
        maxZoom: 18,
        minZoom: 1,
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
        showPanel('welcome-panel', true);
    });

    // --- GLOBE VIEW TOGGLE ---
    const defaultFog = {
        "range": [0.8, 8],
        "color": "rgb(186, 210, 235)",
        "horizon-blend": 0.05,
        "high-color": "rgb(220, 225, 235)",
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.15
    };

    const toggleView = () => {
        try {
            if (map.getProjection().name === 'mercator') {
                map.setFog(defaultFog);
                map.setProjection('globe');
                map.easeTo({
                    zoom: 2.5,
                    pitch: 45,
                    duration: 1500
                });
            } else {
                map.setFog(null);
                map.setProjection('mercator');
                map.easeTo({
                    pitch: 0,
                    bearing: 0,
                    duration: 1500
                });
            }
        } catch (e) {
            console.error("Error toggling globe view:", e);
            showToast("Could not switch view.", "error");
        }
    };

    globeToggleBtn.addEventListener('click', () => {
        if (!map) return;
        if (map.isStyleLoaded()) {
            toggleView();
        } else {
            map.once('styledata', toggleView);
        }
    });

    // --- CONTEXT MENU & MAP CLICK LOGIC ---
    map.on('contextmenu', (e) => {
        e.preventDefault();
        contextMenuLngLat = e.lngLat;
        contextMenuCoords.textContent = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        contextMenu.style.left = `${e.point.x}px`;
        contextMenu.style.top = `${e.point.y}px`;
        contextMenu.style.display = 'block';
    });

    document.getElementById('ctx-directions-from').addEventListener('click', () => {
        showPanel('directions-panel-redesign');
        fromInput.value = `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}`;
        fromInput.dataset.coords = `${contextMenuLngLat.lng},${contextMenuLngLat.lat}`;
        toInput.value = '';
        toInput.dataset.coords = '';
        toInput.focus();
    });
    document.getElementById('ctx-directions-to').addEventListener('click', () => {
        showPanel('directions-panel-redesign');
        toInput.value = `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}`;
        toInput.dataset.coords = `${contextMenuLngLat.lng},${contextMenuLngLat.lat}`;
        fromInput.value = '';
        fromInput.dataset.coords = '';
        fromInput.focus();
    });
    document.getElementById('ctx-whats-here').addEventListener('click', () => reverseGeocodeAndShowInfo(contextMenuLngLat));

    map.on('click', async (e) => {
        const target = e.originalEvent.target;
        if (target.closest('.maplibregl-ctrl, #side-panel, #context-menu, .maplibregl-marker')) return;
        if (map.queryRenderedFeatures(e.point, {
                layers: ['route-line']
            }).length > 0) return;
        const poi = map.queryRenderedFeatures(e.point, {
            layers: ['poi-label']
        })[0];
        if (poi?.properties.name) {
            performSmartSearch(poi.properties.name, processPlaceResult);
        } else {
            await reverseGeocodeAndShowInfo(e.lngLat);
        }
    });

    // --- NAVIGATION STATE & SPEECH SERVICE ---
    let navigationState = {};

    function resetNavigationState() {
        navigationState = {
            isActive: false,
            isRerouting: false,
            currentStepIndex: 0,
            destinationCoords: null,
            lastDistanceToDestination: Infinity
        };
    }
    resetNavigationState();

    const speechService = {
        synthesis: window.speechSynthesis,
        voices: {
            male: null,
            female: null,
        },
        selectedVoice: localStorage.getItem('mapVoice') || 'female',
        isReady: false,
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
                setTimeout(() => {
                    if (!this.isReady) {
                        getVoices();
                        if (this.isReady) resolve();
                    }
                }, 1000);
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

    // --- SIDE PANEL MANAGEMENT (REWORKED) ---
    function goBack() {
        if (panelHistory.length > 1) {
            panelHistory.pop();
            const previousPanel = panelHistory[panelHistory.length - 1];
            showPanel(previousPanel, false);
            if (previousPanel === 'welcome-panel') {
                clearCategoryMarkers();
            }
        } else {
            closePanel();
        }
    }

    function showPanel(viewId, pushToHistory = true) {
        if (pushToHistory && panelHistory[panelHistory.length - 1] !== viewId) {
            panelHistory.push(viewId);
        }
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel', 'welcome-panel', 'search-results-panel'].forEach(id => {
            document.getElementById(id).hidden = id !== viewId;
        });
        panelBackButton.hidden = panelHistory.length <= 1 || viewId === 'welcome-panel';
        if (isMobile) {
            sidePanel.classList.toggle('peek', viewId === 'welcome-panel');
            sidePanel.classList.toggle('open', viewId !== 'welcome-panel');
        } else {
            sidePanel.classList.add('open');
            moveSearchBarToPanel();
        }
    }

    function closePanel() {
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
        clearCategoryMarkers();
        panelHistory = [];
        showPanel('welcome-panel', true);
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
            topSearchWrapper.prepend(mainSearchContainer);
            panelSearchPlaceholder.hidden = true;
            topSearchWrapper.style.opacity = '1';
        }
    }

    // --- SEARCH LOGIC (REWORKED) ---
    const getRecentSearches = () => JSON.parse(localStorage.getItem('recentSearches') || '[]');
    const addRecentSearch = (place) => {
        let recents = getRecentSearches();
        recents = recents.filter(item => item.display_name !== place.display_name);
        recents.unshift(place);
        recents = recents.slice(0, MAX_RECENT_SEARCHES);
        localStorage.setItem('recentSearches', JSON.stringify(recents));
    };

    const showInitialSuggestions = () => {
        mainSuggestions.innerHTML = '';
        const recents = getRecentSearches();
        if (recents.length > 0) {
            const title = document.createElement('div');
            title.className = 'suggestion-title';
            title.textContent = 'Recent Searches';
            mainSuggestions.appendChild(title);
            recents.forEach(place => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerHTML = `<span class="material-symbols-outlined">history</span><span>${place.display_name}</span>`;
                item.addEventListener('click', () => processPlaceResult(place));
                mainSuggestions.appendChild(item);
            });
        }
        const title = document.createElement('div');
        title.className = 'suggestion-title';
        title.textContent = 'Categories';
        mainSuggestions.appendChild(title);
        CATEGORIES.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `<span class="material-symbols-outlined">${cat.icon}</span><span>${cat.name}</span>`;
            item.addEventListener('click', () => searchByCategory(cat.term));
            mainSuggestions.appendChild(item);
        });
        mainSuggestions.style.display = 'block';
    };

    const debouncedGeocode = debounce(async (query) => {
        if (query.length < 2) {
            showInitialSuggestions();
            return;
        }
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            mainSuggestions.innerHTML = '';
            data.features.forEach(item => {
                const el = document.createElement("div");
                el.className = "suggestion-item api-result";
                el.innerHTML = `<span class="material-symbols-outlined">place</span><span>${item.place_name}</span>`;
                const place = {
                    lon: item.center[0],
                    lat: item.center[1],
                    display_name: item.place_name,
                    bbox: item.bbox
                };
                el.addEventListener("click", () => processPlaceResult(place));
                mainSuggestions.appendChild(el);
            });
            mainSuggestions.style.display = data.features.length > 0 ? "block" : "none";
        } catch (e) {
            console.error("Suggestion fetch failed", e);
        }
    }, 300);

    mainSearchInput.addEventListener('focus', () => {
        if (mainSearchInput.value.trim() === '') showInitialSuggestions();
    });
    mainSearchInput.addEventListener('input', () => debouncedGeocode(mainSearchInput.value.trim()));

    async function performSmartSearch(query, onSelect) {
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features.length > 0) {
                const item = data.features[0];
                onSelect({
                    lon: item.center[0],
                    lat: item.center[1],
                    display_name: item.place_name,
                    bbox: item.bbox
                });
            } else {
                showToast("No results found.", "error");
            }
        } catch (e) {
            showToast("Search failed.", "error");
        }
    }
    mainSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") performSmartSearch(mainSearchInput.value, processPlaceResult);
    });
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput.value, processPlaceResult));

    // --- CATEGORY SEARCH ---
    function clearCategoryMarkers() {
        categoryMarkers.forEach(m => m.remove());
        categoryMarkers = [];
    }
    async function searchByCategory(category) {
        showToast(`Searching for ${category}...`, 'info', 2000);
        clearCategoryMarkers();
        if (clickedLocationMarker) {
            clickedLocationMarker.remove();
            clickedLocationMarker = null;
        }
        mainSuggestions.style.display = 'none';
        mainSearchInput.value = category;
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(category)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=10&fuzzyMatch=true`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features.length > 0) {
                displayCategoryResults(category, data.features);
                addRecentSearch({
                    display_name: category,
                    lon: center.lng,
                    lat: center.lat
                });
            } else {
                showToast(`No results found for ${category}.`, "error");
            }
        } catch (e) {
            console.error("Category search failed", e);
            showToast("Search failed.", "error");
        }
    }

    function displayCategoryResults(category, features) {
        searchResultsTitle.textContent = `Results for ${category}`;
        searchResultsList.innerHTML = '';
        const bounds = new maplibregl.LngLatBounds();
        features.forEach(feature => {
            const place = {
                lon: feature.center[0],
                lat: feature.center[1],
                display_name: feature.place_name,
                bbox: feature.bbox
            };
            const marker = new maplibregl.Marker({
                color: '#3887be'
            }).setLngLat([place.lon, place.lat]).addTo(map);
            marker.getElement().addEventListener('click', (e) => {
                e.stopPropagation();
                processPlaceResult(place);
            });
            categoryMarkers.push(marker);
            bounds.extend([place.lon, place.lat]);
            const li = document.createElement('li');
            li.className = 'category-result-item';
            li.innerHTML = `<h4>${feature.text}</h4><p>${feature.place_name.replace(feature.text + ', ', '')}</p>`;
            li.addEventListener('click', () => {
                map.flyTo({
                    center: [place.lon, place.lat],
                    zoom: 15
                });
                processPlaceResult(place);
            });
            searchResultsList.appendChild(li);
        });
        map.fitBounds(bounds, {
            padding: isMobile ? 80 : {
                top: 100,
                bottom: 100,
                left: 450,
                right: 100
            },
            maxZoom: 14
        });
        showPanel('search-results-panel');
    }

    // --- PLACE & ROUTING LOGIC ---
    function processPlaceResult(place) {
        currentPlace = place;
        mainSuggestions.style.display = 'none';
        mainSearchInput.value = place.display_name;
        stopNavigation();
        clearRouteFromMap();
        clearCategoryMarkers();
        if (clickedLocationMarker) clickedLocationMarker.remove();
        clickedLocationMarker = new maplibregl.Marker().setLngLat([parseFloat(place.lon), parseFloat(place.lat)]).addTo(map);
        if (place.bbox) map.fitBounds(place.bbox, {
            padding: 100,
            essential: true
        });
        else map.flyTo({
            center: [parseFloat(place.lon), parseFloat(place.lat)],
            zoom: 14
        });
        infoNameEl.textContent = place.display_name.split(',')[0];
        infoAddressEl.textContent = place.display_name;
        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        fetchAndSetWebsite(locationName);
        addRecentSearch(place);
        showPanel('info-panel-redesign');
    }

    mainDirectionsIcon.addEventListener('click', () => {
        if (currentPlace) {
            openDirectionsPanel();
        } else if (mainSearchInput.value.trim()) {
            performSmartSearch(mainSearchInput.value, (place) => {
                processPlaceResult(place);
                openDirectionsPanel();
            });
        } else {
            showPanel('directions-panel-redesign');
        }
    });

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = '';
            fromInput.dataset.coords = '';
            fromInput.focus();
        }
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
            }
            throw new Error("No image found on Wikipedia.");
        } catch (e) {
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

    async function fetchAndSetWebsite(query) {
        const websiteBtn = document.getElementById('info-website-btn');
        try {
            const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extlinks&titles=${encodeURIComponent(query)}`;
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            const websiteLink = page.extlinks?.find(link => link['*'].includes('://') && !link['*'].includes('wikipedia.org'));
            if (websiteLink) {
                websiteBtn.style.display = 'flex';
                websiteBtn.onclick = () => window.open(websiteLink['*'], '_blank');
            } else {
                websiteBtn.style.display = 'none';
            }
        } catch (e) {
            websiteBtn.style.display = 'none';
        }
    }

    function getWeatherDescription(code) {
        const descriptions = {
            0: 'Clear',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Fog',
            61: 'Rain',
            63: 'Rain',
            65: 'Heavy rain',
            71: 'Snow',
            73: 'Snow',
            75: 'Heavy snow',
            80: 'Showers',
            95: 'Thunderstorm'
        };
        return descriptions[code] || "Weather unavailable";
    }

    async function fetchAndSetWeather(lat, lon) {
        const weatherEl = document.getElementById('info-weather');
        weatherEl.innerHTML = '<div class="skeleton-line"></div>';
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
        factsEl.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div>';
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

    document.getElementById('welcome-directions-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('view-steps-btn').addEventListener('click', () => showPanel('route-section'));
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('start-navigation-btn').addEventListener('click', startNavigation);
    document.getElementById('dir-use-my-location').addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(pos => {
            fromInput.value = "Your Location";
            fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        }, handlePositionError, geolocationOptions);
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
            map.addSource('route', {
                type: 'geojson',
                data: routeGeoJSON
            });
            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#0d89ec',
                    'line-width': 8,
                    'line-opacity': 0.7
                }
            });
        }
    }

    function updateHighlightedSegment(step) {
        if (!step || !step.geometry) return;
        const geojson = {
            type: 'Feature',
            geometry: step.geometry
        };
        if (map.getSource('highlighted-route-segment')) {
            map.getSource('highlighted-route-segment').setData(geojson);
        } else {
            map.addSource('highlighted-route-segment', {
                type: 'geojson',
                data: geojson
            });
            map.addLayer({
                id: 'highlighted-route-segment',
                type: 'line',
                source: 'highlighted-route-segment',
                paint: {
                    'line-color': '#0055ff',
                    'line-width': 9,
                    'line-opacity': 0.9
                }
            }, 'route-line');
        }
    }

    function formatOsrmInstruction(step) {
        if (!step || !step.maneuver) return 'Continue';
        const {
            type,
            modifier
        } = step.maneuver;
        const name = step.name.split(',')[0];
        const onto = (str) => (name ? `${str} onto ${name}` : str);
        const on = (str) => (name ? `${str} on ${name}` : str);
        switch (type) {
            case 'depart':
                return `Head ${modifier || ''} ${on('')}`.trim();
            case 'arrive':
                return `Your destination is on the ${modifier}`;
            case 'turn':
            case 'off ramp':
                return (modifier === 'straight') ? on('Continue straight') : onto(`Turn ${modifier}`);
            case 'fork':
                return onto(`Keep ${modifier} at the fork`);
            case 'roundabout':
                const exit = step.maneuver.exit;
                const nth = new Intl.PluralRules('en-US', {
                    type: 'ordinal'
                }).select(exit);
                const suffix = {
                    one: 'st',
                    two: 'nd',
                    few: 'rd',
                    other: 'th'
                } [nth];
                return onto(`Take the ${exit}${suffix} exit`);
            case 'merge':
                return onto(`Merge ${modifier}`);
            default:
                return on(`Continue ${modifier || ''}`.trim());
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
            addRouteToMap({
                type: 'Feature',
                geometry: route.geometry
            });
            const bounds = new maplibregl.LngLatBounds();
            route.geometry.coordinates.forEach(coord => bounds.extend(coord));
            if (fromInput.value.trim() === "Your Location") {
                map.fitBounds(bounds, {
                    padding: isMobile ? {
                        top: 150,
                        bottom: 250,
                        left: 50,
                        right: 50
                    } : 100
                });
                closePanel();
                startNavigation();
            } else {
                document.getElementById('route-summary-time').textContent = formatDuration(route.duration);
                document.getElementById('route-summary-distance').textContent = `${(route.distance / 1609.34).toFixed(1)} mi`;
                showPanel('route-preview-panel');
                map.fitBounds(bounds, {
                    padding: isMobile ? 50 : {
                        top: 50,
                        bottom: 50,
                        left: 450,
                        right: 50
                    }
                });
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
            addRouteToMap({
                type: 'Feature',
                geometry: data.routes[0].geometry
            });
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

    function startNavigation() {
        if (!navigator.geolocation) return showToast("Geolocation is not supported.", "error");
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
            userLocationMarker = new maplibregl.Marker({
                element: el,
                rotationAlignment: 'map'
            }).setLngLat([0, 0]).addTo(map);
        }
        map.easeTo({
            pitch: 60,
            zoom: 17,
            duration: 1500
        });
        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation);
    }

    function stopNavigation() {
        if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
        if (userLocationMarker) {
            userLocationMarker.remove();
            userLocationMarker = null;
        }
        clearRouteFromMap();
        resetNavigationState();
        navigationStatusPanel.style.display = 'none';
        speechService.synthesis.cancel();
        map.easeTo({
            pitch: 0,
            bearing: 0
        });
    }

    function handlePositionError(error) {
        showToast(`Geolocation error: ${error.message}.`, "error");
        stopNavigation();
    }

    async function handlePositionUpdate(position) {
        if (!navigationState.isActive || navigationState.isRerouting) return;
        const {
            latitude,
            longitude,
            heading,
            speed
        } = position.coords;
        const userPoint = turf.point([longitude, latitude]);
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, {
            units: 'meters'
        });
        userLocationMarker.setLngLat(snapped.geometry.coordinates);
        if (heading != null) {
            userLocationMarker.setRotation(heading);
            map.easeTo({
                center: snapped.geometry.coordinates,
                bearing: heading,
                duration: 500
            });
        } else {
            map.easeTo({
                center: snapped.geometry.coordinates,
                duration: 500
            });
        }
        const distanceFromRoute = snapped.properties.dist;
        const OFF_ROUTE_THRESHOLD = 50;
        if (distanceFromRoute > OFF_ROUTE_THRESHOLD) {
            speechService.speak("Off route. Recalculating.", true);
            await reroute(userPoint);
            return;
        }
        const steps = currentRouteData.routes[0].legs[0].steps;
        const currentStep = steps[navigationState.currentStepIndex];
        const stepEndPoint = turf.point(currentStep.geometry.coordinates.slice(-1)[0]);
        const distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, {
            units: 'meters'
        });
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
        const totalStepDistance = turf.length(turf.lineString(currentStep.geometry.coordinates), {
            units: 'meters'
        });
        const progressAlongStep = Math.max(0, 1 - (distanceToNextManeuver / totalStepDistance));
        instructionProgressBar.transform = `scaleX(${progressAlongStep})`;
        const tripDurationSeconds = currentRouteData.routes[0].duration;
        const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
        const remainingTime = tripDurationSeconds - timeElapsed;
        statTimeRemainingEl.textContent = formatDuration(remainingTime);
        statEtaEl.textContent = new Date(Date.now() + remainingTime * 1000).toLocaleTimeString(navigator.language, {
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    // --- SETTINGS, STYLES, & FINAL INIT ---
    function openSettings() {
        settingsMenu.classList.add('open');
        if (isMobile) menuOverlay.classList.add('open');
    }

    function closeSettings() {
        settingsMenu.classList.remove('open');
        if (isMobile) menuOverlay.classList.remove('open');
    }
    settingsBtns.forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettings();
    }));
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => {
        if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) closeSettings();
    });
    document.querySelectorAll('input[name="map-style"]').forEach(radio => radio.addEventListener('change', () => {
        map.setStyle(STYLES[radio.value]);
        if (isMobile) setTimeout(closeSettings, 200);
    }));
    document.getElementById('traffic-toggle').addEventListener('change', (e) => {
        if (e.target.checked) addTrafficLayer();
        else removeTrafficLayer();
        if (isMobile) setTimeout(closeSettings, 200);
    });
    document.querySelectorAll('input[name="nav-voice"]').forEach(radio => radio.addEventListener('change', () => {
        speechService.setVoice(radio.value);
        speechService.speak("Voice has been changed.", true);
        if (isMobile) setTimeout(closeSettings, 200);
    }));
    const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
    const TRAFFIC_LAYER_ID = 'traffic-lines';
    const trafficSource = {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}`
    };
    const trafficLayer = {
        id: TRAFFIC_LAYER_ID,
        type: 'line',
        source: TRAFFIC_SOURCE_ID,
        'source-layer': 'traffic',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-width': 2,
            'line-color': ['match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0']
        }
    };

    function addTrafficLayer() {
        if (!map.getSource(TRAFFIC_SOURCE_ID)) {
            map.addSource(TRAFFIC_SOURCE_ID, trafficSource);
            let firstSymbolId;
            for (const layer of map.getStyle().layers) {
                if (layer.type === 'symbol') {
                    firstSymbolId = layer.id;
                    break;
                }
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
            addRouteToMap({
                type: 'Feature',
                geometry: currentRouteData.routes[0].geometry
            });
            updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]);
        }
        if (document.getElementById('traffic-toggle').checked) addTrafficLayer();
    });
    if (isMobile) {
        let panelDragState = {
            isDragging: false,
            startY: 0,
            dragOffset: 0
        };
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
            navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered'), err => console.log('SW failed'));
        });
    }
    speechService.init().then(() => {
        const savedVoice = localStorage.getItem('mapVoice') || 'female';
        speechService.setVoice(savedVoice);
        const radio = document.querySelector(`input[name="nav-voice"][value="${savedVoice}"]`);
        if (radio) radio.checked = true;
    });
    getInitialRouteFromUrl();
});

