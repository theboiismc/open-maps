// app.js
// Full updated app.js
// - Robust error handling + toast notifications
// - Google Maps-like bottom sheet (collapsed / half / full) with touch dragging
// - System theme preference & setting persistence
// - Improved mobile/desktop behavior while preserving original app logic

/* ========= AUTHENTICATION SERVICE (OIDC with Authentik) ========= */
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com/"
};

/* ========= GLOBAL STATE ========= */
const state = {
    map: null,
    userMarker: null,
    routeLayer: null,
    panel: document.getElementById('bottom-sheet'),
    panelState: 'collapsed', // collapsed, half, full
    isDragging: false,
    dragStartY: 0,
    dragStartHeight: 0
};

/* ========= TOAST NOTIFICATIONS ========= */
function showToast(message, type='info', duration=3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/* ========= SYSTEM THEME ========= */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

/* ========= MAP INITIALIZATION ========= */
async function initMap() {
    try {
        state.map = L.map('map', {
            center: [37.7749, -122.4194],
            zoom: 13,
            zoomControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(state.map);

        state.routeLayer = L.layerGroup().addTo(state.map);

        showToast('Map loaded successfully!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error initializing map', 'error');
    }
}

/* ========= USER LOCATION ========= */
function trackUserLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'warning');
        return;
    }

    navigator.geolocation.watchPosition(pos => {
        const { latitude, longitude } = pos.coords;
        if (!state.userMarker) {
            state.userMarker = L.marker([latitude, longitude]).addTo(state.map);
        } else {
            state.userMarker.setLatLng([latitude, longitude]);
        }
    }, err => {
        console.error(err);
        showToast('Failed to get location', 'error');
    }, { enableHighAccuracy: true });
}

/* ========= ROUTE HANDLING ========= */
async function drawRoute(coords) {
    try {
        state.routeLayer.clearLayers();
        const polyline = L.polyline(coords, { color: 'blue', weight: 5 });
        polyline.addTo(state.routeLayer);
        state.map.fitBounds(polyline.getBounds());
        showToast('Route drawn!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to draw route', 'error');
    }
}

/* ========= BOTTOM SHEET ========= */
function initBottomSheet() {
    const panel = state.panel;
    const header = panel.querySelector('.handle');

    function setPanelState(stateName) {
        state.panelState = stateName;
        panel.dataset.state = stateName;
    }

    function onDragStart(e) {
        state.isDragging = true;
        state.dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        state.dragStartHeight = panel.getBoundingClientRect().height;
        document.body.style.userSelect = 'none';
    }

    function onDragMove(e) {
        if (!state.isDragging) return;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const diff = state.dragStartY - currentY;
        panel.style.height = `${Math.max(100, state.dragStartHeight + diff)}px`;
    }

    function onDragEnd() {
        state.isDragging = false;
        document.body.style.userSelect = '';
        const h = panel.getBoundingClientRect().height;
        const vh = window.innerHeight;
        if (h < vh * 0.3) setPanelState('collapsed');
        else if (h < vh * 0.7) setPanelState('half');
        else setPanelState('full');
        panel.style.height = '';
    }

    header.addEventListener('mousedown', onDragStart);
    header.addEventListener('touchstart', onDragStart);

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('touchmove', onDragMove);

    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);
}

/* ========= EVENT BINDINGS ========= */
function initEventListeners() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            showToast(`Switched to ${newTheme} mode`, 'info');
        });
    });

    document.getElementById('route-btn').addEventListener('click', async () => {
        try {
            const coords = await fetchRouteData();
            drawRoute(coords);
        } catch (err) {
            console.error(err);
            showToast('Failed to fetch route', 'error');
        }
    });
}

/* ========= FETCH ROUTE DATA (EXAMPLE) ========= */
async function fetchRouteData() {
    // Simulated fetch; replace with real API
    return new Promise(resolve => {
        setTimeout(() => resolve([
            [37.7749, -122.4194],
            [37.7849, -122.4094],
            [37.7949, -122.4194]
        ]), 500);
    });
}

/* ========= INITIALIZATION ========= */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initMap();
        trackUserLocation();
        initBottomSheet();
        initEventListeners();
    } catch (err) {
        console.error(err);
        showToast('App failed to initialize', 'error');
    }
});
