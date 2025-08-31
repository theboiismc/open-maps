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

// --- TOAST NOTIFICATIONS ---
function showToast(message, type='info', duration=4000){
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(()=>{ toast.classList.add('visible'); }, 50);
    setTimeout(()=>{ toast.classList.remove('visible'); setTimeout(()=>toast.remove(),300); }, duration);
}

// --- SYSTEM THEME PREFERENCE ---
function applyTheme(theme){
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
}
const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

// --- DOM CONTENT LOADED ---
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
            window.location.href = "/";
        } else {
            const user = await authService.getUser();
            updateAuthUI(user);
        }
    } catch (error) {
        console.error("Authentication process failed:", error);
        updateAuthUI(null);
        showToast("Authentication failed", "error");
    }

    profileButton.addEventListener('click', () => {
        profileDropdown.style.display = (profileDropdown.style.display === 'none' || !profileDropdown.style.display) ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });
    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    // --- MAP INITIALIZATION & CONTROLS ---
    const MAPTILER_KEY = 'YOUR_MAPTILER_API_KEY';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: {
            version: 8,
            sources: {
                "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' }
            },
            layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }]
        }
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

    // --- NAVIGATION STATE & FUNCTIONS ---
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

    // --- PANEL & SEARCH FUNCTIONS ---
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
        else { sidePanel.classList.remove('open'); moveSearchBarToTop(); }
    }
    if(closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
    if(closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);
    map.on('click', (e) => {
        const target = e.originalEvent.target;
        if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) {
            closePanel();
        }
    });

    // --- DEBOUNCE & SUGGESTION ---
    function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        const fetchAndDisplaySuggestions = async (query) => {
            if (!query) { suggestionsEl.style.display = "none"; return; }
            const bounds = map.getBounds();
            const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                suggestionsEl.innerHTML = "";
                data.forEach(item => {
                    const el = document.createElement("div");
                    el.className = "search-result";
                    el.textContent = item.display_name;
                    el.addEventListener("click", () => onSelect(item));
                    suggestionsEl.appendChild(el);
                });
                suggestionsEl.style.display = data.length > 0 ? "block" : "none";
            } catch (e) { console.error("Suggestion fetch failed", e); showToast("Failed to fetch search suggestions","error"); }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
    }

    // --- SMART SEARCH ---
    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else showToast("No results found for your search","warning");
        } catch (e) { showToast("Search failed. Check connection.","error"); }
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

    // --- PLACE PROCESSING, WEATHER, QUICK FACTS ---
    async function processPlaceResult(place, isReverse=false) {
        currentPlace = place;
        stopNavigation();
        clearRouteFromMap();
        let lon = isReverse ? place.lon || place.lng || 0 : place.lon;
        let lat = isReverse ? place.lat || place.lat || 0 : place.lat;
        map.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 14 });
        mainSearchInput.value = isReverse ? place.display_name : place.display_name.split(',').slice(0,2).join(',');
        document.getElementById('info-name').textContent = place.display_name.split(',')[0];
        document.getElementById('info-address').textContent = place.display_name;
        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName, lon, lat);
        fetchAndSetWeather(lat, lon);
        fetchAndSetQuickFacts(locationName);
        showPanel('info-panel-redesign');
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
            if (page.thumbnail && page.thumbnail.source) { imgEl.src = page.thumbnail.source; imgEl.alt = `Photograph of ${query}`; return; }
            else throw new Error("No image found on Wikipedia.");
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
    function getWeatherDescription(code){
        const descriptions = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow fall',73:'Moderate snow fall',75:'Heavy snow fall',80:'Slight rain showers',81:'Moderate rain showers',82:'Violent rain showers',95:'Thunderstorm'};
        return descriptions[code] || 'Unknown';
    }
    async function fetchAndSetWeather(lat, lon) {
        const weatherPanel = document.getElementById('weather-panel');
        weatherPanel.innerHTML = 'Loading weather...';
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.current_weather) {
                weatherPanel.innerHTML = `${data.current_weather.temperature}°C, ${getWeatherDescription(data.current_weather.weathercode)}`;
            } else weatherPanel.innerHTML = 'Weather not available';
        } catch (e) { weatherPanel.innerHTML = 'Weather fetch failed'; }
    }
    async function fetchAndSetQuickFacts(query) {
        const factsPanel = document.getElementById('facts-panel');
        factsPanel.innerHTML = 'Loading...';
        try {
            const wikipediaUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
            const res = await fetch(wikipediaUrl);
            const data = await res.json();
            if(data.extract) factsPanel.innerHTML = data.extract;
            else factsPanel.innerHTML = 'No quick facts available';
        } catch(e){ factsPanel.innerHTML = 'Failed to fetch quick facts'; }
    }

    // --- NAVIGATION & ROUTING ---
    function stopNavigation(){
        resetNavigationState();
        if(navigationWatcherId!==null) navigator.geolocation.clearWatch(navigationWatcherId);
        removeRouteFromMap();
        navigationStatusPanel.hidden=true;
    }
    endNavigationBtn.addEventListener('click', stopNavigation);
    function removeRouteFromMap(){
        if(map.getLayer('route-layer')) map.removeLayer('route-layer');
        if(map.getSource('route-source')) map.removeSource('route-source');
        currentRouteData=null;
    }
    async function calculateRoute(fromCoords, toCoords){
        try{
            const url=`https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=full&geometries=geojson`;
            const res=await fetch(url);
            const data=await res.json();
            if(data.code!=='Ok') throw new Error("Routing failed");
            currentRouteData=data.routes[0];
            displayRouteOnMap(currentRouteData);
        }catch(e){ showToast("Failed to calculate route","error"); }
    }
    function displayRouteOnMap(route){
        if(map.getSource('route-source')) map.removeSource('route-source');
        if(map.getLayer('route-layer')) map.removeLayer('route-layer');
        map.addSource('route-source',{ type:'geojson', data:route.geometry });
        map.addLayer({ id:'route-layer', type:'line', source:'route-source', layout:{ 'line-join':'round','line-cap':'round' }, paint:{ 'line-color':'#00796b', 'line-width':6 } });
        map.fitBounds(route.geometry.coordinates.reduce((bounds,[lon,lat])=>{
            return bounds.extend([lon,lat]);
        }, new maplibregl.LngLatBounds(route.geometry.coordinates[0],route.geometry.coordinates[0])),{ padding:50 });
    }

    // --- MOBILE PANEL DRAGGING (Google Maps style) ---
    if(isMobile && sidePanel){
        let startY=0, currentY=0, panelHeight=sidePanel.offsetHeight;
        const collapsedHeight=220, halfHeight=window.innerHeight/2, fullHeight=window.innerHeight-50;
        const setPanelPosition=(y)=>{
            y=Math.min(fullHeight,Math.max(collapsedHeight,y));
            sidePanel.style.transition='transform 0s';
            sidePanel.style.transform=`translateY(${window.innerHeight - y}px)`;
        };
        const snapPanel=()=>{
            const panelTop=window.innerHeight - parseFloat(sidePanel.style.transform.replace('translateY(',''));
            const distances=[{state:'collapsed',value:collapsedHeight},{state:'half',value:halfHeight},{state:'full',value:fullHeight}];
            const closest=distances.reduce((prev,curr)=>Math.abs(curr.value-panelTop)<Math.abs(prev.value-panelTop)?curr:prev);
            sidePanel.style.transition='transform 0.3s ease';
            sidePanel.style.transform=`translateY(${window.innerHeight - closest.value}px)`;
            sidePanel.dataset.state=closest.state;
        };
        sidePanel.addEventListener('touchstart',(e)=>{ startY=e.touches[0].clientY; panelHeight=sidePanel.offsetHeight; sidePanel.style.transition='transform 0s'; });
        sidePanel.addEventListener('touchmove',(e)=>{ currentY=e.touches[0].clientY; const delta=startY-currentY; const panelTop=window.innerHeight-panelHeight-delta; setPanelPosition(panelTop); });
        sidePanel.addEventListener('touchend', snapPanel);
        setPanelPosition(collapsedHeight); sidePanel.dataset.state='collapsed';
        const origShowPanel=showPanel; showPanel=(viewId)=>{
            ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id=>{ document.getElementById(id).hidden=id!==viewId; });
            if(!sidePanel.classList.contains('open')){
                sidePanel.classList.add('peek');
                setPanelPosition(halfHeight); sidePanel.dataset.state='half';
            }
        };
        const origClosePanel=closePanel; closePanel=()=>{ setPanelPosition(collapsedHeight); sidePanel.dataset.state='collapsed'; };
    }
});
