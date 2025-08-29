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
function debounce(func, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
function throttle(func, limit) { let inThrottle; return (...args) => { if (!inThrottle) { func.apply(this, args); inThrottle = true; setTimeout(() => inThrottle = false, limit); } }; }
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
    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}
function formatEta(date) {
    if (!date) return "--:--";
    let h = date.getHours(), m = date.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12; m = m < 10 ? '0'+m : m;
    return `${h}:${m} ${ampm}`;
}

// --- DOM READY ---
document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTHENTICATION & UI ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameDisplay = loggedInView.querySelector('.username');
    const emailDisplay = loggedInView.querySelector('.email');
    let currentUser = null;

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const loggedIn = !!currentUser;
        loggedInView.hidden = !loggedIn;
        loggedOutView.hidden = loggedIn;
        if (loggedIn) {
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
    } catch (err) { console.error("Auth failed:", err); updateAuthUI(null); }

    profileButton.addEventListener('click', () => profileDropdown.classList.toggle('open'));
    document.addEventListener('click', e => { if (!profileArea.contains(e.target)) profileDropdown.classList.remove('open'); });
    loginBtn.addEventListener('click', e => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', e => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', e => { e.preventDefault(); authService.logout(); });

    // --- MAP ---
    const MAPTILER_KEY = 'YOUR_MAPTILER_API_KEY';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const STYLES = { default: 'https://tiles.openfreemap.org/styles/liberty', satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] } };
    
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: isMobile ? 3 : 4,
        fadeDuration: 0
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ positionOptions: geolocationOptions, trackUserLocation: true, showUserHeading: true });
    map.addControl(geolocateControl, "bottom-right");
    map.once('load', () => geolocateControl.trigger());

    // --- PANEL & SEARCH ---
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const closeInfoBtn = document.getElementById('close-info-btn');

    let currentPlace = null, currentRouteData = null, userLocationMarker = null, navigationWatcherId = null;
    let navigationState = { isActive: false, isRerouting: false, currentStepIndex: 0, progressAlongStep: 0, distanceToNextManeuver: Infinity, userSpeed: 0, estimatedArrivalTime: null, totalTripTime: 0, lastAnnouncedDistance: Infinity, isWrongWay: false };

    const navigationStatusPanel = document.getElementById('navigation-status');
    const navigationInstructionEl = document.getElementById('navigation-instruction');
    const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const statSpeedEl = document.getElementById('stat-speed');
    const statEtaEl = document.getElementById('stat-eta');
    const statTimeRemainingEl = document.getElementById('stat-time-remaining');

    // --- SPEECH ---
    const speech = { synthesis: window.speechSynthesis, utterance: new SpeechSynthesisUtterance(), speak(text, priority = false) { if(priority && this.synthesis.speaking) this.synthesis.cancel(); if(!this.synthesis.speaking && text){ this.utterance.text=text; this.synthesis.speak(this.utterance); } } };

    // --- PANEL LOGIC ---
    function showPanel(viewId) { ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id=>document.getElementById(id).hidden=id!==viewId); sidePanel.classList.add('open'); if(!isMobile) mainSearchContainer && panelSearchPlaceholder.appendChild(mainSearchContainer); }
    function closePanel() { sidePanel.classList.remove('open'); if(!isMobile) topSearchWrapper && topSearchWrapper.appendChild(mainSearchContainer); }
    if(closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
    if(closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);
    map.on('click', e => { if(!e.originalEvent.target.closest('.maplibregl-ctrl') && !e.originalEvent.target.closest('#side-panel')) closePanel(); });

    // --- SEARCH & SUGGESTIONS ---
    const mainSuggestions = document.getElementById("main-suggestions");
    async function fetchSuggestions(query, onSelect) {
        if(!query){ mainSuggestions.style.display='none'; return; }
        try{
            const b=map.getBounds(), v=`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${v}&bounded=1`);
            const data = await res.json();
            mainSuggestions.innerHTML=''; data.forEach(item=>{ const el=document.createElement('div'); el.className='search-result'; el.textContent=item.display_name; el.addEventListener('click',()=>onSelect(item)); mainSuggestions.appendChild(el); });
            mainSuggestions.style.display=data.length>0?'block':'none';
        }catch(e){ console.error("Suggestion fetch failed", e); }
    }
    mainSearchInput.addEventListener('input', debounce(e=>fetchSuggestions(mainSearchInput.value.trim(), processPlaceResult), 300));
    mainSearchInput.addEventListener('keydown', e => { if(e.key==='Enter') fetchSuggestions(mainSearchInput.value.trim(), processPlaceResult); });

    // --- PLACE PROCESSING ---
    async function processPlaceResult(place) {
        if(!place) return;
        currentPlace = place;
        clearRouteFromMap();
        map.flyTo({ center:[parseFloat(place.lon),parseFloat(place.lat)], zoom:isMobile?12:14 });
        document.getElementById('info-name').textContent = place.display_name.split(',')[0];
        document.getElementById('info-address').textContent = place.display_name;
        fetchAndSetPlaceImage(place.display_name.split(',')[0], place.lon, place.lat);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(place.display_name.split(',')[0]);
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query, lon, lat) {
        const imgEl = document.getElementById('info-image'); imgEl.src=''; imgEl.style.backgroundColor='#e0e0e0';
        try {
            const res=await fetch(`https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`);
            const data=await res.json();
            const page=Object.values(data.query.pages)[0];
            if(page.thumbnail && page.thumbnail.source){ imgEl.src=page.thumbnail.source; imgEl.alt=`Photograph of ${query}`; return; }
            throw new Error("No image");
        } catch(e) {
            const offset=0.005; const bbox=`${lon-offset},${lat-offset},${lon+offset},${lat+offset}`;
            imgEl.src=`https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`; imgEl.alt='Map thumbnail';
        }
    }

    async function fetchAndSetWeather(lat, lon) {
        const el=document.getElementById('weather-info');
        try{
            const res=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const data=await res.json();
            el.textContent=`${data.current_weather.temperature.toFixed(1)}°C, ${data.current_weather.weathercode}`;
        }catch(e){ el.textContent="Weather unavailable"; }
    }

    async function fetchAndSetQuickFacts(title) {
        const el=document.getElementById('quick-facts'); el.textContent='';
        try{
            const res=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
            const data=await res.json(); el.textContent=data.extract || '';
        }catch(e){ el.textContent='No info available'; }
    }

    function clearRouteFromMap() {
        if(map.getSource('route')) { map.removeLayer('route-layer'); map.removeSource('route'); }
        if(userLocationMarker){ userLocationMarker.remove(); userLocationMarker=null; }
    }

    // --- SYSTEM THEME PREFERENCE ---
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // --- TOASTS ---
    function showToast(message, type='info', duration=3000) {
        const toast = document.createElement('div'); toast.className=`toast toast-${type}`; toast.textContent=message;
        document.body.appendChild(toast); setTimeout(()=>{ toast.remove(); }, duration);
    }

    // --- MOBILE PANEL DRAGGING ---
    let startY, currentY, panelHeight;
    sidePanel.addEventListener('touchstart', e=>{ startY=e.touches[0].clientY; panelHeight=sidePanel.offsetHeight; });
    sidePanel.addEventListener('touchmove', e=>{ currentY=e.touches[0].clientY; const diff=currentY-startY; if(diff>0) sidePanel.style.transform=`translateY(${diff}px)`; });
    sidePanel.addEventListener('touchend', e=>{ sidePanel.style.transform=''; });

    // --- SERVICE WORKER CACHING (optional for tiles/images/fonts) ---
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(err=>console.error('SW registration failed:',err)); }
});
