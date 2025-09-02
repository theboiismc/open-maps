// --- CORE PANEL & SEARCH LOGIC ---
function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

function showPanel(viewId) {
    ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => { document.getElementById(id).hidden = id !== viewId; });
    if (!sidePanel.classList.contains('open')) {
        if (isMobile) {
            if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek');
        } else {
            sidePanel.classList.add('open');
            moveSearchBarToPanel();
        }
    }
}

function closePanel() {
    if (isMobile) sidePanel.classList.remove('open', 'peek');
    else {
        sidePanel.classList.remove('open');
        moveSearchBarToTop();
    }
}

if(closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
closeInfoBtn.addEventListener('click', closePanel);

map.on('click', (e) => {
    const target = e.originalEvent.target;
    if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) {
        closePanel();
    }
});

function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }

const mainSuggestions = document.getElementById("main-suggestions");
attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput.value));
mainSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSmartSearch(mainSearchInput.value);
});

const fromInput = document.getElementById('panel-from-input');
const fromSuggestions = document.getElementById('panel-from-suggestions');
attachSuggestionListener(fromInput, fromSuggestions, (place) => {
    fromInput.value = place.place_name;
    fromInput.dataset.coords = `${place.center[0]},${place.center[1]}`;
});

const toInput = document.getElementById('panel-to-input');
const toSuggestions = document.getElementById('panel-to-suggestions');
attachSuggestionListener(toInput, toSuggestions, (place) => {
    toInput.value = place.place_name;
    toInput.dataset.coords = `${place.center[0]},${place.center[1]}`;
});

function processPlaceResult(place) {
    currentPlace = place;
    stopNavigation();
    clearRouteFromMap();
    map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
    mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
    document.getElementById('info-name').textContent = place.display_name.split(',')[0];
    document.getElementById('info-address').textContent = place.display_name;
    const locationName = place.display_name.split(',')[0];
    fetchAndSetPlaceImage(locationName, place.lon, place.lat);
    fetchAndSetWeather(place.lat, place.lon);
    fetchAndSetQuickFacts(locationName);
    showPanel('info-panel-redesign');
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

function openDirectionsPanel() {
    showPanel('directions-panel-redesign');
    if (currentPlace) {
        toInput.value = currentPlace.display_name;
        toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
        fromInput.value = '';
        fromInput.dataset.coords = '';
    } else {
        toInput.value = mainSearchInput.value;
    }
}
document.getElementById('get-directions-btn').addEventListener('click', openDirectionsPanel);

// Function to handle showing the info panel
function showInfoPanel(place) {
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
}
