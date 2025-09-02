// --- MAP INITIALIZATION & CONTROLS ---
// NEW: Add your MapTiler API Key here
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
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': [
                'match',
                ['get', 'traffic'],
                'low',
                '#30c25a',
                'moderate',
                '#ebc100',
                'high',
                '#de585a',
                'severe',
                '#b33671',
                '#b33671' // Default color
            ],
            'line-width': 2,
            'line-opacity': 0.8
        },
        'metadata': {
            'title': 'Traffic'
        },
        'minzoom': 5,
        'maxzoom': 22
    });

    // Hide traffic layer by default
    map.setLayoutProperty('traffic-lines', 'visibility', 'none');
});

map.on('style.load', () => {
    // Re-add traffic layer if style changes
    if (!map.getSource('traffic')) {
        map.addSource('traffic', {
            type: 'vector',
            url: `https://api.maptiler.com/tiles/v2/traffic-v2.json?key=${MAPTILER_KEY}`
        });
        map.addLayer({
            'id': 'traffic-lines',
            'type': 'line',
            'source': 'traffic',
            'source-layer': 'traffic',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': {
                'line-color': [ 'match', ['get', 'traffic'], 'low', '#30c25a', 'moderate', '#ebc100', 'high', '#de585a', 'severe', '#b33671', '#b33671' ],
                'line-width': 2,
                'line-opacity': 0.8
            }
        });
    }
    const trafficToggle = document.getElementById('traffic-toggle');
    if (trafficToggle.checked) {
        map.setLayoutProperty('traffic-lines', 'visibility', 'visible');
    }
});

let mapMarker;
let currentPlace;

// REPLACED: Updated to use MapTiler Geocoding API for reverse geocoding
map.on('click', async (e) => {
    const lngLat = e.lngLat;
    const url = `https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`;
    try {
        const res = await fetch(url);
        const data = await res.json();

        // Check for a valid result from the new API
        if (data.features && data.features.length > 0) {
            const place = data.features[0];
            const address = place.place_name || 'Address not available';
            const name = place.text || 'Location';
            showInfoPanel({
                name: name,
                address: address,
                coordinates: [lngLat.lng, lngLat.lat],
                quickFacts: 'Tap for directions.'
            });
        } else {
            throw new Error("No place found at this location.");
        }
    } catch (error) {
        // Friendly message for a connection or server error
        console.error("Failed to show location info:", error);
        mainSearchInput.value = `[${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}]`;
        showInfoPanel({
            name: `Location`,
            address: `We're having trouble getting details for this location right now.`,
            coordinates: [lngLat.lng, lngLat.lat],
            quickFacts: 'Please try again in a moment or use the coordinates provided.'
        });
    }
});
