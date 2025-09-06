import maplibregl from 'maplibre-gl';
import { showToast, showPanel } from './ui.js';

let mapInstance = null;

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
    const { fetchSuggestions } = window.theBoiisMC.api;

    const debouncedFetch = debounce(async (query) => {
        if (query.length < 3) {
            suggestionsEl.style.display = "none";
            return;
        }
        try {
            const data = await fetchSuggestions(query, mapInstance.getCenter());
            suggestionsEl.innerHTML = "";
            data.features.forEach(item => {
                const el = document.createElement("div");
                el.className = "search-result";
                el.textContent = item.place_name;
                el.addEventListener("click", () => {
                    const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name };
                    inputEl.value = item.place_name;
                    suggestionsEl.style.display = "none";
                    onSelect(place);
                });
                suggestionsEl.appendChild(el);
            });
            suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
        } catch (e) {
            console.error("Suggestion fetch failed", e);
        }
    }, 300);

    inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
    inputEl.addEventListener("blur", () => setTimeout(() => { suggestionsEl.style.display = "none"; }, 200));
}

export async function performSmartSearch(inputEl, onSelect) {
    const { geocodeQuery } = window.theBoiisMC.api;
    const query = inputEl.value.trim();
    if (!query) return;

    try {
        const item = await geocodeQuery(query, mapInstance.getCenter());
        const place = { lon: item.center[0], lat: item.center[1], display_name: item.place_name };
        
        // Add marker and fly to location
        if (window.theBoiisMC.clickedLocationMarker) window.theBoiisMC.clickedLocationMarker.remove();
        window.theBoiisMC.clickedLocationMarker = new maplibregl.Marker()
            .setLngLat(item.center)
            .addTo(mapInstance);
        mapInstance.flyTo({ center: item.center, zoom: 14 });

        onSelect(place);
    } catch (e) {
        showToast("No results found for your search.", "error");
    }
}

export async function reverseGeocodeAndShowInfo(lngLat) {
    const { reverseGeocode } = window.theBoiisMC.api;
    try {
        const item = await reverseGeocode(lngLat);
        const place = {
            lon: item.center[0],
            lat: item.center[1],
            display_name: item.place_name
        };
        
        // Add marker at clicked location
        if (window.theBoiisMC.clickedLocationMarker) window.theBoiisMC.clickedLocationMarker.remove();
        window.theBoiisMC.clickedLocationMarker = new maplibregl.Marker()
            .setLngLat(item.center)
            .addTo(mapInstance);
            
        return place;
    } catch (error) {
        console.error("Reverse geocoding failed", error);
        return null;
    }
}

export function initializeSearch(map, onPlaceSelected) {
    mapInstance = map;
    window.theBoiisMC = window.theBoiisMC || {};
    window.theBoiisMC.clickedLocationMarker = null;

    const mainSearchInput = document.getElementById("main-search");
    const mainSuggestions = document.getElementById("main-suggestions");
    const fromInput = document.getElementById('panel-from-input');
    const fromSuggestions = document.getElementById('panel-from-suggestions');
    const toInput = document.getElementById('panel-to-input');
    const toSuggestions = document.getElementById('panel-to-suggestions');

    // Main search bar
    attachSuggestionListener(mainSearchInput, mainSuggestions, onPlaceSelected);
    document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, onPlaceSelected));
    mainSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") performSmartSearch(mainSearchInput, onPlaceSelected);
    });

    // Directions inputs
    const setCoords = (input, place) => { input.dataset.coords = `${place.lon},${place.lat}`; };
    attachSuggestionListener(fromInput, fromSuggestions, (place) => setCoords(fromInput, place));
    attachSuggestionListener(toInput, toSuggestions, (place) => setCoords(toInput, place));
}
