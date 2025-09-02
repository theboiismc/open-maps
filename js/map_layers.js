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
        displayRoutePreview(route);
        drawRouteOnMap(route);
    } catch (e) {
        console.error("Routing error:", e);
        alert("Failed to find a route. Please check the addresses or try again.");
    }
}
function drawRouteOnMap(route) {
    clearRouteFromMap();
    const routeGeoJSON = {
        type: 'Feature',
        geometry: route.geometry
    };
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', {
            type: 'geojson',
            data: routeGeoJSON
        });
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#0d89ec',
                'line-width': 8,
                'line-opacity': 0.7
            }
        });
    }
}
