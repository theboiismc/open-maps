/**
 * maps_v11.0.0.js
 * Updated: 2026-03-22
 * - Feature: Integrated Capacitor native plugins (TTS, Haptics, KeepAwake, Browser, App State).
 * - Feature: Native Share menu trigger for mobile and clipboard fallback for PC.
 * - Feature: Intercepted hardware and browser back buttons to confirm navigation exit.
 * - Feature: Built interactive MapPicker engine for "Choose on Map" functionality.
 * - Fix: Forced public domain for native Capacitor share links to fix localhost routing.
 * - Fix: Handled native external links (MapLibre footer, etc.) using Capacitor Browser plugin.
 * - Fix: Reprogrammed OIDC authentication to use native Browser popup and appUrlOpen deep link callback.
 * - Fix: Eliminated background geolocation ghost notifications caused by race conditions.
 * - Fix: Rewired MapPicker button listeners to the document body for guaranteed firing.
 * - Fix: Completely eliminated all .innerHTML usage for maximum security.
 * - Fix: Google Play Services is strictly optional and falls back to raw hardware GPS when disabled.
 * - Fix: Font sizes use percentage scaling to respect Android/iOS system accessibility sliders.
 * - Fix: High Contrast accessibility toggle applies custom map filtering and UI overrides.
 * - Fix: Detached camera on drag/zoom, hid native blue dot, and forced puck start to road line.
 * - Fix: Removed strict GPS timeouts and added manual speed/bearing calculators.
 * - Fix: Replaced MapLibre drag events with raw touch canvas listeners for reliable camera detach.
 * - Fix: Anti-Jitter EWMA filtering to the puck coordinates and HUD distance.
 * - Feature: Modern, floating Nav UI manager with detached, smooth-panning camera tracking[cite: 1].
 */

// --- CAPACITOR BRIDGE ---
const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
const Plugins = isNative ? Capacitor.Plugins : null;
const BackgroundGeolocation = isNative && Capacitor.Plugins.BackgroundGeolocation ? Capacitor.Plugins.BackgroundGeolocation : null;

// --- 0. GLOBAL STATE ---
let map;
let mapLoadTimeout = null; 
let appRouter = null; 
let kfLat = null;     
let kfLon = null;
let navigationState = { 
    isActive: false, 
    isRerouting: false, 
    currentStepIndex: 0, 
    offRouteCounter: 0, 
    lastSpokenIndex: -1,
    approachingAnnounced: false,
    isCameraLocked: true,
    destinationCoords: null,
    lastGpsTimestamp: 0,
    currentSpeedMps: 0,
    smoothedBearing: 0,
    roadLockScore: 0,
    pendingStepIndex: -1,
    lastVisualCoords: null,
    totalDistance: 0,
    isCustomStart: false,
    lastDisplayCoords: null,
    lastDistToManeuver: undefined
};
let navigationWatcherId = null;
let currentLastKnownPosition = null; 
let currentRouteData = null;
let alternativeRoutes = []; 
let selectedRouteIndex = 0;
let currentPlace = null; 

let KNOWN_CATEGORIES = [];
let OFFLINE_PRESETS = [];

// --- 1. CONFIGURATION & PROVIDERS ---
const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
const FOURSQUARE_API_KEY = ''; 

const RECENT_SEARCHES_KEY = 'theboiismc-maps-recent-searches';
const SAVED_PLACES_KEY = 'theboiismc-maps-saved-places';
const SETTINGS_KEY = 'theboiismc-maps-settings';

const SERVICES = [
    { name: 'Home', icon: 'home', url: 'https://homeassistant.theboiismc.com' },
    { name: 'Search', icon: 'search', url: 'https://search.theboiismc.com' },
    { name: 'Maps', icon: 'map', url: 'https://maps.theboiismc.com' },
    { name: 'Account', icon: 'account_circle', url: 'https://accounts.theboiismc.com' },
    { name: 'Drive', icon: 'cloud', url: 'https://drive.theboiismc.com' },
    { name: 'Photos', icon: 'photo_library', url: 'https://photos.theboiismc.com' }
];

const NAV_CONSTANTS = {
    REROUTE_THRESHOLD_MILES: 0.3, 
    OFF_ROUTE_LIMIT: 3, 
    SNAP_DISTANCE_MILES: 0.3, 
    STEP_ADVANCE_METERS: 40 
};

const DATA_PROVIDERS = {
    tiles: {
        openfreemap: { 
            name: 'OpenFreeMap', 
            style: `https://tiles.openfreemap.org/styles/liberty`,
            satelliteStyle: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}` 
        },
        maptiler: { 
            name: 'MapTiler Streets', 
            style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
            satelliteStyle: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
        },
        custom: { 
            name: 'TheBoiisMC Custom', 
            style: `https://tiles.theboiismc.com/styles/Default/style.json`,
            satelliteStyle: `https://tiles.theboiismc.com/styles/Satellite/style.json`
        }
    },
    routing: {
        osrm: { name: 'OSRM (Public)', url: 'https://router.project-osrm.org/route/v1/driving' },
        custom: { name: 'TheBoiisMC Routing', url: 'https://api.theboiismc.com/routing/v1/driving' }
    },
    search: {
        maptiler: { name: 'MapTiler Cloud', type: 'maptiler' },
        nominatim: { name: 'OSM Nominatim', type: 'nominatim' },
        custom: { name: 'TheBoiisMC Search', type: 'custom' }
    }
};

// --- 2. DOM HELPER FUNCTIONS ---
function createEl(tag, className = '', text = null) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text; 
    return el;
}

function createIcon(iconName, fontSize = null) {
    const span = createEl('span', 'material-symbols-outlined', iconName);
    span.setAttribute('aria-hidden', 'true');
    if (fontSize) span.style.fontSize = fontSize;
    return span;
}

function clearEl(element) {
    if (!element) return;
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function appendHighlightedText(container, text, query) {
    if (!query) {
        container.textContent = text || '';
        return;
    }
    const safeText = text || '';
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = safeText.split(regex);
    
    parts.forEach(part => {
        if (part.toLowerCase() === query.toLowerCase()) {
            const span = createEl('span', 'search-match', part);
            container.appendChild(span);
        } else {
            container.appendChild(document.createTextNode(part));
        }
    });
}

function createMarkerSVG() {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "#E53935");
    svg.setAttribute("stroke", "white");
    svg.setAttribute("stroke-width", "1.5");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z");
    svg.appendChild(path);
    return svg;
}

// --- CSS OVERRIDES ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
    .maplibregl-ctrl-geolocate.maplibregl-ctrl-geolocate-background-error {
        background-color: white !important;
    }
    .maplibregl-ctrl-geolocate.maplibregl-ctrl-geolocate-background-error .maplibregl-ctrl-icon {
        filter: none !important;
    }
    body.high-contrast {
        --surface-primary: #000000 !important;
        --surface-secondary: #111111 !important;
        --surface-floating: #000000 !important;
        --text-primary: #FFFFFF !important;
        --text-secondary: #DDDDDD !important;
        --brand-primary: #FFCC00 !important;
        --border-color: #FFFFFF !important;
        --error-color: #FF5555 !important;
    }
    body.high-contrast .maplibregl-canvas {
        filter: contrast(1.25) saturate(1.2);
    }
`;
document.head.appendChild(globalStyle);

// --- 2.5 MAP PICKER ENGINE ---
const MapPicker = {
    isActive: false,
    crosshair: null,
    confirmContainer: null,
    targetInput: null,
    
    start(inputEl) {
        if (!inputEl) return;
        this.isActive = true;
        this.targetInput = inputEl;
        
        if (window.fullyClosePanel) window.fullyClosePanel();

        this.crosshair = createEl('div', 'map-picker-crosshair');
        const iconSpan = createIcon('add');
        iconSpan.style.fontSize = '36px';
        iconSpan.style.color = '#111';
        iconSpan.style.textShadow = '0 0 3px #fff';
        this.crosshair.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9999; pointer-events:none; margin-top:-18px;';
        this.crosshair.appendChild(iconSpan);
        document.body.appendChild(this.crosshair);

        this.confirmContainer = createEl('div', 'map-picker-ui');
        this.confirmContainer.style.cssText = 'position:absolute; bottom:40px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; gap:12px;';
        
        const okBtn = createEl('button', '', 'OK');
        okBtn.style.cssText = 'background:var(--brand-primary); color:white; padding:12px 32px; border-radius:24px; font-weight:bold; border:none; box-shadow:0 4px 6px rgba(0,0,0,0.3); cursor:pointer; font-size:16px;';
        okBtn.onclick = () => this.confirm();
        const cancelBtn = createEl('button', '', 'Cancel');
        cancelBtn.style.cssText = 'background:var(--surface-floating); color:var(--text-primary); padding:12px 32px; border-radius:24px; font-weight:bold; border:1px solid var(--border-color); box-shadow:0 4px 6px rgba(0,0,0,0.3); cursor:pointer; font-size:16px;';
        cancelBtn.onclick = () => this.cancel();

        this.confirmContainer.appendChild(cancelBtn);
        this.confirmContainer.appendChild(okBtn);
        document.body.appendChild(this.confirmContainer);
    },
    
    async confirm() {
        const center = map.getCenter();
        const lat = center.lat.toFixed(5);
        const lng = center.lng.toFixed(5);
        
        this.cleanup();
        
        if (this.targetInput) {
            this.targetInput.value = `${lat}, ${lng}`;
            this.targetInput.dataset.coords = `${lng},${lat}`;
            
            const panel = document.getElementById('side-panel');
            if (panel) { panel.classList.add('open'); if(window.innerWidth < 768) panel.classList.add('open-half'); }

            try {
                this.targetInput.value = "Loading address...";
                const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}&limit=1`;
                const res = await fetch(url);
                const data = await res.json();
                if(data.features && data.features.length > 0) {
                    this.targetInput.value = data.features[0].place_name;
                } else {
                    this.targetInput.value = `${lat}, ${lng}`;
                }
            } catch(e) {
                this.targetInput.value = `${lat}, ${lng}`;
            }
        }
    },
    
    cancel() {
        this.cleanup();
        const panel = document.getElementById('side-panel');
        if (panel) { panel.classList.add('open'); if(window.innerWidth < 768) panel.classList.add('open-half'); }
    },
    
    cleanup() {
        this.isActive = false;
        if (this.crosshair) this.crosshair.remove();
        if (this.confirmContainer) this.confirmContainer.remove();
    }
};
window.MapPicker = MapPicker;

// --- 3. MODAL MANAGER ---
const ModalManager = {
    overlay: null,
    titleEl: null,
    bodyEl: null,
    closeBtn: null,
    init() {
        this.overlay = document.getElementById('app-modal-overlay');
        this.titleEl = document.getElementById('modal-title');
        this.bodyEl = document.getElementById('modal-body');
        this.closeBtn = document.getElementById('modal-close-btn');
        if (this.overlay) {
            this.overlay.style.position = 'fixed';
            this.overlay.style.zIndex = '9999';
        }
        if(this.closeBtn) this.closeBtn.onclick = () => this.close();
        if(this.overlay) this.overlay.onclick = (e) => { 
            if(e.target === this.overlay) this.close();
        };
    },
    open(title, contentElement) {
        if(!this.overlay) return;
        if(this.titleEl) this.titleEl.textContent = title;
        if(this.bodyEl) {
            clearEl(this.bodyEl);
            if(contentElement) this.bodyEl.appendChild(contentElement);
        }
        this.overlay.hidden = false;
        this.overlay.style.display = 'flex';
        const drawer = document.getElementById('sidebar-drawer');
        const dOverlay = document.getElementById('drawer-overlay');
        if(drawer) drawer.classList.remove('open');
        if(dOverlay) dOverlay.classList.remove('open');
    },
    close() {
        if(!this.overlay) return;
        this.overlay.hidden = true;
        this.overlay.style.display = 'none';
        if(this.bodyEl) clearEl(this.bodyEl);
    }
};

// --- 4. DATA LOADER ---
async function loadExternalData() {
    const DATA_VERSION = 'v1.1';
    try {
        const cachedCats = localStorage.getItem('maps-data-categories');
        const cachedVer = localStorage.getItem('maps-data-version');
        if (cachedCats && cachedVer === DATA_VERSION) {
            KNOWN_CATEGORIES = JSON.parse(cachedCats);
            return;
        }
        const catRes = await fetch('/data/categories.json');
        if (catRes.ok) {
            KNOWN_CATEGORIES = await catRes.json();
            localStorage.setItem('maps-data-categories', JSON.stringify(KNOWN_CATEGORIES));
        }
        localStorage.setItem('maps-data-version', DATA_VERSION);
    } catch (e) {}
}

// --- 5. SEARCH SERVICE ADAPTER ---
const SearchService = {
    async query(query, proximity = null, bbox = null, types = null) {
        const providerKey = appSettings.get('source').search;
        const provider = DATA_PROVIDERS.search[providerKey] || DATA_PROVIDERS.search.maptiler;

        if (provider.type === 'nominatim') {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                return data.map(item => ({
                    center: [parseFloat(item.lon), parseFloat(item.lat)],
                    place_name: item.display_name,
                    text: item.name || item.display_name.split(',')[0],
                    bbox: item.boundingbox ? [parseFloat(item.boundingbox[2]), parseFloat(item.boundingbox[0]), parseFloat(item.boundingbox[3]), parseFloat(item.boundingbox[1])] : null,
                    properties: { category: item.type }
                }));
            } catch (e) { return []; }
        } else if (provider.type === 'custom') {
             return [];
        } else {
            let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&limit=5`;
            if (proximity) url += `&proximity=${proximity}`;
            if (bbox) url += `&bbox=${bbox}`;
            if (types) url += `&types=${types}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                return data.features.map(f => ({
                    center: f.center,
                    place_name: f.place_name,
                    text: f.text,
                    bbox: f.bbox,
                    properties: f.properties
                }));
            } catch (e) { return []; }
        }
    }
};

// --- 6. SETTINGS & UNITS ---
const DEFAULT_SETTINGS = {
    source: { tiles: 'openfreemap', routing: 'osrm', search: 'maptiler' },
    language: 'en', units: 'imperial', theme: 'system', show3dBuildings: false,
    privacy: { clearRecentsOnExit: false, disableSuggestions: false, useDeviceLocationServices: true },
    navigation: { voiceMute: 'unmuted', avoidTolls: false, avoidHighways: false },
    accessibility: { labelSize: 'normal', fontSize: 'normal', highContrast: false }
};

const appSettings = {
    current: {},
    load() {
        try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.current = { 
                    ...DEFAULT_SETTINGS, 
                    ...parsed,
                    source: { ...DEFAULT_SETTINGS.source, ...(parsed.source || {}) },
                    privacy: { ...DEFAULT_SETTINGS.privacy, ...(parsed.privacy || {}) },
                    navigation: { ...DEFAULT_SETTINGS.navigation, ...(parsed.navigation || {}) },
                    accessibility: { ...DEFAULT_SETTINGS.accessibility, ...(parsed.accessibility || {}) }
                };
            } else { this.current = { ...DEFAULT_SETTINGS }; }
        } catch (e) { this.current = { ...DEFAULT_SETTINGS }; }
        return this.current;
    },
    save() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.current)); } catch (e) {} },
    get(key) { return this.current[key]; },
    set(key, value) { this.current[key] = value; this.save(); },
    apply() {
        if (this.get('privacy').clearRecentsOnExit) {
            window.addEventListener('beforeunload', () => { localStorage.removeItem(RECENT_SEARCHES_KEY); });
        }
        applyTheme(this.get('theme'));
        applyMapVisuals();
        if(map) loadMapStyle(); 
    }
};

function formatDistance(meters) {
    const units = appSettings.get('units') || 'imperial';
    if (units === 'metric') {
        if (meters < 1000) return `${Math.round(meters)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    } else {
        const miles = meters / 1609.34;
        if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
        return `${miles.toFixed(1)} mi`;
    }
}

function applyTheme(theme) {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
}

function applyMapVisuals() {
    if (!map || !map.getStyle()) return;
    const acc = appSettings.get('accessibility') || {};
    const root = document.documentElement;
    
    if (acc.fontSize === 'large') {
        root.style.setProperty('--font-scale', '1.2');
        root.style.fontSize = '120%'; 
    } else {
        root.style.setProperty('--font-scale', '1');
        root.style.fontSize = '100%';
    }

    if (acc.highContrast) document.body.classList.add('high-contrast');
    else document.body.classList.remove('high-contrast');

    const show3d = appSettings.get('show3dBuildings');
    if (map.getLayer('building-3d')) {
        map.setLayoutProperty('building-3d', 'visibility', show3d ? 'visible' : 'none');
    }
}

// --- 7. MAP STYLE & STATE FUNCTIONS ---
function restoreMapState() {
    if (!map) return;
    const isGlobe = document.getElementById('globe-toggle-menu') && document.getElementById('globe-toggle-menu').checked;
    if (map.setProjection) {
            try { map.setProjection({ type: isGlobe ? 'globe' : 'mercator' }); } catch(e){}
    }
    applyTheme(appSettings.get('theme') || 'system');
    applyMapVisuals();
}

function loadMapStyle() {
    if (!map) return;
    if (mapLoadTimeout) { clearTimeout(mapLoadTimeout); mapLoadTimeout = null; }
    
    const styleKey = appSettings.get('source').tiles;
    const provider = DATA_PROVIDERS.tiles[styleKey] || DATA_PROVIDERS.tiles.openfreemap;
    const styleUrl = provider.style;

    const onError = (e) => { 
        showToast("Failed to load map style. Reverting...", "error");
        if (styleKey !== 'openfreemap') {
            appSettings.set('source', { ...appSettings.get('source'), tiles: 'openfreemap' });
            map.setStyle(DATA_PROVIDERS.tiles.openfreemap.style);
        }
    };

    const onLoad = () => {
        if (mapLoadTimeout) { clearTimeout(mapLoadTimeout); mapLoadTimeout = null; }
        map.off('error', onError);
        restoreMapState(); 
    };

    mapLoadTimeout = setTimeout(() => { 
        map.off('error', onError); 
        map.off('styledata', onLoad); 
    }, 10000);

    map.once('error', onError);
    map.once('styledata', onLoad);

    try { 
        map.setStyle(styleUrl); 
    } catch (e) { onError(e); }
}

// --- 8. SETTINGS MODAL ---
function renderSettingsModal() {
    const container = createEl('div');
    container.style.cssText = 'display:flex; height: 60vh; min-height: 400px;';

    const sidebar = createEl('div');
    sidebar.style.cssText = 'width: 140px; border-right: 1px solid var(--border-color); background: var(--surface-secondary); padding-top: 10px; display:flex; flex-direction:column;';
    const content = createEl('div');
    content.id = 'settings-tab-content';
    content.style.cssText = 'flex: 1; overflow-y: auto; padding: 0;';

    const tabs = [
        { id: 'general', label: 'General', icon: 'tune' },
        { id: 'sources', label: 'Data Sources', icon: 'dns' },
        { id: 'navigation', label: 'Navigation', icon: 'navigation' },
        { id: 'privacy', label: 'Privacy', icon: 'security' },
        { id: 'accessibility', label: 'Access', icon: 'accessibility_new' }
    ];

    let activeTab = 'general';

    const renderTabButton = (tab) => {
        const btn = createEl('button');
        btn.style.cssText = 'padding: 12px; text-align: left; background: none; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 500; border-left: 3px solid transparent; transition: all 0.2s;';
        if (tab.id === activeTab) {
            btn.style.color = 'var(--brand-primary)';
            btn.style.background = 'var(--surface-tertiary)';
            btn.style.borderLeftColor = 'var(--brand-primary)';
        }
        const icon = createIcon(tab.icon);
        icon.style.fontSize = '20px';
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(tab.label));
        btn.onclick = () => {
            activeTab = tab.id;
            updateSidebar();
            renderContent(tab.id);
        };
        return btn;
    };

    const updateSidebar = () => {
        clearEl(sidebar);
        tabs.forEach(t => sidebar.appendChild(renderTabButton(t)));
    };

    const createSelect = (label, options, curr, onChange, description = null) => {
        const wrapper = createEl('div', 'modal-list-item');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'flex-start';
        wrapper.style.gap = '8px';
        wrapper.style.padding = '16px 20px';

        const row = createEl('div');
        row.style.cssText = "display: flex; justify-content: space-between; width: 100%; align-items: center;";
        
        const labelContainer = createEl('div');
        const lbl = createEl('span', '', label);
        lbl.style.fontWeight = '500';
        labelContainer.appendChild(lbl);
        
        if (description) {
            const desc = createEl('div', '', description);
            desc.style.cssText = "font-size: 12px; color: var(--text-secondary); margin-top: 4px;";
            labelContainer.appendChild(desc);
        }
        
        row.appendChild(labelContainer);
        const sel = createEl('select');
        sel.style.cssText = "padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-floating); color: var(--text-primary); outline: none; cursor: pointer; min-width: 140px;";
        options.forEach(o => {
            const opt = createEl('option', '', o.label);
            opt.value = o.value;
            if (o.value === curr) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = (e) => onChange(e.target.value);
        row.appendChild(sel);
        wrapper.appendChild(row);
        return wrapper;
    };

    const createToggle = (label, id, checked, onChange, subtext = null) => {
        const row = createEl('div', 'modal-list-item');
        row.style.justifyContent = 'space-between';
        
        const textDiv = createEl('div');
        const mainLabel = createEl('div', '', label);
        textDiv.appendChild(mainLabel);
        if(subtext) {
            const sub = createEl('div', '', subtext);
            sub.style.cssText = "font-size: 11px; color: var(--text-secondary); margin-top: 2px;";
            textDiv.appendChild(sub);
        }
        
        const toggleDiv = createEl('div', 'toggle-switch');
        const input = createEl('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = checked;
        const tLabel = createEl('label');
        tLabel.setAttribute('for', id);
        
        toggleDiv.appendChild(input);
        toggleDiv.appendChild(tLabel);
        input.onchange = (e) => onChange(e.target.checked);
        
        row.appendChild(textDiv);
        row.appendChild(toggleDiv);
        return row;
    };

    const renderContent = (tabId) => {
        clearEl(content);
        if (tabId === 'general') {
            content.appendChild(createSelect('App Theme', [
                {label:'System Default', value:'system'},
                {label:'Dark Mode', value:'dark'},
                {label:'Light Mode', value:'light'}
            ], appSettings.get('theme'), (v) => {
                appSettings.set('theme', v);
                applyTheme(v);
            }));
            content.appendChild(createSelect('Distance Units', [
                {label:'Imperial (mi)', value:'imperial'},
                {label:'Metric (km)', value:'metric'}
            ], appSettings.get('units'), (v) => appSettings.set('units', v)));
            content.appendChild(createSelect('Language', [
                {label:'English (US)', value:'en'},
                {label:'Español', value:'es'},
                {label:'Français', value:'de'}
            ], appSettings.get('language'), (v) => appSettings.set('language', v)));
            content.appendChild(createToggle('3D Buildings', 'set-gen-3d', appSettings.get('show3dBuildings'), (v) => {
                appSettings.set('show3dBuildings', v);
                applyMapVisuals();
            }));
        } 
        else if (tabId === 'sources') { 
            const src = appSettings.get('source') || DEFAULT_SETTINGS.source;
            const tileOpts = Object.keys(DATA_PROVIDERS.tiles).map(k => ({label: DATA_PROVIDERS.tiles[k].name, value: k}));
            content.appendChild(createSelect('Map Visuals', tileOpts, src.tiles, (v) => {
                appSettings.set('source', {...src, tiles: v});
                showToast(`Loading ${DATA_PROVIDERS.tiles[v].name}...`, 'info');
                loadMapStyle(); 
            }, "Visual style and terrain data provider"));
            const routeOpts = Object.keys(DATA_PROVIDERS.routing).map(k => ({label: DATA_PROVIDERS.routing[k].name, value: k}));
            content.appendChild(createSelect('Routing Engine', routeOpts, src.routing, (v) => {
                appSettings.set('source', {...src, routing: v});
                const name = DATA_PROVIDERS.routing[v].name;
                if (typeof currentRouteData !== 'undefined' && currentRouteData && !navigationState.isActive && typeof getRoute === 'function') {
                    showToast(`Recalculating via ${name}...`, 'info');
                    getRoute(); 
                } else {
                    showToast(`Routing switched to ${name}`, 'info');
                }
            }, "Provider used for calculating directions"));

            const searchOpts = Object.keys(DATA_PROVIDERS.search).map(k => ({label: DATA_PROVIDERS.search[k].name, value: k}));
            content.appendChild(createSelect('Search Provider', searchOpts, src.search, (v) => {
                appSettings.set('source', {...src, search: v});
                showToast(`Search powered by ${DATA_PROVIDERS.search[v].name}`, 'info');
            }, "Service used for finding places and addresses"));
        }
        else if (tabId === 'navigation') {
            const nav = appSettings.get('navigation') || {};
            content.appendChild(createSelect('Voice Instructions', [
                {label:'Unmuted', value:'unmuted'},
                {label:'Alerts Only', value:'alerts_only'},
                {label:'Muted', value:'muted'}
            ], nav.voiceMute, (v) => appSettings.set('navigation', {...nav, voiceMute: v})));
            content.appendChild(createToggle('Avoid Tolls', 'set-nav-tolls', nav.avoidTolls, (v) => appSettings.set('navigation', {...nav, avoidTolls: v})));
            content.appendChild(createToggle('Avoid Highways', 'set-nav-hwy', nav.avoidHighways, (v) => appSettings.set('navigation', {...nav, avoidHighways: v})));
        }
        else if (tabId === 'privacy') {
            const priv = appSettings.get('privacy') || {};
            content.appendChild(createToggle('Clear History on Exit', 'set-priv-clear', priv.clearRecentsOnExit, (v) => appSettings.set('privacy', {...priv, clearRecentsOnExit: v})));
            content.appendChild(createToggle('Device Location Services', 'set-priv-loc', priv.useDeviceLocationServices, (v) => appSettings.set('privacy', {...priv, useDeviceLocationServices: v}), "Uses Google Play Services for location tracking when enabled"));
            const clearBtn = createEl('button', 'modal-list-item');
            clearBtn.style.color = 'var(--error-color)';
            clearBtn.style.justifyContent = 'center';
            clearBtn.style.fontWeight = '600';
            clearBtn.textContent = 'Clear Search History';
            clearBtn.onclick = () => {
                if(confirm("Clear all recent searches?")) {
                    localStorage.removeItem(RECENT_SEARCHES_KEY);
                    showToast("Search history cleared", "info");
                }
            };
            content.appendChild(clearBtn);
        }
        else if (tabId === 'accessibility') {
            const acc = appSettings.get('accessibility') || {};
            content.appendChild(createSelect('Label Size', [{label:'Normal', value:'normal'},{label:'Large', value:'large'}], acc.labelSize, (v) => { appSettings.set('accessibility', {...acc, labelSize: v}); applyMapVisuals(); }));
            content.appendChild(createSelect('Font Size', [{label:'Normal', value:'normal'},{label:'Large', value:'large'}], acc.fontSize, (v) => { appSettings.set('accessibility', {...acc, fontSize: v}); applyMapVisuals(); }));
            content.appendChild(createToggle('High Contrast', 'set-acc-contrast', acc.highContrast, (v) => { appSettings.set('accessibility', {...acc, highContrast: v}); applyMapVisuals(); }));
        }
    };

    updateSidebar();
    renderContent(activeTab);
    container.appendChild(sidebar);
    container.appendChild(content);
    ModalManager.open('Settings', container);
}

// --- 9. HELPER FUNCTIONS ---
function onUserInteraction(e) {
    if (e && !e.originalEvent) return;
    if (navigationState.isActive && navigationState.isCameraLocked) {
        navigationState.isCameraLocked = false; 
        showRecenterButton();
    }
}
function setupRecenterButton() {
    let btn = document.getElementById('recenter-btn');
    if (!btn) {
        btn = createEl('button');
        btn.id = 'recenter-btn';
        const icon = createIcon('my_location');
        icon.style.fontSize = '28px';
        btn.appendChild(icon);
        btn.onclick = recenterCamera;
        document.body.appendChild(btn);
    }
}
function showRecenterButton() {
    const btn = document.getElementById('recenter-btn');
    if (btn) btn.style.display = 'flex';
}
function recenterCamera() {
    const btn = document.getElementById('recenter-btn');
    if (btn) btn.style.display = 'none';
    navigationState.isCameraLocked = true;
    if (map && currentLastKnownPosition) {
        map.jumpTo({ center: currentLastKnownPosition.coords, bearing: currentLastKnownPosition.bearing, pitch: 60, zoom: 19 });
    }
}
let currentToast = null; 
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    if (currentToast) {
        currentToast.classList.remove('show');
        currentToast.classList.add('hide');
        currentToast.addEventListener('transitionend', () => currentToast.remove(), { once: true });
        currentToast = null;
    }
    const toast = createEl('div', `toast ${type}`, message);
    container.appendChild(toast);
    currentToast = toast;
    setTimeout(() => { if (currentToast === toast) toast.classList.add('show'); }, 10);
    const hideTimer = setTimeout(() => { if (currentToast === toast) toast.classList.add('hide'); }, duration);
    toast.addEventListener('transitionend', () => {
        if (toast.classList.contains('hide')) { toast.remove(); if (currentToast === toast) currentToast = null; }
    }, { once: true });
    toast.addEventListener('click', () => { clearTimeout(hideTimer); toast.classList.add('hide'); }, { once: true });
}
function announce(text) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = createEl('div', 'sr-only', text);
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 1000);
}
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}
function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs} hr ${mins} min`;
    return `${mins} min`;
}
function getManeuverIcon(type, modifier) {
    modifier = (modifier || '').toLowerCase();
    type = (type || '').toLowerCase();
    if (modifier.includes('left')) return 'turn_left';
    if (modifier.includes('right')) return 'turn_right';
    if (modifier.includes('uturn')) return 'u_turn_left'; 
    if (type === 'arrive') return 'flag';
    if (type === 'roundabout') return 'roundabout_right';
    if (type === 'merge') return 'merge';
    if (type === 'fork') return 'fork_left';
    if (type === 'depart') return 'directions_car';
    return 'straight'; 
}

// --- 10. AUTH & LOCATION SERVICES ---
const customNavigator = {
    prepare: async () => {
        return {
            navigate: async (params) => {
                if (isNative && Plugins && Plugins.Browser) {
                    await Plugins.Browser.open({ url: params.url });
                } else {
                    window.location.href = params.url;
                }
            },
            close: () => {}
        };
    }
};

const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "xqfUqdpbn8PCCz6ouRAQtFV0oUyg4lpEb64U8W9s", 
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    scope: 'openid profile email offline_access', 
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    automaticSilentRenew: true,
    userStore: new oidc.WebStorageStateStore({ store: window.sessionStorage }),
    redirectNavigator: (isNative && Plugins && Plugins.Browser) ? customNavigator : undefined
};

const userManager = new oidc.UserManager(authConfig);

const authService = {
    async login() { 
        return userManager.signinRedirect();
    },
    async logout() { 
        return userManager.signoutRedirect();
    },
    async getUser() { return userManager.getUser(); },
    async handleCallback(url) { 
        if (url) return userManager.signinCallback(url);
        return userManager.signinRedirectCallback(); 
    }
};

const locationService = {
    STORAGE_KEY: 'theboiismc-last-known-location',
    API_ENDPOINT: 'https://api.theboiismc.com/user/location', 
    async save(coords) {
        if (!coords || coords.length !== 2) return;
        const data = { coords: coords, timestamp: Date.now() };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    },
    async getLastLocation() {
        let localData = null;
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) localData = JSON.parse(raw);
        } catch(e) {}
        if (localData && (Date.now() - localData.timestamp < 86400000)) {
            return localData.coords;
        }
        return null; 
    }
};

// --- 11. SAVED PLACES SERVICE ---
const savedPlacesService = {
    get() { 
        try { return JSON.parse(localStorage.getItem(SAVED_PLACES_KEY)) || []; } 
        catch(e) { return []; } 
    },
    isSaved(place) {
        if(!place) return false;
        const saved = this.get();
        return saved.some(p => p.display_name === place.display_name && p.lat == place.lat && p.lon == place.lon);
    },
    toggle(place) {
        let saved = this.get();
        const isAlreadySaved = this.isSaved(place);
        if (isAlreadySaved) {
            saved = saved.filter(p => !(p.display_name === place.display_name && p.lat == place.lat));
        } else {
            const safePlace = {
                display_name: place.display_name,
                name: place.name || place.display_name.split(',')[0],
                lat: place.lat,
                lon: place.lon,
                text: place.text || place.name,
                bbox: place.bbox,
                timestamp: Date.now()
            };
            saved.unshift(safePlace);
        }
        localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(saved));
        return !isAlreadySaved;
    }
};

// --- 12. SPEECH SERVICE ---
const speechService = {
    synthesis: window.speechSynthesis,
    currentVoice: null,
    init() {
        if (isNative) return;
        if (!this.synthesis) return;
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = () => this.loadPreferredVoice();
        }
        this.loadPreferredVoice();
    },
    loadPreferredVoice() {
        if (!this.synthesis) return;
        const voices = this.synthesis.getVoices();
        const savedVoice = localStorage.getItem('maps-nav-voice');
        if (savedVoice) { this.currentVoice = voices.find(v => v.name === savedVoice); }
        if (!this.currentVoice) {
            this.currentVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
        }
    },
    setVoice(voiceName) {
        if (!this.synthesis) return;
        const voices = this.synthesis.getVoices();
        const found = voices.find(v => v.name === voiceName);
        if (found) {
            this.currentVoice = found;
            localStorage.setItem('maps-nav-voice', voiceName);
        }
    },
    async speak(text, priority = false) {
        const navSettings = appSettings.get('navigation') || {};
        if (navSettings.voiceMute === 'muted') return;
        if (navSettings.voiceMute === 'alerts_only' && !priority) return;
        if (isNative) {
            try {
                if (Plugins && Plugins.Haptics) {
                    await Plugins.Haptics.vibrate({ duration: 300 }).catch(()=>{});
                }
                if (Plugins && Plugins.TextToSpeech) {
                    await Plugins.TextToSpeech.speak({
                        text: text,
                        lang: 'en-US',
                        rate: 1.0,
                        pitch: 1.0,
                        category: 'ambient' 
                    }).catch(()=>{});
                }
            } catch (e) {}
        } else {
            if (!this.synthesis) return;
            if (priority) { this.synthesis.cancel(); }
            const utterance = new SpeechSynthesisUtterance(text);
            if (this.currentVoice) utterance.voice = this.currentVoice;
            this.synthesis.speak(utterance);
        }
    }
};
speechService.init();

// --- 12.5. PHOTO SERVICE ---
const PhotoService = {
    cache: new Map(),

    async getPhotoForPlace(place) {
        if (!place) return null;
        const cacheKey = `${place.lat},${place.lon}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        let photoUrl = null;
        const name = place.name || place.text || (place.display_name ? place.display_name.split(',')[0] : '');

        if (FOURSQUARE_API_KEY) {
            photoUrl = await this.getFoursquareImage(name, place.lat, place.lon);
        }

        if (!photoUrl && place.properties && place.properties.wikidata) {
            photoUrl = await this.getWikidataImage(place.properties.wikidata);
        }

        if (!photoUrl && name) {
            photoUrl = await this.getWikipediaImage(name);
        }

        this.cache.set(cacheKey, photoUrl);
        return photoUrl;
    },

    async getFoursquareImage(name, lat, lon) {
        try {
            const searchUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&query=${encodeURIComponent(name)}&limit=1`;
            const searchRes = await fetch(searchUrl, {
                headers: { 'Authorization': FOURSQUARE_API_KEY, 'Accept': 'application/json' }
            });
            const searchData = await searchRes.json();
            
            if (searchData.results && searchData.results.length > 0) {
                const fsqId = searchData.results[0].fsq_id;
                const photosUrl = `https://api.foursquare.com/v3/places/${fsqId}/photos?limit=1`;
                const photosRes = await fetch(photosUrl, {
                    headers: { 'Authorization': FOURSQUARE_API_KEY, 'Accept': 'application/json' }
                });
                const photosData = await photosRes.json();
                
                if (photosData && photosData.length > 0) {
                    const photo = photosData[0];
                    return `${photo.prefix}original${photo.suffix}`;
                }
            }
        } catch(e) {}
        return null;
    },

    async getWikidataImage(wikidataId) {
        try {
            const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json&origin=*`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.claims && data.claims.P18) {
                const imageClaim = data.claims.P18[0].mainsnak.datavalue.value;
                if (imageClaim) {
                    const filename = imageClaim.replace(/ /g, '_');
                    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=600`;
                }
            }
        } catch(e) {}
        return null;
    },

    async getWikipediaImage(title) {
        try {
            const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=600&format=json&origin=*`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.query && data.query.pages) {
                const pages = Object.values(data.query.pages);
                if (pages[0] && pages[0].thumbnail) return pages[0].thumbnail.source;
            }
        } catch(e) {}
        return null;
    },

    getFallbackGradient(seedString) {
        let hash = 0;
        const safeString = seedString || 'Unknown';
        for (let i = 0; i < safeString.length; i++) {
            hash = safeString.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h1 = Math.abs(hash) % 360;
        const h2 = (h1 + 40) % 360;
        return `linear-gradient(135deg, hsl(${h1}, 60%, 30%), hsl(${h2}, 70%, 15%))`;
    }
};

// --- 13. NAV ENGINE ---
const navEngine = {
    calculateSegmentProbability(step, stepIndex, rawCoords, rawBearing, speed) {
        if (!step || !step.geometry || !step.geometry.coordinates || step.geometry.coordinates.length < 2) {
            return { probability: 0, score: 999 };
        }
        
        const line = turf.lineString(step.geometry.coordinates);
        const snapped = turf.nearestPointOnLine(line, rawCoords, { units: 'miles' });
        const dist = snapped.properties.dist;
        const pointAhead = turf.along(line, snapped.properties.location + 0.005, { units: 'miles' });
        const roadBearing = turf.bearing(turf.point(snapped.geometry.coordinates), pointAhead);
        let angleDiff = Math.abs(rawBearing - roadBearing);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        if (speed > 2.2 && angleDiff > 90) return { probability: 0 };
        let score = dist;
        if (speed > 2.2) score += (angleDiff / 180) * 0.05; 
        if (stepIndex === navigationState.currentStepIndex) score -= 0.005;
        return { probability: 1 / (score + 0.0001), snap: snapped, bearing: roadBearing, score: score };
    }
};

// --- NAV UI MANAGER ---
const NavUI = {
    container: null,
    
    init() {
        this.destroy(); 
        
        this.container = createEl('div', 'modern-nav-ui');
        this.container.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 1000; display: flex; flex-direction: column; justify-content: space-between; font-family: sans-serif;';

        this.topBanner = createEl('div', 'nav-top-banner');
        this.topBanner.style.cssText = 'background: #1e3a8a; color: white; padding: 16px 20px; margin: 16px; border-radius: 16px; display: flex; align-items: center; gap: 20px; pointer-events: auto; box-shadow: 0 6px 16px rgba(0,0,0,0.3);';

        this.iconContainer = createEl('div');
        this.iconContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 50px; height: 50px;';

        this.textContainer = createEl('div');
        this.textContainer.style.cssText = 'display: flex; flex-direction: column; flex: 1;';

        this.distText = createEl('span');
        this.distText.style.cssText = 'font-size: 28px; font-weight: 800; line-height: 1.2;';

        this.instrText = createEl('span');
        this.instrText.style.cssText = 'font-size: 18px; font-weight: 500; opacity: 0.9; line-height: 1.2;';

        this.textContainer.appendChild(this.distText);
        this.textContainer.appendChild(this.instrText);
        this.topBanner.appendChild(this.iconContainer);
        this.topBanner.appendChild(this.textContainer);

        this.bottomBanner = createEl('div', 'nav-bottom-banner');
        this.bottomBanner.style.cssText = 'background: var(--surface-primary, #ffffff); color: var(--text-primary, #111111); padding: 16px 20px; margin: 16px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; pointer-events: auto; box-shadow: 0 -4px 16px rgba(0,0,0,0.15);';

        this.statsContainer = createEl('div');
        this.statsContainer.style.cssText = 'display: flex; gap: 16px; font-size: 18px; font-weight: 700; align-items: baseline;';

        this.etaText = createEl('span');
        this.etaText.style.cssText = 'color: #10B981; font-size: 22px;';

        this.timeText = createEl('span');
        this.distStatsText = createEl('span');
        this.distStatsText.style.opacity = '0.6';
        this.distStatsText.style.fontSize = '16px';

        this.statsContainer.appendChild(this.etaText);
        this.statsContainer.appendChild(this.timeText);
        this.statsContainer.appendChild(this.distStatsText);

        this.endBtn = createEl('button', '', 'Exit');
        this.endBtn.style.cssText = 'background: #EF4444; color: white; border: none; padding: 12px 28px; border-radius: 24px; font-weight: bold; cursor: pointer; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);';
        this.endBtn.onclick = () => { if (typeof endNavigation === 'function') endNavigation(); };

        this.bottomBanner.appendChild(this.statsContainer);
        this.bottomBanner.appendChild(this.endBtn);

        this.container.appendChild(this.topBanner);
        this.container.appendChild(this.bottomBanner);
        document.body.appendChild(this.container);
    },
    
    updateStep(step, distStr) {
        if (!this.container) return;
        clearEl(this.iconContainer);
        const iconSpan = createIcon(getManeuverIcon(step.maneuver.type, step.maneuver.modifier));
        iconSpan.style.fontSize = '48px';
        iconSpan.style.color = '#60A5FA'; 
        this.iconContainer.appendChild(iconSpan);

        this.distText.textContent = distStr;
        this.instrText.textContent = formatOsrmInstruction(step);
    },
    
    updateStats(eta, min, mi) {
        if (!this.container) return;
        this.etaText.textContent = eta;
        this.timeText.textContent = `${min} min`;
        this.distStatsText.textContent = `${mi} mi`;
    },
    
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
    }
};

// --- 14. MAIN APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    appSettings.load();
    appSettings.apply();
    setupRecenterButton(); 
    loadExternalData(); 
    ModalManager.init();

    if (isNative && Plugins && Plugins.App) {
        try {
            Plugins.App.addListener('appStateChange', ({ isActive }) => {
                if (!isActive && navigationState.isActive) {
                    console.log("App paused - Navigation active in background");
                } else if (isActive && navigationState.isActive) {
                    showRecenterButton();
                }
            }).catch(()=>{});

            Plugins.App.addListener('appUrlOpen', async (data) => {
                if (data.url.includes('callback.html')) {
                    if (Plugins.Browser) Plugins.Browser.close().catch(()=>{});
                    try {
                        await authService.handleCallback(data.url);
                        authService.getUser().then(user => {
                            if (typeof updateProfileUI !== 'undefined') updateProfileUI(user);
                        });
                        if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                    } catch(e) {}
                }
            }).catch(()=>{});
            Plugins.App.addListener('backButton', ({ canGoBack }) => {
                if (navigationState.isActive) {
                    if (confirm("Are you sure you want to end navigation and exit?")) {
                        endNavigation();
                        if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                        else PanelRouter.renderHome();
                    }
                } else {
                    if (canGoBack) {
                        window.history.back();
                    } else {
                        Plugins.App.exitApp();
                    }
                }
            }).catch(()=>{});
        } catch (e) {}
    }

    window.addEventListener('popstate', (e) => {
        if (navigationState.isActive) {
            if (confirm("Are you sure you want to end navigation and exit?")) {
                endNavigation();
                if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                else PanelRouter.renderHome();
            } else {
                window.history.pushState({ nav: true }, '', window.location.href);
            }
        }
    });
    async function initAutoLocation() {
        const saved = await locationService.getLastLocation();
        if (saved) {
            if (map && map.getZoom() < 5) map.jumpTo({ center: saved, zoom: 15 });
            return;
        }
    }
    setTimeout(initAutoLocation, 1000);

    const sidebarContainer = document.getElementById('drawer-links-container');
    if (sidebarContainer) {
        clearEl(sidebarContainer);
        const createLink = (icon, text, onClick) => {
            const a = createEl('a', 'drawer-item');
            a.href = '#';
            const iconSpan = createIcon(icon);
            a.appendChild(iconSpan);
            a.appendChild(document.createTextNode(' ' + text));
            a.onclick = (e) => { 
                e.preventDefault();
                onClick(); 
                const sidebarDrawer = document.getElementById('sidebar-drawer');
                if (sidebarDrawer) sidebarDrawer.classList.remove('open');
                const drawerOverlay = document.getElementById('drawer-overlay');
                if (drawerOverlay) drawerOverlay.classList.remove('open');
            };
            return a;
        };
        sidebarContainer.appendChild(createLink('bookmark', 'Saved Places', () => { if (appRouter) appRouter.navigate('/saved'); else PanelRouter.renderSavedPlaces(); }));
        sidebarContainer.appendChild(createLink('settings', 'Settings', () => renderSettingsModal()));
    }

    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const appMenuButton = document.getElementById('app-menu-button');
    const servicesDropdown = document.getElementById('services-dropdown');
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const mainSuggestions = document.getElementById("main-suggestions");
    const apiSuggestionsView = document.getElementById("api-suggestions-view");
    const recentSearchesContainer = document.getElementById("recent-searches-container");
    const mainDirectionsIcon = document.getElementById('main-directions-icon');
    const sidePanel = document.getElementById("side-panel");
    const endNavigationBtn = document.getElementById('end-navigation-btn');
    const contextMenu = document.getElementById('context-menu');
    const contextMenuCoords = document.getElementById('context-menu-coords');
    let currentUser = null;
    let contextMenuLngLat = null;
    let clickedLocationMarker = null;
    let userLocationMarker = null; 
    let searchResultMarkers = [];
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    window.fullyClosePanel = function() {
        if (sidePanel) {
            sidePanel.classList.remove('open', 'open-full', 'open-half', 'peek');
            sidePanel.style.transform = ''; 
        }
        PanelRouter.toggleSearchBar(true);
    };
    document.body.addEventListener('click', (e) => {
        if(e.target.closest('#directions-close-btn') || e.target.closest('#close-panel-btn')) {
            window.fullyClosePanel();
        }
        
        const pickBtn = e.target.closest('.pick-on-map, [data-action="pick-map"], #pick-on-map-from, #pick-on-map-to, #dir-pick-from-map, #dir-pick-to-map');
        if (pickBtn) {
            e.preventDefault();
            let targetInput = null;
            if (pickBtn.classList.contains('to') || pickBtn.id.includes('to')) {
                targetInput = document.getElementById('panel-to-input');
            } else {
                targetInput = document.getElementById('panel-from-input');
            }
            if (targetInput) MapPicker.start(targetInput);
        }

        const link = e.target.closest('a');
        if (link && link.href && link.href.startsWith('http') && !link.href.includes(window.location.hostname)) {
            if (isNative && Plugins && Plugins.Browser) {
                e.preventDefault();
                Plugins.Browser.open({ url: link.href }).catch(()=>{});
            }
        }
    });
    const categories = [
        { label: 'Restaurants', icon: 'restaurant', query: 'restaurant' },
        { label: 'Gas', icon: 'local_gas_station', query: 'fuel' },
        { label: 'Coffee', icon: 'coffee', query: 'cafe' },
        { label: 'Groceries', icon: 'shopping_cart', query: 'supermarket' },
        { label: 'Parks', icon: 'park', query: 'park' },
        { label: 'Hotels', icon: 'hotel', query: 'hotel' }
    ];
    function createChipsRow() {
        const chipsRow = createEl('div', 'search-categories');
        chipsRow.id = 'category-chips-row';
        categories.forEach(cat => {
            const chip = createEl('button', 'category-pill');
            const icon = createIcon(cat.icon);
            icon.style.fontSize = '18px';
            chip.appendChild(icon);
            const label = createEl('span', '', cat.label);
            chip.appendChild(label);
            
            chip.onclick = () => {
                if (typeof appRouter !== 'undefined' && appRouter) {
                    appRouter.navigate(`/search?q=${encodeURIComponent(cat.query)}`);
                } else {
                    window.performCategorySearch(cat.query);
                }
            };
            chipsRow.appendChild(chip);
        });
        return chipsRow;
    }

    if (isMobile) {
        const searchWrapper = document.getElementById('top-search-wrapper');
        const topRow = createEl('div');
        topRow.id = 'mobile-search-row';
        const makeMobileBtn = (originalBtn) => {
            if(!originalBtn) return;
            originalBtn.classList.add('mobile-header-btn');
            originalBtn.style.position = 'static'; 
        };
        const searchContainer = document.getElementById('main-search-container');
        if (searchContainer) topRow.appendChild(searchContainer);
        if(profileButton) { 
            makeMobileBtn(profileButton); 
            topRow.appendChild(profileButton);
        }
        
        const chipsRow = createChipsRow();
        clearEl(searchWrapper); 
        if (searchWrapper) {
            searchWrapper.appendChild(topRow);
            searchWrapper.appendChild(chipsRow);
        }
        
        if(profileButton && profileDropdown && searchWrapper) {
            searchWrapper.appendChild(profileDropdown);
        }
    } else {
        const searchWrapper = document.getElementById('top-search-wrapper');
        if (searchWrapper) {
            const chipsRow = createChipsRow();
            searchWrapper.appendChild(chipsRow);
        }
    }

    if (profileDropdown) {
        const settingsDivider = createEl('hr');
        settingsDivider.setAttribute('aria-hidden', 'true');
        
        const settingsActionDiv = createEl('div', 'profile-actions');
        const settingsLink = createEl('a');
        settingsLink.href = '#';
        settingsLink.role = 'menuitem';
        const settingsIcon = createIcon('settings');
        settingsIcon.style.verticalAlign = 'middle';
        settingsIcon.style.marginRight = '8px';
        settingsIcon.style.fontSize = '20px';
        
        settingsLink.appendChild(settingsIcon);
        settingsLink.appendChild(document.createTextNode('Settings'));
        settingsLink.onclick = (e) => {
            e.preventDefault();
            profileDropdown.style.display = 'none';
            renderSettingsModal();
        };
        
        settingsActionDiv.appendChild(settingsLink);
        profileDropdown.appendChild(settingsDivider);
        profileDropdown.appendChild(settingsActionDiv);
    }

    function getRecentsKey() {
        if (currentUser && currentUser.profile && currentUser.profile.sub) {
            return `${RECENT_SEARCHES_KEY}-${currentUser.profile.sub}`;
        }
        return null;
    }

    function getRecentSearches() {
        const key = getRecentsKey();
        if (!key) return []; 
        try { 
            const raw = JSON.parse(localStorage.getItem(key)) || [];
            const now = Date.now();
            const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
            const validItems = raw.filter(item => {
                if (!item.timestamp) item.timestamp = now;
                return (now - item.timestamp) < THIRTY_DAYS;
            });
            if (validItems.length !== raw.length) {
                localStorage.setItem(key, JSON.stringify(validItems));
            }
            return validItems;
        } catch(e) { return []; }
    }

    function addRecentSearch(place) {
        const key = getRecentsKey();
        if (!key || !place || !place.display_name) return;
        let searches = getRecentSearches();
        searches = searches.filter(item => item.display_name !== place.display_name);
        place.timestamp = Date.now();
        searches.unshift(place);
        if (searches.length > 5) { searches.length = 5; }
        localStorage.setItem(key, JSON.stringify(searches));
    }

    function showRecentSearches() {
        const recents = getRecentSearches();
        if (recents.length > 0) {
            clearEl(recentSearchesContainer);
            const header = createEl('div', 'suggestions-header', 'Recent Searches');
            header.setAttribute('role', 'presentation');
            if (recentSearchesContainer) recentSearchesContainer.appendChild(header);
            recents.forEach(place => {
                const item = createEl('button', 'recent-item search-result-item');
                item.style.width = '100%';
                item.style.textAlign = 'left';
                item.style.background = 'none';
                item.style.border = 'none';
                item.style.borderBottom = '1px solid var(--border-color)';
                const iconDiv = createEl('div', 'result-item-icon');
                iconDiv.appendChild(createIcon('history'));
                const detailsDiv = createEl('div', 'result-item-details');
                const h4 = createEl('h4', '', place.display_name.split(',')[0]);
                const p = createEl('p', '', place.display_name);
                detailsDiv.appendChild(h4);
                detailsDiv.appendChild(p);
                item.appendChild(iconDiv);
                item.appendChild(detailsDiv);
                item.addEventListener('click', () => { processPlaceResult(place); if (mainSuggestions) mainSuggestions.style.display = 'none'; });
                if (recentSearchesContainer) recentSearchesContainer.appendChild(item);
            });
            const initSuggestionsView = document.getElementById("initial-suggestions-view");
            if (initSuggestionsView) initSuggestionsView.hidden = false;
            if (apiSuggestionsView) apiSuggestionsView.hidden = true;
            if (mainSuggestions) mainSuggestions.style.display = 'block';
        } else {
            if (mainSuggestions) mainSuggestions.style.display = 'none';
        }
    }

    window.PanelRouter = {
        container: document.getElementById('dynamic-content'),
        toggleSearchBar(show) {
            const searchBar = document.getElementById('top-search-wrapper');
            const profileControls = document.getElementById('floating-profile-controls');
            if(searchBar) {
                if(show) {
                    searchBar.style.opacity = '1';
                    searchBar.style.pointerEvents = 'auto';
                    searchBar.style.transform = 'translateY(0)';
                    searchBar.style.zIndex = '100'; 
                } else {
                    searchBar.style.opacity = '0';
                    searchBar.style.pointerEvents = 'none';
                    searchBar.style.transform = 'translateY(-10px)';
                    searchBar.style.zIndex = '-1'; 
                }
            }
            if(profileControls && window.innerWidth < 768) {
                profileControls.style.opacity = show ? '1' : '0';
                profileControls.style.pointerEvents = show ? 'auto' : 'none';
            }
        },
        updateView(fragment) {
            if (this.container) {
                this.container.replaceChildren(fragment);
            }
            this.toggleSearchBar(false);
            const panel = document.getElementById('side-panel');
            if (panel) {
                panel.classList.add('open');
                if(window.innerWidth < 768) panel.classList.add('open-half');
            }
            setTimeout(() => { 
                if (this.container) {
                    const h = this.container.querySelector('h1, h3'); 
                    if(h) h.focus(); 
                }
            }, 50);
        },
        createResultItem(title, subtitle, onClick, distance = '', iconName = 'place', type = 'generic', placeData = null) {
            const template = document.getElementById('tmpl-result-item');
            if (!template) return createEl('div');
            const clone = template.content.cloneNode(true);
            const titleEl = clone.querySelector('.item-title');
            if (titleEl) titleEl.textContent = title;
            const subtitleEl = clone.querySelector('.item-subtitle');
            if (subtitleEl) subtitleEl.textContent = subtitle;
            const distEl = clone.querySelector('.result-item-distance');
            if (distEl) distEl.textContent = distance;
            const itemBtn = clone.querySelector('.search-result-item');
            const iconBox = clone.querySelector('.result-item-icon');
            
            if (iconBox) {
                clearEl(iconBox);
                if (distance === 'history') {
                    iconBox.appendChild(createIcon('history'));
                    if (distEl) distEl.textContent = '';
                } else if (iconName !== 'place') {
                    iconBox.appendChild(createIcon(iconName));
                } else {
                    iconBox.appendChild(createIcon('place'));
                }
            }

            if (itemBtn) {
                itemBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    onClick();
                 });
            }

            const imgBox = clone.querySelector('.result-item-image-box');
            const imgEl = clone.querySelector('.result-thumb');
            const iconBoxForList = clone.querySelector('.result-item-icon');
            
            if (placeData && imgBox && imgEl) {
                if (iconBoxForList && (type === 'search_result' || type === 'saved')) {
                    iconBoxForList.style.display = 'none';
                }

                PhotoService.getPhotoForPlace(placeData).then(photoUrl => {
                    imgBox.hidden = false;
                    if (photoUrl) {
                        imgEl.src = photoUrl;
                    } else {
                        imgBox.style.background = 'var(--surface-tertiary, #333)';
                        imgEl.hidden = true; 
                        const fallbackIcon = createIcon('storefront');
                        fallbackIcon.style.cssText = 'color: var(--text-secondary); font-size: 28px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;';
                        imgBox.appendChild(fallbackIcon);
                    }
                });
            }

            return clone;
        },
        renderSkeletonResults() {
            const template = document.getElementById('tmpl-search-results');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const headerText = clone.querySelector('#results-header-text');
            if (headerText) headerText.textContent = "Loading...";
            const listContainer = clone.querySelector('#search-results-list');
            if (listContainer) {
                for(let i=0; i<5; i++) {
                    const item = document.createElement('div');
                    item.className = 'search-result-item'; 
                    item.style.height = '80px';
                    item.style.opacity = '0.6';
                    listContainer.appendChild(item);
                }
            }
            const backBtn = clone.querySelector('#results-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                    else this.renderHome(); 
                });
            }
            this.updateView(clone);
        },
        renderHome() {
            this.toggleSearchBar(true);
            window.fullyClosePanel();
            document.title = "TheBoiisMC Maps | Private Navigation";
        },
        renderSavedPlaces() {
            const template = document.getElementById('tmpl-search-results');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const headerText = clone.querySelector('#results-header-text');
            if (headerText) headerText.textContent = 'Saved Places';
            const listContainer = clone.querySelector('#search-results-list');
            const saved = savedPlacesService.get();
            if (listContainer) {
                if (saved.length === 0) {
                    const noRes = document.createElement('div');
                    noRes.textContent = 'No saved places yet.';
                    noRes.style.padding = '20px';
                    noRes.style.textAlign = 'center';
                    listContainer.appendChild(noRes);
                } else {
                    saved.forEach(place => {
                        const itemFragment = this.createResultItem(
                            place.name || place.display_name.split(',')[0], 
                            place.display_name, 
                            () => processPlaceResult(place), 
                            '', 
                            'bookmark',
                            'saved',
                            place
                        );
                        listContainer.appendChild(itemFragment);
                    });
                }
            }
            const backBtn = clone.querySelector('#results-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                    else this.renderHome(); 
                });
            }
            this.updateView(clone);
        },
        renderPlaceDetails(place) {
            const title = place.name || place.text || (place.display_name ? place.display_name.split(',')[0].trim() : "Unknown Place");
            let subtitle = place.display_name || "";
            if (subtitle.toLowerCase().startsWith(title.toLowerCase())) {
                subtitle = subtitle.substring(title.length).replace(/^,\s*/, '').trim();
            }

            document.title = `${title} - TheBoiisMC Maps`;
            const template = document.getElementById('tmpl-place-details');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const nameEl = clone.querySelector('#info-name');
            const subEl = clone.querySelector('#info-subtitle');
            const imgEl = clone.querySelector('#info-image');
            const heroWrapper = clone.querySelector('.hero-image-wrapper');
            
            if (imgEl && heroWrapper) {
                imgEl.alt = `Photo of ${title}`;
                heroWrapper.style.minHeight = '220px'; 
                
                PhotoService.getPhotoForPlace(place).then(photoUrl => {
                    if (photoUrl) {
                        imgEl.src = photoUrl;
                        imgEl.onload = () => { imgEl.style.opacity = '1'; };
                    } else {
                        heroWrapper.style.background = PhotoService.getFallbackGradient(title);
                        imgEl.style.opacity = '0';
                    }
                });
            }

            if (nameEl) nameEl.textContent = title;
            if (subEl) subEl.textContent = subtitle;
            
            const factsEl = clone.querySelector('#quick-facts-content');
            if (factsEl) factsEl.textContent = "Loading details...";

            const coordsTextEl = clone.querySelector('#info-coords-text');
            if(coordsTextEl) coordsTextEl.textContent = `${parseFloat(place.lat).toFixed(5)}, ${parseFloat(place.lon).toFixed(5)}`;

            if (place.properties && place.properties.website) {
                const webBtn = clone.querySelector('#info-website-btn');
                if (webBtn) {
                    webBtn.style.display = 'flex';
                    webBtn.onclick = async (e) => {
                        e.preventDefault();
                        if (isNative && Plugins && Plugins.Browser) {
                            await Plugins.Browser.open({ url: place.properties.website }).catch(()=>{});
                        } else {
                            window.open(place.properties.website, '_blank', 'noopener,noreferrer');
                        }
                    };
                }
            }

            const shareBtn = clone.querySelector('#btn-details-share');
            if (shareBtn) {
                shareBtn.onclick = async () => {
                    const baseUrl = isNative ? 'https://maps.theboiismc.com' : window.location.origin;
                    const shareUrl = `${baseUrl}/place?name=${encodeURIComponent(title)}&lat=${place.lat}&lon=${place.lon}`;
                    const shareData = {
                        title: title,
                        text: `Check out this place on TheBoiisMC Maps:`,
                        url: shareUrl
                    };
                    try {
                        if (navigator.share) {
                            await navigator.share(shareData);
                        } else {
                            await navigator.clipboard.writeText(shareUrl);
                            showToast("Link copied to clipboard", "success");
                        }
                    } catch (err) {}
                };
            }

            const saveBtn = clone.querySelector('#btn-details-save');
            if (saveBtn) {
                const updateSaveState = () => {
                    if (savedPlacesService.isSaved(place)) {
                        saveBtn.classList.add('active');
                        clearEl(saveBtn);
                        saveBtn.appendChild(createIcon('bookmark'));
                        saveBtn.appendChild(document.createTextNode(' Saved'));
                    } else {
                        saveBtn.classList.remove('active');
                        clearEl(saveBtn);
                        saveBtn.appendChild(createIcon('bookmark_border'));
                        saveBtn.appendChild(document.createTextNode(' Save'));
                    }
                };
                updateSaveState();
                saveBtn.onclick = () => { savedPlacesService.toggle(place); updateSaveState(); };
            }

            const backBtn = clone.querySelector('#details-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearSearchResultMarkers();
                    if (clickedLocationMarker) { clickedLocationMarker.remove(); clickedLocationMarker = null; }
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                    else this.renderHome();
                });
            }
            const dirBtn = clone.querySelector('#btn-details-dir');
            if (dirBtn) {
                dirBtn.addEventListener('click', () => {
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/directions');
                    else this.renderDirections(place);
                });
            }
            this.updateView(clone);
        },
        renderDirections(destinationPlace = null) {
            const destName = destinationPlace ? (destinationPlace.name || destinationPlace.text) : "Destination";
            document.title = destinationPlace ? `Directions to ${destName} - TheBoiisMC Maps` : `Directions - TheBoiisMC Maps`;
            const destVal = destinationPlace ? destinationPlace.display_name : '';
            const destCoords = destinationPlace ? `${destinationPlace.lon},${destinationPlace.lat}` : '';
            const template = document.getElementById('tmpl-directions');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const fromIn = clone.querySelector('#panel-from-input');
            const toIn = clone.querySelector('#panel-to-input');
            if(toIn) { toIn.value = destVal; toIn.dataset.coords = destCoords; }
            
            const modeBtns = clone.querySelectorAll('.travel-mode-btn');
            modeBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    modeBtns.forEach(b => { b.classList.remove('active'); });
                    e.currentTarget.classList.add('active');
                });
            });
            attachSuggestionListener(fromIn, clone.querySelector('#panel-from-suggestions'), (place) => { 
                if (fromIn) {
                    fromIn.value = place.display_name; 
                    fromIn.dataset.coords = `${place.lon},${place.lat}`; 
                }
            });
            attachSuggestionListener(toIn, clone.querySelector('#panel-to-suggestions'), (place) => { 
                if (toIn) {
                    toIn.value = place.display_name; 
                    toIn.dataset.coords = `${place.lon},${place.lat}`; 
                }
            });
            const getRouteBtn = clone.querySelector('#get-route-btn');
            if (getRouteBtn) getRouteBtn.addEventListener('click', () => getRoute());

            const swapBtn = clone.querySelector('#swap-btn');
            if (swapBtn) {
                swapBtn.addEventListener('click', () => {
                    if (fromIn && toIn) {
                        const tempV = fromIn.value; const tempC = fromIn.dataset.coords;
                        fromIn.value = toIn.value; fromIn.dataset.coords = toIn.dataset.coords;
                        toIn.value = tempV; toIn.dataset.coords = tempC;
                    }
                });
            }

            const handleClose = (e) => {
                if(e) e.stopPropagation();
                clearRouteFromMap();
                if (typeof appRouter !== 'undefined' && appRouter) {
                    appRouter.navigate(currentPlace ? `/place?name=${encodeURIComponent(currentPlace.name || '')}&lat=${currentPlace.lat}&lon=${currentPlace.lon}` : '/');
                } else {
                    if (currentPlace) { this.renderPlaceDetails(currentPlace); } else { this.renderHome(); }
                }
            };
            const closeBtn = clone.querySelector('#directions-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', handleClose);
            
            const cancelBtn = clone.querySelector('#cancel-route-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', handleClose);
            
            const myLocBtn = clone.querySelector('#dir-use-my-location');
            if (myLocBtn) {
                myLocBtn.addEventListener('click', () => {
                    if (!navigator.geolocation) return showToast("Geolocation not supported.", "error");
                    if (fromIn) fromIn.value = "Locating...";
                    navigator.geolocation.getCurrentPosition(
                        (pos) => { 
                            if (fromIn) {
                                fromIn.value = "Your Location"; 
                                fromIn.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`; 
                            }
                            announce("Location found"); 
                        },
                        () => { if (fromIn) fromIn.value = ""; showToast("Location denied.", "error"); }
                    );
                });
            }
            this.updateView(clone);
        },
        renderRoutePreview() {
            const template = document.getElementById('tmpl-route-preview');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const route = alternativeRoutes[selectedRouteIndex];
            if(!route) return;
            
            const timeDisplay = clone.querySelector('#route-time-display');
            if (timeDisplay) {
                timeDisplay.textContent = formatDuration(route.duration);
                timeDisplay.style.color = selectedRouteIndex === 0 ? '#10B981' : '#6366F1';
            }
            
            const distDisplay = clone.querySelector('#route-dist-display');
            if (distDisplay) distDisplay.textContent = `${formatDistance(route.distance)} • via ${route.legs[0].summary || 'Road'}`;
            
            const altContainer = clone.querySelector('#route-alternatives-container');
            if (altContainer) {
                if (alternativeRoutes.length > 1) {
                    alternativeRoutes.forEach((r, idx) => {
                        const card = document.createElement('button');
                        card.className = `route-option-card ${idx === selectedRouteIndex ? 'selected' : ''}`;
                        const time = Math.round(r.duration / 60);
                        const diff = time - Math.round(alternativeRoutes[0].duration / 60);
                        const diffStr = diff > 0 ? `+${diff} min` : (idx===0 ? 'Best' : `${diff} min`);
                        
                        if(idx === 0) {
                            const tag = document.createElement('span');
                            tag.className = 'route-tag';
                            tag.textContent = 'Fastest';
                            card.appendChild(tag);
                        }
                        
                        const timeDiv = document.createElement('div');
                        timeDiv.className = 'r-time';
                        timeDiv.textContent = formatDuration(r.duration);
                        card.appendChild(timeDiv);

                        const distDiv = document.createElement('div');
                        distDiv.className = 'r-dist';
                        distDiv.textContent = formatDistance(r.distance);
                        card.appendChild(distDiv);

                        const diffDiv = document.createElement('div');
                        diffDiv.style.fontSize = '11px';
                        diffDiv.style.marginTop = '4px';
                        diffDiv.style.color = diff > 0 ? '#EF4444' : '#10B981';
                        diffDiv.textContent = diffStr;
                        card.appendChild(diffDiv);
                        card.onclick = () => selectRoute(idx);
                        altContainer.appendChild(card);
                    });
                } else { 
                    altContainer.style.display = 'none';
                }
            }

            const stepsContainer = clone.querySelector('#route-steps-list');
            const stepsBtn = clone.querySelector('#btn-toggle-steps');
            if (stepsBtn && stepsContainer) {
                stepsBtn.onclick = () => {
                    const isHidden = stepsContainer.hidden;
                    stepsContainer.hidden = !isHidden;
                    if(isHidden && stepsContainer.children.length === 0) {
                        route.legs[0].steps.forEach(step => {
                            const row = document.createElement('div');
                            row.className = 'step-row';
                            const iconSpan = createIcon(getManeuverIcon(step.maneuver.type, step.maneuver.modifier));
                            iconSpan.classList.add('step-icon');
                            row.appendChild(iconSpan);

                            const instrDiv = document.createElement('div');
                            instrDiv.className = 'step-instr';
                            instrDiv.textContent = formatOsrmInstruction(step);
                            row.appendChild(instrDiv);

                            const distDiv = document.createElement('div');
                            distDiv.className = 'step-dist';
                            distDiv.textContent = formatDistance(step.distance);
                            row.appendChild(distDiv);

                            stepsContainer.appendChild(row);
                        });
                    }
                };
            }
            
            const startNavBtn = clone.querySelector('#start-navigation-btn');
            if (startNavBtn) startNavBtn.addEventListener('click', startNavigation);
            
            const backBtn = clone.querySelector('#back-to-directions-btn');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    clearRouteFromMap(); 
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/directions');
                    else this.renderDirections(); 
                });
            }
            this.updateView(clone);
        },
        renderSearchResults(features, query) {
            document.title = `${query} - TheBoiisMC Maps`;
            const template = document.getElementById('tmpl-search-results');
            if (!template) return;
            const clone = template.content.cloneNode(true);
            const headerText = clone.querySelector('#results-header-text');
            if (headerText) headerText.textContent = `Results for "${query}"`;
            const listContainer = clone.querySelector('#search-results-list');
            if (listContainer) {
                if(!features.length) {
                    const noRes = document.createElement('div');
                    noRes.textContent = 'No results found.';
                    noRes.style.padding = '20px';
                    noRes.style.textAlign = 'center';
                    listContainer.appendChild(noRes);
                } else {
                    features.forEach((item) => {
                        const dist = item.distance ? formatDistance(item.distance * 1609.34) : '';
                        const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox, properties: item.properties, text: item.text, name: item.text };
                        const itemFragment = this.createResultItem(
                            item.text, 
                            item.place_name, 
                            () => processPlaceResult(place), 
                            dist, 
                            'place', 
                            'search_result',
                            place
                        );
                        listContainer.appendChild(itemFragment);
                    });
                }
            }
            const backBtn = clone.querySelector('#results-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => { 
                    e.stopPropagation(); 
                    clearSearchResultMarkers(); 
                    if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                    else this.renderHome(); 
                });
            }
            this.updateView(clone);
        }
    };

    window.performCategorySearch = async function(query, skipRoute = false) {
        PanelRouter.renderSkeletonResults();
        const center = map.getCenter();
        const proximity = `${center.lng},${center.lat}`;

        const features = await SearchService.query(query, proximity, null, 'poi');
        if (!features || features.length === 0) {
            if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
            else PanelRouter.renderHome();
            return;
        }

        const enrichedFeatures = features.map(item => {
            const userLoc = currentLastKnownPosition ? currentLastKnownPosition.coords : [center.lng, center.lat];
            return {
                ...item,
                distance: turf.distance(turf.point(userLoc), turf.point(item.center), {units: 'miles'})
            };
        }).sort((a,b) => a.distance - b.distance);

        renderMarkersAndList(enrichedFeatures, query, appSettings.get('source').search, skipRoute);
    };

    let initialCenter = [-95, 39];
    locationService.getLastLocation().then(saved => { if (saved && map && map.getZoom() < 4) map.jumpTo({ center: saved, zoom: 15 }); });
    map = new maplibregl.Map({
        container: "map",
        center: initialCenter,
        zoom: 3,
        pitch: 0,
        dragRotate: false,
        touchPitch: false,
        scrollZoom: true,
        renderWorldCopies: !isMobile,
        maxZoom: 22,
        minZoom: 1,
    });

    map.getCanvasContainer().addEventListener('touchstart', onUserInteraction, { passive: true });
    map.getCanvasContainer().addEventListener('mousedown', onUserInteraction, { passive: true });
    map.on('dragstart', onUserInteraction);
    map.on('zoomstart', onUserInteraction);
    
    loadMapStyle();
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({ 
        positionOptions: { enableHighAccuracy: true }, 
        trackUserLocation: true, 
        showUserHeading: true 
    });
    geolocateControl.on('geolocate', (e) => { 
        currentLastKnownPosition = { coords: [e.coords.longitude, e.coords.latitude], bearing: e.coords.heading || 0 };
        locationService.save([e.coords.longitude, e.coords.latitude]); 
    });
    map.addControl(geolocateControl, "bottom-right");

    const scaleControl = new maplibregl.ScaleControl({
        maxWidth: 150,
        unit: appSettings.get('units') || 'imperial'
    });
    map.addControl(scaleControl, "bottom-right");

    const updateProfileUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const profileBtn = document.getElementById('profile-button');
        const loggedInView = document.getElementById('logged-in-view');
        const loggedOutView = document.getElementById('logged-out-view');
        const avatarImg = document.getElementById('dropdown-avatar');
        const nameDiv = document.querySelector('.profile-section .username');
        const emailDiv = document.querySelector('.profile-section .email');
        const mainInput = document.getElementById("main-search");
        const headerSavedBtn = document.getElementById('saved-places-btn');
        const drawerContent = document.querySelector('.drawer-content');
        const existingDrawerProfile = document.getElementById('drawer-profile-injection');
        if(existingDrawerProfile) existingDrawerProfile.remove();
        
        const sidebarProfile = createEl('div', 'drawer-profile-section');
        sidebarProfile.id = 'drawer-profile-injection';
        if (headerSavedBtn) {
            headerSavedBtn.onclick = (e) => {
                e.preventDefault();
                if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/saved');
                else PanelRouter.renderSavedPlaces();
                if(profileDropdown) profileDropdown.style.display = 'none';
            };
        }

        if (currentUser) {
            if(loggedInView) loggedInView.hidden = false;
            if(loggedOutView) loggedOutView.hidden = true;
            const avatarUrl = currentUser.profile.picture || null;
            if (avatarImg) { avatarImg.src = avatarUrl || 'https://www.gravatar.com/avatar/?d=mp'; avatarImg.hidden = false; }
            if (nameDiv) nameDiv.textContent = currentUser.profile.name || "User";
            if (emailDiv) emailDiv.textContent = currentUser.profile.email || "";
            if (profileBtn) {
                clearEl(profileBtn);
                if (avatarUrl) {
                    profileBtn.style.backgroundImage = `url('${avatarUrl}')`;
                    profileBtn.style.backgroundSize = 'cover';
                } else {
                    const initial = (currentUser.profile.name || "U").charAt(0).toUpperCase();
                    profileBtn.textContent = initial;
                    profileBtn.style.background = 'var(--brand-primary)';
                    profileBtn.style.color = 'white';
                    profileBtn.style.fontWeight = 'bold';
                }
                profileBtn.style.border = '2px solid var(--brand-primary)';
            }
            const firstName = (currentUser.profile.name || "User").split(' ')[0];
            if (mainInput) mainInput.placeholder = `Where to, ${firstName}?`;
            const userCard = createEl('div', 'drawer-user-card');
            const sbAvatar = createEl('img', 'drawer-avatar');
            sbAvatar.src = avatarUrl || 'https://www.gravatar.com/avatar/?d=mp';
            const sbInfo = createEl('div');
            const sbName = createEl('div', 'drawer-username', currentUser.profile.name);
            const sbEmail = createEl('div', 'drawer-email', currentUser.profile.email);
            sbInfo.appendChild(sbName); sbInfo.appendChild(sbEmail);
            userCard.appendChild(sbAvatar); userCard.appendChild(sbInfo);
            const savedBtn = createEl('button', 'drawer-auth-btn', 'Saved Places');
            savedBtn.style.marginBottom = '8px';
            savedBtn.style.background = 'var(--surface-floating)';
            savedBtn.style.color = 'var(--text-primary)';
            savedBtn.style.border = '1px solid var(--border-color)';
            savedBtn.onclick = (e) => { 
                e.preventDefault();
                if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/saved');
                else PanelRouter.renderSavedPlaces(); 
                const closeDrawerBtn = document.getElementById('close-drawer-btn');
                if(closeDrawerBtn) closeDrawerBtn.click();
            };
            const logoutBtn = createEl('button', 'drawer-auth-btn', 'Log Out');
            logoutBtn.onclick = (e) => { e.preventDefault(); authService.logout(); };
            sidebarProfile.appendChild(userCard);
            sidebarProfile.appendChild(savedBtn);
            sidebarProfile.appendChild(logoutBtn);
        } else {
            if(loggedInView) loggedInView.hidden = true;
            if(loggedOutView) loggedOutView.hidden = false;
            if (profileBtn) {
                profileBtn.style.backgroundImage = 'none';
                profileBtn.style.border = '1px solid var(--border-color)';
                profileBtn.style.background = 'var(--surface-floating)';
                clearEl(profileBtn);
                profileBtn.appendChild(createIcon('account_circle'));
            }
            if (mainInput) mainInput.placeholder = 'Search TheBoiisMC Maps';
            const loginMsg = createEl('div', 'drawer-username', 'Sign in to Maps');
            loginMsg.style.marginBottom = '10px';
            loginMsg.style.textAlign = 'center';
            const loginBtn = createEl('button', 'drawer-auth-btn', 'Log In');
            loginBtn.onclick = (e) => { e.preventDefault(); authService.login(); };
            sidebarProfile.appendChild(loginMsg);
            sidebarProfile.appendChild(loginBtn);
        }
        if(drawerContent) drawerContent.prepend(sidebarProfile);
    };

    if (window.location.pathname.endsWith("callback.html")) {
        try { await authService.handleCallback(); window.location.href = "/"; } catch (e) { window.location.href = "/"; }
        return;
    }
    
    const loginBtn = document.getElementById('login-btn');
    if(loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

    authService.getUser().then(user => updateProfileUI(user)).catch(() => updateProfileUI(null));

    const drawer = document.getElementById('sidebar-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    function openDrawer() { if(drawer) drawer.classList.add('open'); if(drawerOverlay) drawerOverlay.classList.add('open'); }
    function closeDrawer() { if(drawer) drawer.classList.remove('open'); if(drawerOverlay) drawerOverlay.classList.remove('open'); }
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(); });
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
    if (drawer) { drawer.querySelectorAll('a, button').forEach(link => { if(!link.classList.contains('drawer-auth-btn') && !link.onclick) { link.addEventListener('click', closeDrawer); } }); }

    document.addEventListener('click', (e) => {
        const targetIsProfile = e.target.closest('#profile-button');
        const targetIsDropdown = e.target.closest('#profile-dropdown');
        if (!targetIsProfile && !targetIsDropdown) { if(profileDropdown) profileDropdown.style.display = 'none'; }
        if (appMenuButton && !appMenuButton.contains(e.target) && servicesDropdown) servicesDropdown.classList.remove('open');
        if (contextMenu && contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        if (mainSearchContainer && !mainSearchContainer.contains(e.target) && mainSuggestions) mainSuggestions.style.display = 'none';
    });

    if(profileButton) {
        profileButton.addEventListener('click', (e) => { 
            e.stopPropagation(); e.preventDefault();
            if(profileDropdown) {
                const isHidden = window.getComputedStyle(profileDropdown).display === 'none';
                profileDropdown.style.display = isHidden ? 'block' : 'none';
            }
        });
    }
    if(appMenuButton) {
        appMenuButton.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (servicesDropdown) servicesDropdown.classList.toggle('open'); 
        });
    }
    if(endNavigationBtn) endNavigationBtn.addEventListener('click', endNavigation); 
    if (mainDirectionsIcon) { 
        mainDirectionsIcon.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/directions');
            else PanelRouter.renderDirections(); 
        });
    }

    map.on('contextmenu', (e) => {
        e.preventDefault();
        contextMenuLngLat = e.lngLat;
        if (contextMenuCoords) contextMenuCoords.textContent = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
        if (contextMenu) {
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.point.x}px`;
            contextMenu.style.top = `${e.point.y}px`;
        }
    });
    
    const ctxDirFrom = document.getElementById('ctx-directions-from');
    if (ctxDirFrom) {
        ctxDirFrom.addEventListener('click', () => {
             const tempPlace = { lon: contextMenuLngLat.lng, lat: contextMenuLngLat.lat, display_name: `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}` };
             if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/directions');
             else PanelRouter.renderDirections(null); 
             setTimeout(() => { 
                 const fromIn = document.getElementById('panel-from-input');
                 if(fromIn) { fromIn.value = tempPlace.display_name; fromIn.dataset.coords = `${tempPlace.lon},${tempPlace.lat}`; }
             }, 50);
        });
    }

    const ctxDirTo = document.getElementById('ctx-directions-to');
    if (ctxDirTo) {
        ctxDirTo.addEventListener('click', () => {
            const tempPlace = { lon: contextMenuLngLat.lng, lat: contextMenuLngLat.lat, display_name: `${contextMenuLngLat.lat.toFixed(5)}, ${contextMenuLngLat.lng.toFixed(5)}` };
            currentPlace = tempPlace;
            if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/directions');
            else PanelRouter.renderDirections(tempPlace);
        });
    }

    const ctxWhatsHere = document.getElementById('ctx-whats-here');
    if (ctxWhatsHere) {
        ctxWhatsHere.addEventListener('click', async () => {
            const url = `https://api.maptiler.com/geocoding/${contextMenuLngLat.lng.toFixed(6)},${contextMenuLngLat.lat.toFixed(6)}.json?key=${MAPTILER_KEY}&limit=1`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if(data.features && data.features.length) {
                    const item = data.features[0];
                    processPlaceResult({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox });
                }
            } catch(e) {}
        });
    }

    map.on('click', async (e) => {
        const target = e.originalEvent.target;
        if (target.closest('.maplibregl-ctrl, #side-panel, #context-menu, .maplibregl-marker')) return;
        if (isMobile) {
            const panel = document.getElementById('side-panel');
            if (panel && (panel.classList.contains('open') || panel.classList.contains('open-full'))) {
                window.fullyClosePanel();
                if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/');
                return;
            }
        }
        if (map.getLayer('route-line-main') && map.queryRenderedFeatures(e.point, { layers: ['route-line-main'] }).length > 0) return;
        
        const style = map.getStyle();
        if (!style) return;
        const candidateLayers = style.layers.filter(l => (l.id.includes('poi') || l.id.includes('label') || l.id.includes('icon') || l.type === 'symbol') && !l.id.includes('road')).map(l => l.id);
        const bbox = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
        const features = map.queryRenderedFeatures(bbox, { layers: candidateLayers });
        const validFeature = features.find(f => f.properties && (f.properties.name || f.properties.name_en));
        if (validFeature) {
            const props = validFeature.properties;
            const name = props.name || props.name_en || props.text;
            if (name) {
                const place = {
                    lon: validFeature.geometry.type === 'Point' ? validFeature.geometry.coordinates[0] : e.lngLat.lng,
                    lat: validFeature.geometry.type === 'Point' ? validFeature.geometry.coordinates[1] : e.lngLat.lat,
                    display_name: name, name: name, text: name, bbox: null, properties: props
                };
                processPlaceResult(place);
                return; 
            }
        }
    });

    function getSearchProximity() {
        if (currentLastKnownPosition && currentLastKnownPosition.coords) {
            return `${currentLastKnownPosition.coords[0]},${currentLastKnownPosition.coords[1]}`;
        }
        const center = map.getCenter();
        return `${center.lng},${center.lat}`;
    }

    function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
        if(!inputEl || !suggestionsEl) return;
        const fetchAndDisplaySuggestions = async (query) => {
            if (appSettings.get('privacy').disableSuggestions || query.length < 3) { suggestionsEl.style.display = "none"; return; }
            
            const features = await SearchService.query(query, getSearchProximity());
            clearEl(suggestionsEl);
            if(!features || features.length === 0) {
                suggestionsEl.style.display = "none";
                return;
            }
            features.forEach(item => {
                const el = createEl('button', 'search-result-item');
                el.style.width = '100%'; el.style.textAlign = 'left'; el.style.background = 'none'; el.style.border = 'none'; el.style.borderBottom = '1px solid var(--border-color)';
                const iconDiv = createEl('div', 'result-item-icon');
                iconDiv.appendChild(createIcon('location_on'));
                const detailsDiv = createEl('div', 'result-item-details');
                const h4 = createEl('h4');
                appendHighlightedText(h4, item.text, query);
                const p = createEl('p');
                appendHighlightedText(p, item.place_name || '', query);
                detailsDiv.appendChild(h4); detailsDiv.appendChild(p);
                el.appendChild(iconDiv); el.appendChild(detailsDiv);
                el.addEventListener("click", (e) => {
                    e.preventDefault(); 
                    onSelect({ lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox });
                    suggestionsEl.style.display = "none";
                });
                suggestionsEl.appendChild(el);
            });
            suggestionsEl.style.display = "block";
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
    }

    if (mainSearchInput) {
        mainSearchInput.addEventListener('focus', showRecentSearches);
        mainSearchInput.addEventListener('input', () => {
            const query = mainSearchInput.value.trim();
            if (query) {
                 if (appSettings.get('privacy').disableSuggestions) { if (apiSuggestionsView) apiSuggestionsView.style.display = "none"; return; }
                 if (query.length < 3) { if (mainSuggestions) mainSuggestions.style.display = "none"; return; }
                 const initView = document.getElementById("initial-suggestions-view");
                 if (initView) initView.hidden = true;
                 if (apiSuggestionsView) apiSuggestionsView.hidden = false;
                 if (mainSuggestions) mainSuggestions.style.display = "block";
                 const fetchMainSuggestions = debounce(async (q) => {
                     const features = await SearchService.query(q, getSearchProximity());
                     clearEl(apiSuggestionsView);
                     features.forEach(item => {
                         const el = createEl('button', 'search-result-item');
                         el.style.width = '100%'; el.style.textAlign = 'left'; el.style.background = 'none'; el.style.border = 'none'; el.style.borderBottom = '1px solid var(--border-color)';
                         const iconDiv = createEl('div', 'result-item-icon');
                         iconDiv.appendChild(createIcon('location_on'));
                         const detailsDiv = createEl('div', 'result-item-details');
                         const h4 = createEl('h4');
                         appendHighlightedText(h4, item.text, q);
                         const p = createEl('p');
                         appendHighlightedText(p, item.place_name || '', q);
                         detailsDiv.appendChild(h4); detailsDiv.appendChild(p);
                         el.appendChild(iconDiv); el.appendChild(detailsDiv);
                         el.addEventListener("click", (e) => {
                             e.preventDefault();
                             const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox };
                             processPlaceResult(place);
                             if (mainSuggestions) mainSuggestions.style.display = "none";
                         });
                         if (apiSuggestionsView) apiSuggestionsView.appendChild(el);
                     });
                 }, 300);
                 fetchMainSuggestions(query);
            } else {
                showRecentSearches();
            }
        });

        mainSearchInput.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter') { 
                performSmartSearch(mainSearchInput, processPlaceResult); 
                if (mainSuggestions) mainSuggestions.style.display = 'none'; 
            } 
        });
    }

    const searchTriggerBtn = document.getElementById('search-trigger-btn');
    if(searchTriggerBtn) { searchTriggerBtn.addEventListener('click', () => performSmartSearch(mainSearchInput, processPlaceResult)); }

    function getEditDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    }

    function detectCategoryIntent(query) {
        const cleanQuery = query.toLowerCase().trim();
        for (const cat of KNOWN_CATEGORIES) {
            if (cat.label === cleanQuery || cat.synonyms.includes(cleanQuery)) return cat.label;
        }
        let bestMatch = null;
        let lowestDist = Infinity;
        for (const cat of KNOWN_CATEGORIES) {
            const wordsToCheck = [cat.label, ...cat.synonyms];
            for (const word of wordsToCheck) {
                const dist = getEditDistance(cleanQuery, word);
                const allowedErrors = cleanQuery.length < 5 ? 1 : 2;
                if (dist <= allowedErrors && dist < lowestDist) {
                    lowestDist = dist;
                    bestMatch = cat.label;
                }
            }
        }
        return bestMatch;
    }

    async function performSmartSearch(inputEl, onSelect) {
        const rawQuery = inputEl && inputEl.value !== undefined ? inputEl.value : inputEl; 
        const query = rawQuery ? rawQuery.trim() : "";
        if (!query) return;

        const detectedCategory = detectCategoryIntent(query);
        if (detectedCategory) {
            if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate(`/search?q=${encodeURIComponent(detectedCategory)}`);
            else window.performCategorySearch(detectedCategory);
            return;
        }

        const features = await SearchService.query(query, getSearchProximity());
        if (features && features.length > 0) {
            const item = features[0];
            onSelect({ 
                lon: item.center[0], 
                lat: item.center[1], 
                display_name: item.place_name, 
                text: item.text, 
                bbox: item.bbox 
            });
        } else { 
            if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate(`/search?q=${encodeURIComponent(query)}`);
            else window.performCategorySearch(query);
        }
    }

    function renderMarkersAndList(features, query, sourceLabel, skipRoute = false) {
        clearSearchResultMarkers();
        const markersBounds = new maplibregl.LngLatBounds();
        if(features.length > 0) markersBounds.extend(features[0].center);
        features.forEach(item => {
            const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name, bbox: item.bbox, properties: item.properties, text: item.text, name: item.text };
            const markerEl = document.createElement('div');
            markerEl.style.width = '25px'; markerEl.style.height = '40px';
            const svg = createMarkerSVG();
            markerEl.appendChild(svg);
            const marker = new maplibregl.Marker({ element: markerEl }).setLngLat(item.center).addTo(map);
            markerEl.addEventListener('click', (e) => { e.stopPropagation(); processPlaceResult(place); });
            searchResultMarkers.push(marker);
            markersBounds.extend(item.center);
        });
        if (features.length > 0) {
            map.fitBounds(markersBounds, { padding: 80, maxZoom: 15 });
            if (!skipRoute && typeof appRouter !== 'undefined' && appRouter) {
                appRouter.navigate(`/search?q=${encodeURIComponent(query)}`);
            } else {
                PanelRouter.renderSearchResults(features, query);
            }
        } else {
            showToast("No results found.", "error");
        }
    }

    function processPlaceResult(place, skipRoute = false) {
        addRecentSearch(place);
        currentPlace = place;
        clearRouteFromMap();
        clearSearchResultMarkers();
        if (clickedLocationMarker) clickedLocationMarker.remove();
        const lon = parseFloat(place.lon).toFixed(6);
        const lat = parseFloat(place.lat).toFixed(6);
        clickedLocationMarker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
        if (place.bbox) map.fitBounds(place.bbox, { padding: 100, maxZoom: 16 });
        else map.flyTo({ center: [lon, lat], zoom: 15 });
        
        if (!skipRoute && typeof appRouter !== 'undefined' && appRouter) {
            const title = place.name || place.text || (place.display_name ? place.display_name.split(',')[0].trim() : "Unknown Place");
            appRouter.navigate(`/place?name=${encodeURIComponent(title)}&lat=${lat}&lon=${lon}`);
        } else {
            PanelRouter.renderPlaceDetails(place);
        }
    }

    function clearSearchResultMarkers() {
        searchResultMarkers.forEach(marker => marker.remove());
        searchResultMarkers = [];
    }

    function clearRouteFromMap() {
        ['route-line-main', 'route-line-casing', 'route-line-alt', 'next-maneuver-segment', 'approach-line-layer'].forEach(id => { if(map.getLayer(id)) map.removeLayer(id); });
        ['route', 'route-casing', 'route-alt', 'next-maneuver-segment', 'approach-line'].forEach(id => { if(map.getSource(id)) map.removeSource(id); });
    }

    function formatOsrmInstruction(step) {
        if (!step || !step.maneuver) return 'Continue';
        const { type, modifier } = step.maneuver;
        const name = (step.name && step.name !== 'default') ? step.name.split(',')[0] : '';
        const onto = (str) => (name ? `${str} onto ${name}` : str);
        const on = (str) => (name ? `${str} on ${name}` : str);
        switch (type) {
            case 'depart': return name ? `Head towards ${name}` : "Start navigation";
            case 'arrive': return `Destination on the ${modifier}`;
            case 'turn': return onto(`Turn ${modifier}`);
            case 'off ramp': return onto(`Take exit ${modifier}`);
            case 'fork': return onto(`Keep ${modifier} at fork`);
            case 'roundabout': return onto(`Take the exit`);
            case 'merge': return onto(`Merge ${modifier}`);
            case 'new name': return `Continue onto ${name}`;
            case 'notification': return `Continue straight`;
            default: return on(`Continue ${modifier || ''}`.trim());
        }
    }

    async function getRoute(startCoordsOverride = null) {
        window.getRoute = getRoute;
        const fromInput = document.getElementById('panel-from-input');
        const toInput = document.getElementById('panel-to-input');
        const isManualOverride = Array.isArray(startCoordsOverride);

        if ((!fromInput || !toInput) && !isManualOverride) return;
        if (!isManualOverride) clearRouteFromMap();

        try {
            const getCoords = async (inp) => {
                if (inp.dataset.coords) return inp.dataset.coords.split(',').map(Number);
                const features = await SearchService.query(inp.value);
                if(!features || !features.length) throw new Error(`Could not find "${inp.value}"`);
                return features[0].center; 
            };

            let start, end;
            if (isManualOverride) {
                start = startCoordsOverride;
                end = navigationState.destinationCoords;
            } else {
                start = await getCoords(fromInput);
                end = await getCoords(toInput);
                navigationState.destinationCoords = end; 
                navigationState.isCustomStart = (fromInput.value !== "Your Location" && fromInput.value !== "Locating...");
            }
            
            const providerKey = appSettings.get('source').routing;
            const provider = DATA_PROVIDERS.routing[providerKey] || DATA_PROVIDERS.routing.osrm;
            
            let url = '';
            const coordStr = `${start.join(',')};${end.join(',')}`;
            
            url = `${provider.url}/${coordStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Route calculation failed");
            const data = await res.json();
            if (data.code && data.code !== "Ok") return showToast("No route found.", "error");

            currentRouteData = data;
            alternativeRoutes = data.routes || [];
            selectedRouteIndex = 0;

            if (!isManualOverride) {
                drawRoutesOnMap();
                const bounds = new maplibregl.LngLatBounds();
                alternativeRoutes[0].geometry.coordinates.forEach(c => bounds.extend(c));
                map.fitBounds(bounds, { padding: isMobile ? { top: 50, bottom: 300, left: 20, right: 20 } : 100 });
                if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/route-preview');
                else PanelRouter.renderRoutePreview();
            } else {
                navigationState.currentStepIndex = 0;
                navigationState.totalDistance = alternativeRoutes[0].distance;
                const firstStep = alternativeRoutes[0].legs[0].steps[0];
                NavUI.updateStep(firstStep, 'Proceed');
                speechService.speak("Rerouting... " + formatOsrmInstruction(firstStep), true);
                const geo = { type: 'Feature', geometry: alternativeRoutes[0].geometry };
                if (map.getSource('route')) map.getSource('route').setData(geo);
            }
        } catch (e) { showToast(e.message, "error"); }
    }
    window.getRoute = getRoute;

    function drawRoutesOnMap() {
        if(map.getSource('route')) map.getSource('route').setData({type:'FeatureCollection', features:[]});
        if(map.getSource('route-alt')) map.getSource('route-alt').setData({type:'FeatureCollection', features:[]});
        const selectedGeo = { type: 'Feature', geometry: alternativeRoutes[selectedRouteIndex].geometry };
        const altFeatures = alternativeRoutes.map((r, i) => {
            if (i === selectedRouteIndex) return null;
            return { type: 'Feature', geometry: r.geometry, properties: { index: i } };
        }).filter(Boolean);
        if (!map.getSource('route')) {
            map.addSource('route', { type: 'geojson', data: selectedGeo });
            map.addLayer({
                id: 'route-line-main', type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#0d89ec', 'line-width': 6 }
            });
            map.addSource('route-alt', { type: 'geojson', data: { type: 'FeatureCollection', features: altFeatures } });
            map.addLayer({
                id: 'route-line-alt', type: 'line', source: 'route-alt',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#94A3B8', 'line-width': 5, 'line-dasharray': [1, 2] }
            }, 'route-line-main');
            map.on('click', 'route-line-alt', (e) => {
                if(e.features[0].properties.index !== undefined) { selectRoute(e.features[0].properties.index); }
            });
            map.on('mouseenter', 'route-line-alt', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'route-line-alt', () => map.getCanvas().style.cursor = '');
        } else {
            map.getSource('route').setData(selectedGeo);
            map.getSource('route-alt').setData({ type: 'FeatureCollection', features: altFeatures });
        }
    }

    window.selectRoute = function(index) {
        selectedRouteIndex = index;
        drawRoutesOnMap();
        if (typeof appRouter !== 'undefined' && appRouter) appRouter.navigate('/route-preview');
        else PanelRouter.renderRoutePreview();
    };

    function startNavigation() {
        if (!alternativeRoutes || !alternativeRoutes[selectedRouteIndex]) return showToast("No route selected.", "error");
        navigationState.isActive = true;
        navigationState.isCameraLocked = true;
        navigationState.currentStepIndex = 0;
        navigationState.offRouteCounter = 0;
        navigationState.lastGpsTimestamp = Date.now();
        navigationState.currentSpeedMps = 0;
        navigationState.lastDisplayCoords = null;
        navigationState.lastDistToManeuver = undefined;

        window.history.pushState({ nav: true }, '', window.location.href);
        document.body.classList.add('nav-active');
        window.fullyClosePanel();
        PanelRouter.toggleSearchBar(false);

        NavUI.init();

        const floatProfile = document.getElementById('floating-profile-controls');
        if (floatProfile) {
            floatProfile.style.opacity = '0';
            floatProfile.style.pointerEvents = 'none';
        }

        const routeCoords = alternativeRoutes[selectedRouteIndex].geometry.coordinates;
        const startCoords = routeCoords[0];
        const routeSecondPt = routeCoords.length > 1 ? routeCoords[1] : startCoords;
        
        navigationState.smoothedBearing = (routeCoords.length > 1 && window.turf) 
            ? turf.bearing(turf.point(startCoords), turf.point(routeSecondPt)) 
            : 0;

        map.jumpTo({ 
            center: startCoords,
            bearing: navigationState.smoothedBearing || 0,
            pitch: 60, 
            zoom: 19
        });

        const firstStep = alternativeRoutes[selectedRouteIndex].legs[0].steps[0];
        NavUI.updateStep(firstStep, 'Proceed');
        speechService.speak(formatOsrmInstruction(firstStep));

        if (!userLocationMarker) {
            const el = createModernPuck();
            userLocationMarker = new maplibregl.Marker({ 
                element: el, 
                rotationAlignment: 'map', 
                pitchAlignment: 'map' 
            }).setLngLat(startCoords).addTo(map);
        } else { 
            userLocationMarker.setLngLat(startCoords);
        }
        userLocationMarker.setRotation(navigationState.smoothedBearing || 0);

        const totalDist = alternativeRoutes[selectedRouteIndex].distance;
        const totalTime = alternativeRoutes[selectedRouteIndex].duration;
        const etaDate = new Date(Date.now() + totalTime * 1000);
        
        NavUI.updateStats(
            etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 
            Math.max(1, Math.round(totalTime / 60)), 
            (totalDist / 1609.34).toFixed(1)
        );

        if (navigationWatcherId) {
            if (navigationState.isCustomStart) {
                clearInterval(navigationWatcherId);
            } else if (isNative && BackgroundGeolocation) {
                try { BackgroundGeolocation.removeWatcher({ id: navigationWatcherId }).catch(()=>{}); } catch(e){}
            } else {
                navigator.geolocation.clearWatch(navigationWatcherId);
            }
            navigationWatcherId = null;
        }

        const usePlayServices = appSettings.get('privacy').useDeviceLocationServices;
        if (navigationState.isCustomStart) {
            let simIndex = 0;
            navigationWatcherId = setInterval(() => {
                if (!navigationState.isActive) {
                    clearInterval(navigationWatcherId);
                    return;
                }
                if (simIndex >= routeCoords.length) {
                    clearInterval(navigationWatcherId);
                    showToast("Arrived at destination.", "success");
                    endNavigation();
                    return;
                }
                const pt = routeCoords[simIndex];
                let heading = navigationState.smoothedBearing;
                if (simIndex < routeCoords.length - 1 && window.turf) {
                    heading = turf.bearing(turf.point(pt), turf.point(routeCoords[simIndex+1]));
                }
                updateNavigation({
                    coords: {
                        longitude: pt[0],
                        latitude: pt[1],
                        speed: 15, 
                        heading: heading
                    },
                    time: Date.now()
                });
                simIndex++;
            }, 1000); 

        } else {
            if (isNative && usePlayServices) {
                try {
                    if (Plugins && Plugins.KeepAwake) Plugins.KeepAwake.keepAwake().catch(()=>{});
                    if (Plugins && Plugins.StatusBar) Plugins.StatusBar.hide().catch(()=>{});
                    if (Plugins && Plugins.ScreenOrientation) Plugins.ScreenOrientation.unlock().catch(()=>{});
                } catch(e) { console.warn("Native plugin safely ignored:", e); }

                let backgroundGeoStarted = false;
                if (BackgroundGeolocation) {
                    try {
                        BackgroundGeolocation.addWatcher(
                            {
                                backgroundMessage: "Navigating to your destination.",
                                backgroundTitle: "TheBoiisMC Maps",
                                requestPermissions: true,
                                stale: false,
                                distanceFilter: 2
                            },
                            function callback(location, error) {
                                if (error) {
                                    if (error.code === 'NOT_AUTHORIZED') showToast("Location permission denied", "error");
                                    return;
                                }
                                if (location) {
                                    backgroundGeoStarted = true;
                                    const pos = {
                                        coords: {
                                            latitude: location.latitude,
                                            longitude: location.longitude,
                                            speed: location.speed !== undefined ? location.speed : null,
                                            heading: location.bearing !== undefined ? location.bearing : null
                                        },
                                        timestamp: location.time
                                    };
                                    updateNavigation(pos);
                                }
                            }
                        ).then(function(watcherId) {
                            if (!navigationState.isActive) {
                                BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(()=>{});
                            } else {
                                navigationWatcherId = watcherId;
                            }
                        }).catch(()=>{});
                    } catch(e){}
                } 
                
                if (!backgroundGeoStarted) {
                    if (navigator.wakeLock) { try { navigator.wakeLock.request('screen').catch(()=>{}); } catch(e){} }
                    navigationWatcherId = navigator.geolocation.watchPosition(
                        updateNavigation,
                        (err) => console.warn("Web GPS Warning:", err),
                        { enableHighAccuracy: true } 
                    );
                }
            } else {
                if (navigator.wakeLock) { try { navigator.wakeLock.request('screen').catch(()=>{}); } catch(e){} }
                navigationWatcherId = navigator.geolocation.watchPosition(
                    updateNavigation,
                    (err) => console.warn("Raw GPS Warning:", err),
                    { enableHighAccuracy: true } 
                );
            }
        }
        showRecenterButton();
    }

    function createModernPuck() {
        const el = document.createElement('div');
        el.className = 'nav-puck-2026';

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 36 36");
        svg.setAttribute("width", "42");
        svg.setAttribute("height", "42");
        svg.style.filter = "drop-shadow(0px 6px 8px rgba(0,0,0,0.5))";

        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", "M18 2 L34 32 L18 26 L2 32 Z");
        path.setAttribute("fill", "#4F46E5"); 
        path.setAttribute("stroke", "white");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linejoin", "round");

        svg.appendChild(path);
        el.appendChild(svg);
        return el;
    }
    
    function triggerReroute(currentCoords) {
        if (navigationState.isRerouting) return;
        navigationState.isRerouting = true;
        getRoute(currentCoords).finally(() => {
            navigationState.isRerouting = false;
            navigationState.offRouteCounter = 0;
        });
    }

    function updateNavigation(pos) {
        if (!navigationState.isActive || !alternativeRoutes[selectedRouteIndex]) return;
        if (!window.turf) {
            console.error("Navigation failed: Turf.js is missing.");
            return;
        }

        if (navigationState.isRerouting) return;
        
        const now = Date.now();
        
        const rawCoords = [pos.coords.longitude, pos.coords.latitude];
        let gpsSpeed = pos.coords.speed;
        let gpsBearing = pos.coords.heading;
        
        if (gpsSpeed === null || isNaN(gpsSpeed) || gpsSpeed === undefined) {
            if (currentLastKnownPosition && currentLastKnownPosition.timestamp) {
                const timeDiffSec = (now - currentLastKnownPosition.timestamp) / 1000;
                if (timeDiffSec > 0.5 && timeDiffSec < 10) {
                    const distMeters = turf.distance(turf.point(currentLastKnownPosition.coords), turf.point(rawCoords), { units: 'meters' });
                    gpsSpeed = distMeters / timeDiffSec;
                } else {
                    gpsSpeed = navigationState.currentSpeedMps || 0;
                }
            } else {
                gpsSpeed = 0;
            }
        }
        
        if (gpsBearing === null || isNaN(gpsBearing) || gpsBearing === undefined) {
            if (currentLastKnownPosition && gpsSpeed > 1.0) {
                 gpsBearing = turf.bearing(turf.point(currentLastKnownPosition.coords), turf.point(rawCoords));
            }
        }
        
        navigationState.lastGpsTimestamp = now;
        if (gpsSpeed >= 0) {
            navigationState.currentSpeedMps = (navigationState.currentSpeedMps * 0.3) + (gpsSpeed * 0.7);
        }
        
        if (gpsBearing !== null && !isNaN(gpsBearing) && navigationState.currentSpeedMps > 1.5) {
            navigationState.smoothedBearing = gpsBearing;
        }

        const steps = alternativeRoutes[selectedRouteIndex].legs[0].steps;
        const currentIdx = navigationState.currentStepIndex;
        const currentData = navEngine.calculateSegmentProbability(steps[currentIdx], currentIdx, rawCoords, navigationState.smoothedBearing, navigationState.currentSpeedMps);
        const nextData = navEngine.calculateSegmentProbability(steps[currentIdx + 1], currentIdx + 1, rawCoords, navigationState.smoothedBearing, navigationState.currentSpeedMps);
        let chosenMatch = currentData;
        let chosenIndex = currentIdx;
        
        if (nextData && nextData.probability > 0) {
            const distToTurn = turf.distance(turf.point(rawCoords), turf.point(steps[currentIdx].maneuver.location), { units: 'meters' });
            if (distToTurn < 30) { chosenMatch = nextData; chosenIndex = currentIdx + 1;
            } 
            else if (nextData.score < currentData.score) {
                if (navigationState.pendingStepIndex === currentIdx + 1) { navigationState.roadLockScore++;
                } else { navigationState.pendingStepIndex = currentIdx + 1; navigationState.roadLockScore = 1;
                }
                if (navigationState.roadLockScore >= 2) { chosenMatch = nextData;
                chosenIndex = currentIdx + 1; navigationState.roadLockScore = 0; }
            } else { navigationState.roadLockScore = 0;
            }
        }

        if (chosenIndex > currentIdx) {
            navigationState.currentStepIndex = chosenIndex;
            const newStep = steps[chosenIndex];
            speechService.speak(formatOsrmInstruction(newStep), true);
        }

        let displayCoords = rawCoords;
        if (chosenMatch.snap && chosenMatch.snap.properties.dist < NAV_CONSTANTS.SNAP_DISTANCE_MILES) {
            displayCoords = chosenMatch.snap.geometry.coordinates;
            if (navigationState.currentSpeedMps > 1.5 && chosenMatch.bearing !== undefined) {
                navigationState.smoothedBearing = chosenMatch.bearing;
            }
        }
        
        if (navigationState.lastDisplayCoords) {
             const distJump = turf.distance(turf.point(navigationState.lastDisplayCoords), turf.point(displayCoords), {units: 'meters'});
             if (navigationState.currentSpeedMps < 2.0 && distJump < 15) {
                 displayCoords = navigationState.lastDisplayCoords;
             } else {
                 displayCoords = [
                     (navigationState.lastDisplayCoords[0] * 0.4) + (displayCoords[0] * 0.6),
                     (navigationState.lastDisplayCoords[1] * 0.4) + (displayCoords[1] * 0.6)
                 ];
             }
        }
        navigationState.lastDisplayCoords = displayCoords;
        currentLastKnownPosition = { coords: displayCoords, bearing: navigationState.smoothedBearing, timestamp: now };

        if (chosenMatch.score > NAV_CONSTANTS.REROUTE_THRESHOLD_MILES) {
            if (!navigationState.isCustomStart && navigationState.currentSpeedMps > 1.0) {
                navigationState.offRouteCounter++;
                if (navigationState.offRouteCounter >= NAV_CONSTANTS.OFF_ROUTE_LIMIT) { triggerReroute(rawCoords); return; }
            }
        } else { navigationState.offRouteCounter = 0; }

        if (!userLocationMarker) {
            const el = createModernPuck();
            userLocationMarker = new maplibregl.Marker({ 
                element: el, 
                rotationAlignment: 'map', 
                pitchAlignment: 'map' 
            }).setLngLat(displayCoords).addTo(map);
        } else { 
            userLocationMarker.setLngLat(displayCoords);
        }
        
        if (navigationState.smoothedBearing !== undefined && !isNaN(navigationState.smoothedBearing)) {
            userLocationMarker.setRotation(navigationState.smoothedBearing);
        }

        if (navigationState.isCameraLocked && map) {
            map.easeTo({ 
                center: displayCoords, 
                bearing: navigationState.smoothedBearing || 0, 
                pitch: 60, 
                zoom: 19,
                duration: 1000,
                easing: (t) => t
            });
        }

        let remDistMeters = 0;
        let remTimeSec = 0;
        let currentStepDistMeters = 0;

        for (let i = navigationState.currentStepIndex; i < steps.length; i++) {
            const step = steps[i];
            if (i === navigationState.currentStepIndex) {
                let distToManeuver = turf.distance(turf.point(displayCoords), turf.point(step.maneuver.location), { units: 'meters' });
                
                if (navigationState.lastDistToManeuver !== undefined && chosenMatch.score < NAV_CONSTANTS.REROUTE_THRESHOLD_MILES) {
                     if (distToManeuver > navigationState.lastDistToManeuver && navigationState.currentSpeedMps < 2.0) {
                         distToManeuver = navigationState.lastDistToManeuver;
                     } else {
                         distToManeuver = (navigationState.lastDistToManeuver * 0.6) + (distToManeuver * 0.4);
                     }
                }
                navigationState.lastDistToManeuver = distToManeuver;
                currentStepDistMeters = distToManeuver;
                remDistMeters += distToManeuver;
                
                const fraction = (step.distance > 0) ? (distToManeuver / step.distance) : 1;
                remTimeSec += (step.duration * fraction);
                
                if (distToManeuver < 250 && !navigationState.approachingAnnounced && steps[i+1]) {
                    speechService.speak(`In ${formatDistance(distToManeuver)}, ${formatOsrmInstruction(steps[i+1])}`);
                    navigationState.approachingAnnounced = true;
                } else if (distToManeuver > 250) {
                    navigationState.approachingAnnounced = false;
                }
            } else {
                remDistMeters += step.distance;
                remTimeSec += step.duration;
            }
        }

        const activeStep = steps[navigationState.currentStepIndex];
        if (activeStep) {
            NavUI.updateStep(activeStep, formatDistance(currentStepDistMeters));
        }

        const etaDate = new Date(Date.now() + remTimeSec * 1000);
        NavUI.updateStats(
            etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            Math.max(1, Math.round(remTimeSec / 60)),
            (remDistMeters / 1609.34).toFixed(1)
        );
    }
    
    function endNavigation() {
        navigationState.isActive = false;
        document.body.classList.remove('nav-active');

        NavUI.destroy();

        if (navigationWatcherId) {
            if (navigationState.isCustomStart) {
                clearInterval(navigationWatcherId);
            } else if (isNative && BackgroundGeolocation) {
                try { BackgroundGeolocation.removeWatcher({ id: navigationWatcherId }).catch(()=>{}); } catch(e){}
            } else {
                navigator.geolocation.clearWatch(navigationWatcherId);
            }
            navigationWatcherId = null;
        }

        if (isNative) {
            try {
                if (Plugins && Plugins.KeepAwake) Plugins.KeepAwake.allowSleep().catch(()=>{});
                if (Plugins && Plugins.StatusBar) Plugins.StatusBar.show().catch(()=>{});
                if (Plugins && Plugins.ScreenOrientation) Plugins.ScreenOrientation.lock({ type: 'portrait' }).catch(()=>{});
            } catch(e){}
        }
        
        PanelRouter.toggleSearchBar(true);
        
        const floatProfile = document.getElementById('floating-profile-controls');
        if (floatProfile) {
            floatProfile.style.opacity = '1'; 
            floatProfile.style.pointerEvents = 'auto';
        }
        
        const recenterBtn = document.getElementById('recenter-btn');
        if (recenterBtn) recenterBtn.style.display = 'none';
        
        if (userLocationMarker) {
            userLocationMarker.remove();
            userLocationMarker = null;
        }
        
        if (map) map.easeTo({ pitch: 0, zoom: 15, bearing: 0, duration: 1000 });
        clearRouteFromMap();
    }

    class LayersControl {
        onAdd(map) {
            this._map = map;
            this._container = createEl('div', 'maplibregl-ctrl maplibregl-ctrl-layers');
            this._button = createEl('button', 'maplibregl-ctrl-layers-btn');
            this._button.setAttribute('aria-label', 'Map Style');
            this._button.onclick = (e) => { e.stopPropagation(); this._container.classList.toggle('open'); };
            this._panel = createEl('div', 'maplibregl-ctrl-layers-panel');
            const typeSection = createEl('div');
            typeSection.appendChild(createEl('div', 'layers-panel-header', 'Map Type'));
            const grid = createEl('div', 'map-style-grid');
            const defCard = createEl('div', 'style-card active');
            defCard.id = 'style-card-default';
            defCard.appendChild(createIcon('map', '32px'));
            defCard.appendChild(createEl('span', '', 'Default'));
            defCard.onclick = () => {
                if (navigationState.isActive) return showToast("Cannot change style while navigating", "error");
                this.setVisualActive(defCard);
                loadMapStyle(); 
            };
            const satCard = createEl('div', 'style-card');
            satCard.id = 'style-card-satellite';
            satCard.appendChild(createIcon('satellite_alt', '32px'));
            satCard.appendChild(createEl('span', '', 'Satellite'));
            satCard.onclick = () => {
                if (navigationState.isActive) return showToast("Cannot change style while navigating", "error");
                this.setVisualActive(satCard);
                const currentKey = appSettings.get('source').tiles;
                const provider = DATA_PROVIDERS.tiles[currentKey];
                const satStyle = provider.satelliteStyle || DATA_PROVIDERS.tiles.maptiler.satelliteStyle;
                map.setStyle(satStyle);
                map.once('styledata', restoreMapState);
            };
            grid.appendChild(defCard);
            grid.appendChild(satCard);
            typeSection.appendChild(grid);
            const detailsSection = createEl('div', 'map-details-section');
            detailsSection.appendChild(createEl('div', 'layers-panel-header', 'Map Details'));
            const detailRow = createEl('div', 'detail-row');
            detailRow.appendChild(createEl('span', '', 'Globe View'));
            const toggleSwitch = createEl('div', 'toggle-switch');
            const input = createEl('input');
            input.type = 'checkbox';
            input.id = 'globe-toggle-menu';
            if (map.getProjection && typeof map.getProjection === 'function') {
                 const proj = map.getProjection();
                 if (proj && proj.name === 'globe') { input.checked = true; }
            }
            const label = createEl('label');
            label.setAttribute('for', 'globe-toggle-menu');
            toggleSwitch.appendChild(input); toggleSwitch.appendChild(label);
            detailRow.appendChild(toggleSwitch); detailsSection.appendChild(detailRow);
            input.onchange = (e) => {
                const isGlobe = e.target.checked;
                if (map.setProjection) { map.setProjection({ type: isGlobe ? 'globe' : 'mercator' }); }
                if(isGlobe && map.setFog) {
                    map.setFog({ 'range': [0.8, 1.2], 'color': '#dc9f9f', 'horizon-blend': 0.5, 'high-color': '#245b64', 'space-color': '#000000', 'star-intensity': 0.15 });
                } else if (map.setFog) { map.setFog({}); }
            };
            this._panel.appendChild(typeSection);
            this._panel.appendChild(detailsSection);
            this._container.appendChild(this._button); this._container.appendChild(this._panel);
            return this._container;
        }
        setVisualActive(activeElement) {
            const cards = this._panel.querySelectorAll('.style-card');
            cards.forEach(el => el.classList.remove('active'));
            activeElement.classList.add('active');
        }
        onRemove() {
            if(this._container && this._container.parentNode) { this._container.parentNode.removeChild(this._container); }
            this._map = undefined;
        }
    }
    map.addControl(new LayersControl(), 'bottom-left');
    document.addEventListener('click', (e) => {
        const layers = document.querySelector('.maplibregl-ctrl-layers');
        if (layers && !layers.contains(e.target)) layers.classList.remove('open');
    });
    window.addEventListener('beforeunload', () => {
        if(appSettings.get('privacy').clearRecentsOnExit) localStorage.removeItem(RECENT_SEARCHES_KEY);
    });
    if (typeof Navigo !== 'undefined') {
        appRouter = new Navigo('/', { hash: false });
        appRouter.on({
            '/': (match) => {
                if (match && match.queryString && match.queryString.includes('place=')) {
                    const params = new URLSearchParams(match.queryString);
                    if (params.get('place') && params.get('lat') && params.get('lon')) {
                        const place = {
                            display_name: decodeURIComponent(params.get('place')),
                            name: decodeURIComponent(params.get('place')),
                            lat: parseFloat(params.get('lat')),
                            lon: parseFloat(params.get('lon')),
                            text: decodeURIComponent(params.get('place'))
                        };
                        processPlaceResult(place, true);
                        return;
                    }
                }
                PanelRouter.renderHome();
            },
            '/place': (match) => {
                if (match && match.params && match.params.lat && match.params.lon) {
                    const place = {
                        display_name: decodeURIComponent(match.params.name || 'Unknown'),
                        name: decodeURIComponent(match.params.name || 'Unknown'),
                        lat: parseFloat(match.params.lat),
                        lon: parseFloat(match.params.lon),
                        text: decodeURIComponent(match.params.name || 'Unknown')
                    };
                    processPlaceResult(place, true); 
                } else if (currentPlace) {
                    PanelRouter.renderPlaceDetails(currentPlace);
                } else {
                    appRouter.navigate('/');
                }
            },
            '/directions': () => {
                PanelRouter.renderDirections(currentPlace);
            },
            '/route-preview': () => {
                if(currentRouteData) PanelRouter.renderRoutePreview();
                else appRouter.navigate('/');
            },
            '/search': (match) => {
                if (match && match.params && match.params.q) {
                    window.performCategorySearch(decodeURIComponent(match.params.q), true);
                } else {
                    appRouter.navigate('/');
                }
            },
            '/saved': () => {
                PanelRouter.renderSavedPlaces();
            }
        });
        
        map.once('load', () => appRouter.resolve());
    } else {
        PanelRouter.renderHome();
    }
});
