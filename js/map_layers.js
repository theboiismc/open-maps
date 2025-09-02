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
        const url = `https://api.maptiler.com/directions/v1/driving/${start.join(',')};${end.join(',')}?key=${MAPTILER_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.routes || data.routes.length === 0 || !data.routes[0].geometry) {
            throw new Error('No route found.');
        }

        const route = data.routes[0];
        currentRouteData = data; 
        
        // Convert MapTiler's polyline to GeoJSON for rendering
        const decodedPath = decodePolyline(route.geometry.coordinates, 5); 
        const routeGeoJSON = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: decodedPath
            }
        };

        addRouteToMap(routeGeoJSON);
        displayRoutePreview(route);
        // The rest of your route handling logic goes here
        addStepsToPanel(route.legs[0].steps);
        fitMapToRoute(route);
    } catch (e) {
        console.error("Route fetch failed", e);
        alert(`Could not find a route: ${e.message}`);
        closePanel();
    }
}
async function addRouteToMap(routeGeoJSON) {
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
            '#ccc' // default color
        ]
    },
    'minzoom': 5
};

function addTrafficLayer() {
    if (!map.getSource('traffic')) {
        map.addSource('traffic', trafficSource);
    }
    if (!map.getLayer(TRAFFIC_LAYER_ID)) {
        map.addLayer(trafficLayer);
    }
    map.setLayoutProperty(TRAFFIC_LAYER_ID, 'visibility', 'visible');
}

function removeTrafficLayer() {
    if (map.getLayer(TRAFFIC_LAYER_ID)) {
        map.setLayoutProperty(TRAFFIC_LAYER_ID, 'visibility', 'none');
    }
}

// Helper function to decode the polyline
function decodePolyline(encoded, precision) {
    const points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lng / Math.pow(10, precision), lat / Math.pow(10, precision)]);
    }
    return points;
}
