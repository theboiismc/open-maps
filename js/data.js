/* ========= FETCH DATA ========= */
import { fetchJSON, showToast } from './utils.js';

export async function loadPlaces() {
    try {
        const data = await fetchJSON("/api/places");
        renderPlaces(data);
    } catch (err) {
        showToast(err.message, "error");
    }
}

function renderPlaces(places) {
    console.log("Places loaded:", places);
    // Implement DOM rendering logic here
}
