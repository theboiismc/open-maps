document.addEventListener('DOMContentLoaded', () => {
    // --- SETUP & STATE MANAGEMENT ---
    const isMobile = /Mobi/i.test(navigator.userAgent);
    
    // ✅ FIXED: The full style objects are now here, not placeholders.
    const STYLES = {
        default: 'https://tiles.openfreemap.org/styles/liberty',
        satellite: {
            version: 8,
            sources: {
                "esri-world-imagery": {
                    type: "raster",
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    tileSize: 256,
                    attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                }
            },
            layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery" }]
        }
    };
    const STYLE_ICONS = {
        default: { src: 'satelite_style.png', alt: 'Switch to Satellite View' },
        satellite: { src: 'default_style.png', alt: 'Switch to Default View' }
    };

    // ✅ FIXED: Map initialization is complete.
    const map = new maplibregl.Map({
        container: "map",
        style: STYLES.default,
        center: [-95, 39],
        zoom: 4
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

    // DOM References
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    const getRouteBtn = document.getElementById('get-route-btn');
    const startNavBtn = document.getElementById('start-nav-btn');
    const shareRouteBtn = document.getElementById('share-route-btn');
    const routeSection = document.getElementById('route-section');
    const directionsPanel = document.getElementById('directions-panel-redesign');
    const backToDirectionsBtn = document.getElementById('back-to-directions-btn');
    const sidePanel = document.getElementById('side-panel');
    const mainDirectionsIcon = document.getElementById('main-directions-icon');
    const navUi = document.getElementById('nav-ui');
    const navInstructionEl = document.getElementById('nav-instruction');
    const navDistanceEl = document.getElementById('nav-distance');
    const exitNavBtn = document.getElementById('exit-nav-btn');
    const shareModalOverlay = document.getElementById('share-modal-overlay');
    const qrCodeCanvas = document.getElementById('qr-code');
    const shareLinkInput = document.getElementById('share-link');
    const layerSwitcher = document.getElementById('layer-switcher');
    const layerSwitcherIcon = document.getElementById('layer-switcher-icon');
    
    // Navigation State
    let isNavigating = false;
    let currentRoute = null;
    let currentRouteGeoJSON = null;
    let currentStepIndex = 0;
    let locationWatcherId = null;
    let userMarker = null;

    // --- INITIALIZATION ---
    checkForNavInUrl();
    mainDirectionsIcon.addEventListener('click', () => sidePanel.classList.add('open'));
    backToDirectionsBtn.addEventListener('click', () => {
        routeSection.classList.add('hidden');
        directionsPanel.classList.remove('hidden');
    });

    // --- NAVIGATION ENGINE ---
    function startNavigation() {
        if (!currentRoute || !isMobile) return;
        isNavigating = true;
        currentStepIndex = 0;
        sidePanel.classList.remove('open');
        navUi.classList.add('visible');
        map.flyTo({ zoom: 18, pitch: 60 });

        if (!userMarker) {
            const el = document.createElement('div');
            el.className = 'user-marker';
            userMarker = new maplibregl.Marker(el).setLngLat([0, 0]).addTo(map);
        }
        
        locationWatcherId = navigator.geolocation.watchPosition(
            (position) => {
                const userCoords = [position.coords.longitude, position.coords.latitude];
                userMarker.setLngLat(userCoords);
                map.setCenter(userCoords);
                checkStepCompletion(userCoords);
            },
            () => { alert("GPS signal lost."); stopNavigation(); },
            { enableHighAccuracy: true }
        );
        updateNavInstruction();
    }
    
    function stopNavigation() {
        if (!isNavigating) return;
        isNavigating = false;
        navUi.classList.remove('visible');
        if (locationWatcherId) navigator.geolocation.clearWatch(locationWatcherId);
        if (userMarker) { userMarker.remove(); userMarker = null; }
        map.flyTo({ pitch: 0 });
        speechSynthesis.cancel();
    }
    
    exitNavBtn.addEventListener('click', stopNavigation);
    startNavBtn.addEventListener('click', startNavigation);

    function updateNavInstruction() {
        if (!currentRoute || currentStepIndex >= currentRoute.legs[0].steps.length) {
            navInstructionEl.textContent = "You have arrived!";
            navDistanceEl.textContent = "";
            speak("You have arrived at your destination.");
            setTimeout(stopNavigation, 3000);
            return;
        }
        const step = currentRoute.legs[0].steps[currentStepIndex];
        navInstructionEl.textContent = step.maneuver.instruction;
        speak(step.maneuver.instruction);
    }
    
    function checkStepCompletion(userCoords) {
        if (!currentRoute) return;
        const step = currentRoute.legs[0].steps[currentStepIndex];
        const nextManeuverCoords = step.maneuver.location;
        const distance = getDistance(userCoords, nextManeuverCoords);
        navDistanceEl.textContent = `${distance.toFixed(2)} mi to next turn`;
        if (distance < 0.012) { // approx 20 meters
            currentStepIndex++;
            updateNavInstruction();
        }
    }

    function speak(text) {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
        }
    }

    function getDistance(coords1, coords2) {
        const R = 3959; // Earth radius in miles
        const dLat = (coords2[1] - coords1[1]) * Math.PI / 180;
        const dLon = (coords2[0] - coords1[0]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(coords1[1] * Math.PI / 180) * Math.cos(coords2[1] * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // --- ROUTING & SHARE LOGIC ---
    getRouteBtn.addEventListener('click', async () => {
        if (!fromInput.value || !toInput.value) return alert("Please fill both start and end points.");
        try {
            const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
            fetchAndDisplayRoute(start, end);
        } catch (err) { alert(`Error getting route: ${err.message}`); }
    });

    async function fetchAndDisplayRoute(startCoords, endCoords) {
        const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.join(',')};${endCoords.join(',')}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return alert("No route found.");
        
        currentRoute = data.routes[0];
        currentRouteGeoJSON = { type: 'Feature', geometry: currentRoute.geometry };
        addRouteToMap(currentRouteGeoJSON);

        const bounds = new maplibregl.LngLatBounds();
        currentRoute.geometry.coordinates.forEach(coord => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 100 });
        
        const stepsEl = document.getElementById("route-steps");
        stepsEl.innerHTML = "";
        currentRoute.legs[0].steps.forEach(step => {
            const li = document.createElement("li");
            li.textContent = step.maneuver.instruction;
            stepsEl.appendChild(li);
        });
        
        // Show the route panel and the correct action button
        directionsPanel.classList.add('hidden');
        routeSection.classList.remove('hidden');
        getRouteBtn.classList.add('hidden');
        if (isMobile) {
            startNavBtn.classList.remove('hidden');
        } else {
            shareRouteBtn.classList.remove('hidden');
        }
    }
    
    shareRouteBtn.addEventListener('click', () => {
        const start = currentRoute.legs[0].steps[0].maneuver.location;
        const end = currentRoute.legs[0].steps[currentRoute.legs[0].steps.length - 1].maneuver.location;
        const navUrl = `${window.location.origin}${window.location.pathname}?nav=${start.join(',')};${end.join(',')}`;
        shareLinkInput.value = navUrl;
        new QRious({ element: qrCodeCanvas, value: navUrl, size: 200, padding: 10 });
        shareModalOverlay.classList.add('visible');
    });

    shareModalOverlay.addEventListener('click', (e) => {
        if (e.target === shareModalOverlay) shareModalOverlay.classList.remove('visible');
    });

    function checkForNavInUrl() {
        const params = new URLSearchParams(window.location.search);
        const navData = params.get('nav');
        if (navData) {
            sidePanel.classList.add('open');
            const [startStr, endStr] = navData.split(';');
            const startCoords = startStr.split(',').map(Number);
            const endCoords = endStr.split(',').map(Number);
            fromInput.value = `Route Start`;
            toInput.value = `Route Destination`;
            fetchAndDisplayRoute(startCoords, endCoords);
        }
    }

    async function geocode(query) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data[0]) throw new Error(`Could not find: ${query}`);
        return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    }

    // --- MAP & LAYER LOGIC ---
    function addRouteToMap(routeGeoJSON) {
        if (map.getSource('route')) {
             map.getSource('route').setData(routeGeoJSON);
        } else {
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0d89ec', 'line-width': 6 } }, 'road-label'); // Draw route under labels
        }
    }
    
    layerSwitcher.addEventListener('click', () => {
        const newStyleKey = (currentStyle === 'default') ? 'satellite' : 'default';
        map.setStyle(STYLES[newStyleKey]);
        const newIcon = STYLE_ICONS[newStyleKey];
        layerSwitcherIcon.src = newIcon.src;
        layerSwitcherIcon.alt = newIcon.alt;
        currentStyle = newStyleKey;
    });

    map.on('styledata', () => {
        if (currentRouteGeoJSON) addRouteToMap(currentRouteGeoJSON);
    });
});
