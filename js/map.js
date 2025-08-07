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
