if (window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches) {
    (function() {
        const panel = document.getElementById('side-panel');
        const headerHeight = 50; // height of panel header
        const windowHeight = window.innerHeight;

        // Define the three positions
        const POSITIONS = {
            COLLAPSED: windowHeight - headerHeight,
            HALF: windowHeight / 2,
            FULL: 0
        };

        let startY = 0;
        let currentY = 0;
        let lastTranslate = POSITIONS.COLLAPSED;
        let isDragging = false;

        panel.style.transform = `translateY(${POSITIONS.COLLAPSED}px)`;
        panel.style.transition = 'transform 0.3s ease';

        const setPanelPosition = (y) => {
            panel.style.transform = `translateY(${y}px)`;
            lastTranslate = y;
        };

        const snapToNearest = () => {
            const distances = Object.values(POSITIONS).map(pos => Math.abs(lastTranslate - pos));
            const nearestIndex = distances.indexOf(Math.min(...distances));
            const nearestPosition = Object.values(POSITIONS)[nearestIndex];
            setPanelPosition(nearestPosition);
        };

        // Default vs dynamic panel content
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
        panel.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
            panel.style.transition = '';
        });

        panel.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;
            let nextPos = lastTranslate + delta;
            nextPos = Math.max(POSITIONS.FULL, Math.min(POSITIONS.COLLAPSED, nextPos));
            panel.style.transform = `translateY(${nextPos}px)`;
        });

        panel.addEventListener('touchend', () => {
            isDragging = false;
            panel.style.transition = 'transform 0.3s ease';
            lastTranslate = parseFloat(panel.style.transform.match(/translateY\((.+)px\)/)[1]);
            snapToNearest();
        });

        // Programmatic control
        window.mobilePanel = {
            collapse: () => setPanelPosition(POSITIONS.COLLAPSED),
            half: () => setPanelPosition(POSITIONS.HALF),
            full: () => setPanelPosition(POSITIONS.FULL),
            showDefault: showDefaultPanel,
            showDynamic: showDynamicPanel
        };

        // Panel always visible on map clicks
        map.on('click', () => {});

        // Initialize default panel
        showDefaultPanel();
        setPanelPosition(POSITIONS.COLLAPSED);
    })();
}

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
            registration => console.log('SW registered: ', registration.scope),
            err => console.log('SW registration failed: ', err)
        );
    });
}
