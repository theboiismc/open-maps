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

async function performSmartSearch() {
    const query = mainSearchInput.value.trim();
    if (query) {
        showPanel('info-panel-redesign');
        try {
            const coords = await geocode(mainSearchInput);
            if (coords) {
                map.flyTo({ center: coords, zoom: 14 });
                showInfoPanel({
                    name: mainSearchInput.value,
                    address: `Coordinates: [${coords.join(', ')}]`,
                    coordinates: coords,
                    quickFacts: "Loading quick facts..."
                });
                fetchAndSetQuickFacts(mainSearchInput.value);
            }
        } catch (e) {
            console.error("Smart search failed", e);
            alert("Could not find that location. Please try a different search.");
            closePanel();
        }
    }
}

async function fetchAndSetPlaceImage(query, lon, lat) {
    const imageEl = document.getElementById('place-image');
    imageEl.src = "https://via.placeholder.com/200x150.png?text=Image+Not+Found";
    imageEl.alt = "Placeholder image";
    const url = `https://api.geoapify.com/v1/places/search?limit=1&filter=circle:${lon},${lat},500&bias=proximity:${lon},${lat}&apiKey=${GEOAPIFY_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const place = data.features[0];
            const name = place.properties.name || "Place";
            if (place.properties.image) {
                imageEl.src = place.properties.image;
                imageEl.alt = `Image of ${name}`;
            }
        }
    } catch (e) {
        console.error("Geoapify image fetch failed", e);
    }
}

async function fetchAndSetWeather(lat, lon) {
    const weatherEl = document.getElementById('weather-info');
    weatherEl.textContent = "Loading weather...";
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.current_weather) {
            const temp = document.getElementById('units-imperial').checked ? (data.current_weather.temperature * 9 / 5 + 32).toFixed(1) + '°F' : data.current_weather.temperature.toFixed(1) + '°C';
            weatherEl.textContent = `Temp: ${temp}, Wind: ${data.current_weather.windspeed} km/h`;
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
    inputEl.dataset.coords = `${data.features[0].center[0]},${data.features[0].center[1]}`;
    return data.features[0].center;
}
