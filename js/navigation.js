import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { showToast, showPanel, closePanel } from './ui.js';

let map = null;
let speech = null;
let state = {};
let currentRouteData = null;
let userLocationMarker = null;
let navigationWatcherId = null;

const highlightedSegmentLayerId = 'highlighted-route-segment';

function resetNavigationState() {
    state = {
        isActive: false,
        isRerouting: false,
        currentStepIndex: 0,
        userSpeed: 0,
        estimatedArrivalTime: null,
        totalTripTime: 0,
        lastAnnouncedDistance: Infinity,
    };
}

function addRouteToMap(routeGeoJSON) {
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 }
        });
    }
}

function updateHighlightedSegment(step) {
    if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
    if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    if (!step || !step.geometry) return;

    map.addSource(highlightedSegmentLayerId, { type: 'geojson', data: step.geometry });
    map.addLayer({
        id: highlightedSegmentLayerId, type: 'line', source: highlightedSegmentLayerId,
        paint: { 'line-color': '#0055ff', 'line-width': 9 }
    }, 'route-line');
}

async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    const { geocodeQuery } = window.theBoiisMC.api;
    const center = map.getCenter();
    const feature = await geocodeQuery(inputEl.value, center);
    inputEl.value = feature.place_name;
    inputEl.dataset.coords = `${feature.center[0]},${feature.center[1]}`;
    return feature.center;
}

// --- Navigation Logic ---
function handlePositionUpdate(position) {
    // ... (This function remains large, but is self-contained)
}

// --- Public API for the module ---
export function initializeNavigation(mapInstance, speechService) {
    map = mapInstance;
    speech = speechService;
    resetNavigationState();

    document.getElementById('end-navigation-btn').addEventListener('click', stopNavigation);
    
    // Return the public interface
    return {
        start: startNavigation,
        stop: stopNavigation,
        clearRoute,
        getRoute,
        isActive: () => state.isActive,
        redrawRoute: () => {
             if (currentRouteData) {
                const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
                addRouteToMap(routeGeoJSON);
                updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[state.currentStepIndex]);
            }
        }
    };
}

async function getRoute() {
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    if (!fromInput.value || !toInput.value) {
        return showToast("Please fill both start and end points.", "error");
    }
    clearRoute();

    try {
        const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
        const { fetchRoute } = window.theBoiisMC.api;
        const data = await fetchRoute(start, end);
        currentRouteData = data;
        
        const route = data.routes[0];
        const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
        addRouteToMap(routeGeoJSON);

        const bounds = new maplibregl.LngLatBounds();
        routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
        
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        map.fitBounds(bounds, {
            padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : { top: 50, bottom: 50, left: 450, right: 50 }
        });
        
        showRoutePreview(route);

    } catch (err) {
        showToast(`Error getting route: ${err.message}`, "error");
        state.isRerouting = false;
    }
}

function showRoutePreview(route) {
    const duration = Math.round(route.duration / 60);
    const distance = (route.distance / 1609.34).toFixed(1);
    
    const container = document.getElementById('route-options-container');
    container.innerHTML = `
        <div class="route-option selected">
            <div class="route-summary-time">${duration} min</div>
            <div class="route-summary-details">${distance} mi</div>
        </div>
    `;
    showPanel('route-preview-panel');
}

function startNavigation() {
    if (!navigator.geolocation) {
        return showToast("Geolocation is not supported.", "error");
    }
    resetNavigationState();
    state.isActive = true;
    
    // ... setup UI and start watcher
    document.getElementById('navigation-status').style.display = 'flex';
    if (!userLocationMarker) {
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        userLocationMarker = new maplibregl.Marker(el).setLngLat([0,0]).addTo(map);
    }
    map.easeTo({ pitch: 60, zoom: 17 });
    
    navigationWatcherId = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        (err) => showToast(`Geolocation error: ${err.message}`, 'error'),
        { enableHighAccuracy: true }
    );
    closePanel();
}

function stopNavigation() {
    if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
    if (userLocationMarker) {
        userLocationMarker.remove();
        userLocationMarker = null;
    }
    clearRoute();
    resetNavigationState();
    document.getElementById('navigation-status').style.display = 'none';
    speech.cancel();
    map.easeTo({ pitch: 0, bearing: 0 });
}

function clearRoute() {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
    if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    currentRouteData = null;
}
