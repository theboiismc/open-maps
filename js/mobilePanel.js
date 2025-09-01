// mobilePanel.js
export function initMobilePanel() {
    const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    if (!isMobile) return;
    const panel = document.getElementById('side-panel');
    const headerHeight = 50;
    const windowHeight = window.innerHeight;
    const POSITIONS = { COLLAPSED: windowHeight - headerHeight, HALF: windowHeight / 2, FULL: 0 };
    let startY = 0, currentY = 0, lastTranslate = POSITIONS.COLLAPSED, isDragging = false;
    panel.style.transform = `translateY(${POSITIONS.COLLAPSED}px)`;
    panel.style.transition = 'transform 0.3s ease';

    const setPanelPosition = y => { panel.style.transform = `translateY(${y}px)`; lastTranslate = y; };
    const snapToNearest = () => {
        const distances = Object.values(POSITIONS).map(pos => Math.abs(lastTranslate - pos));
        const nearestIndex = distances.indexOf(Math.min(...distances));
        setPanelPosition(Object.values(POSITIONS)[nearestIndex]);
    };

    panel.addEventListener('touchstart', e => { startY = e.touches[0].clientY; isDragging = true; panel.style.transition = ''; });
    panel.addEventListener('touchmove', e => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        let nextPos = Math.max(POSITIONS.FULL, Math.min(POSITIONS.COLLAPSED, lastTranslate + (currentY - startY)));
        panel.style.transform = `translateY(${nextPos}px)`;
    });
    panel.addEventListener('touchend', () => { isDragging = false; panel.style.transition = 'transform 0.3s ease'; lastTranslate = parseFloat(panel.style.transform.match(/translateY\((.+)px\)/)[1]); snapToNearest(); });

    window.mobilePanel = { collapse: () => setPanelPosition(POSITIONS.COLLAPSED), half: () => setPanelPosition(POSITIONS.HALF), full: () => setPanelPosition(POSITIONS.FULL) };
}
