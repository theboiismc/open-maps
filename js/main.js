### Complete File Set

Here are all the updated and necessary files for your project, including the code to fix the log in and sign up functionality, the updated styling, and the modular file structure.

**Instructions:**

1.  Create a new folder for your project.
2.  Create the five files listed below within that folder.
3.  Copy and paste the code for each file into its corresponding file.
4.  Ensure your `logo.png` is in the same directory.
5.  **Important:** Remember to replace the placeholder `client_id` in `oidc.js` with your actual Client ID from Authentik. You should also verify that the `signupBtn` URL points to the correct registration flow in Authentik.

-----

### `index.html`

This is the main HTML file. It has been updated with the correct CSS for your branding and links to all the new JavaScript files.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maps | TheBoiisMC</title>
    <link rel="icon" href="logo.png">
    <link rel="apple-touch-icon" href="logo.png">
    <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <script src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"></script>
    <script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/oidc-client/1.11.5/oidc-client.min.js"></script>

    <style>
        :root {
            --panel-width: 400px;
            --panel-mobile-height: 90vh;
            --panel-mobile-peek: 220px;
            --brand-color: #00e5e0;
            --banner-height: 50px;
            --dark-bg: #212121;
        }

        html, body, #map {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            overflow: hidden;
            background-color: var(--dark-bg);
        }

        #top-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: var(--banner-height);
            background-color: transparent;
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 100;
            font-weight: 600;
            padding: 0 20px;
            box-shadow: none;
        }

        #top-banner .logo-img {
            max-height: 40px;
            width: auto;
            display: block;
        }
        
        #top-search-wrapper {
            position: fixed;
            top: 50px;
            left: 50%;
            transform: translateX(-50%);
            width: min(90%, 600px);
            z-index: 100;
            transition: opacity 0.3s ease-in-out;
        }

        #main-search-container {
            width: 100%;
            background: var(--dark-bg);
            color: white;
            border-radius: 28px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            padding: 0 15px;
            display: flex;
            align-items: center;
            position: relative;
        }

        #main-search {
            background: transparent;
            color: white;
            border: none;
            flex-grow: 1;
            padding: 10px 0;
            font-size: 16px;
            outline: none;
        }

        .search-icon path, .directions-icon path {
            stroke: white;
        }
        
        .search-results {
            background-color: var(--dark-bg);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            border-radius: 8px;
            padding: 8px;
            max-height: 200px;
            overflow-y: auto;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            z-index: 1000;
            display: none;
        }

        .search-result {
            padding: 10px;
            cursor: pointer;
            border-radius: 4px;
            color: #ccc;
        }

        .search-result:hover {
            background-color: #333;
            color: white;
        }
        
        #side-panel {
            position: fixed;
            top: 0;
            left: -420px;
            width: var(--panel-width);
            height: 100%;
            background-color: var(--dark-bg);
            color: white;
            z-index: 99;
            transition: left 0.3s ease-in-out;
            box-shadow: 2px 0 12px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
        }

        #side-panel.open {
            left: 0;
        }
        
        .panel-header {
            display: flex;
            align-items: center;
            padding: 15px;
            border-bottom: 1px solid #333;
        }

        .panel-header h3 {
            margin: 0;
            flex-grow: 1;
        }
        
        #panel-content {
            flex-grow: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .info-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .info-text h3, .info-text p {
            margin: 0 0 10px 0;
        }

        .info-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .btn-primary, .btn-secondary {
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            flex-grow: 1;
            text-align: center;
            border: none;
        }

        .btn-primary {
            background-color: var(--brand-color);
            color: black;
        }

        .btn-secondary {
            background-color: #444;
            color: white;
        }

        .dir-input-group {
            position: relative;
            margin-bottom: 15px;
        }

        .dir-input-group input {
            width: calc(100% - 20px);
            padding: 10px;
            background-color: #333;
            border: 1px solid #555;
            color: white;
            border-radius: 8px;
            font-size: 16px;
        }
        
        .dir-input-group .search-results {
            top: 100%;
        }

        #route-options {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        #route-steps {
            list-style: none;
            padding: 0;
        }

        #route-steps li {
            padding: 10px 0;
            border-bottom: 1px solid #444;
        }

        #navigation-status {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 120px;
            background-color: var(--dark-bg);
            color: white;
            z-index: 100;
            display: none;
            flex-direction: column;
            justify-content: center;
            padding: 10px;
            box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.5);
        }

        #navigation-instruction {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stats-row {
            display: flex;
            justify-content: space-around;
            text-align: center;
            margin-top: 10px;
        }

        .stat {
            font-size: 14px;
            color: #aaa;
        }

        .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: white;
        }
        
        .progress-bar-container {
            width: 100%;
            height: 5px;
            background-color: #555;
            margin-top: 5px;
            border-radius: 2.5px;
        }

        .progress-bar {
            height: 100%;
            background-color: var(--brand-color);
            transform-origin: left;
            transition: transform 0.5s linear;
        }
        
        .user-location-marker {
            width: 20px;
            height: 20px;
            background-color: #007bff;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 0 5px rgba(0, 123, 255, 0.3);
            transform-origin: center center;
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }

        @media (max-width: 768px) {
            #side-panel {
                width: 100%;
                left: 0;
                bottom: calc(-1 * var(--panel-mobile-peek));
                top: auto;
                height: var(--panel-mobile-height);
                transition: bottom 0.3s ease-in-out;
            }
            #side-panel.peek {
                bottom: 0;
            }
            #side-panel.open {
                bottom: calc(var(--panel-mobile-height) - 100vh);
            }
        }

    </style>
</head>
<body>
    <div id="map"></div>
    
    <header id="top-banner">
        <img src="logo.png" alt="TheBoiisMC Logo" class="logo-img">
        <div id="top-search-wrapper">
            <div id="main-search-container">
                <input type="text" id="main-search" placeholder="Search a place">
                <div id="main-suggestions" class="search-results"></div>
                <div id="main-search-icon" class="search-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="11.5" cy="11.5" r="8.5" stroke="white" stroke-width="2"/>
                        <path d="M18 18L22 22" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <div id="main-directions-icon" class="directions-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z" stroke="white" stroke-width="2"/>
                        <path d="M12 6V18M12 6L9 9M12 6L15 9M12 18L9 15M12 18L15 15" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
        </div>
        <div id="auth-buttons" class="logged-out-view">
            <button id="login-btn">Log In</button>
            <button id="signup-btn" class="btn-primary">Sign Up</button>
        </div>
        <div id="profile-area" class="logged-in-view" hidden>
            <button id="profile-button">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="white"/>
                </svg>
            </button>
            <div id="profile-dropdown" style="display: none;">
                <div class="profile-section-header">
                    <div class="username"></div>
                    <div class="email"></div>
                </div>
                <button id="saved-places-btn">Saved Places</button>
                <button id="logout-btn">Log Out</button>
            </div>
        </div>
    </header>

    <aside id="side-panel">
        <div id="panel-grabber"></div>
        <div class="panel-header">
            <button id="close-panel-btn">
                <i class="fas fa-arrow-left"></i>
            </button>
            <h3 id="panel-title"></h3>
            <button class="js-settings-btn" style="background:none;border:none;color:white;font-size:24px;">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>

        <div id="panel-content">
            <div id="info-panel-redesign">
                <img id="info-image" class="info-image" src="" alt="Place image">
                <div class="info-text">
                    <h3 id="info-name">Place Name</h3>
                    <p id="info-address">Address, City, State</p>
                </div>
                <div class="info-buttons">
                    <button id="info-directions-btn" class="btn-primary">Directions</button>
                    <button id="info-save-btn" class="btn-secondary">Save</button>
                </div>
                <div class="quick-facts">
                    <h4>Quick Facts</h4>
                    <p id="quick-facts-content">Loading...</p>
                </div>
                <div class="weather">
                    <h4>Current Weather</h4>
                    <p id="info-weather">Loading...</p>
                </div>
            </div>

            <div id="directions-panel-redesign" hidden>
                <div id="panel-search-placeholder"></div>
                <div class="dir-input-group">
                    <input type="text" id="panel-from-input" placeholder="Start location">
                    <div id="panel-from-suggestions" class="search-results"></div>
                </div>
                <div class="dir-input-group">
                    <input type="text" id="panel-to-input" placeholder="Destination">
                    <div id="panel-to-suggestions" class="search-results"></div>
                </div>
                <div id="route-options">
                    <button class="btn-secondary" id="dir-use-my-location">Use My Location</button>
                    <button class="btn-secondary" id="swap-btn">Swap</button>
                </div>
                <button id="get-route-btn" class="btn-primary" style="width:100%;">Get Directions</button>
                <button id="back-to-info-btn" class="btn-secondary" style="width:100%;margin-top:10px;">Back</button>
            </div>
            
            <div id="route-section" hidden>
                <button id="exit-route-btn">Exit Route</button>
                <ul id="route-steps"></ul>
            </div>
        </div>
    </aside>
    
    <div id="navigation-status">
        <div id="navigation-instruction"></div>
        <div class="progress-bar-container">
            <div id="instruction-progress-bar" class="progress-bar"></div>
        </div>
        <div class="stats-row">
            <div class="stat">
                <div id="stat-speed" class="stat-value">0</div>
                <div>mph</div>
            </div>
            <div class="stat">
                <div id="stat-time-remaining" class="stat-value">--</div>
                <div>Time</div>
            </div>
            <div class="stat">
                <div id="stat-eta" class="stat-value">--:--</div>
                <div>ETA</div>
            </div>
            <button id="end-navigation-btn" class="btn-secondary">End</button>
        </div>
    </div>
    
    <div id="menu-overlay"></div>
    <div id="settings-menu" class="settings-menu">
        <div class="settings-header">
            <h4>Settings</h4>
            <button id="close-settings-btn" style="background:none;border:none;color:white;font-size:24px;"><i class="fas fa-times"></i></button>
        </div>
        <div class="settings-menu-content">
            <div class="setting-group">
                <h5>Map Style</h5>
                <label class="setting-label"><input type="radio" name="map-style" value="default" checked>Default</label>
                <label class="setting-label"><input type="radio" name="map-style" value="satellite">Satellite</label>
            </div>
            <div class="setting-group">
                <h5>Units</h5>
                <label class="setting-label"><input type="radio" name="map-units" value="imperial" checked>Imperial (mph, miles)</label>
                <label class="setting-label"><input type="radio" name="map-units" value="metric">Metric (km/h, km)</label>
            </div>
        </div>
    </div>

    <script src="oidc.js"></script>
    <script src="map.js"></script>
    <script src="ui.js"></script>
    <script src="navigation.js"></script>
    <script src="main.js"></script>
</body>
</html>
```

-----

### `oidc.js`

This file handles all authentication logic, including your client ID.

```javascript
// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/theboiismc/",
    // *** IMPORTANT: Replace this with your actual Client ID from Authentik. ***
    client_id: "9hWmWrA1CS2pLgPANKYXfxExoCMHYu0xg60XdTkB",
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

const profileArea = document.getElementById('profile-area');
const profileButton = document.getElementById('profile-button');
const profileDropdown = document.getElementById('profile-dropdown');
const loggedInView = document.getElementById('profile-area');
const loggedOutView = document.getElementById('auth-buttons');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const savedPlacesBtn = document.getElementById('saved-places-btn');
const usernameDisplay = profileDropdown.querySelector('.username');
const emailDisplay = profileDropdown.querySelector('.email');

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

profileButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
    profileDropdown.style.display = isHidden ? 'block' : 'none';
});

document.addEventListener('click', (e) => {
    if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
        profileDropdown.style.display = 'none';
    }
});

loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
signupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Action: Replace with the correct URL for your registration flow
    window.location.href = "https://accounts.theboiismc.com/if/flow/registration-flow/";
});
logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

export { authService, updateAuthUI, currentUser };
```

-----

### `map.js`

This file handles the MapLibre map initialization and basic controls.

```javascript
// --- MAP INITIALIZATION & CONTROLS ---
const isMobile = window.matchMedia('(max-width: 768px)').matches;
const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const STYLES = {
    default: 'https://tiles.openfreemap.org/styles/liberty',
    satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
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

function addRouteToMap(routeGeoJSON) {
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
    }
}

function clearRouteFromMap() {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
    if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
}

export { map, isMobile, geolocationOptions, geolocateControl, STYLES, addRouteToMap, clearRouteFromMap };
```

-----

### `ui.js`

This file handles the user interface, including search, panels, and data fetching.

```javascript
import { map, isMobile, geolocationOptions, STYLES, addRouteToMap, clearRouteFromMap } from './map.js';
import { startNavigation, stopNavigation, navigationState } from './navigation.js';
import { currentUser } from './oidc.js';

// --- GLOBAL VARIABLES & UI ELEMENTS ---
const sidePanel = document.getElementById("side-panel");
const mainSearchInput = document.getElementById("main-search");
const mainSearchContainer = document.getElementById('main-search-container');
const topSearchWrapper = document.getElementById('top-search-wrapper');
const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
const closePanelBtn = document.getElementById('close-panel-btn');
const fromInput = document.getElementById('panel-from-input');
const fromSuggestions = document.getElementById('panel-from-suggestions');
const toInput = document.getElementById('panel-to-input');
const toSuggestions = document.getElementById('panel-to-suggestions');
const endNavigationBtn = document.getElementById('end-navigation-btn');
const settingsBtns = document.querySelectorAll('.js-settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const menuOverlay = document.getElementById('menu-overlay');
const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
const grabber = document.getElementById("panel-grabber");

let currentPlace = null;
let currentRouteData = null;
let highlightedSegmentLayerId = 'highlighted-route-segment';

// --- CORE PANEL & SEARCH LOGIC ---
function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }
function showPanel(viewId) { ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => { document.getElementById(id).hidden = id !== viewId; }); if (!sidePanel.classList.contains('open')) { if (isMobile) { if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek'); } else { sidePanel.classList.add('open'); moveSearchBarToPanel(); } } }
function closePanel() { if (isMobile) sidePanel.classList.remove('open', 'peek'); else { sidePanel.classList.remove('open'); moveSearchBarToTop(); } }
closePanelBtn.addEventListener('click', closePanel);
map.on('click', (e) => { const target = e.originalEvent.target; if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) { closePanel(); } });
function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
function attachSuggestionListener(inputEl, suggestionsEl, onSelect) { const fetchAndDisplaySuggestions = async (query) => { if (!query) { suggestionsEl.style.display = "none"; return; } const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`; const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`; try { const res = await fetch(url); const data = await res.json(); suggestionsEl.innerHTML = ""; data.forEach(item => { const el = document.createElement("div"); el.className = "search-result"; el.textContent = item.display_name; el.addEventListener("click", () => onSelect(item)); suggestionsEl.appendChild(el); }); suggestionsEl.style.display = data.length > 0 ? "block" : "none"; } catch (e) { console.error("Suggestion fetch failed", e); } }; const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300); inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim())); inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); }); }
async function performSmartSearch(inputEl, onSelect) { const query = inputEl.value.trim(); if (!query) return; const bounds = map.getBounds(); const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`; const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`; try { const res = await fetch(url); const data = await res.json(); if (data.length > 0) onSelect(data[0]); else alert("No results found for your search."); } catch (e) { alert("Search failed. Please check your connection."); } }
const mainSuggestions = document.getElementById("main-suggestions"); attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult); document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult)); mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });
attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });
attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

async function processPlaceResult(place) {
    currentPlace = place;
    stopNavigation();
    clearRouteFromMap();
    map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
    mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
    document.getElementById('info-name').textContent = place.display_name.split(',')[0];
    document.getElementById('info-address').textContent = place.display_name;
    const locationName = place.display_name.split(',')[0];
    fetchAndSetPlaceImage(locationName, place.lon, place.lat);
    fetchAndSetWeather(place.lat, place.lon);
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
        imgEl.onerror = () => {
            imgEl.style.backgroundColor = '#e0e0e0';
            imgEl.alt = 'Image not available';
        };
    }
}

function getWeatherDescription(code) {
    const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail' };
    return descriptions[code] || "Weather data unavailable";
}

async function fetchAndSetWeather(lat, lon) {
    const weatherEl = document.getElementById('info-weather');
    weatherEl.textContent = "Loading weather...";
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}¤t_weather=true&temperature_unit=fahrenheit`;
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
    factsEl.textContent = "Loading facts...";
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
        fromInput.value = '';
        fromInput.dataset.coords = '';
    } else {
        toInput.value = mainSearchInput.value;
        toInput.dataset.coords = '';
        fromInput.value = '';
        fromInput.dataset.coords = '';
    }
}

function displayRouteSteps(route) {
    const routeStepsEl = document.getElementById('route-steps');
    routeStepsEl.innerHTML = '';
    const steps = route.legs[0].steps;
    steps.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step.maneuver.instruction;
        routeStepsEl.appendChild(li);
    });
}

async function getRoute() {
    if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
    clearRouteFromMap();
    try {
        const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
        const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0 || !data.routes[0].legs || !data.routes[0].legs[0].steps || data.routes[0].legs[0].steps.length === 0) {
            return alert("A route could not be found. Please try a different location.");
        }
        currentRouteData = data;
        const route = data.routes[0];
        const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
        addRouteToMap(routeGeoJSON);
        const bounds = new maplibregl.LngLatBounds();
        routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
        if (fromInput.value.trim() === "Your Location") {
            map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });
            closePanel();
            startNavigation(currentRouteData);
        } else {
            displayRouteSteps(route);
            showPanel('route-section');
            map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
        }
    } catch (err) {
        alert(`Error getting route: ${err.message}`);
        navigationState.isRerouting = false;
    }
}

async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`);
    const data = await res.json();
    if (!data[0]) throw new Error(`Could not find location: ${inputEl.value}`);
    inputEl.value = data[0].display_name;
    inputEl.dataset.coords = `${data[0].lon},${data[0].lat}`;
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}


// --- Event Listeners
document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
document.getElementById('info-save-btn').addEventListener('click', () => {
    if (currentUser) {
        alert("Feature 'Save Place' not yet implemented!");
    } else {
        alert("Please log in to save places.");
    }
});
document.getElementById('swap-btn').addEventListener('click', () => {
    [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords];
});
document.getElementById('dir-use-my-location').addEventListener('click', () => {
    fromInput.value = "Getting your location...";
    navigator.geolocation.getCurrentPosition(pos => {
        fromInput.value = "Your Location";
        fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
    }, (error) => { console.error("Geolocation Error:", error.message); fromInput.value = "Your Location (Unavailable)"; }, geolocationOptions);
});
document.getElementById('back-to-info-btn').addEventListener('click', () => {
    if (currentPlace) showPanel('info-panel-redesign');
});
document.getElementById('get-route-btn').addEventListener('click', getRoute);
document.getElementById('exit-route-btn').addEventListener('click', () => {
    clearRouteFromMap();
    showPanel('directions-panel-redesign');
});
endNavigationBtn.addEventListener('click', stopNavigation);


// --- SETTINGS & OTHER UI LOGIC ---
function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }
settingsBtns.forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); if (!isMobile && settingsMenu.classList.contains('open')) { closeSettings(); } else { openSettings(); } }); });
closeSettingsBtn.addEventListener('click', closeSettings);
menuOverlay.addEventListener('click', closeSettings);
document.addEventListener('click', (e) => { if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) { closeSettings(); } });
styleRadioButtons.forEach(radio => { radio.addEventListener('change', () => { const newStyle = radio.value; map.setStyle(STYLES[newStyle]); if (isMobile) { setTimeout(closeSettings, 200); } }); });
document.querySelectorAll('input[name="map-units"]').forEach(radio => { radio.addEventListener('change', () => { if (isMobile) { setTimeout(closeSettings, 200); } }); });
map.on('styledata', () => { if (navigationState.isActive && currentRouteData) { const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry }; addRouteToMap(routeGeoJSON); updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]); } });
if (isMobile) {
    grabber.addEventListener('touchstart', (e) => {
        let startY = e.touches[0].pageY;
        sidePanel.style.transition = 'none';
        const touchMoveHandler = (e) => {
            const currentY = e.touches[0].pageY;
            let newBottom = (parseInt(getComputedStyle(sidePanel).bottom, 10) || 0) + (startY - currentY);
            if (newBottom > 0) newBottom = 0;
            sidePanel.style.bottom = `${newBottom}px`;
            startY = currentY;
        };
        const touchEndHandler = () => {
            sidePanel.style.transition = '';
            const currentBottom = parseInt(sidePanel.style.bottom, 10);
            const panelHeight = sidePanel.clientHeight;
            const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
            if (currentBottom > (-1 * panelHeight) / 2) {
                sidePanel.classList.remove('peek');
                sidePanel.classList.add('open');
            } else {
                sidePanel.classList.remove('open', 'peek');
            }
            sidePanel.style.bottom = '';
            grabber.removeEventListener('touchmove', touchMoveHandler);
            grabber.removeEventListener('touchend', touchEndHandler);
        };
        grabber.addEventListener('touchmove', touchMoveHandler, { passive: true });
        grabber.addEventListener('touchend', touchEndHandler, { passive: true });
    }, { passive: true });
}

export { openDirectionsPanel, currentRouteData, currentPlace };
```

-----

### `navigation.js`

This file contains all the advanced navigation state and logic.

```javascript
import { map, geolocationOptions, addRouteToMap } from './map.js';

// --- ADVANCED NAVIGATION STATE ---
let navigationState = {};

// --- SPEECH SYNTHESIS ---
const speech = {
    synthesis: window.speechSynthesis,
    utterance: new SpeechSynthesisUtterance(),
    speak(text, priority = false) {
        if (priority && this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        if (!this.synthesis.speaking && text) {
            this.utterance.text = text;
            this.synthesis.speak(this.utterance);
        }
    }
};

const navigationStatusPanel = document.getElementById('navigation-status');
const navigationInstructionEl = document.getElementById('navigation-instruction');
const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
const statSpeedEl = document.getElementById('stat-speed');
const statEtaEl = document.getElementById('stat-eta');
const statTimeRemainingEl = document.getElementById('stat-time-remaining');
const highlightedSegmentLayerId = 'highlighted-route-segment';

let userLocationMarker = null;
let navigationWatcherId = null;

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
    minutes = minutes < 10 ? '0' + minutes : minutes;
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

function startNavigation(routeData) {
    if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");

    resetNavigationState();
    navigationState.isActive = true;
    navigationState.totalTripTime = routeData.routes[0].duration;

    const firstStep = routeData.routes[0].legs[0].steps[0];
    navigationInstructionEl.textContent = firstStep.maneuver.instruction;
    updateHighlightedSegment(firstStep);
    updateNavigationUI();

    navigationStatusPanel.style.display = 'flex';
    speech.speak(`Starting route. ${firstStep.maneuver.instruction}`, true);

    if (!userLocationMarker) {
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        userLocationMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
    }

    map.easeTo({ pitch: 60, zoom: 17, duration: 1500 });

    navigationWatcherId = navigator.geolocation.watchPosition((position) => handlePositionUpdate(position, routeData), handlePositionError, geolocationOptions);
}

function stopNavigation() {
    if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
    if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }

    clearRouteFromMap();
    resetNavigationState();

    navigationStatusPanel.style.display = 'none';
    speech.synthesis.cancel();

    map.easeTo({ pitch: 0, bearing: 0 });
}

function handlePositionError(error) {
    console.error("Geolocation Error:", error.message);
    alert(`Geolocation error: ${error.message}. Navigation stopped.`);
    stopNavigation();
}

async function handlePositionUpdate(position, routeData) {
    if (!navigationState.isActive || navigationState.isRerouting) return;

    const { latitude, longitude, heading, speed, accuracy } = position.coords;
    if (accuracy > 40) return;

    const userPoint = turf.point([longitude, latitude]);
    const steps = routeData.routes[0].legs[0].steps;

    // 1. Update State & UI
    navigationState.userSpeed = (speed || 0) * 2.23694;
    const routeLine = turf.lineString(routeData.routes[0].geometry.coordinates);
    const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units: 'meters' });

    userLocationMarker.setLngLat(snapped.geometry.coordinates);
    if (heading != null) {
        userLocationMarker.setRotation(heading);
        map.easeTo({ center: snapped.geometry.coordinates, bearing: heading, zoom: 18, duration: 500 });
    } else {
        map.easeTo({ center: snapped.geometry.coordinates, zoom: 18, duration: 500 });
    }

    // 2. Rerouting Logic (Off-route & Wrong Way)
    const currentStep = steps[navigationState.currentStepIndex];
    const stepStartPoint = turf.point(currentStep.geometry.coordinates[0]);
    const stepEndPoint = turf.point(currentStep.geometry.coordinates[currentStep.geometry.coordinates.length - 1]);
    const stepBearing = getBearing(stepStartPoint, stepEndPoint);
    const headingDifference = Math.abs(heading - stepBearing);

    if (snapped.properties.dist > 50) {
        navigationState.isRerouting = true;
        speech.speak("Off route. Recalculating.", true);
        return;
    }

    if (heading != null && headingDifference > 90 && headingDifference < 270 && navigationState.userSpeed > 5 && !navigationState.isWrongWay) {
        navigationState.isWrongWay = true;
        speech.speak("Wrong way. Recalculating.", true);
        return;
    }
    navigationState.isWrongWay = false;

    // 3. Progress Calculation (Map Matching)
    const currentStepLine = turf.lineString(currentStep.geometry.coordinates);
    const totalStepDistance = turf.length(currentStepLine, { units: 'meters' });
    navigationState.distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units: 'meters' });
    navigationState.progressAlongStep = Math.max(0, 1 - (navigationState.distanceToNextManeuver / totalStepDistance));

    const tripDurationSeconds = routeData.routes[0].duration;
    const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
    const remainingTimeSeconds = tripDurationSeconds - timeElapsed;
    navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
    navigationState.totalTripTime = remainingTimeSeconds;

    updateNavigationUI();

    // 4. Audio Cues
    const distanceMiles = navigationState.distanceToNextManeuver * 0.000621371;
    if (distanceMiles > 0.9 && distanceMiles < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
        speech.speak(`In 1 mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 1;
    } else if (distanceMiles > 0.24 && distanceMiles < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
        speech.speak(`In a quarter mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 0.25;
    }

    // 5. Step Advancement Logic
    if (navigationState.distanceToNextManeuver < 50) {
        navigationState.currentStepIndex++;
        if (navigationState.currentStepIndex >= steps.length) {
            speech.speak("You have arrived at your destination.", true);
            stopNavigation();
            return;
        }
        const nextStep = steps[navigationState.currentStepIndex];
        navigationInstructionEl.textContent = nextStep.maneuver.instruction;
        updateHighlightedSegment(nextStep);
        speech.speak(nextStep.maneuver.instruction, true);
        navigationState.lastAnnouncedDistance = Infinity;
    }
}

export { startNavigation, stopNavigation, navigationState };
```

-----

### `main.js`

This file is the main entry point that ties all the modules together.

```javascript
import { authService, updateAuthUI } from './oidc.js';
import { map, geolocateControl } from './map.js';

// --- MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate and handle callback
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
    }

    // Trigger initial geolocation after map loads
    map.on('load', () => geolocateControl.trigger());

    // Service Worker registration for PWA functionality
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration.scope);
            }, err => {
                console.log('SW registration failed: ', err);
            });
        });
    }
});
```
