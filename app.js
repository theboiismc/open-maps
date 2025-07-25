// ✅ ADDED: Detect if the browser is on a mobile device based on its user agent.
const isMobile = /Mobi/i.test(navigator.userAgent);

// 1) Initialize map
const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-95, 39], zoom: 4
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

// DOM element references
const sidePanel = document.getElementById("side-panel");
const mainSearchInput = document.getElementById("main-search");
let currentPlace = null;
let routeLine = null;

// Utility to show a specific panel view
function showPanel(viewId) {
    ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => {
        document.getElementById(id).hidden = id !== viewId;
    });
    if (!sidePanel.classList.contains('peek') && !sidePanel.classList.contains('open')) {
        // ✅ MODIFIED: Use our new isMobile check instead of window width
        if (isMobile) {
            sidePanel.classList.add('peek');
        } else {
            sidePanel.classList.add('open');
        }
    }
}

// Debounce function to prevent API calls on every keystroke
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// 2) Search & Suggestions Logic
function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
    const fetchAndDisplaySuggestions = async (query) => {
        if (!query) { suggestionsEl.style.display = "none"; return; }
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
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
    inputEl.addEventListener("input", () => {
        debouncedFetch(inputEl.value.trim());
    });

    inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
}

async function performSmartSearch(inputEl, onSelect) {
    const query = inputEl.value.trim();
    if (!query) return;
    const bounds = map.getBounds();
    const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.length > 0) onSelect(data[0]);
    else alert("No results found for your search.");
}


// Attach listeners to search bars
const mainSuggestions = document.getElementById("main-suggestions");
attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
mainSearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });

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


// 3) Process and Display Place Info
function processPlaceResult(place) {
    currentPlace = place;
    map.flyTo({ center: [parseFloat(place.lon), parseFloat(place.lat)], zoom: 14 });
    mainSearchInput.value = place.display_name;
    
    document.getElementById('info-name').textContent = place.display_name.split(',')[0];
    document.getElementById('info-address').textContent = place.display_name;

    fetchAndSetPlaceImage(place.display_name.split(',')[0]);
    fetchAndSetWeather(place.lat, place.lon);
    fetchAndSetQuickFacts(place.display_name.split(',')[0]);
    
    showPanel('info-panel-redesign');
}

function fetchAndSetPlaceImage(query) {
    const imgEl = document.getElementById('info-image');
    const cleanedQuery = query.split(' ').join(',');
    imgEl.src = `https://source.unsplash.com/800x600/?${encodeURIComponent(cleanedQuery)}`;
    imgEl.alt = `Image of ${query}`;
}

async function fetchAndSetWeather(lat, lon) {
    const weatherEl = document.getElementById('info-weather');
    weatherEl.textContent = "Loading weather...";
    try {
        const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
        const data = await res.json();
        const condition = data.current_condition[0];
        weatherEl.innerHTML = `<img src="${condition.weatherIconUrl[0].value}" alt="weather icon" style="background: #eaf8ff; border-radius: 50%;"> ${condition.temp_C}°C / ${condition.temp_F}°F, ${condition.weatherDesc[0].value}`;
    } catch (e) {
        weatherEl.textContent = "Could not load weather data.";
        console.error("wttr.in API error", e);
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
        factsEl.textContent = page.extract ? page.extract.substring(0, 300) + '...' : "No quick facts found on Wikipedia.";
    } catch (e) {
        factsEl.textContent = "Could not load facts.";
        console.error("Wikipedia API error", e);
    }
}


// 4) Directions Panel Logic
function openDirectionsPanel() {
    if (currentPlace) {
        toInput.value = currentPlace.display_name;
        toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
    } else {
        toInput.value = '';
        toInput.dataset.coords = '';
    }
    fromInput.value = '';
    fromInput.dataset.coords = '';
    showPanel('directions-panel-redesign');
}

document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
document.getElementById('info-save-btn').addEventListener('click', () => {
    alert("Save feature not yet implemented!");
});

document.getElementById('swap-btn').addEventListener('click', () => {
    [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords];
});
document.getElementById('dir-use-my-location').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(pos => {
        fromInput.value = "Your Location";
        fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
    }, () => alert("Could not get your location."));
});
document.getElementById('back-to-info-btn').addEventListener('click', () => {
    if (currentPlace) showPanel('info-panel-redesign');
});
document.getElementById('exit-route-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));

// 5) Routing Logic
async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`);
    const data = await res.json();
    if (!data[0]) throw new Error(`Could not find: ${inputEl.value}`);
    inputEl.value = data[0].display_name;
    inputEl.dataset.coords = `${data[0].lon},${data[0].lat}`;
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}
document.getElementById('get-route-btn').addEventListener('click', async () => {
    if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
    try {
        const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
        const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return alert("No route found.");
        
        const route = data.routes[0].geometry;
        if (routeLine) { 
            map.getSource('route').setData({ type: 'Feature', geometry: route }); 
        } else {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#1a73e8', 'line-width': 6 } });
            routeLine = true;
        }
        const bounds = new maplibregl.LngLatBounds(start, end);
        map.fitBounds(bounds, { padding: { top: 50, bottom: 250, left: 50, right: 50 }});
        
        const stepsEl = document.getElementById("route-steps");
        stepsEl.innerHTML = "";
        data.routes[0].legs[0].steps.forEach(step => {
            const li = document.createElement("li");
            li.textContent = step.maneuver.instruction;
            stepsEl.appendChild(li);
        });
        showPanel('route-section');
    } catch (err) { 
        alert(err.message); 
    }
});


// 6) Mobile Panel Drag Logic
// ✅ MODIFIED: The entire drag logic is now wrapped in our 'isMobile' check.
if (isMobile) {
    const grabber = document.getElementById("panel-grabber");
    let startY, startBottom;
    grabber.addEventListener('touchstart', (e) => {
        startY = e.touches[0].pageY;
        startBottom = parseInt(getComputedStyle(sidePanel).bottom, 10);
        sidePanel.style.transition = 'none';
    }, { passive: true });
    grabber.addEventListener('touchmove', (e) => {
        if (startY === undefined) return;
        const currentY = e.touches[0].pageY;
        let newBottom = startBottom + (startY - currentY);
        if (newBottom > 0) newBottom = 0;
        sidePanel.style.bottom = `${newBottom}px`;
    }, { passive: true });
    grabber.addEventListener('touchend', () => {
        if (startY === undefined) return;
        startY = undefined;
        sidePanel.style.transition = 'bottom 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
        const currentBottom = parseInt(sidePanel.style.bottom);
        sidePanel.style.bottom = '';
        const threshold = -200;
        if (currentBottom > threshold) {
            sidePanel.classList.add("open");
            sidePanel.classList.remove("peek");
        } else {
            sidePanel.classList.remove("open");
            sidePanel.classList.add("peek");
        }
    });
}```
