import { initializeAuth, onUserUpdate } from './auth.js';
import { initializeMap, getMap, getGeolocateControl } from './map.js';
import { initializeUI, showPanel, updateAuthUI, closePanel } from './ui.js';
import { initializeSearch } from './search.js';
import { initializeNavigation } from './navigation.js';
import { initializeSpeechService } from './speech.js';

// --- Application Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize core components first
    const map = initializeMap();
    const geolocate = getGeolocateControl();
    initializeUI(map);
    const speechService = await initializeSpeechService();

    // 2. Initialize modules that depend on core components
    initializeSearch(map, (place) => {
        // This is the callback function when a place is selected from search
        const navigation = window.theBoiisMC.navigation;
        navigation.stop(); // Stop any active navigation
        navigation.clearRoute(); // Clear previous route from map
        
        // Show the info panel for the selected place
        showPanel('info-panel-redesign', place); 
    });
    
    // Make navigation globally accessible for now, can be improved with a state manager later
    window.theBoiisMC = window.theBoiisMC || {};
    window.theBoiisMC.navigation = initializeNavigation(map, speechService);

    // 3. Initialize authentication and update UI based on user status
    let currentUser = await initializeAuth();
    updateAuthUI(currentUser);

    // Listen for subsequent auth changes (login/logout)
    onUserUpdate((user) => {
        currentUser = user;
        updateAuthUI(user);
    });

    // 4. Handle shared routes from URL on initial load
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('from') && urlParams.has('to')) {
        const fromCoords = urlParams.get('from');
        const toCoords = urlParams.get('to');
        const fromName = urlParams.get('fromName') || 'Start';
        const toName = urlParams.get('toName') || 'Destination';

        // Set the input fields
        const fromInput = document.getElementById('panel-from-input');
        const toInput = document.getElementById('panel-to-input');
        fromInput.value = fromName;
        fromInput.dataset.coords = fromCoords;
        toInput.value = toName;
        toInput.dataset.coords = toCoords;

        showPanel('directions-panel-redesign');
        // Automatically fetch the route
        window.theBoiisMC.navigation.getRoute(); 
    } else {
        // Default view if no route is shared
        map.on('load', () => {
             showPanel('welcome-panel');
             // Try to geolocate the user on load for a better experience
             setTimeout(() => geolocate.trigger(), 1000);
        });
    }

    // Register Service Worker for PWA capabilities
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered successfully.'))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
});
