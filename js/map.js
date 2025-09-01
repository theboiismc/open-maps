/* ========= MAP ========= */
import { setSheetState } from './bottomSheet.js';

export let map;

export function initMap() {
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
            layers: [{
                id: "satellite-layer",
                type: "raster",
                source: "esri-world-imagery",
                minzoom: 0,
                maxzoom: 22
            }]
        }
    };

    map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });

    // Navigation controls
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Geolocation
    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());

    // Map click collapses panel
    map.on('click', () => setSheetState("collapsed"));
}
