document.addEventListener('DOMContentLoaded', () => {

    const isMobile = /Mobi/i.test(navigator.userAgent);

    // --- START: AUTHENTICATION UI LOGIC (DEFINITIVELY FIXED) ---

    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const savedPlacesBtn = document.getElementById('saved-places-btn');

    let isLoggedIn = false;

    const updateAuthUI = () => {
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
    };

    // This listener now ONLY handles toggling the dropdown's visibility.
    profileButton.addEventListener('click', (e) => {
        const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
        profileDropdown.style.display = isHidden ? 'block' : 'none';
    });

    // This listener now handles all "click outside" events to close the menu.
    document.addEventListener('click', (e) => {
        // If the dropdown is visible AND the click was NOT inside the profile area, then close it.
        // The `contains()` method checks if the clicked element (e.target) is a descendant of the profileArea.
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });


    // --- Placeholder actions for auth buttons ---

    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Redirecting to login page... (Simulation)");
        isLoggedIn = true;
        updateAuthUI();
        profileDropdown.style.display = 'none';
    });

    signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Redirecting to sign-up page... (Simulation)");
        profileDropdown.style.display = 'none';
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isLoggedIn = false;
        updateAuthUI();
        profileDropdown.style.display = 'none';
        alert("You have been logged out. (Simulation)");
    });

    savedPlacesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Feature 'Saved Places' not yet implemented!");
        profileDropdown.style.display = 'none';
    });

    // --- END: AUTHENTICATION UI LOGIC ---


    // --- All other code remains the same ---
    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: { version: 8, sources: { "esri-world-imagery": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: 'Tiles © Esri' } }, layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }] }
    };
    const STYLE_ICONS = {
        default: { src: 'satelite_style.png', alt: 'Switch to Satellite View' },
        satellite: { src: 'default_style.png', alt: 'Switch to Default View' }
    };

    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    const sidePanel = document.getElementById("side-panel");
    const mainSearchInput = document.getElementById("main-search");
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const layerSwitcher = document.getElementById('layer-switcher');
    const layerSwitcherIcon = document.getElementById('layer-switcher-icon');

    let currentPlace = null;
    let currentRouteGeoJSON = null;
    let currentStyle = 'default';

    function moveSearchBarToPanel() { if (!isMobile) { mainSearchContainer.style.boxShadow = 'none'; mainSearchContainer.style.borderRadius = '8px'; panelSearchPlaceholder.hidden = false; panelSearchPlaceholder.appendChild(mainSearchContainer); topSearchWrapper.style.opacity = '0'; } }
    function moveSearchBarToTop() { if (!isMobile) { mainSearchContainer.style.boxShadow = ''; mainSearchContainer.style.borderRadius = ''; topSearchWrapper.appendChild(mainSearchContainer); panelSearchPlaceholder.hidden = true; topSearchWrapper.style.opacity = '1'; } }

    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => {
            document.getElementById(id).hidden = id !== viewId;
        });
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
        if (isMobile) {
            sidePanel.classList.remove('open', 'peek');
        } else {
            sidePanel.classList.remove('open');
            moveSearchBarToTop();
        }
    }
    closePanelBtn.addEventListener('click', closePanel);
    map.on('click', (e) => {
        const targetClasses = e.originalEvent.target.classList;
        if (!targetClasses.contains('maplibregl-ctrl-icon') && !targetClasses.contains('mapboxgl-ctrl-icon')) {
            closePanel();
        }
    });

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

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
            } catch (e) { console.error("Suggestion fetch failed", e); }
        };
        const debouncedFetch = debounce(fetchAndDisplaySuggestions, 300);
        inputEl.addEventListener("input", () => debouncedFetch(inputEl.value.trim()));
        inputEl.addEventListener("blur", () => { setTimeout(() => { suggestionsEl.style.display = "none"; }, 200); });
    }

    async function performSmartSearch(inputEl, onSelect) {
        const query = inputEl.value.trim();
        if (!query) return;
        const bounds = map.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else alert("No results found for your search.");
        } catch (e) { alert("Search failed. Please check your connection."); }
    }

    const mainSuggestions = document.getElementById("main-suggestions");
    attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
    document.getElementById("main-search-icon").addEventListener("click", () => performSmartSearch(mainSearchInput, processPlaceResult));
    mainSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult);
    });

    const fromInput = document.getElementById('panel-from-input'), fromSuggestions = document.getElementById('panel-from-suggestions');
    attachSuggestionListener(fromInput, fromSuggestions, (place) => { fromInput.value = place.display_name; fromInput.dataset.coords = `${place.lon},${place.lat}`; });

    const toInput = document.getElementById('panel-to-input'), toSuggestions = document.getElementById('panel-to-suggestions');
    attachSuggestionListener(toInput, toSuggestions, (place) => { toInput.value = place.display_name; toInput.dataset.coords = `${place.lon},${place.lat}`; });

    function processPlaceResult(place) {
        currentPlace = place;
        currentRouteGeoJSON = null;
        if (map.getLayer('route-line')) { map.removeLayer('route-line'); }
        if (map.getSource('route')) { map.removeSource('route'); }
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
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}¤t_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API returned status ${res.status}`);
            const data = await res.json();
            if (data.current_weather) {
                const tempF = Math.round(data.current_weather.temperature);
                const tempC = Math.round((tempF - 32) * 5 / 9);
                const description = getWeatherDescription(data.current_weather.weathercode);
                weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
            } else { throw new Error("Invalid weather data format."); }
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
            fromInput.value = ''; fromInput.dataset.coords = '';
        } else {
            toInput.value = mainSearchInput.value;
            toInput.dataset.coords = '';
            fromInput.value = ''; fromInput.dataset.coords = '';
        }
    }

    document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
    document.getElementById('info-save-btn').addEventListener('click', () => {
        if (isLoggedIn) { alert("Feature 'Save Place' not yet implemented!"); }
        else { alert("Please log in to save places."); }
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
    document.getElementById('back-to-info-btn').addEventListener('click', () => { if (currentPlace) showPanel('info-panel-redesign'); });
    document.getElementById('exit-route-btn').addEventListener('click', () => showPanel('directions-panel-redesign'));

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
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0d89ec', 'line-width': 6 } });
        }
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
            const routeGeoJSON = { type: 'Feature', geometry: route };
            currentRouteGeoJSON = routeGeoJSON;
            addRouteToMap(routeGeoJSON);
            const bounds = new maplibregl.LngLatBounds();
            route.coordinates.forEach(coord => bounds.extend(coord));
            map.fitBounds(bounds, { padding: isMobile ? { top: 50, bottom: 250, left: 50, right: 50 } : 100 });
            const stepsEl = document.getElementById("route-steps");
            stepsEl.innerHTML = "";
            data.routes[0].legs[0].steps.forEach(step => {
                const li = document.createElement("li");
                li.textContent = step.maneuver.instruction;
                stepsEl.appendChild(li);
            });
            showPanel('route-section');
        } catch (err) { alert(`Error getting route: ${err.message}`); }
    });

    layerSwitcher.addEventListener('click', () => {
        currentStyle = (currentStyle === 'default') ? 'satellite' : 'default';
        map.setStyle(STYLES[currentStyle]);
        const newIcon = STYLE_ICONS[currentStyle];
        layerSwitcherIcon.src = newIcon.src;
        layerSwitcherIcon.alt = newIcon.alt;
    });

    map.on('styledata', () => {
        if (currentRouteGeoJSON) { addRouteToMap(currentRouteGeoJSON); }
    });

    if (isMobile) {
        const grabber = document.getElementById("panel-grabber");
        let startY;
        grabber.addEventListener('touchstart', (e) => { startY = e.touches[0].pageY; sidePanel.style.transition = 'none'; }, { passive: true });
        grabber.addEventListener('touchmove', (e) => {
            if (startY === undefined) return;
            const currentY = e.touches[0].pageY;
            let newBottom = (parseInt(getComputedStyle(sidePanel).bottom, 10) || 0) + (startY - currentY);
            if (newBottom > 0) newBottom = 0;
            sidePanel.style.bottom = `${newBottom}px`;
            startY = currentY;
        }, { passive: true });
        grabber.addEventListener('touchend', () => {
            if (startY === undefined) return;
            startY = undefined;
            sidePanel.style.transition = '';
            const currentBottom = parseInt(sidePanel.style.bottom, 10);
            const panelHeight = sidePanel.clientHeight;
            const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
            if (currentBottom > (-1 * panelHeight) / 2) {
                sidePanel.classList.remove('peek');
                sidePanel.classList.add('open');
            } else {
                sidePanel.classList.remove('open', 'peek');
            }
            sidePanel.style.bottom = '';
        });
    }

    updateAuthUI();
});
