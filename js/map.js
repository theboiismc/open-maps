// --- MAP INITIALIZATION & CONTROLS ---
const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';

const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const STYLES = {
    default: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
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

map.on('load', () => {
    // Add traffic layer on map load
    map.addSource('traffic', {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/v2/traffic-v2.json?key=${MAPTILER_KEY}`
    });

    map.addLayer({
        'id': 'traffic-lines',
        'type': 'line',
        'source': 'traffic',
        'source-layer': 'traffic',
        'paint': {
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
    });
    // Hide traffic layer initially
    map.setLayoutProperty('traffic-lines', 'visibility', 'none');

    // Add 3D buildings layer
    map.addSource('maptiler-dem', {
        'type': 'raster-dem',
        'url': `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_KEY}`,
        'tileSize': 512,
        'maxzoom': 14
    });
    map.setTerrain({ 'source': 'maptiler-dem', 'exaggeration': 1.5 });

    map.addLayer({
        'id': '3d-buildings',
        'source': 'maptiler-streets',
        'source-layer': 'building',
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'render_height'],
            'fill-extrusion-base': ['get', 'render_min_height'],
            'fill-extrusion-opacity': 0.6
        }
    });
});

map.on('click', async (e) => {
    try {
        const url = `https://api.maptiler.com/geocoding/${e.lngLat.lng},${e.lngLat.lat}.json?key=${MAPTILER_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const place = data.features[0];
            showInfoPanel({
                name: place.place_name,
                address: place.text,
                coordinates: place.center,
                quickFacts: 'Reverse geocoding by MapTiler.'
            });
        } else {
            showInfoPanel({
                name: 'Unknown Location',
                address: 'No details found for this location.',
                coordinates: [e.lngLat.lng, e.lngLat.lat],
                quickFacts: 'No reverse geocoding data available.'
            });
        }
    } catch (error) {
        console.error("Failed to show location info:", error);
        showInfoPanel({
            name: `Location`,
            address: `We're having trouble getting details for this location right now.`,
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            quickFacts: 'Please try again in a moment or use the coordinates provided.'
        });
    }
});
