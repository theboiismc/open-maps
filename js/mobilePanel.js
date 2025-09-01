if (window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches) {
    (function() {
        const panel = document.getElementById('side-panel');
        const headerHeight = 50;
        const windowHeight = window.innerHeight;

        const POSITIONS = {
            COLLAPSED: windowHeight - headerHeight,
            HALF: windowHeight / 2,
            FULL: 0
        };

        let startY = 0, currentY = 0, lastTranslate = POSITIONS.COLLAPSED, isDragging = false;

        panel.style.transform = `translateY(${POSITIONS.COLLAPSED}px)`;
        panel.style.transition = 'transform 0.3s ease';

        const setPanelPosition = y => {
            panel.style.transform = `translateY(${y}px)`;
            lastTranslate = y;
        };

        const snapToNearest = () => {
            const distances = Object.values(POSITIONS).map(pos => Math.abs(lastTranslate - pos));
            const nearestIndex = distances.indexOf(Math.min(...distances));
            setPanelPosition(Object.values(POSITIONS)[nearestIndex]);
        };

        // Default / dynamic panel visibility
        const showDefaultPanel = () => {
            document.querySelectorAll('.panel-content > div').forEach(d => d.hidden = true);
            document.getElementById('panel-search-placeholder').hidden = false;
        };

        const showDynamicPanel = (panelId) => {
            document.querySelectorAll('.panel-content > div').forEach(d => d.hidden = true);
            document.getElementById('panel-search-placeholder').hidden = true;
            if (panelId) document.getElementById(panelId).hidden = false;
        };

        // Touch drag events
        panel.addEventListener('touchstart', e => {
            startY = e.touches[0].clientY;
            isDragging = true;
            panel.style.transition = '';
        });

        panel.addEventListener('touchmove', e => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            let nextPos = lastTranslate + (currentY - startY);
            nextPos = Math.max(POSITIONS.FULL, Math.min(POSITIONS.COLLAPSED, nextPos));
            panel.style.transform = `translateY(${nextPos}px)`;
        });

        panel.addEventListener('touchend', () => {
            isDragging = false;
            panel.style.transition = 'transform 0.3s ease';
            lastTranslate = parseFloat(panel.style.transform.match(/translateY\((.+)px\)/)[1]);
            snapToNearest();
        });

        // Panel programmatic API
        window.mobilePanel = {
            collapse: () => setPanelPosition(POSITIONS.COLLAPSED),
            half: () => setPanelPosition(POSITIONS.HALF),
            full: () => setPanelPosition(POSITIONS.FULL),
            showDefault: showDefaultPanel,
            showDynamic: showDynamicPanel
        };

        // Initialize default panel on mobile
        showDefaultPanel();
        setPanelPosition(POSITIONS.HALF);

        // Load static popular places (example)
        const popularPlacesList = document.getElementById('popular-places-list');
        const popularPlaces = [
            { name: 'Central Park', lat: 40.785091, lon: -73.968285 },
            { name: 'Times Square', lat: 40.758896, lon: -73.985130 },
            { name: 'Empire State Building', lat: 40.748817, lon: -73.985428 },
            { name: 'Brooklyn Bridge', lat: 40.706086, lon: -73.996864 }
        ];
        popularPlaces.forEach(place => {
            const li = document.createElement('li');
            li.textContent = place.name;
            li.addEventListener('click', () => {
                if (window.map) window.map.flyTo({ center: [place.lon, place.lat], zoom: 15 });
                setPanelPosition(POSITIONS.HALF);
            });
            popularPlacesList.appendChild(li);
        });

        // Mobile default search autocomplete
        const defaultSearchInput = document.getElementById('mobile-default-search');
        const defaultSuggestions = document.getElementById('mobile-default-suggestions');

        defaultSearchInput.addEventListener('input', async e => {
            const query = e.target.value;
            if (!query) { defaultSuggestions.innerHTML = ''; return; }
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const results = await res.json();
                defaultSuggestions.innerHTML = '';
                results.slice(0,5).forEach(r => {
                    const div = document.createElement('div');
                    div.textContent = r.display_name;
                    div.addEventListener('click', () => {
                        if (window.map) window.map.flyTo({ center: [r.lon, r.lat], zoom: 15 });
                        defaultSuggestions.innerHTML = '';
                    });
                    defaultSuggestions.appendChild(div);
                });
            } catch(err) {
                console.error('Search failed:', err);
            }
        });
    })();
}

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered: ', reg.scope))
        .catch(err => console.log('SW registration failed: ', err));
    });
}
