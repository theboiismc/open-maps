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

        const trafficToggle = document.getElementById('traffic-toggle');
        if (trafficToggle && trafficToggle.checked) {
            map.setLayoutProperty('traffic-lines', 'visibility', 'visible');
        } else {
            map.setLayoutProperty('traffic-lines', 'visibility', 'none');
        }
    }
});

map.on('click', (e) => {
    // Display the location information for the clicked point
    showLocationInfo(e.lngLat);
});

// NEW FUNCTION: showLocationInfo - handles reverse geocoding
async function showLocationInfo(lngLat) {
    showPanel('info-panel-redesign');
    document.getElementById('spinner').hidden = false;
    // NEW: Use MapTiler for reverse geocoding
    const url = `https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const place = data.features[0];
        document.getElementById('spinner').hidden = true;
        if (place) {
            const formattedAddress = place.place_name;
            const placeName = place.text || 'Location';
            showInfoPanel({
                name: placeName,
                address: formattedAddress,
                coordinates: [lngLat.lng, lngLat.lat],
                quickFacts: 'Reverse geocoding with MapTiler is way better than old Nominatim. This allows for more specific results and more useful context. You can now get directions or search this location.'
            });
        } else {
            showInfoPanel({
                name: 'Location',
                address: `[${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}]`,
                coordinates: [lngLat.lng, lngLat.lat],
                quickFacts: 'No address information found. You can still get directions for this location or use the coordinates for directions.'
            });
        }
    } catch (error) {
        console.error("Failed to show location info:", error);
        document.getElementById('spinner').hidden = true;
        mainSearchInput.value = `[${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}]`;
        showInfoPanel({
            name: `Location`,
            address: `We're having trouble getting details for this location right now.`,
            coordinates: [lngLat.lng, lngLat.lat],
            quickFacts: 'Please try again in a moment or use the coordinates provided.'
        });
    }
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
    
    // Add a marker for the selected place
    if (mapMarker) {
        mapMarker.remove();
    }
    mapMarker = new maplibregl.Marker()
        .setLngLat(place.coordinates)
        .addTo(map);
    map.flyTo({ center: place.coordinates, zoom: 14 });
}
