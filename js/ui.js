// --- CORE PANEL & SEARCH LOGIC (UI) ---
function moveSearchBarToPanel() { 
    if (!isMobile) { 
        mainSearchContainer.style.boxShadow = 'none'; 
        mainSearchContainer.style.borderRadius = '8px'; 
        panelSearchPlaceholder.hidden = false; 
        panelSearchPlaceholder.appendChild(mainSearchContainer); 
        topSearchWrapper.style.opacity = '0'; 
    } 
}
function moveSearchBarToTop() { 
    if (!isMobile) { 
        mainSearchContainer.style.boxShadow = ''; 
        mainSearchContainer.style.borderRadius = ''; 
        topSearchWrapper.appendChild(mainSearchContainer); 
        panelSearchPlaceholder.hidden = true; 
        topSearchWrapper.style.opacity = '1'; 
    } 
}

function showPanel(viewId) {
    ['info-panel-redesign', 'directions-panel-redesign', 'route-section', 'route-preview-panel'].forEach(id => { 
        document.getElementById(id).hidden = id !== viewId; 
    });
    if (!sidePanel.classList.contains('open')) {
        if (isMobile) {
            if (!sidePanel.classList.contains('peek')) sidePanel.classList.add('peek');
        } else {
            sidePanel.classList.add('open');
            moveSearchBarToPanel();
        }
    }
}

function closePanel() {
    if (isMobile) sidePanel.classList.remove('open', 'peek');
    else {
        sidePanel.classList.remove('open');
        moveSearchBarToTop();
    }
}

if(closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
closeInfoBtn.addEventListener('click', closePanel);

map.on('click', (e) => {
    const target = e.originalEvent.target;
    if (!target.closest('.maplibregl-ctrl') && !target.closest('#side-panel') && !target.closest('.js-settings-btn')) {
        closePanel();
    }
});

// --- SETTINGS & OTHER UI LOGIC ---
const settingsBtns = document.querySelectorAll('.js-settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const menuOverlay = document.getElementById('menu-overlay');
const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
const trafficToggle = document.getElementById('traffic-toggle');

function openSettings() { settingsMenu.classList.add('open'); if (isMobile) { menuOverlay.classList.add('open'); } }
function closeSettings() { settingsMenu.classList.remove('open'); if (isMobile) { menuOverlay.classList.remove('open'); } }

settingsBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettings();
    });
});
closeSettingsBtn.addEventListener('click', closeSettings);
menuOverlay.addEventListener('click', closeSettings);

document.addEventListener('click', (e) => {
    if (!isMobile && settingsMenu.classList.contains('open') && !settingsMenu.contains(e.target) && !e.target.closest('.js-settings-btn')) {
        closeSettings();
    }
});

styleRadioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
        const newStyle = radio.value;
        map.setStyle(STYLES[newStyle]);
        if (isMobile) {
            setTimeout(closeSettings, 200);
        }
    });
});

// NEW: Event listener for the traffic toggle
trafficToggle.addEventListener('change', () => {
    if (trafficToggle.checked) {
        addTrafficLayer();
    } else {
        removeTrafficLayer();
    }
    if (isMobile) {
        setTimeout(closeSettings, 200);
    }
});

document.querySelectorAll('input[name="map-units"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (isMobile) {
            setTimeout(closeSettings, 200);
        }
    });
});

map.on('styledata', () => {
    if (navigationState.isActive && currentRouteData) {
        const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
        addRouteToMap(routeGeoJSON);
        updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]);
    }
    // NEW: Re-add traffic layer if it was enabled when map style changes
    if (trafficToggle.checked) {
        addTrafficLayer();
    }
});
