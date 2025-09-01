/* ========= MAP ========= */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setSheetState } from './bottomSheet.js';

export let map;

export function initMap() {
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

    // Ensure container exists
    const mapContainer = document.getElementById("map");
    if (!mapContainer) {
        console.error("Map container (#map) not found!");
        return;
    }

    mapContainer.style.width = "100%";
    mapContainer.style.height = "100vh"; // full viewport height

    map = new maplibregl.Map({
        container: mapContainer,
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });

    // Controls
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: geolocationOptions,
        trackUserLocation: true,
        showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");

    map.on('load', () => {
        geolocateControl.trigger();
    });

    // Map click collapses panel
    map.on('click', () => setSheetState("collapsed"));
}
