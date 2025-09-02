// --- MAP LAYERS & ROUTE DISPLAY ---
function clearRouteFromMap() {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
    if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
}
    
function displayRoutePreview(route) {
    const durationMinutes = Math.round(route.duration / 60);
    const distanceMiles = (route.distance / 1609.34).toFixed(1);
    document.getElementById('route-summary-time').textContent = `${durationMinutes} min`;
    document.getElementById('route-summary-distance').textContent = `${distanceMiles} mi`;
    showPanel('route-preview-panel');
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
            startNavigation();
        } else {
            displayRoutePreview(route);
            map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
        }
    } catch (err) {
        alert(`Error getting route: ${err.message}`);
        navigationState.isRerouting = false;
    }
}

function addRouteToMap(routeGeoJSON) {
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
    }
}

// --- TRAFFIC LAYER LOGIC ---
const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
const TRAFFIC_LAYER_ID = 'traffic-lines';

const trafficSource = {
    type: 'vector',
    url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}`
};

const trafficLayer = {
    id: TRAFFIC_LAYER_ID,
    type: 'line',
    source: TRAFFIC_SOURCE_ID,
    'source-layer': 'traffic',
    layout: {
        'line-join': 'round',
        'line-cap': 'round'
    },
    paint: {
        'line-width': 2,
        'line-color': [
            'match',
            ['get', 'congestion'],
            'low', '#30c83a',
            'moderate', '#ff9a00',
            'heavy', '#ff3d3d',
            'severe', '#a00000',
            '#a0a0a0'
        ]
    }
};
    
function addTrafficLayer() {
    if (map.getSource(TRAFFIC_SOURCE_ID)) return;
    map.addSource(TRAFFIC_SOURCE_ID, trafficSource);
    map.addLayer(trafficLayer, 'route-line');
}

function removeTrafficLayer() {
    if (!map.getSource(TRAFFIC_SOURCE_ID)) return;
    map.removeLayer(TRAFFIC_LAYER_ID);
    map.removeSource(TRAFFIC_SOURCE_ID);
}
