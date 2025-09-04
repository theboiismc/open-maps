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
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
        if (currentUser) {
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
    const STYLES = { default: 'https://tiles.theboiismc.com/styles/basic-preview/style.json', satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] } };
    const map = new maplibregl.Map({ container: "map", style: STYLES.default, center: [-95, 39], zoom: 4 });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ positionOptions: geolocationOptions, trackUserLocation: true, showUserHeading: true });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());

    // --- GLOBAL VARIABLES & UI ELEMENTS ---
    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    let currentPlace = null;
    let currentRouteData = null;

    // ===================================================================
    // REVISED: Core Panel Logic
    // ===================================================================

    function showPanel(viewId) {
        // This array now includes the new default panel ID
        const allPanelIds = ['default-panel-content', 'info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'];
        
        allPanelIds.forEach(id => {
            const panel = document.getElementById(id);
            if (panel) {
                panel.hidden = (id !== viewId);
            }
        });
        
        // This logic correctly handles the 'peek' vs 'open' state
        if (isMobile) {
            if (viewId === 'default-panel-content') {
                sidePanel.classList.add('peek');
                sidePanel.classList.remove('open');
            } else {
                sidePanel.classList.add('open');
                sidePanel.classList.remove('peek');
            }
        } else { // Desktop logic
            sidePanel.classList.add('open');
            // moveSearchBarToPanel(); // This can be uncommented if you need this feature
        }
    }

    function closePanel() {
        if (isMobile) {
            // On mobile, "closing" means returning to the default peek state.
            showPanel('default-panel-content');
        } else {
            // On desktop, closing truly hides the panel.
            sidePanel.classList.remove('open');
            // moveSearchBarToTop(); // This can be uncommented if you need this feature
        }
    }
    
    // --- EVENT LISTENERS using the new logic ---
    const closeInfoBtn = document.getElementById('close-info-btn');
    closeInfoBtn.addEventListener('click', closePanel);
    
    // Close to default state when map is clicked
    map.on('click', (e) => {
        if (!e.target.closest('.maplibregl-ctrl, #side-panel, .js-settings-btn')) {
            closePanel();
        }
    });

    // --- All other functions (processPlaceResult, getRoute, etc.) can now be called ---
    // ... (Your existing functions like debounce, attachSuggestionListener, all navigation functions, etc., will now work correctly)
    
    // Wire up the new button from the default panel
    document.getElementById('default-drive-btn').addEventListener('click', () => {
        showPanel('directions-panel-redesign');
    });

    // Wire up nearby places searches
    document.querySelectorAll('.icon-item[data-search-query]').forEach(item => {
        item.addEventListener('click', () => {
            mainSearchInput.value = item.dataset.searchQuery;
            performSmartSearch(mainSearchInput, processPlaceResult);
        });
    });
    
    // --- Your existing event listeners from the stable code ---
    document.getElementById('main-directions-icon').addEventListener('click', () => showPanel('directions-panel-redesign'));
    document.getElementById('info-directions-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));
    document.getElementById('back-to-info-btn').addEventListener('click', () => { if (currentPlace) showPanel('info-panel-redesign'); else closePanel(); });
    document.getElementById('back-to-directions-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));
    document.getElementById('get-route-btn').addEventListener('click', getRoute);
    document.getElementById('exit-route-btn').addEventListener('click', () => { clearRouteFromMap(); showPanel('directions-panel-redesign'); });
    // ... add the rest of your listeners for search, navigation, etc. here

    // --- Your existing full functions go here ---
    function debounce(func, delay) { /* Your implementation */ }
    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { /* Your implementation */ }
    async function performSmartSearch(inputEl, onSelect) { /* Your implementation */ }
    function processPlaceResult(place) { /* Your implementation, calls showPanel('info-panel-redesign') */ }
    async function getRoute() { /* Your implementation, calls showPanel('route-preview-panel') */ }
    function clearRouteFromMap() { /* Your implementation */ }
    // ... every other function from your stable file ...


    // --- INITIAL STATE ---
    // This is the crucial new line that sets the default state on page load.
    showPanel('default-panel-content');
});
