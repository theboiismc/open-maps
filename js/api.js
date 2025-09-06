const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json";
const OPEN_METEO_API = "https://api.open-meteo.com/v1/forecast";
const OSRM_ROUTE_API = "https://router.project-osrm.org/route/v1/driving";
const MAPTILER_GEOCODING_API = "https://api.maptiler.com/geocoding";
const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';

/**
 * Fetches an image for a given location query.
 * @param {string} query - The name of the place.
 * @param {number} lon - Longitude for fallback.
 * @param {number} lat - Latitude for fallback.
 */
export async function fetchPlaceImage(query, lon, lat) {
    const imgEl = document.getElementById('info-image');
    try {
        const url = `${WIKIPEDIA_API}&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const page = Object.values(data.query.pages)[0];
        if (page.thumbnail && page.thumbnail.source) {
            imgEl.src = page.thumbnail.source;
            imgEl.alt = `Photograph of ${query}`;
        } else {
            throw new Error("No image on Wikipedia.");
        }
    } catch (e) {
        console.warn("Wikipedia image failed, using fallback:", e.message);
        const bbox = `${lon - 0.005},${lat - 0.005},${lon + 0.005},${lat + 0.005}`;
        imgEl.src = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
        imgEl.alt = `Map view of ${query}`;
    }
}

/**
 * Fetches the current weather for a given latitude and longitude.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 */
export async function fetchWeather(lat, lon) {
    const weatherEl = document.getElementById('info-weather');
    try {
        const url = `${OPEN_METEO_API}?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const { temperature, weathercode } = data.current_weather;
        const tempF = Math.round(temperature);
        const tempC = Math.round((tempF - 32) * 5 / 9);
        weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${getWeatherDescription(weathercode)}`;
    } catch (e) {
        weatherEl.textContent = "Could not load weather data.";
        console.error("Weather fetch failed:", e);
    }
}

/**
 * Fetches a short summary of a place from Wikipedia.
 * @param {string} query - The name of the place.
 */
export async function fetchQuickFacts(query) {
    const factsEl = document.getElementById('quick-facts-content');
    try {
        const url = `${WIKIPEDIA_API}&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const page = Object.values(data.query.pages)[0];
        factsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found.";
    } catch (e) {
        factsEl.textContent = "Could not load facts.";
        console.error("Quick facts fetch failed:", e);
    }
}

/**
 * Fetches a route between two points from OSRM.
 * @param {number[]} startCoords - [lon, lat] for the start point.
 * @param {number[]} endCoords - [lon, lat] for the end point.
 * @returns {Promise<object>} The route data from the API.
 */
export async function fetchRoute(startCoords, endCoords) {
    const url = `${OSRM_ROUTE_API}/${startCoords.join(',')};${endCoords.join(',')}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        throw new Error(data.message || "A route could not be found.");
    }
    return data;
}

/**
 * Fetches geocoding suggestions for a search query.
 * @param {string} query - The search text.
 * @param {object} center - The map center coordinates for proximity bias.
 * @returns {Promise<object>} The geocoding results.
 */
export async function fetchSuggestions(query, center) {
    const url = `${MAPTILER_GEOCODING_API}/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=5&fuzzyMatch=true`;
    const res = await fetch(url);
    return res.json();
}

/**
 * Geocodes a query to a single best-match location.
 * @param {string} query - The search text.
 * @param {object} center - The map center coordinates for proximity bias.
 * @returns {Promise<object>} The first feature from the geocoding results.
 */
export async function geocodeQuery(query, center) {
     const url = `${MAPTILER_GEOCODING_API}/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&proximity=${center.lng},${center.lat}&limit=1`;
     const res = await fetch(url);
     const data = await res.json();
     if (!data.features || data.features.length === 0) throw new Error(`Could not find: ${query}`);
     return data.features[0];
}

/**
 * Reverse geocodes coordinates to an address.
 * @param {object} lngLat - The coordinates {lng, lat}.
 * @returns {Promise<object>} The first feature from the geocoding results.
 */
export async function reverseGeocode(lngLat) {
    const url = `${MAPTILER_GEOCODING_API}/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.features || data.features.length === 0) throw new Error(`Could not find address.`);
    return data.features[0];
}

// --- Helper Functions ---
function getWeatherDescription(code) {
    const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 80: 'Slight rain showers', 95: 'Thunderstorm' };
    return descriptions[code] || "Weather unavailable";
}

// Make API functions globally available under a namespace
window.theBoiisMC = window.theBoiisMC || {};
window.theBoiisMC.api = {
    fetchPlaceImage,
    fetchWeather,
    fetchQuickFacts,
    fetchRoute,
    fetchSuggestions,
    geocodeQuery,
    reverseGeocode
};
