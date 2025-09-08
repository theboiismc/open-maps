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

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Global state and element references
    let currentUser = null;
    let map = null; // Map object will be stored here
    const uiElements = {}; // To store all DOM element references

    // This function initializes all non-map UI elements.
    function initializeCoreUI() {
        // Grab all necessary DOM elements
        const ids = [
            'profile-area', 'profile-button', 'profile-dropdown', 'logged-in-view', 'dropdown-avatar',
            'logged-out-view', 'login-btn', 'signup-btn', 'logout-btn', 'saved-places-btn', 'username-display', 'email-display',
            'app-menu-button', 'services-dropdown', 'settings-menu', 'close-settings-btn', 'menu-overlay', 'main-search',
            'side-panel', 'minimize-panel-btn', 'maximize-panel-btn'
        ];
        ids.forEach(id => uiElements[id] = document.getElementById(id));
        uiElements.settingsBtns = document.querySelectorAll('.js-settings-btn');

        // --- AUTH & UI UPDATE LOGIC ---
        const updateAuthUI = (user) => {
            currentUser = user && !user.expired ? user : null;
            const isLoggedIn = !!currentUser;
            uiElements['logged-in-view'].hidden = !isLoggedIn;
            uiElements['logged-out-view'].hidden = isLoggedIn;

            if (isLoggedIn) {
                // ... update logged-in view ...
            } else {
                // ... update logged-out view ...
            }
        };

        if (window.location.pathname.endsWith("callback.html")) {
            authService.handleCallback().then(() => window.location.href = "/").catch(err => {
                console.error("Callback failed:", err); window.location.href = "/";
            });
            return;
        }

        userManager.events.addUserLoaded(user => updateAuthUI(user));
        userManager.events.addUserUnloaded(() => updateAuthUI(null));
        authService.getUser().then(user => updateAuthUI(user)).catch(() => updateAuthUI(null));

        // --- CORE UI EVENT LISTENERS ---
        uiElements['profile-button'].addEventListener('click', () => {
            uiElements['profile-dropdown'].style.display = uiElements['profile-dropdown'].style.display === 'block' ? 'none' : 'block';
            uiElements['services-dropdown'].style.display = 'none';
        });
        uiElements['app-menu-button'].addEventListener('click', () => {
            uiElements['services-dropdown'].style.display = uiElements['services-dropdown'].style.display === 'block' ? 'none' : 'block';
            uiElements['profile-dropdown'].style.display = 'none';
        });
        document.addEventListener('click', (e) => {
            if (!uiElements['profile-area'].contains(e.target)) {
                uiElements['profile-dropdown'].style.display = 'none';
                uiElements['services-dropdown'].style.display = 'none';
            }
        });
        uiElements['login-btn'].addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
        uiElements['logout-btn'].addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    }

    // This function initializes the map and all map-dependent logic.
    function initializeMap() {
        if (typeof maplibregl === 'undefined' || typeof turf === 'undefined') {
            throw new Error("Map library (MapLibre or Turf) failed to load.");
        }

        const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
        const STYLES = { /* ... styles object ... */ };
        
        const initialView = getInitialViewFromHash();
        map = new maplibregl.Map({ container: "map", style: STYLES.default, center: initialView.center, zoom: initialView.zoom, pitchWithRotate: false, dragRotate: false });

        // --- MAP-DEPENDENT LOGIC ---
        const geolocateControl = new maplibregl.GeolocateControl({ /* ... options ... */ });
        map.addControl(new maplibregl.NavigationControl(), "bottom-right");
        map.addControl(geolocateControl, "bottom-right");

        const showPanel = (viewId) => { /* ... showPanel logic ... */ };
        
        map.on('load', () => {
            geolocateControl.trigger();
            showPanel('welcome-panel');
            // ... other map.on('load') logic, like updating URL hash
        });
        
        // Desktop panel toggle logic
        uiElements['minimize-panel-btn'].addEventListener('click', () => {
            document.body.classList.add('panel-minimized');
            setTimeout(() => map.resize(), 300); // Resize map after animation
        });
        uiElements['maximize-panel-btn'].addEventListener('click', () => {
            document.body.classList.remove('panel-minimized');
            setTimeout(() => map.resize(), 300); // Resize map after animation
        });

        // --- ALL OTHER MAP-RELATED FUNCTIONS AND LISTENERS ---
        // (e.g., getRoute, startNavigation, map.on('click'), processPlaceResult, etc.)
        // This is where the bulk of your map interaction code would go.
    }

    // --- EXECUTION FLOW ---
    try {
        initializeCoreUI();
    } catch (error) {
        console.error("Core UI failed to initialize:", error);
        // Optionally show a critical error message to the user
    }

    try {
        initializeMap();
    } catch (error) {
        console.error("FATAL: Map initialization failed.", error);
        const errorOverlay = document.getElementById('map-error-overlay');
        const mapContainer = document.getElementById('map');
        if (errorOverlay) errorOverlay.style.display = 'flex';
        if (mapContainer) mapContainer.style.visibility = 'hidden';
        
        const mapDependentButtons = document.querySelectorAll('#main-directions-icon, #info-directions-btn, #welcome-directions-btn, .js-settings-btn');
        mapDependentButtons.forEach(btn => {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
            btn.title = 'Map is unavailable';
        });
    }
});

