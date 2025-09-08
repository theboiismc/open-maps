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
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTHENTICATION CHECK & UI UPDATE ---
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
    const appMenuButton = document.getElementById('app-menu-button');
    const servicesDropdown = document.getElementById('services-dropdown');

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
                profileButton.innerHTML = defaultProfileIconSVG;
                if(dropdownAvatar) dropdownAvatar.hidden = true;
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
        console.log("OIDC Event: User loaded", user);
        updateAuthUI(user);
        const userFirstName = user.profile.name.split(' ')[0];
        showToast(`Welcome back, ${userFirstName}!`, 'success');
    });

    userManager.events.addUserUnloaded(() => {
        console.log("OIDC Event: User unloaded");
        updateAuthUI(null);
    });

    try {
        const user = await authService.getUser();
        if (user) {
            console.log("Initial check: User found", user);
            updateAuthUI(user);
        } else {
            console.log("Initial check: No user found.");
            updateAuthUI(null);
        }
    } catch (error) {
        console.error("Initial getUser check failed:", error);
        updateAuthUI(null);
    }
    
    profileButton.addEventListener('click', (e) => {
        const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
        profileDropdown.style.display = isHidden ? 'block' : 'none';
        servicesDropdown.style.display = 'none';
    });

    if (appMenuButton) {
        appMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = servicesDropdown.style.display === 'none' || !servicesDropdown.style.display;
            servicesDropdown.style.display = isHidden ? 'block' : 'none';
            profileDropdown.style.display = 'none';
        });
    }

    document.addEventListener('click', (e) => {
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
        if (servicesDropdown.style.display === 'block' && !appMenuButton.contains(e.target) && !servicesDropdown.contains(e.target)) {
            servicesDropdown.style.display = 'none';
        }
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    // FIX: Updated signup button to point to the correct general accounts URL
    signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';

    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: 'https://tiles.theboiismc.com/styles/basic-preview/style.json',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };

    function getInitialViewFromHash() {
        if (window.location.hash) {
            const parts = window.location.hash.substring(1).split('/');
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
        zoom: initialView.zoom,
        pitchWithRotate: false,
        dragRotate: false
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
            const hash = `#${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
            history.replaceState(null, '', hash);
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
        voices: {
            male: null,
            female: null,
        },
        selectedVoice: localStorage.getItem('mapVoice') || 'female',
        isReady: false,
        
        init() {
            return new Promise((resolve, reject) => {
                const getVoices = () => {
                    const availableVoices = this.synthesis.getVoices();
                    if (!availableVoices.length) {
                        return;
                    }
                    
                    // IMPROVED: Find male and female voices with more robust checks
                    const femaleNames = ['Google US English', 'Zira', 'Samantha', 'Female', 'Allison'];
                    this.voices.female = availableVoices.find(voice => 
                        voice.lang.startsWith('en') && 
                        femaleNames.some(name => voice.name.includes(name))
                    ) || availableVoices.find(voice => voice.lang.startsWith('en') && !voice.name.toLowerCase().includes('male'));
                    
                    const maleNames = ['Google UK English Male', 'David', 'Male', 'Tom'];
                    this.voices.male = availableVoices.find(voice => 
                        voice.lang.startsWith('en') && 
                        maleNames.some(name => voice.name.includes(name))
                    ) || availableVoices.find(voice => voice.lang.startsWith('en') && !this.voices.female);

                    if (this.voices.female || this.voices.male) {
                        this.isReady = true;
                        console.log("Speech service ready. Voices found:", this.voices);
                        resolve();
                    } else {
                        reject("No suitable English voices found.");
                    }
                };
                
                this.synthesis.onvoiceschanged = getVoices;
                getVoices();

                setTimeout(() => {
                    if (!this.isReady) {
                        getVoices();
                        if(this.isReady) {
                            resolve();
                        } else {
                           console.warn("Speech synthesis voices could not be loaded in time.");
                           reject("Voice loading timeout");
                        }
                    }
                }, 1000);
            });
        },

        speak(text, priority = false) {
            if (!this.isReady || !text) return;
            if (priority && this.synthesis.speaking) {
                this.synthesis.cancel();
            }
    
            setTimeout(() => {
                 if (!this.synthesis.speaking) {
                    const utterance = new SpeechSynthesisUtterance(text);
                    const voice = this.voices[this.selectedVoice];
                    
                    if (voice) {
                        utterance.voice = voice;
                        utterance.pitch = 1; 
                        utterance.rate = 1;
                    } else {
                         console.warn(`Selected voice '${this.selectedVoice}' not available.`);
                    }
                    this.synthesis.speak(utterance);
                }
            }, 50);
        },

        setVoice(voiceGender) {
            if (this.voices[voiceGender]) {
                this.selectedVoice = voiceGender;
                localStorage.setItem('mapVoice', voiceGender);
                console.log(`Voice set to: ${voiceGender}`);
            } else {
                 console.error(`Cannot set voice, '${voiceGender}' not found.`);
            }
        }
    };

    let navigationState = {};
    function resetNavigationState() {
        navigationState = { isActive: false, isRerouting: false, currentStepIndex: 0, progressAlongStep: 0, distanceToNextManeuver: Infinity, userSpeed: 0, estimatedArrivalTime: null, totalTripTime: 0, lastAnnouncedDistance: Infinity, isWrongWay: false };
    }
    resetNavigationState();

    const highlightedSegmentLayerId = 'highlighted-route-segment';
    
    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel', 'welcome-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
        if (isMobile) {
            if (viewId === 'welcome-panel') {
                sidePanel.classList.remove('open');
                sidePanel.classList.add('peek');
            } else {
                sidePanel.classList.remove('peek');
                sidePanel.classList.add('open');
            }
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
        const target = e.originalEvent.target;
        if (target.closest('.maplibregl-ctrl')) return;

        const features = map.queryRenderedFeatures(e.point, { layers: ['route-line', 'highlighted-route-segment'] });
        if (features.length > 0) return;

        if (!target.closest('#side-panel')) {
            const poi = map.queryRenderedFeatures(e.point, { layers: ['poi'] })[0];
            if (poi && poi.properties.name) {
                performSmartSearch({ value: poi.properties.name }, processPlaceResult);
            } else {
                await reverseGeocodeAndShowInfo(e.lngLat);
            }
        }
    });

    async function reverseGeocodeAndShowInfo(lngLat) {
        const url = `https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const item = data.features[0];
                const place = {
                    lon: item.center[0],
                    lat: item.center[1],
                    display_name: item.place_name,
                    bbox: item.bbox
                };
                processPlaceResult(place);
            } else {
                closePanel();
            }
        } catch (error) {
            console.error("Reverse geocoding failed", error);
        }
    }

    function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (query.length < 3) { suggestionsEl.style.display = "none"; return; }
            const center = map.getCenter();
            const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5&fuzzyMatch=true`;
            
            try {
                const res = await fetch(url);
                const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.features.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "search-result";
                    el.textContent = item.place_name;
                    el.addEventListener("click", () => {
                        const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox };
                        onSelect(place);
                    });
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
            } catch (e) {
                console.error("Suggestion fetch failed", e);
            }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const center = map.getCenter();
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=1&fuzzyMatch=true`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const item = data.features[0];
                const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox };
                onSelect(place);
            } else {
                showToast("No results found for your search.", "error");
            }
        } catch (e) {
            showToast("Search failed. Please check your connection.", "error");
        }
    }

    const mainSuggestions = document.getElementById("main-suggestions");
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });

    const fromInput = document.getElementById('panel-from-input');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });

    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();

        if (clickedLocationMarker) {
            clickedLocationMarker.remove();
        }
        clickedLocationMarker = new maplibregl.Marker()
            .setLngLat([parseFloat(place.lon), parseFloat(place.lat)])
            .addTo(map);

        if (place.bbox) {
            map.fitBounds(place.bbox, {
                padding: { top: 100, bottom: 100, left: 100, right: 100 },
                essential: true
            });
        } else {
            map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
        }

        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');

        infoNameEl.textContent = place.display_name.split(',')[0];
        infoAddressEl.textContent = place.display_name;
        infoImageEl.src = '';
        infoImageEl.style.backgroundColor = '#e0e0e0';
        infoWeatherEl.innerHTML = '<div class="skeleton-line"></div>';
        quickFactsEl.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';

        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        fetchAndSetWebsite(locationName);
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query, lon, lat) {
        const imgEl = document.getElementById('info-image');
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
            } else {
                throw new Error("No image found on Wikipedia.");
            }
        } catch (e) {
            console.log("Wikipedia image failed:", e.message, "Activating fallback.");
            const offset = 0.005;
            const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
            const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
            imgEl.src = fallbackUrl;
            imgEl.alt = `Map view of ${query}`;
            imgEl.onerror = () => { imgEl.style.backgroundColor = '#e0e0e0'; imgEl.alt = 'Image not available'; };
        }
    }

    async function fetchAndSetWebsite(query) {
        const websiteBtn = document.getElementById('info-website-btn');
        const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageprops|extlinks&titles=${encodeURIComponent(query)}`;
        try {
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            let websiteFound = false;
            
            if (page.extlinks && page.extlinks.length > 0) {
                const websiteLink = page.extlinks.find(link => link['*'].includes('://') && !link['*'].includes('wikipedia.org'));
                if (websiteLink) {
                    websiteBtn.style.display = 'flex';
                    websiteBtn.onclick = () => window.open(websiteLink['*'], '_blank');
                    websiteFound = true;
                }
            }

            if (!websiteFound && page.pageprops && page.pageprops.wikibase_item) {
                const wikidataId = page.pageprops.wikibase_item;
                const wikidataUrl = `https://www.wikidata.org/w/api.php?origin=*&action=wbgetentities&format=json&ids=${wikidataId}&props=claims&languages=en`;
                const wikidataRes = await fetch(wikidataUrl);
                const wikidataData = await wikidataRes.json();
                const claims = wikidataData.entities[wikidataId]?.claims;
                if (claims && claims.P856 && claims.P856.length > 0) {
                    const website = claims.P856[0].mainsnak.datavalue.value;
                    if (website) {
                        websiteBtn.style.display = 'flex';
                        websiteBtn.onclick = () => window.open(website, '_blank');
                        websiteFound = true;
                    }
                }
            }
            
            if (!websiteFound) {
                websiteBtn.style.display = 'none';
            }
        } catch (e) {
            console.error("Website fetch failed:", e);
            websiteBtn.style.display = 'none';
        }
    }

    function getWeatherDescription(code) {
        const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail' };
        return descriptions[code] || "Weather data unavailable";
    }

    async function fetchAndSetWeather(lat, lon) {
        const weatherEl = document.getElementById('info-weather');
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API returned status ${res.status}`);
            const data = await res.json();
            if (data.current_weather) {
                const tempF = Math.round(data.current_weather.temperature);
                const tempC = Math.round((tempF - 32) * 5 / 9);
                const description = getWeatherDescription(data.current_weather.weathercode);
                weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
            } else {
                throw new Error("Invalid weather data format.");
            }
        } catch (e) {
            weatherEl.textContent = "Could not load weather data.";
            console.error("Weather fetch/parse error:", e);
        }
    }

    async function fetchAndSetQuickFacts(query) {
        const factsEl = document.getElementById('quick-facts-content');
        try {
            const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            factsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found on Wikipedia.";
        } catch (e) {
            factsEl.textContent = "Could not load facts.";
            console.error("Wikipedia API error", e);
        }
    }

    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = ''; fromInput.dataset.coords = '';
        } else {
            toInput.value = mainSearchInput.value;
            toInput.dataset.coords = ''; fromInput.value = ''; fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => { if (currentUser) { showToast("Feature 'Save Place' not yet implemented!"); } else { showToast("Please log in to save places.", "error"); } });
    document.getElementById('swap-btn').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });
    document.getElementById('dir-use-my-location').addEventListener('click', () => { fromInput.value = "Getting your location..."; navigator.geolocation.getCurrentPosition( pos => { fromInput.value = "Your Location"; fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`; }, handlePositionError, geolocationOptions ); });
    document.getElementById('back-to-info-btn').addEventListener('click', () => { if (currentPlace) showPanel('info-panel-redesign'); });
    document.getElementById('back-to-directions-btn').addEventListener('click', () => { showPanel('directions-panel-redesign'); });
    document.getElementById('view-steps-btn').addEventListener('click', () => {
        showPanel('route-section');
        populateRouteSteps();
    });

    function clearRouteFromMap() {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    }
    
    function displayRoutePreview(route) {
        const durationMinutes = Math.round(route.duration / 60);
        const distanceMiles = (route.distance / 1609.34).toFixed(1);
        document.getElementById('route-summary-time').textContent = `${durationMinutes} min`;
        document.getElementById('route-summary-distance').textContent = `${distanceMiles} mi`;
        showPanel('route-preview-panel');
    }
    
    function populateRouteSteps() {
        routeStepsList.innerHTML = '';
        const steps = currentRouteData.routes[0].legs[0].steps;
        steps.forEach((step, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${formatOsrmInstruction(step)}</span><span class="step-distance">${(step.distance / 1609.34).toFixed(2)} mi</span>`;
            routeStepsList.appendChild(li);
        });
    }

    async function getRoute() {
        if (!fromInput.value || !toInput.value) return showToast("Please fill both start and end points.", "error");
        
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
                return showToast(data.message || "A route could not be found.", "error");
            }
            
            currentRouteData = data;
            const route = data.routes[0];
            const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
            addRouteToMap(routeGeoJSON);
            const bounds = new maplibregl.LngLatBounds();
            routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));

            if (navigationState.isRerouting) {
                map.fitBounds(bounds, { padding: 100 });
                updateHighlightedSegment(route.legs[0].steps[0]);
                navigationInstructionEl.textContent = formatOsrmInstruction(route.legs[0].steps[0]);
                navigationState.currentStepIndex = 0;
                navigationState.isRerouting = false;
                navigationState.isWrongWay = false;
            } else if (fromInput.value.trim() === "Your Location") {
                map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });
                closePanel();
                startNavigation();
            } else {
                displayRoutePreview(route);
                map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
            }
        } catch (err) {
            showToast(`Error getting route: ${err.message}`, "error");
            navigationState.isRerouting = false;
        }
    }
    
    const startNavigationBtn = document.getElementById('start-navigation-btn');
    startNavigationBtn.addEventListener('click', startNavigation);

    const shareRouteBtn = document.getElementById('share-route-btn');
    shareRouteBtn.addEventListener('click', async () => {
        const fromName = fromInput.value;
        const toName = toInput.value;
        const fromCoords = fromInput.dataset.coords;
        const toCoords = toInput.dataset.coords;
        const shareText = `Check out this route from ${fromName} to ${toName}!`;
        const url = new URL(window.location.href);
        url.searchParams.set('from', fromCoords);
        url.searchParams.set('to', toCoords);
        url.searchParams.set('fromName', fromName);
        url.searchParams.set('toName', toName);

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'TheBoiisMC Maps Route',
                    text: shareText,
                    url: url.toString()
                });
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            navigator.clipboard.writeText(url.toString()).then(() => {
                showToast("Route link copied to clipboard!", "success");
            }).catch(err => {
                console.error('Could not copy link: ', err);
                showToast("Could not copy link to clipboard.", "error");
            });
        }
    });

    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => {
        clearRouteFromMap();
        showPanel('directions-panel-redesign');
    });

    async function geocode(inputEl) {
        if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?key=${MAPTILER_KEY}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.features || data.features.length === 0) throw new Error(`Could not find location: ${inputEl.value}`);
        const feature = data.features[0];
        inputEl.value = feature.place_name;
        inputEl.dataset.coords = `${feature.center[0]},${feature.center[1]}`;
        return [feature.center[0], feature.center[1]];
    }

    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) { map.getSource('route').setData(routeGeoJSON); } 
        else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
        }
    }

    function toRadians(degrees) { return degrees * Math.PI / 180; }
    function toDegrees(radians) { return radians * 180 / Math.PI; }
    function getBearing(startPoint, endPoint) {
        const startLat = toRadians(startPoint.geometry.coordinates[1]);
        const startLng = toRadians(startPoint.geometry.coordinates[0]);
        const endLat = toRadians(endPoint.geometry.coordinates[1]);
        const endLng = toRadians(endPoint.geometry.coordinates[0]);
        const dLng = endLng - startLng;
        const y = Math.sin(dLng) * Math.cos(endLat);
        const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
        let brng = toDegrees(Math.atan2(y, x));
        return (brng + 360) % 360;
    }

    function formatEta(date) {
        if (!date) return "--:--";
        let hours = date.getHours();
        let minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0'+minutes : minutes;
        return `${hours}:${minutes} ${ampm}`;
    }

    function updateNavigationUI() {
        const remainingTime = (navigationState.totalTripTime / 60).toFixed(0);
        statTimeRemainingEl.textContent = `${remainingTime} min`;
        statEtaEl.textContent = formatEta(navigationState.estimatedArrivalTime);
        statSpeedEl.textContent = navigationState.userSpeed.toFixed(0);
        instructionProgressBar.transform = `scaleX(${1 - navigationState.progressAlongStep})`;
    }

    function updateHighlightedSegment(step) {
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
        if (!step || !step.geometry) return;
        map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: step.geometry });
        map.addLayer({
            id: highlightedSegmentLayerId,
            type: 'line',
            source: highlightedSegmentLayerId,
            paint: { 'line-color': '#0055ff', 'line-width': 9, 'line-opacity': 0.9 }
        }, 'route-line');
    }

    function formatOsrmInstruction(step) {
        if (!step || !step.maneuver) return 'Continue';
    
        const { type, modifier } = step.maneuver;
        const name = step.name.split(',')[0];
    
        const onto = (str) => (name ? `${str} onto ${name}` : str);
        const on = (str) => (name ? `${str} on ${name}` : str);
    
        switch (type) {
            case 'depart':
                const cardinalDirection = modifier ? modifier.replace(/\b\w/g, l => l.toUpperCase()) : '';
                return `Head ${cardinalDirection} ${on('')}`.trim();
            case 'arrive':
                return `Your destination is on the ${modifier}`;
            case 'turn':
            case 'off ramp':
                if (modifier === 'straight') return on('Continue straight');
                return onto(`Turn ${modifier}`);
            case 'fork':
                return onto(`Keep ${modifier} at the fork`);
            case 'roundabout':
                const exit = step.maneuver.exit;
                if (!exit) return 'Enter the roundabout';
                const nth = exit === 1 ? 'st' : exit === 2 ? 'nd' : exit === 3 ? 'rd' : 'th';
                return onto(`Take the ${exit}${nth} exit from the roundabout`);
            case 'merge':
                return onto(`Merge ${modifier}`);
            case 'new name':
                return on('Continue');
            case 'continue':
                return on(`Continue ${modifier || ''}`.trim());
            default:
                const formattedType = type.replace(/_/g, ' ');
                return `${formattedType} ${modifier || ''}`.trim();
        }
    }

    function startNavigation() {
        if (!navigator.geolocation) return showToast("Geolocation is not supported by your browser.", "error");
        
        resetNavigationState();
        navigationState.isActive = true;
        navigationState.totalTripTime = currentRouteData.routes[0].duration;

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
            el.innerHTML = `<svg class="car-icon" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>`;
            userLocationMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([0, 0]).addTo(map);
        }

        map.easeTo({ pitch: 0, zoom: 17, duration: 1500 });
        map.flyTo({ bearing: 0, pitch: 0 });

        navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
        endNavigationBtn.addEventListener('click', stopNavigation);
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

    async function handlePositionUpdate(position) {
        if (!navigationState.isActive) return;
        const { latitude, longitude, heading, speed, accuracy } = position.coords;

        if (accuracy > 80) return;

        const userPoint = turf.point([longitude, latitude]);
        const steps = currentRouteData.routes[0].legs[0].steps;

        navigationState.userSpeed = (speed || 0) * 2.23694;
        const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
        const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });

        userLocationMarker.setLngLat(snapped.geometry.coordinates);
        if (heading != null) {
            userLocationMarker.setRotation(heading);
            map.easeTo({ center: snapped.geometry.coordinates, bearing: 0, zoom: 18, duration: 500 });
        } else {
            map.easeTo({ center: snapped.geometry.coordinates, zoom: 18, duration: 500 });
        }

        if (snapped.properties.dist > 50) {
            if (!navigationState.isRerouting) {
                navigationState.isRerouting = true;
                speechService.speak("Off route. Recalculating.", true);
                await getRoute();
            }
            return;
        }
        
        if (heading != null && navigationState.userSpeed > 5) {
            const currentStep = steps[navigationState.currentStepIndex];
            const stepLine = turf.lineString(currentStep.geometry.coordinates);
            const stepBearing = getBearing(turf.point(stepLine.coordinates[0]), turf.point(stepLine.coordinates[stepLine.coordinates.length - 1]));
            const headingDifference = Math.abs(heading - stepBearing);

            if (headingDifference > 135 && headingDifference < 225) {
                if (!navigationState.isWrongWay && snapped.properties.dist > 10) {
                     navigationState.isWrongWay = true;
                     speechService.speak("Wrong way. Recalculating.", true);
                     await getRoute();
                     return;
                }
            } else {
                navigationState.isWrongWay = false;
            }
        }

        const remainingRoute = turf.lineSlice(snapped, turf.point(routeLine.coordinates[routeLine.coordinates.length - 1]), routeLine);
        const remainingDistance = turf.length(remainingRoute, { units: 'meters' });
        const speedInMetersPerSecond = navigationState.userSpeed * 0.44704;
        const remainingTimeSeconds = speedInMetersPerSecond > 0 ? (remainingDistance / speedInMetersPerSecond) : 0;
        navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
        navigationState.totalTripTime = remainingTimeSeconds;
        updateNavigationUI();

        const currentStep = steps[navigationState.currentStepIndex];
        const stepLine = turf.lineString(currentStep.geometry.coordinates);
        const totalStepDistance = turf.length(stepLine, { units: 'meters' });
        navigationState.distanceToNextManeuver = turf.distance(userPoint, turf.point(stepLine.coordinates[stepLine.coordinates.length - 1]), { units: 'meters' });
        navigationState.progressAlongStep = Math.max(0, 1 - (navigationState.distanceToNextManeuver / totalStepDistance));

        const distanceMiles = navigationState.distanceToNextManeuver * 0.000621371;
        const instruction = formatOsrmInstruction(currentStep);
        if (distanceMiles > 0.9 && distanceMiles < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
            speechService.speak(`In 1 mile, ${instruction}`);
            navigationState.lastAnnouncedDistance = 1;
        } else if (distanceMiles > 0.24 && distanceMiles < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
            speechService.speak(`In a quarter mile, ${instruction}`);
            navigationState.lastAnnouncedDistance = 0.25;
        }

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
    }

    const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
    const TRAFFIC_LAYER_ID = 'traffic-lines';
    const trafficSource = { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` };
    const trafficLayer = { id: TRAFFIC_LAYER_ID, type: 'line', source: TRAFFIC_SOURCE_ID, 'source-layer': 'traffic', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': 2, 'line-color': [ 'match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0' ] } };
    
    function addTrafficLayer() { 
        if (map.getSource(TRAFFIC_SOURCE_ID)) return; 
        map.addSource(TRAFFIC_SOURCE_ID, trafficSource); 
        
        const layers = map.getStyle().layers;
        let firstSymbolId;
        for (const layer of layers) {
            if (layer.type === 'symbol') {
                firstSymbolId = layer.id;
                break;
            }
        }
        map.addLayer(trafficLayer, firstSymbolId);
    }
    
    function removeTrafficLayer() { 
        if (!map.getSource(TRAFFIC_SOURCE_ID)) return; 
        map.removeLayer(TRAFFIC_LAYER_ID); 
        map.removeSource(TRAFFIC_SOURCE_ID); 
    }

    const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
    const trafficToggle = document.getElementById('traffic-toggle');
    const voiceRadioButtons = document.querySelectorAll('input[name="nav-voice"]');
    const unitsRadioButtons = document.querySelectorAll('input[name="map-units"]');
    
    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }
    
    document.getElementById('mobile-settings-btn').addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', (e) => { if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn') && !e.target.closest('#mobile-settings-btn')) { closeSettings(); } });
    
    styleRadioButtons.forEach(radio => { 
        radio.addEventListener('change', () => { 
            const newStyle = radio.value; 
            map.setStyle(STYLES[newStyle]); 
            if (isMobile) { 
                setTimeout(closeSettings, 200); 
            } 
        }); 
    });
    
    trafficToggle.addEventListener('change', () => { 
        if (trafficToggle.checked) { 
            addTrafficLayer(); 
        } else { 
            removeTrafficLayer(); 
        } 
        if (isMobile) { 
            setTimeout(closeSettings, 200); 
        } 
    });
    
    voiceRadioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            speechService.setVoice(radio.value);
            speechService.speak("Voice has been changed.", true);
            if (isMobile) {
                setTimeout(closeSettings, 200);
            }
        });
    });
    
    unitsRadioButtons.forEach(radio => { radio.addEventListener('change', () => { if (isMobile) { setTimeout(closeSettings, 200); } }); });
    
    map.on('styledata', () => { 
        if (navigationState.isActive && currentRouteData) { 
            const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry }; 
            addRouteToMap(routeGeoJSON); 
            updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]); 
        } 
        if (trafficToggle.checked) { 
            addTrafficLayer(); 
        } 
    });
    
    if (isMobile) {
        let panelDragState = {
            isDragging: false,
            startY: 0,
            currentY: 0,
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
            
            panelDragState.currentY = e.touches[0].clientY;
            panelDragState.dragOffset = panelDragState.currentY - panelDragState.startY;

            if (panelDragState.dragOffset > 0) {
                sidePanel.style.transform = `translateY(${panelDragState.dragOffset}px)`;
            }
        };

        const panelDragEnd = () => {
            if (!panelDragState.isDragging) return;
            
            panelDragState.isDragging = false;
            sidePanel.style.transition = '';
            sidePanel.style.transform = '';

            const closeThreshold = sidePanel.offsetHeight / 3;
            if (panelDragState.dragOffset > closeThreshold) {
                closePanel();
            }
            
            panelDragState.dragOffset = 0;
        };
        
        sidePanel.addEventListener('touchstart', panelDragStart);
        document.addEventListener('touchmove', panelDragMove);
        document.addEventListener('touchend', panelDragEnd);
    }
    
    function getInitialRouteFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const fromCoords = params.get('from');
        const toCoords = params.get('to');
        const fromName = params.get('fromName');
        const toName = params.get('toName');

        if (fromCoords && toCoords) {
            fromInput.dataset.coords = fromCoords;
            toInput.dataset.coords = toCoords;
            fromInput.value = fromName || 'Start Location';
            toInput.value = toName || 'Destination';
            getRoute();
        }
    }

    if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW registered'), err => console.log('SW failed')); }); }

    speechService.init().then(() => {
        const savedVoice = localStorage.getItem('mapVoice') || 'female';
        speechService.setVoice(savedVoice);
        const radioToCheck = document.querySelector(`input[name="nav-voice"][value="${savedVoice}"]`);
        if (radioToCheck) {
            radioToCheck.checked = true;
        } else {
            const femaleRadio = document.querySelector(`input[name="nav-voice"][value="female"]`);
            if(femaleRadio) femaleRadio.checked = true;
        }
    }).catch(err => console.error("Could not initialize speech service:", err));
    
    getInitialRouteFromUrl();
});
