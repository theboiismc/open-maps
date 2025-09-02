// --- SEARCH & DATA FETCHING LOGIC ---
const MAPTILER_KEY = 'F3cdRiC1r36tcrNrvrcV';
const GEOAPIFY_KEY = 'YOUR_GEOAPIFY_API_KEY'; // IMPORTANT: Add your new Geoapify API key here.

function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
    const fetchAndDisplaySuggestions = async (query) => {
        if (!query) { suggestionsEl.style.display = "none"; return; }
        // NEW: Use MapTiler Geocoding API for suggestions
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&limit=5`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            suggestionsEl.innerHTML = "";
            data.features.forEach(item => {
                const el = document.createElement("div");
                el.className = "search-result";
                el.textContent = item.place_name;
                const coords = `${item.center[0]},${item.center[1]}`;
                el.dataset.coords = coords;
                el.addEventListener("click", () => onSelect(item));
                suggestionsEl.appendChild(el);
            });
            suggestionsEl.style.display = data.features.length > 0 ? "block" : "none";
        } catch (e) {
            console.error("Suggestion fetch failed", e);
        }
    };
    const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
    inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
    inputEl.addEventListener("blur", () => {
        setTimeout(() => { suggestionsEl.style.display = "none"; }, 200);
    });
}

async function performSmartSearch(query) {
    showPanel('info-panel-redesign');
    document.getElementById('spinner').hidden = false;
    // NEW: Use MapTiler Geocoding API for main search
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&limit=1`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        document.getElementById('spinner').hidden = true;
        if (data.features[0]) {
            const place = data.features[0];
            const coordinates = place.center;
            const placeName = place.text || place.place_name.split(',')[0];
            const formattedAddress = place.place_name;
            showInfoPanel({
                name: placeName,
                address: formattedAddress,
                coordinates: coordinates,
                quickFacts: 'Tap for directions.'
            });
        } else {
            alert("No results found for your search.");
        }
    } catch (e) {
        alert("Search failed. Please check your connection.");
        document.getElementById('spinner').hidden = true;
    }
}

function processPlaceResult(place) {
    currentPlace = place;
    stopNavigation();
    clearRouteFromMap();
    map.flyTo({ center: [parseFloat(place.center[0]), parseFloat(place.center[1])], zoom: 14 });
    mainSearchInput.value = place.place_name.split(',').slice(0, 2).join(',');
    document.getElementById('info-name').textContent = place.text || place.place_name.split(',')[0];
    document.getElementById('info-address').textContent = place.place_name;
    const locationName = place.text || place.place_name.split(',')[0];
    fetchAndSetPlaceImage(locationName, place.center[0], place.center[1]);
    fetchAndSetWeather(place.center[1], place.center[0]);
    fetchAndSetQuickFacts(locationName);
    showPanel('info-panel-redesign');
}

async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    // NEW: Use MapTiler Geocoding API for the final geocode
    const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?key=${MAPTILER_KEY}&limit=1`);
    const data = await res.json();
    if (!data.features[0]) throw new Error(`Could not find location: ${inputEl.value}`);
    inputEl.value = data.features[0].place_name;
    inputEl.dataset.coords = `${data.features[0].center[0]},${data.features[0].center[1]}`;
    return data.features[0].center;
}

// --- UTILITY FUNCTIONS ---
function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
function getWeatherDescription(code) {
    const descriptions = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail' };
    return descriptions[code] || "Weather data unavailable";
}
async function fetchAndSetWeather(lat, lon) {
    const weatherEl = document.getElementById('info-weather');
    weatherEl.textContent = "Loading weather...";
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API returned status ${res.status}`);
        const data = await res.json();
        if (data.current_weather) {
            const tempF = Math.round(data.current_weather.temperature);
            const tempC = Math.round((tempF - 32) * 5 / 9);
            const description = getWeatherDescription(data.current_weather.weathercode);
            weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
        } else {
            throw new Error("Invalid weather data format.");
        }
    } catch (e) {
        weatherEl.textContent = "Could not load weather data.";
        console.error("Weather fetch/parse error:", e);
    }
}

async function fetchAndSetQuickFacts(query) {
    const factsEl = document.getElementById('quick-facts-content');
    factsEl.textContent = "Loading facts...";
    try {
        const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const page = Object.values(data.query.pages)[0];
        factsEl.textContent = page.extract ? page.extract.substring(0, 350) + '...' : "No quick facts found on Wikipedia.";
    } catch (e) {
        factsEl.textContent = "Could not load facts.";
        console.error("Wikipedia API error", e);
    }
}

async function fetchAndSetPlaceImage(query, lon, lat) {
    const imgEl = document.getElementById('info-image');
    imgEl.src = '';
    imgEl.style.backgroundColor = '#e0e0e0';
    imgEl.alt = 'Loading image...';
    imgEl.onerror = null;
    try {
        const wikipediaUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
        const res = await fetch(wikipediaUrl);
        const data = await res.json();
        const page = Object.values(data.query.pages)[0];
        if (page.thumbnail && page.thumbnail.source) {
            imgEl.src = page.thumbnail.source;
            imgEl.alt = `Photograph of ${query}`;
            return;
        } else {
            throw new Error("No image found on Wikipedia.");
        }
    } catch (e) {
        console.log("Wikipedia image failed:", e.message, "Activating fallback.");
        const offset = 0.005;
        const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
        const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
        imgEl.src = fallbackUrl;
        imgEl.alt = `Map view of ${query}`;
        imgEl.onerror = () => {
            imgEl.style.backgroundColor = '#e0e0e0';
            imgEl.alt = 'Image not available';
        };
    }
}
