// --- INITIALIZATION & RESET LOGIC ---
function resetMapState() {
    // Clear the main search bar input
    mainSearchInput.value = '';

    // Clear the directions panel inputs
    const fromInput = document.getElementById('panel-from-input');
    const toInput = document.getElementById('panel-to-input');
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';

    // Close any open panels
    closePanel();

    // Clear route data from the map and stop navigation
    clearRouteFromMap();
    stopNavigation();
}

// Listen for the page to load and then run the reset function
document.addEventListener('DOMContentLoaded', resetMapState);
