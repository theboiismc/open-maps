
    if (isMobile) {
        // --- MOBILE PANEL: COLLAPSED / HALF / FULL ---
(function() {
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    if (!isMobile) return;

    const panel = document.getElementById('side-panel');
    const headerHeight = 50; // height of the panel header
    const windowHeight = window.innerHeight;

    // Define the three positions in pixels
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

    panel.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        panel.style.transition = ''; // disable transition during drag
    });

    panel.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        let nextPos = lastTranslate + delta;
        // constrain within screen
        nextPos = Math.max(POSITIONS.FULL, Math.min(POSITIONS.COLLAPSED, nextPos));
        panel.style.transform = `translateY(${nextPos}px)`;
    });

    panel.addEventListener('touchend', () => {
        isDragging = false;
        panel.style.transition = 'transform 0.3s ease';
        // update lastTranslate
        const transformValue = parseFloat(panel.style.transform.match(/translateY\((.+)px\)/)[1]);
        lastTranslate = transformValue;
        snapToNearest();
    });

    // Optional: allow programmatic open/close
    window.mobilePanel = {
        collapse: () => setPanelPosition(POSITIONS.COLLAPSED),
        half: () => setPanelPosition(POSITIONS.HALF),
        full: () => setPanelPosition(POSITIONS.FULL),
    };

    // Keep panel visible on map clicks
    map.on('click', (e) => {
        // do nothing, panel stays in current position
    });
})();

    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration.scope);
            }, err => {
                console.log('SW registration failed: ', err);
            });
        });
    }
});
