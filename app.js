document.addEventListener('DOMContentLoaded', () => {

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
    const mainSearchContainer = document.getElementById('main-search-container');
    const topSearchWrapper = document.getElementById('top-search-wrapper');
    const panelSearchPlaceholder = document.getElementById('panel-search-placeholder');
    const closePanelBtn = document.getElementById('close-panel-btn');

    let currentPlace = null;
    let routeLine = null;

    // --- UI LOGIC FOR MOVING SEARCH BAR ---
    function moveSearchBarToPanel() {
        if (isMobile) return;
        mainSearchContainer.style.boxShadow = 'none';
        mainSearchContainer.style.borderRadius = '8px';
        panelSearchPlaceholder.hidden = false;
        panelSearchPlaceholder.appendChild(mainSearchContainer);
        topSearchWrapper.style.opacity = '0';
    }

    function moveSearchBarToTop() {
        if (isMobile) return;
        mainSearchContainer.style.boxShadow = ''; // Reset to CSS default
        mainSearchContainer.style.borderRadius = ''; // Reset to CSS default
        topSearchWrapper.appendChild(mainSearchContainer);
        panelSearchPlaceholder.hidden = true;
        topSearchWrapper.style.opacity = '1';
    }

    // Utility to show a specific panel view
    function showPanel(viewId) {
        ['info-panel-redesign', 'directions-panel-redesign', 'route-section'].forEach(id => {
            document.getElementById(id).hidden = id !== viewId;
        });

        if (!sidePanel.classList.contains('open')) {
            if (isMobile) {
                if (!sidePanel.classList.contains('peek')) {
                     sidePanel.classList.add('peek');
                }
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
        // Close panel if map is clicked and the click wasn't on a map control
        const targetClasses = e.originalEvent.target.classList;
        if (!targetClasses.contains('maplibregl-ctrl-icon') && !targetClasses.contains('mapboxgl-ctrl-icon')) {
             closePanel();
        }
    });


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

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.length > 0) onSelect(data[0]);
            else alert("No results found for your search.");
        } catch (e) {
             alert("Search failed. Please check your connection.");
        }
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
        mainSearchInput.value = place.display_name.split(',').slice(0, 2).join(',');
        
        document.getElementById('info-name').textContent = place.display_name.split(',')[0];
        document.getElementById('info-address').textContent = place.display_name;

        const locationName = place.display_name.split(',')[0];
        fetchAndSetPlaceImage(locationName);
        fetchAndSetWeather(place.lat, place.lon);
        fetchAndSetQuickFacts(locationName);
        
        showPanel('info-panel-redesign');
    }

    async function fetchAndSetPlaceImage(query) {
        const imgEl = document.getElementById('info-image');
        imgEl.src = ''; // Clear previous image
        imgEl.style.backgroundColor = '#e0e0e0';
        imgEl.alt = 'Loading image...';

        try {
            const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = await res.json();
            const page = Object.values(data.query.pages)[0];
            
            if (page.thumbnail && page.thumbnail.source) {
                imgEl.src = page.thumbnail.source;
                imgEl.alt = `Image of ${query}`;
                imgEl.onerror = () => { // Add a fallback just in case the URL is bad
                    imgEl.style.backgroundColor = '#e0e0e0';
                    imgEl.alt = 'Image not available';
                };
            } else {
                throw new Error("No image found on Wikipedia.");
            }
        } catch (e) {
            console.error("Wikipedia Image API error:", e);
            imgEl.alt = 'Image not available';
        }
    }
    
    function getWeatherDescription(code) {
        const descriptions = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
            80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
        };
        return descriptions[code] || "Weather data unavailable";
    }

    async function fetchAndSetWeather(lat, lon) {
        const weatherEl = document.getElementById('info-weather');
        weatherEl.textContent = "Loading weather...";
        try {
            // ✅ FIXED: Switched to the more robust `current_weather=true` parameter.
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}¤t_weather=true&temperature_unit=fahrenheit`;
            const res = await fetch(url);
            
            if (!res.ok) { // Check if response is successful
                throw new Error(`API returned status ${res.status}`);
            }

            const data = await res.json();
            
            // ✅ FIXED: Parsing the new response structure from `current_weather`.
            if (data.current_weather) {
                const tempF = Math.round(data.current_weather.temperature);
                const tempC = Math.round((tempF - 32) * 5 / 9);
                // The weather code is now in `weathercode` (no underscore)
                const description = getWeatherDescription(data.current_weather.weathercode);
                weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
            } else {
                 throw new Error("Invalid weather data format from API.");
            }
        } catch (e) {
            weatherEl.textContent = "Could not load weather data.";
            console.error("Open-Meteo fetch/parse error:", e);
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


    // 4) Directions Panel Logic
    function openDirectionsPanel() {
        showPanel('directions-panel-redesign');
        if (currentPlace) {
            toInput.value = currentPlace.display_name;
            toInput.dataset.coords = `${currentPlace.lon},${currentPlace.lat}`;
            fromInput.value = '';
            fromInput.dataset.coords = '';
        } else {
            // If no location is selected, move main search to 'to' input
            toInput.value = mainSearchInput.value; 
            toInput.dataset.coords = '';
            fromInput.value = '';
            fromInput.dataset.coords = '';
        }
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
        }, () => alert("Could not get your location. Please enable location permissions."));
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
        if (!data[0]) throw new Error(`Could not find location: ${inputEl.value}`);
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
            if (!data.routes || data.routes.length === 0) return alert("No route found between the specified locations.");
            
            const route = data.routes[0].geometry;
            if (routeLine && map.getSource('route')) { 
                map.getSource('route').setData({ type: 'Feature', geometry: route }); 
            } else {
                map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
                map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0d89ec', 'line-width': 6 } });
                routeLine = true;
            }
            
            const bounds = new maplibregl.LngLatBounds();
            route.coordinates.forEach(coord => bounds.extend(coord));
            map.fitBounds(bounds, { padding: isMobile ? {top: 50, bottom: 250, left: 50, right: 50} : 100 });
            
            const stepsEl = document.getElementById("route-steps");
            stepsEl.innerHTML = "";
            data.routes[0].legs[0].steps.forEach(step => {
                const li = document.createElement("li");
                li.textContent = step.maneuver.instruction;
                stepsEl.appendChild(li);
            });
            showPanel('route-section');
        } catch (err) { 
            alert(`Error getting route: ${err.message}`); 
        }
    });


    // 6) Mobile Panel Drag Logic
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
            if (newBottom > 0) newBottom = 0; // Don't let it go above the screen bottom
            sidePanel.style.bottom = `${newBottom}px`;
        }, { passive: true });
        grabber.addEventListener('touchend', (e) => {
            if (startY === undefined) return;
            const endY = e.changedTouches[0].pageY;
            const deltaY = startY - endY;
            startY = undefined;

            sidePanel.style.transition = 'bottom 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
            const currentBottom = parseInt(sidePanel.style.bottom, 10);
            sidePanel.style.bottom = ''; // Let CSS take over

            if (deltaY > 50) { // Swiped up
                 sidePanel.classList.remove("peek");
                 sidePanel.classList.add("open");
            } else if (deltaY < -50) { // Swiped down
                sidePanel.classList.remove("open", "peek");
            } else { // Tap or small drag, decide based on position
                const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
                if (sidePanel.classList.contains('open')) {
                    // Stay open
                } else if (sidePanel.classList.contains('peek')) {
                    sidePanel.classList.remove('peek');
                    sidePanel.classList.add('open');
                }
            }
        });
    }

});
