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

        const setPanelPosition = y => { panel.style.transform = `translateY(${y}px)`; lastTranslate = y; };
        const snapToNearest = () => {
            const distances = Object.values(POSITIONS).map(pos => Math.abs(lastTranslate - pos));
            setPanelPosition(Object.values(POSITIONS)[distances.indexOf(Math.min(...distances))]);
        };

        const showDefaultPanel = () => {
            document.querySelectorAll('.panel-content > div').forEach(d => d.hidden = true);
            document.getElementById('panel-search-placeholder').hidden = false;
        };
        const showDynamicPanel = (panelId) => {
            document.querySelectorAll('.panel-content > div').forEach(d => d.hidden = true);
            document.getElementById('panel-search-placeholder').hidden = true;
            if (panelId) document.getElementById(panelId).hidden = false;
        };

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

        window.mobilePanel = { collapse: () => setPanelPosition(POSITIONS.COLLAPSED), half: () => setPanelPosition(POSITIONS.HALF), full: () => setPanelPosition(POSITIONS.FULL), showDefault: showDefaultPanel, showDynamic: showDynamicPanel };

        showDefaultPanel();
        setPanelPosition(POSITIONS.HALF);

        // -------- MAPTILER API SEARCH & POPULAR PLACES --------
        const MAPTILER_KEY = 'YOUR_MAPTILER_KEY';
        const popularPlacesList = document.getElementById('popular-places-list');
        const defaultSearchInput = document.getElementById('mobile-default-search');
        const defaultSuggestions = document.getElementById('mobile-default-suggestions');
        const defaultPopularQueries = ['Central Park', 'Times Square', 'Empire State Building', 'Brooklyn Bridge'];

        async function fetchPlaces(query) {
            try {
                const res = await fetch(`https://api.maptiler.com/search?q=${encodeURIComponent(query)}&key=${MAPTILER_KEY}`);
                const data = await res.json();
                return data.features || [];
            } catch(err) {
                console.error('MapTiler search failed', err);
                return [];
            }
        }

        async function loadPopularPlaces() {
            popularPlacesList.innerHTML = '';
            for (let q of defaultPopularQueries) {
                const li = document.createElement('li');
                li.textContent = q;
                li.addEventListener('click', async () => {
                    const results = await fetchPlaces(q);
                    if (results.length && window.map) {
                        const [lon, lat] = results[0].geometry.coordinates;
                        window.map.flyTo({ center: [lon, lat], zoom: 15 });
                    }
                    setPanelPosition(POSITIONS.HALF);
                });
                popularPlacesList.appendChild(li);
            }
        }

        loadPopularPlaces();

        defaultSearchInput.addEventListener('input', async e => {
            const query = e.target.value;
            if (!query) { defaultSuggestions.innerHTML = ''; return; }
            try {
                const results = await fetchPlaces(query);
                defaultSuggestions.innerHTML = '';
                results.slice(0,5).forEach(r => {
                    const div = document.createElement('div');
                    div.textContent = r.properties.name || r.properties.label;
                    div.addEventListener('click', () => {
                        if (window.map) {
                            const [lon, lat] = r.geometry.coordinates;
                            window.map.flyTo({ center: [lon, lat], zoom: 15 });
                        }
                        defaultSuggestions.innerHTML = '';
                    });
                    defaultSuggestions.appendChild(div);
                });
            } catch(err) { console.error('Search failed:', err); }
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
