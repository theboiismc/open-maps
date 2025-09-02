<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    
    <title>TheBoiisMC Maps</title>
    <meta name="description" content="Explore the world with private, modern mapping." />
    <meta name="theme-color" content="#00796b" />
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="icon512_rounded.png">
    
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'self';
        script-src 'self' https://unpkg.com https://npmcdn.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com 'unsafe-inline';
        style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com;
        img-src 'self' data: https:;
        font-src 'self' https://fonts.gstatic.com;
        connect-src 'self' https://accounts.theboiismc.com https://tiles.openfreemap.org https://server.arcgisonline.com https://nominatim.openstreetmap.org https://api.open-meteo.com https://en.wikipedia.org https://router.project-osrm.org https://cloudflareinsights.com https://api.maptiler.com;
        worker-src 'self' blob: https://unpkg.com;
    ">
    
    <meta property="og:title" content="TheBoiisMC Maps" />
    <meta property="og:description" content="Explore the world with private, modern mapping." />
    <meta property="og:image" content="https://maps.theboiismc.com/icon512_rounded.png" />
    <meta property="og:url" content="https://maps.theboiismc.com" />
    <meta name="twitter:card" content="summary_large_image" />
    
    <script src="https://cdn.jsdelivr.net/npm/oidc-client-ts@2.2.0/dist/browser/oidc-client-ts.min.js" defer></script>
    
    <link href="https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css" rel="stylesheet" />
    <script src="https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js" defer></script>
    <script src='https://npmcdn.com/@turf/turf/turf.min.js' defer></script>
    
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />

    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="top-banner">
        <span id="site-title">TheBoiisMC Maps</span>
        <div id="profile-area">
            <button class="js-settings-btn" aria-label="Map Settings">
                <span class="material-symbols-outlined">settings</span>
            </button>
            <button id="profile-button" aria-label="User Profile">
                <span class="material-symbols-outlined">account_circle</span>
            </button>
            <div id="profile-dropdown">
                <div id="logged-in-view" hidden>
                    <div class="profile-section profile-section-header">
                        <div class="username">TheBoiisMC</div>
                        <div class="email">user@example.com</div>
                    </div>
                    <hr/>
                    <div class="profile-actions">
                        <a id="saved-places-btn">Saved Places</a>
                    </div>
                    <hr/>
                    <div class="profile-actions">
                        <a id="logout-btn">Log Out</a>
                    </div>
                </div>
                <div id="not-logged-in-view">
                    <div class="profile-actions">
                        <a id="login-btn">Log In</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div id="side-panel" class="closed">
        <button id="close-panel-btn"><span class="material-symbols-outlined">close</span></button>
        <div id="panel-search-placeholder"></div>
        <div id="info-panel-redesign" hidden>
            <div class="info-image-container">
                <img id="info-image" src="" alt="Place image" />
            </div>
            <div class="info-content-container">
                <div class="info-header">
                    <h2 id="info-name"></h2>
                    <p id="info-address"></p>
                    <p id="info-weather"></p>
                </div>
                <div class="info-body">
                    <p id="quick-facts-content"></p>
                    <div class="info-actions">
                        <button id="get-directions-btn"><span class="material-symbols-outlined">directions_car</span>Get Directions</button>
                        <button id="save-place-btn"><span class="material-symbols-outlined">favorite</span>Save</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="directions-panel-redesign" hidden>
            <div class="directions-header">
                <h2>Directions</h2>
                <div id="directions-inputs">
                    <input type="text" id="panel-from-input" placeholder="Start location" />
                    <div id="panel-from-suggestions" class="search-suggestions"></div>
                    <input type="text" id="panel-to-input" placeholder="Destination" />
                    <div id="panel-to-suggestions" class="search-suggestions"></div>
                </div>
                <button id="get-route-btn">Get Route</button>
            </div>
        </div>
        
        <div id="route-preview-panel" hidden>
            <div class="route-summary">
                <span id="route-summary-time">-- min</span>
                <span id="route-summary-distance">-- mi</span>
            </div>
            <div class="route-actions">
                <button id="start-navigation-btn" class="primary-action"><span class="material-symbols-outlined">play_arrow</span>Start Navigation</button>
                <button id="share-route-btn"><span class="material-symbols-outlined">share</span>Share</button>
            </div>
            <ul id="steps-list"></ul>
        </div>
        
        <div id="route-section" hidden>
            <div class="route-header">
                <button id="exit-route-btn"><span class="material-symbols-outlined">close</span></button>
                <div class="route-main-info">
                    <div class="instruction-text">
                        <p id="navigation-instruction">Driving to destination</p>
                        <p id="navigation-subinstruction"></p>
                    </div>
                    <div class="eta-info">
                        <span id="eta-time">--:--</span>
                        <div class="distance-info">
                            <span id="distance-remaining">--</span>
                            <span id="distance-units">mi</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div id="search-container">
        <div id="top-search-wrapper">
            <div id="main-search-container">
                <div class="search-box">
                    <span id="search-icon-inside" class="material-symbols-outlined">search</span>
                    <input type="text" id="main-search-input" placeholder="Search for a place" />
                </div>
                <div id="main-suggestions" class="search-suggestions"></div>
            </div>
        </div>
    </div>
    
    <div id="settings-menu" class="closed">
        <div class="settings-header">
            <h3>Map Settings</h3>
            <button id="close-settings-btn"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="settings-content">
            <div class="setting-group">
                <label class="setting-label">Map Style</label>
                <div class="radio-group">
                    <input type="radio" id="style-streets" name="map-style" value="streets" checked>
                    <label for="style-streets">Streets</label>
                    <input type="radio" id="style-satellite" name="map-style" value="satellite">
                    <label for="style-satellite">Satellite</label>
                </div>
            </div>
            <hr>
            <div class="setting-group">
                <label class="setting-label">Live Traffic</label>
                <div class="toggle-switch">
                    <input type="checkbox" id="traffic-toggle" name="map-traffic">
                    <label for="traffic-toggle"></label>
                </div>
            </div>
            <hr>
            <div class="setting-group">
                <label class="setting-label">Units</label>
                <div class="radio-group">
                    <input type="radio" id="units-imperial" name="map-units" value="imperial" checked>
                    <label for="units-imperial">Imperial</label>
                    <input type="radio" id="units-metric" name="map-units" value="metric">
                    <label for="units-metric">Metric</label>
                </div>
            </div>
        </div>
    </div>
    
    <div id="map">
        <div id="map-watermark">TheBoiisMC</div>
    </div>
    <script src="js/auth.js" defer></script>
    <script src="js/map.js" defer></script>
    <script src="js/utils.js" defer ></script>
    <script src="js/map_layers.js" defer ></script>
    <script src="js/ui.js" defer></script>
    <script src="js/search.js" defer></script>
    <script src="js/navigation.js" defer></script>
    <script src="js/init.js" defer ></script>
    <script src="js/logic.js" defer></script>
</body>
</html>
