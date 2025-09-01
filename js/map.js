// map.js
export function initMap() {
    const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: {
            version: 8,
            sources: { 
                "esri-world-imagery": { 
                    type: "raster", 
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], 
                    tileSize: 256, 
                    attribution: 'Tiles © Esri' 
                } 
            },
            layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }]
        }
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
    map.on('load', () => geolocateControl.trigger());

    // --- TRAFFIC LAYER LOGIC ---
    const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
    const TRAFFIC_LAYER_ID = 'traffic-lines';
    const trafficSource = { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` };
    const trafficLayer = {
        id: TRAFFIC_LAYER_ID,
        type: 'line',
        source: TRAFFIC_SOURCE_ID,
        'source-layer': 'traffic',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-width': 2,
            'line-color': ['match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0']
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

    return { map, isMobile, geolocationOptions, STYLES, addTrafficLayer, removeTrafficLayer };
}
