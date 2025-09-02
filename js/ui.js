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
    if (trafficToggle.checked) {
        addTrafficLayer();
    }
});

// Event listeners for various buttons
document.getElementById('main-directions-icon').addEventListener('click', openDirectionsPanel);
document.getElementById('info-directions-btn').addEventListener('click', openDirectionsPanel);
document.getElementById('info-save-btn').addEventListener('click', () => {
    if (currentUser) {
        alert("Feature 'Save Place' not yet implemented!");
    } else {
        alert("Please log in to save places.");
    }
});
document.getElementById('swap-btn').addEventListener('click', () => {
    [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords];
});
document.getElementById('dir-use-my-location').addEventListener('click', () => {
    fromInput.value = "Getting your location...";
    navigator.geolocation.getCurrentPosition(
        pos => {
            fromInput.value = "Your Location";
            fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        },
        handlePositionError,
        geolocationOptions
    );
});
document.getElementById('back-to-info-btn').addEventListener('click', () => {
    if (currentPlace) showPanel('info-panel-redesign');
});
document.getElementById('back-to-directions-btn').addEventListener('click', () => {
    showPanel('directions-panel-redesign');
});
const startNavigationBtn = document.getElementById('start-navigation-btn');
startNavigationBtn.addEventListener('click', startNavigation);
const shareRouteBtn = document.getElementById('share-route-btn');
shareRouteBtn.addEventListener('click', async () => {
    const fromName = fromInput.value;
    const toName = toInput.value;
    const fromCoords = fromInput.dataset.coords;
    const toCoords = toInput.dataset.coords;
    const shareText = `Check out this route from ${fromName} to ${toName}!`;
    const url = new URL(window.location.href);
    url.searchParams.set('from', fromCoords);
    url.searchParams.set('to', toCoords);
    url.searchParams.set('fromName', fromName);
    url.searchParams.set('toName', toName);
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'TheBoiisMC Maps Route',
                text: shareText,
                url: url.toString()
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    } else {
        navigator.clipboard.writeText(url.toString()).then(() => {
            alert("Route link copied to clipboard!");
        }).catch(err => {
            console.error('Could not copy link: ', err);
            alert("Could not copy link. Please manually copy the URL from the address bar.");
        });
    }
});
document.getElementById('get-route-btn').addEventListener('click', getRoute);
document.getElementById('exit-route-btn').addEventListener('click', () => {
    clearRouteFromMap();
    showPanel('directions-panel-redesign');
});
