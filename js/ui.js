const settingsMenu = document.getElementById('settings-menu');
const profileBtn = document.getElementById('profile-button');
const profileDropdown = document.getElementById('profile-dropdown');
const closeInfoBtn = document.getElementById('close-info-btn');
const sidePanel = document.getElementById('side-panel');
const mainSearchContainer = document.querySelector('.main-search-container');
const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
const topSearchWrapper = document.getElementById('top-search-wrapper');

// --- FIX 1: Added declaration for the main search input element ---
const mainSearchInput = document.getElementById('main-search');

let isMobile = window.matchMedia("(max-width: 768px)").matches;

window.addEventListener('resize', () => {
    isMobile = window.matchMedia("(max-width: 768px)").matches;
});

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

if(document.getElementById('close-panel-btn')) document.getElementById('close-panel-btn').addEventListener('click', closePanel);
closeInfoBtn.addEventListener('click', closePanel);

map.on('click', (e) => {
    const target = e.originalEvent.target;
    if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn') && !target.closest('#profile-button')) {
        closePanel();
    }
});

function debounce(func, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
    const fetchAndDisplaySuggestions = async (query) => {
        if (!query) { suggestionsEl.style.display = "none"; return; }
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            suggestionsEl.innerHTML = "";
            data.forEach(item => {
                const el = document.createElement("div");
                el.className = "search-result";
                el.textContent = item.display_name;
                el.addEventListener("click", () => onSelect(item));
                suggestionsEl.appendChild(el);
            });
            suggestionsEl.style.display = data.length > 0 ? "block" : "none";
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

async function performSmartSearch(inputEl, onSelect) {
    const query = inputEl.value.trim();
    if (!query) return;
    const bounds = map.getBounds();
    const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.length > 0) onSelect(data[0]);
        else alert("No results found for your search.");
    } catch (e) {
        alert("Search failed. Please check your connection.");
    }
}

const mainSuggestions = document.getElementById("main-suggestions");
attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
document.getElementById("search-icon-inside").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
mainSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult);
});

const fromInput = document.getElementById('panel-from-input');
const fromSuggestions = document.getElementById('panel-from-suggestions');
attachSuggestionListener(fromInput, fromSuggestions, (place) => {
    fromInput.value = place.display_name;
    fromInput.dataset.coords = `${place.lon},${place.lat}`;
});

const toInput = document.getElementById('panel-to-input');
const toSuggestions = document.getElementById('panel-to-suggestions');
attachSuggestionListener(toInput, toSuggestions, (place) => {
    toInput.value = place.display_name;
    toInput.dataset.coords = `${place.lon},${place.lat}`;
});

function processPlaceResult(place) {
    currentPlace = place;
    // stopNavigation(); // Assuming stopNavigation is defined elsewhere
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
        toInput.dataset.coords = '';
        fromInput.value = '';
        fromInput.dataset.coords = '';
    }
}

document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
document.getElementById('info-save-btn').addEventListener('click', () => {
    // Assuming currentUser is defined elsewhere
    if (typeof currentUser !== 'undefined' && currentUser) {
        alert("Feature 'Save Place' not yet implemented!");
    } else {
        alert("Please log in to save places.");
    }
});

document.getElementById('swap-btn').addEventListener('click', () => {
    [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords];
});

document.getElementById('dir-use-my-location').addEventListener('click', () => {
    fromInput.value = "Getting your location...";
    navigator.geolocation.getCurrentPosition(
        pos => {
            fromInput.value = "Your Location";
            fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        },
        () => alert("Could not get your location."), // Simplified error handler
        { enableHighAccuracy: true } // Simplified geolocation options
    );
});

document.getElementById('back-to-info-btn').addEventListener('click', () => {
    if (currentPlace) showPanel('info-panel-redesign');
});

document.getElementById('back-to-directions-btn').addEventListener('click', () => {
    showPanel('directions-panel-redesign');
});

function clearRouteFromMap() {
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    // Assuming highlightedSegmentLayerId is defined elsewhere
    if (typeof highlightedSegmentLayerId !== 'undefined') {
        if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
        if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
    }
}
    
function displayRoutePreview(route) {
    const durationMinutes = Math.round(route.duration / 60);
    const distanceMiles = (route.distance / 1609.34).toFixed(1);
    document.getElementById('route-summary-time').textContent = `${durationMinutes} min`;
    document.getElementById('route-summary-distance').textContent = `${distanceMiles} mi`;
    showPanel('route-preview-panel');
}

async function getRoute() {
    if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
    clearRouteFromMap();
    try {
        const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
        const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0 || !data.routes[0].legs || !data.routes[0].legs[0].steps || data.routes[0].legs[0].steps.length === 0) {
            return alert("A route could not be found. Please try a different location.");
        }
        currentRouteData = data;
        const route = data.routes[0];
        const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
        addRouteToMap(routeGeoJSON);
        const bounds = new maplibregl.LngLatBounds();
        routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));

        if (fromInput.value.trim() === "Your Location") {
            map.fitBounds(bounds, { padding: isMobile ? { top: 150, bottom: 250, left: 50, right: 50 } : 100 });
            closePanel();
            // startNavigation(); // Assuming startNavigation is defined elsewhere
        } else {
            displayRoutePreview(route);
            map.fitBounds(bounds, { padding: isMobile ? 50 : { top: 50, bottom: 50, left: 450, right: 50 } });
        }
    } catch (err) {
        alert(`Error getting route: ${err.message}`);
    }
}
    
document.getElementById('start-navigation-btn').addEventListener('click', () => console.log("Start Navigation clicked")); // Placeholder for startNavigation
const shareRouteBtn = document.getElementById('share-route-btn');
shareRouteBtn.addEventListener('click', async () => {
    const fromName = fromInput.value;
    const toName = toInput.value;
    const fromCoords = fromInput.dataset.coords;
    const toCoords = toInput.dataset.coords;
    const shareText = `Check out this route from ${fromName} to ${toName}!`;
    const url = new URL(window.location.href);
    url.searchParams.set('from', fromCoords);
    url.searchParams.set('to', toCoords);
    url.searchParams.set('fromName', fromName);
    url.searchParams.set('toName', toName);

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'TheBoiisMC Maps Route',
                text: shareText,
                url: url.toString()
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    } else {
        navigator.clipboard.writeText(url.toString()).then(() => {
            alert("Route link copied to clipboard!");
        }).catch(err => {
            console.error('Could not copy link: ', err);
            alert("Could not copy link. Please manually copy the URL from the address bar.");
        });
    }
});

document.getElementById('get-route-btn').addEventListener('click', getRoute);
document.getElementById('exit-route-btn').addEventListener('click', () => {
    clearRouteFromMap();
    showPanel('directions-panel-redesign');
});

async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`);
    const data = await res.json();
    if (!data[0]) throw new Error(`Could not find location: ${inputEl.value}`);
    inputEl.value = data[0].display_name;
    inputEl.dataset.coords = `${data[0].lon},${data[0].lat}`;
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

function addRouteToMap(routeGeoJSON) {
    if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
    } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 } });
    }
}

// NOTE: All advanced navigation functions from logic.js can be pasted here if needed.

// --- SETTINGS & OTHER UI LOGIC ---
// --- FIX 2: Corrected selector and event listener logic for ALL settings buttons ---
const settingsBtns = document.querySelectorAll('.js-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const menuOverlay = document.getElementById('menu-overlay');
const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
const trafficToggle = document.getElementById('traffic-toggle');

function openProfileDropdown() { profileDropdown.classList.add('open'); profileBtn.classList.add('active'); }
function closeProfileDropdown() { profileDropdown.classList.remove('open'); profileBtn.classList.remove('active'); }
function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }

settingsBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeProfileDropdown();
        if (settingsMenu.classList.contains('open')) {
            closeSettings();
        } else {
            openSettings();
        }
    });
});

profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettings();
    if (profileDropdown.classList.contains('open')) {
        closeProfileDropdown();
    } else {
        openProfileDropdown();
    }
});

closeSettingsBtn.addEventListener('click', closeSettings);
menuOverlay.addEventListener('click', closeSettings);

document.addEventListener('click', (e) => {
    if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) {
        closeSettings();
    }
    if (profileDropdown.classList.contains('open') && !profileDropdown.contains(e.target) && !e.target.closest('#profile-button')) {
        closeProfileDropdown();
    }
});

styleRadioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
        const newStyle = radio.value;
        // Assuming STYLES object is defined elsewhere
        if (typeof STYLES !== 'undefined') map.setStyle(STYLES[newStyle]);
        if (isMobile) {
            setTimeout(closeSettings, 200);
        }
    });
});

trafficToggle.addEventListener('change', () => {
    if (trafficToggle.checked) {
        // addTrafficLayer(); // Assuming addTrafficLayer is defined elsewhere
    } else {
        // removeTrafficLayer(); // Assuming removeTrafficLayer is defined elsewhere
    }
    if (isMobile) {
        setTimeout(closeSettings, 200);
    }
});

document.querySelectorAll('input[name="map-units"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (isMobile) {
            setTimeout(closeSettings, 200);
        }
    });
});

map.on('styledata', () => {
    // Assuming navigationState and currentRouteData are defined elsewhere
    if (typeof navigationState !== 'undefined' && navigationState.isActive && currentRouteData) {
        const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
        addRouteToMap(routeGeoJSON);
        // updateHighlightedSegment(...); // Assuming this function is defined
    }
    if (trafficToggle.checked) {
        // addTrafficLayer();
    }
});
