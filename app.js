// --- AUTHENTICATION CONFIG ---
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

// --- UTILS ---
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

let userLocationMarker = null;

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTH UI ---
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
        console.error("Authentication failed:", error);
        updateAuthUI(null);
    }

    loginBtn.addEventListener('click', e => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', e => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
    logoutBtn.addEventListener('click', e => { e.preventDefault(); authService.logout(); });

    // --- MAP INIT ---
    const map = new maplibregl.Map({
        container: "map",
        style: "https://tiles.openfreemap.org/styles/liberty.json",
        center: [-95, 39],
        zoom: 4,
        pitch: 0,
        bearing: 0,
    });

    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // Controls
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
    });
    map.addControl(geolocate, "bottom-right");

    map.on('load', () => { geolocate.trigger(); map.resize(); });

    // --- SETTINGS MENU ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsMenu = document.getElementById('settings-menu');

    settingsBtn.addEventListener('click', e => {
        e.stopPropagation();
        settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { settingsMenu.style.display = 'none'; });

    // --- LAYER SWITCHING ---
    const layers = {
        "Liberty (default)": "https://tiles.openfreemap.org/styles/liberty.json",
        "Satellite": {
            version: 8,
            sources: {
                "esri": {
                    type: "raster",
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    tileSize: 256
                }
            },
            layers: [{ id: "sat-layer", type: "raster", source: "esri" }]
        }
    };

    document.querySelectorAll('.layer-option').forEach(el => {
        el.addEventListener('click', () => {
            const layerName = el.dataset.layer;
            map.setStyle(layers[layerName]);
            settingsMenu.style.display = 'none';
        });
    });

    // --- SEARCH ---
    const searchInput = document.getElementById('main-search');
    const suggestions = document.getElementById('search-suggestions');

    searchInput.addEventListener('input', debounce(async (e) => {
        const q = e.target.value.trim();
        if (!q) { suggestions.innerHTML = ''; suggestions.style.display = 'none'; return; }

        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&viewbox=${viewbox}&bounded=1`;

        try {
            const res = await fetch(url);
            const results = await res.json();
            suggestions.innerHTML = '';
            results.forEach(place => {
                const div = document.createElement('div');
                div.textContent = place.display_name;
                div.className = 'suggestion-item';
                div.addEventListener('click', () => {
                    map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 15 });
                    suggestions.innerHTML = '';
                    suggestions.style.display = 'none';
                });
                suggestions.appendChild(div);
            });
            suggestions.style.display = results.length ? 'block' : 'none';
        } catch (err) {
            console.error("Search error:", err);
        }
    }, 300));

    document.addEventListener('click', e => {
        if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) suggestions.style.display = 'none';
    });

    // --- TAP/CLICK TO PLACE MARKER ---
    map.on('click', e => {
        const coords = e.lngLat;
        if (userLocationMarker) userLocationMarker.remove();
        userLocationMarker = new maplibregl.Marker({ color: 'red' }).setLngLat([coords.lng, coords.lat]).addTo(map);
    });

    // --- PANEL BEHAVIOR FOR MOBILE ---
    const panel = document.getElementById('side-panel');
    let isDragging = false;
    let startY = 0, startHeight = 0;

    panel.addEventListener('pointerdown', e => {
        isDragging = true;
        startY = e.clientY;
        startHeight = panel.offsetHeight;
        panel.setPointerCapture(e.pointerId);
    });

    panel.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const dy = startY - e.clientY;
        let newHeight = Math.min(Math.max(startHeight + dy, 100), window.innerHeight - 50);
        panel.style.height = `${newHeight}px`;
    });

    panel.addEventListener('pointerup', e => { isDragging = false; });

});
