// settings.js
export function initSettings({ map, STYLES, isMobile, addTrafficLayer, removeTrafficLayer }) {
    const settingsBtns = document.querySelectorAll('.js-settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
    const trafficToggle = document.getElementById('traffic-toggle');

    function openSettings() { settingsMenu.classList.add('open'); if (isMobile) menuOverlay.classList.add('open'); }
    function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) menuOverlay.classList.remove('open'); }

    settingsBtns.forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openSettings(); }));
    closeSettingsBtn.addEventListener('click', closeSettings);
    menuOverlay.addEventListener('click', closeSettings);
    document.addEventListener('click', e => {
        if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) closeSettings();
    });

    styleRadioButtons.forEach(radio => {
        radio.addEventListener('change', () => { map.setStyle(STYLES[radio.value]); if (isMobile) setTimeout(closeSettings, 200); });
    });

    trafficToggle.addEventListener('change', () => {
        if (trafficToggle.checked) addTrafficLayer(); else removeTrafficLayer();
        if (isMobile) setTimeout(closeSettings, 200);
    });
}
