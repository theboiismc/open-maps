/* ========= MAP ========= */
import { setSheetState } from './bottomSheet.js';

export let map;

export function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 0, lng: 0 },
        zoom: 2,
        disableDefaultUI: true
    });

    map.addListener("click", () => {
        setSheetState("collapsed");
    });
}
