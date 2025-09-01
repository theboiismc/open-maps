(function() {
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    if (!isMobile) return;

    const panel = document.getElementById('side-panel');
    const headerHeight = 50; // banner height
    let windowHeight = window.innerHeight;

    // Panel positions
    const POSITIONS = {
        COLLAPSED: windowHeight - headerHeight,
        HALF: windowHeight / 2,
        FULL: 0
    };

    let startY = 0;
    let lastTranslate = POSITIONS.COLLAPSED;
    let isDragging = false;

    // Set initial panel position
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
        const currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        let nextPos = lastTranslate + delta;

        // constrain within screen
        nextPos = Math.max(POSITIONS.FULL, Math.min(POSITIONS.COLLAPSED, nextPos));
        panel.style.transform = `translateY(${nextPos}px)`;
    });

    panel.addEventListener('touchend', () => {
        isDragging = false;
        panel.style.transition = 'transform 0.3s ease';
        const transformValue = parseFloat(panel.style.transform.match(/translateY\((.+)px\)/)[1]);
        lastTranslate = transformValue;
        snapToNearest();
    });

    // Optional: programmatic controls
    window.mobilePanel = {
        collapse: () => setPanelPosition(POSITIONS.COLLAPSED),
        half: () => setPanelPosition(POSITIONS.HALF),
        full: () => setPanelPosition(POSITIONS.FULL),
    };

    // Keep panel visible on map clicks
    if (window.map) {
        map.on('click', (e) => {
            // panel stays in current position
        });
    }

    // Update windowHeight and positions on resize
    window.addEventListener('resize', () => {
        windowHeight = window.innerHeight;
        POSITIONS.COLLAPSED = windowHeight - headerHeight;
        POSITIONS.HALF = windowHeight / 2;
        POSITIONS.FULL = 0;
        snapToNearest();
    });

})();
