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
                quickFacts: 'Search powered by MapTiler Geocoding API. The search results are more accurate and comprehensive, allowing users to find any place.'
            });
        } else {
            document.getElementById('spinner').hidden = true;
            showInfoPanel({
                name: 'Not Found',
                address: `Could not find any results for "${query}"`,
                coordinates: [-95, 39],
                quickFacts: 'Please try a different search query.'
            });
        }
    } catch (e) {
        document.getElementById('spinner').hidden = true;
        console.error("Search fetch failed:", e);
        showInfoPanel({
            name: 'Search Error',
            address: `An error occurred while searching for "${query}"`,
            coordinates: [-95, 39],
            quickFacts: 'Please check your internet connection or try again later.'
        });
    }
}

async function fetchAndSetPlaceImage(query, lon, lat) {
    const imgEl = document.getElementById('info-image');
    // Using Place Details API with a search query
    // The previous logic for Unsplash is removed as we now use MapTiler
    // This is an example of what can be done with MapTiler's API for place images
    // Note: A specific 'place image' API endpoint is not provided, this would be a custom implementation
    // For now, we'll keep a placeholder or remove the image functionality
    console.log(`Searching for image for ${query} at [${lon}, ${lat}]`);
    // Placeholder logic: We'll set a default image for now
    imgEl.src = 'https://via.placeholder.com/300x200?text=MapTiler';
}

async function fetchAndSetWeather(lat, lon) {
    const weatherEl = document.getElementById('weather-content');
    weatherEl.textContent = "Loading weather...";
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`);
        const data = await res.json();
        if (data.current) {
            const temp = data.current.temperature_2m;
            const wind = data.current.wind_speed_10m;
            weatherEl.textContent = `Current temp: ${temp}°F, Wind: ${wind} mph`;
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

async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    // NEW: Use MapTiler Geocoding API for the final geocode
    const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(inputEl.value)}.json?key=${MAPTILER_KEY}&limit=1`);
    const data = await res.json();
    if (!data.features[0]) throw new Error(`Could not find location: ${inputEl.value}`);
    inputEl.value = data.features[0].place_name;
    inputEl.dataset.coords = data.features[0].center.join(',');
    return data.features[0].center;
}
