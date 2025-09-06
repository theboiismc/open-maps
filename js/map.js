import maplibregl from 'maplibre-gl';
import { showPanel } from './ui.js';
import { performSmartSearch, reverseGeocodeAndShowInfo } from './search.js';

const STYLES = {
    default: 'https://tiles.theboiismc.com/styles/basic-preview/style.json',
    satellite: {
        version: 8,
        sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } },
        layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }]
    }
};

let map = null;
let geolocateControl = null;

function getInitialViewFromHash() {
    if (window.location.hash) {
        const [zoom, lat, lng] = window.location.hash.substring(1).split('/').map(parseFloat);
        if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) {
            return { center: [lng, lat], zoom: zoom };
        }
    }
    return { center: [-95, 39], zoom: 4 }; // Default view
}

function setupMapEventListeners() {
    // URL Hash Syncing
    const updateUrlHash = () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const hash = `#${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`;
        history.replaceState(null, '', hash);
    };
    map.on('moveend', updateUrlHash);
    map.on('zoomend', updateUrlHash);

    // Map Click Logic
    map.on('click', async (e) => {
        if (e.originalEvent.target.closest('.maplibregl-ctrl')) return;
        const features = map.queryRenderedFeatures(e.point, { layers: ['route-line'] });
        if (features.length > 0) return;

        const poi = map.queryRenderedFeatures(e.point, { layers: ['poi'] })[0];
        if (poi && poi.properties.name) {
            performSmartSearch({ value: poi.properties.name }, (place) => {
                showPanel('info-panel-redesign', place);
            });
        } else {
            const place = await reverseGeocodeAndShowInfo(e.lngLat);
            if (place) {
                 showPanel('info-panel-redesign', place);
            }
        }
    });

    // Re-apply route and traffic layers on style change
    map.on('styledata', () => {
        const { navigation } = window.theBoiisMC;
        if (navigation && navigation.isActive()) {
            navigation.redrawRoute();
        }
        if (document.getElementById('traffic-toggle').checked) {
            addTrafficLayer();
        }
    });
}

function setupSettingsListeners() {
    document.querySelectorAll('input[name="map-style"]').forEach(radio => {
        radio.addEventListener('change', () => map.setStyle(STYLES[radio.value]));
    });

    document.getElementById('traffic-toggle').addEventListener('change', (e) => {
        e.target.checked ? addTrafficLayer() : removeTrafficLayer();
    });
}

function addTrafficLayer() {
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const sourceId = 'maptiler-traffic';
    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}`
    });

    const firstSymbolId = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    map.addLayer({
        id: 'traffic-lines',
        type: 'line',
        source: sourceId,
        'source-layer': 'traffic',
        paint: {
            'line-width': 2,
            'line-color': ['match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0']
        }
    }, firstSymbolId);
}

function removeTrafficLayer() {
    if (map.getLayer('traffic-lines')) map.removeLayer('traffic-lines');
    if (map.getSource('maptiler-traffic')) map.removeSource('maptiler-traffic');
}

export function initializeMap() {
    const initialView = getInitialViewFromHash();
    map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: initialView.center,
        zoom: initialView.zoom
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");
    
    map.on('load', () => {
        setupMapEventListeners();
        setupSettingsListeners();
    });

    window.theBoiisMC = window.theBoiisMC || {};
    window.theBoiisMC.map = map; // Make map instance globally available for modules
    return map;
}

export function getMap() { return map; }
export function getGeolocateControl() { return geolocateControl; }
