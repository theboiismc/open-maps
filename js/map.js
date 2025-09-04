// --- MAP INITIALIZATION & CONTROLS ---
// NEW: Add your MapTiler API Key here
const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';

const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const STYLES = {
    default: 'https://tiles.theboiismc.com/styles/basic-preview',
    satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
};
const map = new maplibregl.Map({
    container: "map",
    style: STYLES.default,
    center: [-95, 39],
    zoom: 2,
    pitch: 0, // no tilt
    bearing: 0,
    dragRotate: false,      // disable mouse drag rotation
    touchPitch: false,      // disable pinch-tilt gesture
    pitchWithRotate: false, // disables right-click+drag tilt
    renderWorldCopies: false
});


map.addControl(new maplibregl.NavigationControl(), "bottom-right");
const geolocateControl = new maplibregl.GeolocateControl({
    positionOptions: geolocationOptions,
    trackUserLocation: true,
    showUserHeading: true
});
map.addControl(geolocateControl, "bottom-right");
map.on('load', () => geolocateControl.trigger());

// NEW: Add a click event listener to the map
let clickMarker = null;
map.on('click', (e) => {
    // Prevent click events from triggering if navigation is active
    if (!navigationState.isActive) {
        showClickedLocation(e.lngLat);
    }
});

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
        if (priority && this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        if (!this.synthesis.speaking && text) {
            this.utterance.text = text;
            this.synthesis.speak(this.utterance);
        }
    }
};

// --- ADVANCED NAVIGATION STATE ---
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

// --- NAVIGATION UI ELEMENTS ---
const navigationStatusPanel = document.getElementById('navigation-status');
const navigationInstructionEl = document.getElementById('navigation-instruction');
const instructionProgressBar = document.getElementById('instruction-progress-bar').style;
const endNavigationBtn = document.getElementById('end-navigation-btn');
const statSpeedEl = document.getElementById('stat-speed');
const statEtaEl = document.getElementById('stat-eta');
const statTimeRemainingEl = document.getElementById('stat-time-remaining');
const highlightedSegmentLayerId = 'highlighted-route-segment';

// --- NEW FUNCTIONS FOR CLICK-TO-GET-LOCATION ---

// Function to handle getting location details from coordinates
async function reverseGeocode(lngLat) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lngLat.lat}&lon=${lngLat.lng}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Geocoding service failed:", error);
        return null;
    }
}

// Function to show the location information
function showClickedLocation(lngLat) {
    if (clickMarker) {
        clickMarker.remove();
    }
    
    // Animate the map to the clicked location
    map.flyTo({
        center: lngLat,
        zoom: 16, // Zoom in to a street-level view
        essential: true // This ensures the animation plays even if prefers-reduced-motion is enabled
    });

    clickMarker = new maplibregl.Marker()
        .setLngLat(lngLat)
        .addTo(map);

    reverseGeocode(lngLat).then(data => {
        if (data && data.display_name) {
            // Call the existing function to process the result and populate the panel
            processPlaceResult(data);
        } else {
            // Friendly message for when no address is found
            mainSearchInput.value = `[${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}]`;
            showInfoPanel({
                name: `Location`,
                address: `Unable to find an address for this spot.`,
                coordinates: [lngLat.lng, lngLat.lat],
                quickFacts: 'This location may be in a remote or unmapped area. You can still use the coordinates for directions.'
            });
        }
    }).catch(error => {
        // Friendly message for a connection or server error
        console.error("Failed to show location info:", error);
        mainSearchInput.value = `[${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}]`;
        showInfoPanel({
            name: `Location`,
            address: `We're having trouble getting details for this location right now.`,
            coordinates: [lngLat.lng, lngLat.lat],
            quickFacts: 'Please try again in a moment or use the coordinates provided.'
        });
    });
}

// NEW FUNCTION: showInfoPanel - centralizes the panel population
function showInfoPanel(place) {
    // This is a new function to populate the info panel from any source (search, click, etc.)
    // It will be added to the ui.js file when we refactor
    currentPlace = {
        display_name: place.name,
        lon: place.coordinates[0],
        lat: place.coordinates[1]
    };
    stopNavigation();
    clearRouteFromMap();
    document.getElementById('info-name').textContent = place.name.split(',')[0];
    document.getElementById('info-address').textContent = place.address;
    const locationName = place.name.split(',')[0];
    fetchAndSetPlaceImage(locationName, place.coordinates[0], place.coordinates[1]);
    fetchAndSetWeather(place.coordinates[1], place.coordinates[0]);
    document.getElementById('quick-facts-content').textContent = place.quickFacts;
    showPanel('info-panel-redesign');
}
