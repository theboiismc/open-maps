// app.js
// Full updated app.js with:
// - robust error handling + toast notifications
// - Google Maps-like bottom sheet (collapsed / half / full) with touch dragging
// - system theme preference & setting persistence
// - improved mobile/desktop behavior while preserving original app logic

/* ========= AUTH (unchanged) ========= */
const authConfig = {
  authority: "https://accounts.theboiismc.com/application/o/maps/",
  client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
  redirect_uri: "https://maps.theboiismc.com/callback.html",
  post_logout_redirect_uri: "https://maps.theboiismc.com",
  response_type: 'code',
  automaticSilentRenew: true,
};
const userManager = new oidc.UserManager(authConfig);
const authService = {
  async login() { return userManager.signinRedirect(); },
  async logout() { return userManager.signoutRedirect(); },
  async getUser() { return userManager.getUser(); },
  async handleCallback() { return userManager.signinRedirectCallback(); }
};

/* ========= UTIL: Toasts & safeFetch ========= */

function showToast(message, type = 'info', timeout = 4500) {
  try {
    const container = document.getElementById('toast-container');
    if (!container) { console.warn('No toast container'); return; }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    // show
    requestAnimationFrame(() => t.classList.add('show'));
    // hide
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, timeout);
  } catch (e) {
    console.error('Toast failed', e);
  }
}

async function safeFetch(url, opts = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  opts = Object.assign({}, opts, { signal: controller.signal });
  try {
    const res = await fetch(url, opts);
    clearTimeout(id);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const errMsg = `Network error ${res.status}: ${res.statusText}${text ? ' — ' + text : ''}`;
      throw new Error(errMsg);
    }
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/* ========= DOM READY ========= */
document.addEventListener('DOMContentLoaded', async () => {
  // quick DOM guards
  const el = id => document.getElementById(id);
  const profileArea = el('profile-area');
  const profileButton = el('profile-button');
  const profileDropdown = el('profile-dropdown');
  const loggedInView = el('logged-in-view');
  const loggedOutView = el('logged-out-view');
  const loginBtn = el('login-btn');
  const signupBtn = el('signup-btn');
  const logoutBtn = el('logout-btn');
  const savedPlacesBtn = el('saved-places-btn');
  const usernameDisplay = loggedInView ? loggedInView.querySelector('.username') : null;
  const emailDisplay = loggedInView ? loggedInView.querySelector('.email') : null;

  // theme handling (system + persisted)
  const applyTheme = (choice) => {
    const root = document.documentElement;
    if (choice === 'dark') root.classList.add('dark');
    else if (choice === 'light') root.classList.remove('dark');
    else {
      // system
      const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (sysDark) root.classList.add('dark'); else root.classList.remove('dark');
    }
    document.querySelectorAll('input[name="theme-choice"]').forEach(r => {
      if (r.value === choice) r.checked = true;
    });
  };

  // init theme from localStorage or system
  const storedTheme = localStorage.getItem('maps_theme') || 'system';
  applyTheme(storedTheme);

  // watch system preference if user likes 'system'
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', () => {
    const cur = localStorage.getItem('maps_theme') || 'system';
    if (cur === 'system') applyTheme('system');
  });

  // AUTH UI
  let currentUser = null;
  const updateAuthUI = (user) => {
    currentUser = user && !user.expired ? user : null;
    const isLoggedIn = !!currentUser;
    if (loggedInView) loggedInView.hidden = !isLoggedIn;
    if (loggedOutView) loggedOutView.hidden = isLoggedIn;
    if (isLoggedIn && usernameDisplay && emailDisplay) {
      usernameDisplay.textContent = currentUser.profile.name || 'User';
      emailDisplay.textContent = currentUser.profile.email || '';
    }
  };

  try {
    if (window.location.pathname.endsWith("callback.html")) {
      await authService.handleCallback();
      window.location.href = "/";
    } else {
      const user = await authService.getUser();
      updateAuthUI(user);
    }
  } catch (error) {
    console.error("Authentication process failed:", error);
    updateAuthUI(null);
    showToast('Auth check failed — continuing anonymous', 'info');
  }

  // profile dropdown toggle
  if (profileButton && profileDropdown) {
    profileButton.addEventListener('click', (e) => {
      const showing = profileDropdown.style.display === 'block';
      profileDropdown.style.display = showing ? 'none' : 'block';
      profileButton.setAttribute('aria-expanded', String(!showing));
    });
    document.addEventListener('click', (e) => {
      if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
        profileDropdown.style.display = 'none';
        profileButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); try { authService.login(); } catch (err) { console.error(err); showToast('Login failed', 'error'); }});
  if (signupBtn) signupBtn.addEventListener('click', (e) => { e.preventDefault(); window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/"; });
  if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); try { authService.logout(); } catch (err) { console.error(err); showToast('Logout failed', 'error'); } });

  /* ========= Map Init ========= */
  const MAPTILER_KEY = 'YOUR_MAPTILER_API_KEY'; // replace with your key
  const isMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
  const geolocationOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

  const STYLES = {
    default: 'https://tiles.openfreemap.org/styles/liberty',
    satellite: {
      version: 8,
      sources: {
        "esri-world-imagery": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: 'Tiles © Esri'
        }
      },
      layers: [{ id: "satellite-layer", type: "raster", source: "esri-world-imagery", minzoom: 0, maxzoom: 22 }]
    }
  };

  let map;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: STYLES.default,
      center: [-95, 39],
      zoom: 4
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: geolocationOptions,
      trackUserLocation: true,
      showUserHeading: true
    });
    map.addControl(geolocateControl, "bottom-right");
    map.on('load', () => geolocateControl.trigger());
  } catch (err) {
    console.error('Maplibre init failed', err);
    showToast('Map failed to initialize', 'error');
  }

  /* ========= DOM refs for map logic ========= */
  const sidePanel = el('side-panel');
  const panelGrabber = el('panel-grabber');
  const mainSearchInput = el('main-search');
  const mainSearchContainer = el('main-search-container');
  const topSearchWrapper = el('top-search-wrapper');
  const panelSearchPlaceholder = el('panel-search-placeholder');
  const closePanelBtn = el('close-panel-btn');
  const closeInfoBtn = el('close-info-btn');

  const navigationStatusPanel = el('navigation-status');
  const navigationInstructionEl = el('navigation-instruction');
  const instructionProgressBarStyle = el('instruction-progress-bar')?.style;
  const endNavigationBtn = el('end-navigation-btn');
  const statSpeedEl = el('stat-speed');
  const statEtaEl = el('stat-eta');
  const statTimeRemainingEl = el('stat-time-remaining');

  const mainSuggestions = el('main-suggestions');

  const fromInput = el('panel-from-input');
  const fromSuggestions = el('panel-from-suggestions');
  const toInput = el('panel-to-input');
  const toSuggestions = el('panel-to-suggestions');

  // guards
  if (!sidePanel) { showToast('UI init failed: side panel missing', 'error'); return; }
  if (!mainSearchInput) { showToast('UI init failed: search input missing', 'error'); return; }

  /* ========= NAV state & helpers (kept from original) ========= */
  let currentPlace = null;
  let currentRouteData = null;
  let userLocationMarker = null;
  let navigationWatcherId = null;

  const speech = {
    synthesis: window.speechSynthesis,
    utterance: new SpeechSynthesisUtterance(),
    speak(text, priority = false) {
      if (!text) return;
      try {
        if (priority && this.synthesis.speaking) this.synthesis.cancel();
        this.utterance.text = text;
        this.synthesis.speak(this.utterance);
      } catch (e) { console.warn('Speech failed', e); }
    }
  };

  let navigationState = {};
  function resetNavigationState(){
    navigationState = {
      isActive:false, isRerouting:false, currentStepIndex:0,
      progressAlongStep:0, distanceToNextManeuver: Infinity,
      userSpeed:0, estimatedArrivalTime:null, totalTripTime:0,
      lastAnnouncedDistance: Infinity, isWrongWay:false
    };
  }
  resetNavigationState();

  function updateNavigationUI(){
    const remainingTime = (navigationState.totalTripTime / 60).toFixed(0);
    statTimeRemainingEl && (statTimeRemainingEl.textContent = `${remainingTime} min`);
    statEtaEl && (statEtaEl.textContent = formatEta(navigationState.estimatedArrivalTime));
    statSpeedEl && (statSpeedEl.textContent = navigationState.userSpeed ? navigationState.userSpeed.toFixed(0) : '--');
    if (instructionProgressBarStyle) instructionProgressBarStyle.transform = `scaleX(${1 - navigationState.progressAlongStep})`;
  }

  /* ========= Bottom sheet logic (mobile) =========
     States:
       - closed/peek  (panel partial)
       - half
       - full
  */
  const sheetStates = ['closed','peek','half','full'];
  let currentSheetState = 'peek'; // default
  // set initial attr state for mobile; desktop uses left drawer
  const isTouchMobile = window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
  if (isTouchMobile) {
    sidePanel.setAttribute('data-sheet-state', currentSheetState);
    sidePanel.setAttribute('aria-hidden', 'false'); // visible peek
    // move the top search into panel placeholder (for proper z-index & collisions)
    if (panelSearchPlaceholder && mainSearchContainer) {
      panelSearchPlaceholder.hidden = false;
      panelSearchPlaceholder.appendChild(mainSearchContainer);
      mainSearchContainer.style.width = '100%';
    }
  }

  function setSheetState(state) {
    if (!sheetStates.includes(state)) return;
    currentSheetState = state;
    sidePanel.setAttribute('data-sheet-state', state);
    if (state === 'closed' || state === 'peek') {
      // keep map interactions default
      document.documentElement.style.setProperty('--map-bottom-offset', `${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'))}px`);
    } else if (state === 'half') {
      document.documentElement.style.setProperty('--map-bottom-offset', `56vh`);
    } else {
      document.documentElement.style.setProperty('--map-bottom-offset', `94vh`);
    }
    // small UX cue: when fully open, focus the first form element
    if (state === 'full') {
      setTimeout(() => {
        const inpt = sidePanel.querySelector('input, button, [tabindex]');
        inpt && inpt.focus();
      }, 220);
    }
  }

  // drag handling
  let dragging = false;
  let dragStartY = 0;
  let startingState = currentSheetState;
  let lastY = 0;

  function onDragStart(clientY) {
    dragging = true;
    dragStartY = clientY;
    startingState = currentSheetState;
    sidePanel.classList.add('dragging');
  }
  function onDragMove(clientY) {
    if (!dragging) return;
    lastY = clientY;
    const dy = clientY - dragStartY;
    // positive dy -> dragging down (close), negative -> up (open)
    // compute progress and temporarily set panel transform for fluid feel
    const panelHeight = sidePanel.getBoundingClientRect().height;
    let offset = 0;
    if (startingState === 'peek') offset = panelHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek')) + dy;
    else if (startingState === 'half') offset = panelHeight * 0.56 + dy;
    else if (startingState === 'full') offset = dy; // smaller offset
    // clamp
    offset = Math.max(-panelHeight, Math.min(panelHeight, offset));
    // visual move
    sidePanel.style.transform = `translateY(${Math.max(0, offset)}px)`; // only push down visually
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    sidePanel.style.transform = '';
    sidePanel.classList.remove('dragging');
    // determine where to snap based on final dy
    const dy = lastY - dragStartY;
    const absdy = Math.abs(dy);
    if (dy > 50) {
      // swiped down (close)
      if (startingState === 'full') setSheetState('half');
      else if (startingState === 'half') setSheetState('peek');
      else setSheetState('closed');
    } else if (dy < -50) {
      // swiped up (open)
      if (startingState === 'closed' || startingState === 'peek') setSheetState('half');
      else setSheetState('full');
    } else {
      // small nudge -> return to starting state
      setSheetState(startingState);
    }
  }

  // attach touch/mouse handlers for panel grabber (mobile)
  if (panelGrabber) {
    panelGrabber.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientY), { passive:false });
    panelGrabber.addEventListener('touchmove', (e) => { e.preventDefault(); onDragMove(e.touches[0].clientY); }, { passive:false });
    panelGrabber.addEventListener('touchend', (e) => onDragEnd());
    // mouse fallback
    panelGrabber.addEventListener('mousedown', (e) => { e.preventDefault(); onDragStart(e.clientY); });
    window.addEventListener('mousemove', (e) => onDragMove(e.clientY));
    window.addEventListener('mouseup', (e) => onDragEnd());
    // keyboard accessibility: toggle states
    panelGrabber.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        if (currentSheetState === 'peek') setSheetState('half');
        else setSheetState('full');
      } else if (e.key === 'ArrowDown') {
        if (currentSheetState === 'full') setSheetState('half');
        else setSheetState('peek');
      } else if (e.key === 'Enter') {
        setSheetState(currentSheetState === 'full' ? 'peek' : 'full');
      }
    });
  }

  // open/close panel (desktop uses left drawer)
  const openPanel = (state = 'peek') => {
    if (!isTouchMobile) {
      sidePanel.classList.add('open');
      sidePanel.setAttribute('aria-hidden','false');
      // move search into placeholder on desktop as well if needed
      if (panelSearchPlaceholder && mainSearchContainer) {
        panelSearchPlaceholder.hidden = false;
        panelSearchPlaceholder.appendChild(mainSearchContainer);
      }
    } else {
      setSheetState(state);
      sidePanel.setAttribute('aria-hidden','false');
    }
  };
  const closePanel = () => {
    if (!isTouchMobile) {
      sidePanel.classList.remove('open');
      sidePanel.setAttribute('aria-hidden','true');
      // restore search to top
      if (topSearchWrapper && mainSearchContainer) topSearchWrapper.appendChild(mainSearchContainer);
    } else {
      setSheetState('closed');
      sidePanel.setAttribute('aria-hidden','false'); // still visible as peek
    }
  };

  // hook top-left menu button
  const openPanelBtn = el('open-panel-btn');
  openPanelBtn?.addEventListener('click', () => {
    if (!isTouchMobile) openPanel('peek');
    else {
      // cycle states on mobile
      if (currentSheetState === 'peek') setSheetState('half');
      else if (currentSheetState === 'half') setSheetState('full');
      else setSheetState('peek');
    }
  });

  // close info btn (back)
  if (closeInfoBtn) closeInfoBtn.addEventListener('click', closePanel);

  /* ========= Search & suggestions (kept from original, wrapped with toasts) ========= */

  function debounce(func, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => func(...args), delay); }; }

  function attachSuggestionListener(inputEl, suggestionsEl, onSelect) {
    if (!inputEl || !suggestionsEl) return;
    const fetchAndDisplaySuggestions = async (query) => {
      if (!query) { suggestionsEl.style.display = "none"; return; }
      try {
        const bounds = map?.getBounds ? map.getBounds() : { getWest: () => -180, getEast: () => 180, getSouth: () => -90, getNorth: () => 90 };
        const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1`;
        const res = await safeFetch(url, { method: 'GET' }, 9000);
        const data = await res.json();
        suggestionsEl.innerHTML = "";
        data.forEach(item => {
          const elItem = document.createElement('div');
          elItem.className = "search-result";
          elItem.textContent = item.display_name;
          elItem.addEventListener('click', () => {
            suggestionsEl.style.display = "none";
            onSelect(item);
          });
          suggestionsEl.appendChild(elItem);
        });
        suggestionsEl.style.display = data.length ? 'block' : 'none';
      } catch (err) {
        console.error('Suggestion error', err);
        showToast('Could not load suggestions', 'error');
      }
    };
    const deb = debounce(fetchAndDisplaySuggestions, 300);
    inputEl.addEventListener('input', () => deb(inputEl.value.trim()));
    inputEl.addEventListener('blur', () => { setTimeout(() => suggestionsEl.style.display = 'none', 200); });
  }

  async function performSmartSearch(inputEl, onSelect) {
    const query = inputEl.value.trim();
    if (!query) return showToast('Type something to search', 'info');
    try {
      const bounds = map.getBounds();
      const viewbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
      const res = await safeFetch(url, {}, 9000);
      const data = await res.json();
      if (data.length > 0) onSelect(data[0]);
      else { showToast('No results found', 'info'); }
    } catch (err) {
      console.error('Search failed', err);
      showToast('Search failed — check your connection', 'error');
    }
  }

  attachSuggestionListener(mainSearchInput, mainSuggestions, processPlaceResult);
  el('search-icon-inside')?.addEventListener('click', () => performSmartSearch(mainSearchInput, processPlaceResult));
  mainSearchInput.addEventListener('keydown', (e) => { if (e.key === "Enter") performSmartSearch(mainSearchInput, processPlaceResult); });

  attachSuggestionListener(fromInput, fromSuggestions, (place) => {
    fromInput.value = place.display_name;
    fromInput.dataset.coords = `${place.lon},${place.lat}`;
  });
  attachSuggestionListener(toInput, toSuggestions, (place) => {
    toInput.value = place.display_name;
    toInput.dataset.coords = `${place.lon},${place.lat}`;
  });

  /* ========= Place processing, image, weather, facts with error handling ========= */
  function processPlaceResult(place) {
    try {
      // Nominatim search returns different shape for reverse lookup sometimes (has .lat/.lon or .geometry). handle both
      const lon = place.lon || (place?.geometry?.coordinates ? place.geometry.coordinates[0] : null);
      const lat = place.lat || (place?.geometry?.coordinates ? place.geometry.coordinates[1] : null);
      if (!lon || !lat) {
        showToast('Place has no coordinates', 'error');
        return;
      }
      currentPlace = place;
      stopNavigation();
      clearRouteFromMap();
      map?.flyTo?.({ center: [parseFloat(lon), parseFloat(lat)], zoom: 14 });
      mainSearchInput.value = (place.display_name || place.name || '').split(',').slice(0,2).join(',');
      el('info-name') && (el('info-name').textContent = (place.display_name || '').split(',')[0] || '');
      el('info-address') && (el('info-address').textContent = place.display_name || '');
      const locationName = (place.display_name || place.name || '').split(',')[0] || '';
      fetchAndSetPlaceImage(locationName, lon, lat);
      fetchAndSetWeather(lat, lon);
      fetchAndSetQuickFacts(locationName);
      // show panel with info
      openPanel('half');
      // show info view
      ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id => {
        const elid = el(id);
        if (!elid) return;
        elid.hidden = id !== 'info-panel-redesign';
      });
    } catch (err) {
      console.error('Processing place failed', err);
      showToast('Could not process place', 'error');
    }
  }

  async function fetchAndSetPlaceImage(query, lon, lat) {
    const imgEl = el('info-image');
    if (!imgEl) return;
    imgEl.src = '';
    imgEl.style.backgroundColor = '#e0e0e0';
    imgEl.alt = 'Loading image...';
    imgEl.onerror = null;
    if (!query) { imgEl.alt = 'Image not available'; return; }
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=pageimages&pithumbsize=800&titles=${encodeURIComponent(query)}`;
      const res = await safeFetch(wikiUrl, {}, 10000);
      const data = await res.json();
      const page = Object.values(data.query.pages)[0];
      if (page && page.thumbnail && page.thumbnail.source) {
        imgEl.src = page.thumbnail.source;
        imgEl.alt = `Photograph of ${query}`;
        return;
      }
      throw new Error('No thumbnail found');
    } catch (err) {
      console.info('Wikipedia image failed, using fallback', err);
      try {
        const offset = 0.005;
        const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
        const fallbackUrl = `https://render.openstreetmap.org/cgi-bin/export?bbox=${bbox}&scale=10000&format=png`;
        imgEl.src = fallbackUrl;
        imgEl.alt = `Map view of ${query}`;
      } catch (e) {
        imgEl.style.backgroundColor = '#e0e0e0';
        imgEl.alt = 'Image not available';
      }
    }
  }

  function getWeatherDescription(code){
    const descriptions = { 0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow fall',73:'Moderate snow fall',75:'Heavy snow fall',80:'Slight rain showers',81:'Moderate rain showers',82:'Violent rain showers',95:'Thunderstorm',96:'Thunderstorm with slight hail',99:'Thunderstorm with heavy hail' };
    return descriptions[code] || "Weather data unavailable";
  }

  async function fetchAndSetWeather(lat, lon) {
    const weatherEl = el('info-weather');
    if (!weatherEl) return;
    weatherEl.textContent = "Loading weather...";
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
      const res = await safeFetch(url, {}, 9000);
      const data = await res.json();
      if (data && data.current_weather) {
        const tempF = Math.round(data.current_weather.temperature);
        const tempC = Math.round((tempF - 32) * 5 / 9);
        const description = getWeatherDescription(data.current_weather.weathercode);
        weatherEl.textContent = `${tempF}°F / ${tempC}°C, ${description}`;
      } else throw new Error('Invalid weather payload');
    } catch (err) {
      console.error('Weather fetch failed', err);
      weatherEl.textContent = "Weather unavailable";
      showToast('Weather data unavailable', 'info');
    }
  }

  async function fetchAndSetQuickFacts(query) {
    const factsEl = el('quick-facts-content');
    if (!factsEl) return;
    factsEl.textContent = "Loading facts...";
    try {
      const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(query)}`;
      const res = await safeFetch(url, {}, 10000);
      const data = await res.json();
      const page = Object.values(data.query.pages)[0];
      factsEl.textContent = page && page.extract ? page.extract.substring(0,350) + '...' : "No quick facts found.";
    } catch (err) {
      console.error('Facts fetch failed', err);
      factsEl.textContent = "No facts available";
    }
  }

  /* ========= Routing & Navigation (kept original logic, wrapped errors) ========= */
  function clearRouteFromMap() {
    try {
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getSource('route')) map.removeSource('route');
      if (map.getLayer('highlighted-route-segment')) map.removeLayer('highlighted-route-segment');
      if (map.getSource('highlighted-route-segment')) map.removeSource('highlighted-route-segment');
    } catch (e) { /* ignore */ }
  }

  function displayRoutePreview(route) {
    try {
      const durationMinutes = Math.round(route.duration / 60);
      const distanceMiles = (route.distance / 1609.34).toFixed(1);
      el('route-summary-time') && (el('route-summary-time').textContent = `${durationMinutes} min`);
      el('route-summary-distance') && (el('route-summary-distance').textContent = `${distanceMiles} mi`);
      // show route preview screen in panel & open panel
      ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id => {
        const element = el(id);
        if (!element) return;
        element.hidden = id !== 'route-preview-panel';
      });
      openPanel('half');
    } catch (err) {
      console.error('displayRoutePreview failed', err);
    }
  }

  async function geocode(inputEl) {
    if (inputEl.dataset.coords) return inputEl.dataset.coords.split(',').map(Number);
    try {
      const res = await safeFetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputEl.value)}&format=json&limit=1`, {}, 9000);
      const data = await res.json();
      if (!data[0]) throw new Error(`Could not find location: ${inputEl.value}`);
      inputEl.value = data[0].display_name;
      inputEl.dataset.coords = `${data[0].lon},${data[0].lat}`;
      return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    } catch (err) {
      console.error('Geocode failed', err);
      throw err;
    }
  }

  function addRouteToMap(routeGeoJSON) {
    try {
      if (map.getSource('route')) {
        map.getSource('route').setData(routeGeoJSON);
      } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#0d89ec', 'line-width': 8, 'line-opacity': 0.7 }
        });
      }
    } catch (err) {
      console.error('Add route failed', err);
      showToast('Failed to draw route', 'error');
    }
  }

  async function getRoute() {
    if (!fromInput.value || !toInput.value) { showToast('Please fill both start and end points', 'info'); return; }
    clearRouteFromMap();
    try {
      const [start, end] = await Promise.all([geocode(fromInput), geocode(toInput)]);
      const url = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=true`;
      const res = await safeFetch(url, {}, 11000);
      const data = await res.json();
      if (!data.routes || !data.routes.length) {
        showToast('No route found', 'info');
        return;
      }
      currentRouteData = data;
      const route = data.routes[0];
      const routeGeoJSON = { type: 'Feature', geometry: route.geometry };
      addRouteToMap(routeGeoJSON);
      const bounds = new maplibregl.LngLatBounds();
      routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
      if (fromInput.value.trim() === "Your Location") {
        map.fitBounds(bounds, { padding: isMobile ? { top:150, bottom:250, left:50, right:50 } : 100 });
        closePanel();
        startNavigation();
      } else {
        displayRoutePreview(route);
        map.fitBounds(bounds, { padding: isMobile ? 50 : { top:50, bottom:50, left:450, right:50 } });
      }
    } catch (err) {
      console.error('Get route failed', err);
      showToast(`Error getting route: ${err.message}`, 'error');
      navigationState.isRerouting = false;
    }
  }

  // wire up UI route buttons
  el('get-route-btn')?.addEventListener('click', getRoute);
  el('exit-route-btn')?.addEventListener('click', () => { clearRouteFromMap(); ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id => el(id) && (el(id).hidden = id !== 'directions-panel-redesign')); openPanel('peek'); });

  el('main-directions-icon')?.addEventListener('click', openDirectionsPanel);
  el('info-directions-btn')?.addEventListener('click', openDirectionsPanel);
  el('info-save-btn')?.addEventListener('click', () => { if (currentUser) showToast('Save place not implemented', 'info'); else showToast('Log in to save places', 'info'); });

  el('swap-btn')?.addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; [fromInput.dataset.coords, toInput.dataset.coords] = [toInput.dataset.coords, fromInput.dataset.coords]; });

  el('dir-use-my-location')?.addEventListener('click', () => {
    fromInput.value = "Getting your location...";
    if (!navigator.geolocation) { showToast('Geolocation unsupported', 'error'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      fromInput.value = "Your Location";
      fromInput.dataset.coords = `${pos.coords.longitude},${pos.coords.latitude}`;
      showToast('Location set', 'success');
    }, (err) => { handlePositionError(err); }, geolocationOptions);
  });

  /* ========= Navigation logic (near-original, wrapped) ========= */
  const highlightedSegmentLayerId = 'highlighted-route-segment';

  function toRadians(deg){ return deg * Math.PI / 180; }
  function toDegrees(rad){ return rad * 180 / Math.PI; }
  function getBearing(startPoint, endPoint){
    const startLat = toRadians(startPoint.geometry.coordinates[1]);
    const startLng = toRadians(startPoint.geometry.coordinates[0]);
    const endLat = toRadians(endPoint.geometry.coordinates[1]);
    const endLng = toRadians(endPoint.geometry.coordinates[0]);
    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    let brng = toDegrees(Math.atan2(y,x));
    return (brng + 360) % 360;
  }

  function formatEta(date) {
    if (!date) return "--:--";
    let hours = date.getHours(), minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12; hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0'+minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
  }

  function updateHighlightedSegment(step) {
    try {
      if (map.getLayer(highlightedSegmentLayerId)) map.removeLayer(highlightedSegmentLayerId);
      if (map.getSource(highlightedSegmentLayerId)) map.removeSource(highlightedSegmentLayerId);
      if (!step || !step.geometry) return;
      map.addSource(highlightedSegmentLayerId, { type:'geojson', data: step.geometry });
      map.addLayer({ id: highlightedSegmentLayerId, type:'line', source: highlightedSegmentLayerId, paint: { 'line-color':'#0055ff','line-width':9,'line-opacity':0.9 } }, 'route-line');
    } catch (err) { console.warn('updateHighlightedSegment failed', err); }
  }

  function startNavigation(){
    if (!navigator.geolocation) { showToast('Geolocation unsupported', 'error'); return; }
    try {
      resetNavigationState();
      navigationState.isActive = true;
      navigationState.totalTripTime = currentRouteData.routes[0].duration;
      const firstStep = currentRouteData.routes[0].legs[0].steps[0];
      navigationInstructionEl.textContent = firstStep.maneuver.instruction;
      updateHighlightedSegment(firstStep);
      updateNavigationUI();
      navigationStatusPanel && (navigationStatusPanel.setAttribute('aria-hidden','false'), navigationStatusPanel.style.display = 'flex');
      speech.speak(`Starting route. ${firstStep.maneuver.instruction}`, true);
      if (!userLocationMarker) {
        const elMarker = document.createElement('div'); elMarker.className = 'user-location-marker';
        userLocationMarker = new maplibregl.Marker(elMarker).setLngLat([0,0]).addTo(map);
      }
      map.easeTo({ pitch:60, zoom:17, duration:1500 });
      navigationWatcherId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, geolocationOptions);
      endNavigationBtn && endNavigationBtn.addEventListener('click', stopNavigation);
    } catch (err) {
      console.error('Start navigation failed', err);
      showToast('Navigation start failed', 'error');
    }
  }

  function stopNavigation(){
    try {
      if (navigationWatcherId) navigator.geolocation.clearWatch(navigationWatcherId);
      if (userLocationMarker) { userLocationMarker.remove(); userLocationMarker = null; }
      clearRouteFromMap();
      resetNavigationState();
      navigationStatusPanel && (navigationStatusPanel.setAttribute('aria-hidden','true'), navigationStatusPanel.style.display = 'none');
      speech.synthesis.cancel();
      map.easeTo({ pitch:0, bearing:0 });
      showToast('Navigation ended', 'info');
    } catch (err) {
      console.error('Stop navigation failed', err);
    }
  }

  function handlePositionError(error) {
    console.error("Geolocation Error:", error);
    showToast(`Geolocation error: ${error.message || 'unknown'}`, 'error');
    stopNavigation();
  }

  async function handlePositionUpdate(position) {
    try {
      if (!navigationState.isActive || navigationState.isRerouting) return;
      const { latitude, longitude, heading, speed, accuracy } = position.coords;
      if (accuracy > 80) return;
      const userPoint = turf.point([longitude, latitude]);
      const steps = currentRouteData.routes[0].legs[0].steps;
      navigationState.userSpeed = (speed || 0) * 2.23694;
      const routeLine = turf.lineString(currentRouteData.routes[0].geometry.coordinates);
      const snapped = turf.nearestPointOnLine(routeLine, userPoint, { units:'meters' });
      userLocationMarker && userLocationMarker.setLngLat(snapped.geometry.coordinates);
      if (heading != null) {
        userLocationMarker && userLocationMarker.setRotation(heading);
        map.easeTo({ center: snapped.geometry.coordinates, bearing: heading, zoom:18, duration:500 });
      } else {
        map.easeTo({ center: snapped.geometry.coordinates, zoom:18, duration:500 });
      }

      const currentStep = steps[navigationState.currentStepIndex];
      const stepStartPoint = turf.point(currentStep.geometry.coordinates[0]);
      const stepEndPoint = turf.point(currentStep.geometry.coordinates[currentStep.geometry.coordinates.length - 1]);
      const stepBearing = getBearing(stepStartPoint, stepEndPoint);
      const headingDifference = Math.abs((heading || 0) - stepBearing);

      if (snapped.properties.dist > 50) {
        navigationState.isRerouting = true;
        speech.speak("Off route. Recalculating.", true);
        showToast('Off route — recalculating', 'info');
        await getRoute();
        return;
      }

      if (heading != null && headingDifference > 90 && headingDifference < 270 && navigationState.userSpeed > 5 && !navigationState.isWrongWay) {
        navigationState.isWrongWay = true;
        speech.speak("Wrong way. Recalculating.", true);
        showToast('Wrong way — recalculating', 'info');
        await getRoute();
        return;
      }
      navigationState.isWrongWay = false;

      const currentStepLine = turf.lineString(currentStep.geometry.coordinates);
      const totalStepDistance = turf.length(currentStepLine, { units:'meters' });
      navigationState.distanceToNextManeuver = turf.distance(userPoint, stepEndPoint, { units:'meters' });
      navigationState.progressAlongStep = Math.max(0, 1 - (navigationState.distanceToNextManeuver / totalStepDistance));
      const tripDurationSeconds = currentRouteData.routes[0].duration;
      const timeElapsed = tripDurationSeconds * (snapped.properties.location / turf.length(routeLine));
      const remainingTimeSeconds = tripDurationSeconds - timeElapsed;
      navigationState.estimatedArrivalTime = new Date(Date.now() + remainingTimeSeconds * 1000);
      navigationState.totalTripTime = remainingTimeSeconds;
      updateNavigationUI();

      const distanceMiles = navigationState.distanceToNextManeuver * 0.000621371;
      if (distanceMiles > 0.9 && distanceMiles < 1.1 && navigationState.lastAnnouncedDistance > 1.1) {
        speech.speak(`In 1 mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 1;
      } else if (distanceMiles > 0.24 && distanceMiles < 0.26 && navigationState.lastAnnouncedDistance > 0.26) {
        speech.speak(`In a quarter mile, ${currentStep.maneuver.instruction}`);
        navigationState.lastAnnouncedDistance = 0.25;
      }

      if (navigationState.distanceToNextManeuver < 50) {
        navigationState.currentStepIndex++;
        if (navigationState.currentStepIndex >= steps.length) {
          speech.speak("You have arrived at your destination.", true);
          stopNavigation();
          return;
        }
        const nextStep = steps[navigationState.currentStepIndex];
        navigationInstructionEl.textContent = nextStep.maneuver.instruction;
        updateHighlightedSegment(nextStep);
        speech.speak(nextStep.maneuver.instruction, true);
        navigationState.lastAnnouncedDistance = Infinity;
      }
    } catch (err) {
      console.error('Position update failed', err);
    }
  }

  /* ========= Traffic Layer logic ========= */
  const TRAFFIC_SOURCE_ID = 'maptiler-traffic';
  const TRAFFIC_LAYER_ID = 'traffic-lines';
  const trafficSource = { type: 'vector', url: `https://api.maptiler.com/tiles/traffic/tiles.json?key=${MAPTILER_KEY}` };
  const trafficLayer = {
    id: TRAFFIC_LAYER_ID,
    type: 'line',
    source: TRAFFIC_SOURCE_ID,
    'source-layer': 'traffic',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-width': 2,
      'line-color': ['match', ['get', 'congestion'], 'low', '#30c83a', 'moderate', '#ff9a00', 'heavy', '#ff3d3d', 'severe', '#a00000', '#a0a0a0']
    }
  };
  function addTrafficLayer() {
    try {
      if (map.getSource(TRAFFIC_SOURCE_ID)) return;
      map.addSource(TRAFFIC_SOURCE_ID, trafficSource);
      map.addLayer(trafficLayer, 'route-line');
    } catch (err) { console.warn('addTrafficLayer failed', err); showToast('Traffic layer failed', 'error'); }
  }
  function removeTrafficLayer() {
    try {
      if (!map.getSource(TRAFFIC_SOURCE_ID)) return;
      map.removeLayer(TRAFFIC_LAYER_ID);
      map.removeSource(TRAFFIC_SOURCE_ID);
    } catch (err) { console.warn('removeTrafficLayer failed', err); }
  }

  // settings UI wiring
  const settingsBtns = document.querySelectorAll('.js-settings-btn');
  const settingsMenu = el('settings-menu');
  const closeSettingsBtn = el('close-settings-btn');
  const menuOverlay = el('menu-overlay');
  const styleRadioButtons = document.querySelectorAll('input[name="map-style"]');
  const trafficToggle = el('traffic-toggle');

  function openSettings() {
    settingsMenu?.classList.add('open');
    settingsMenu?.setAttribute('aria-hidden','false');
    if (isTouchMobile) menuOverlay?.classList.add('open');
    menuOverlay && (menuOverlay.style.display = 'block');
  }
  function closeSettings() {
    settingsMenu?.classList.remove('open');
    settingsMenu?.setAttribute('aria-hidden','true');
    if (isTouchMobile) menuOverlay?.classList.remove('open');
    menuOverlay && (menuOverlay.style.display = 'none');
  }

  settingsBtns.forEach(btn => btn.addEventListener('click', (e)=>{ e.stopPropagation(); openSettings(); }));

  closeSettingsBtn?.addEventListener('click', closeSettings);
  menuOverlay?.addEventListener('click', closeSettings);

  styleRadioButtons.forEach(radio => radio.addEventListener('change', () => {
    const newStyle = radio.value;
    try {
      map.setStyle(STYLES[newStyle]);
      showToast('Style applied', 'success');
    } catch (err) { console.error('setStyle failed', err); showToast('Could not set style', 'error'); }
    if (isTouchMobile) setTimeout(closeSettings, 200);
  }));

  trafficToggle?.addEventListener('change', () => { if (trafficToggle.checked) addTrafficLayer(); else removeTrafficLayer(); if (isTouchMobile) setTimeout(closeSettings,200); });

  // Units - nothing to wire (future)
  document.querySelectorAll('input[name="map-units"]').forEach(radio => radio.addEventListener('change', () => { if (isTouchMobile) setTimeout(closeSettings,200); }));

  // theme radio wiring
  document.querySelectorAll('input[name="theme-choice"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const val = radio.value;
      localStorage.setItem('maps_theme', val);
      applyTheme(val);
      showToast('Theme updated', 'success');
    });
  });

  map?.on && map.on('styledata', () => {
    if (navigationState.isActive && currentRouteData) {
      const routeGeoJSON = { type: 'Feature', geometry: currentRouteData.routes[0].geometry };
      addRouteToMap(routeGeoJSON);
      updateHighlightedSegment(currentRouteData.routes[0].legs[0].steps[navigationState.currentStepIndex]);
    }
    if (trafficToggle && trafficToggle.checked) addTrafficLayer();
  });

  // reverse geocoding on map click
  map?.on && map.on('click', async (e) => {
    try {
      const { lng, lat } = e.lngLat;
      const response = await safeFetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&extratags=1`, {}, 9000);
      const data = await response.json();
      if (data) {
        processPlaceResult(data);
      }
    } catch (err) {
      console.error('Reverse geocode failed', err);
      showToast('Reverse geocoding failed', 'error');
    }
  });

  // start/stop navigation UI
  el('start-navigation-btn')?.addEventListener('click', startNavigation);
  el('share-route-btn')?.addEventListener('click', async () => {
    try {
      const fromName = fromInput.value; const toName = toInput.value;
      const fromCoords = fromInput.dataset.coords; const toCoords = toInput.dataset.coords;
      const url = new URL(window.location.href);
      url.searchParams.set('from', fromCoords);
      url.searchParams.set('to', toCoords);
      url.searchParams.set('fromName', fromName);
      url.searchParams.set('toName', toName);
      const shareText = `Check out this route from ${fromName} to ${toName}!`;
      if (navigator.share) {
        await navigator.share({ title:'TheBoiisMC Maps Route', text: shareText, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
        showToast('Link copied to clipboard', 'success');
      }
    } catch (err) {
      console.error('Share failed', err);
      showToast('Could not share route', 'error');
    }
  });

  // panel open helpers for directions
  function openDirectionsPanel(){
    ['info-panel-redesign','directions-panel-redesign','route-section','route-preview-panel'].forEach(id => el(id) && (el(id).hidden = id !== 'directions-panel-redesign'));
    if (currentPlace) {
      toInput.value = currentPlace.display_name || '';
      toInput.dataset.coords = `${currentPlace.lon || ''},${currentPlace.lat || ''}`;
    } else {
      toInput.value = mainSearchInput.value || '';
      toInput.dataset.coords = '';
    }
    fromInput.value = '';
    fromInput.dataset.coords = '';
    openPanel('half');
  }

  // minimal serviceWorker registration remains
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW registered: ', reg.scope);
      }).catch(err => {
        console.warn('SW reg failed: ', err);
      });
    });
  }

  // small UX: close suggestions on outside click
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.suggestions-dropdown').forEach(sd => {
      if (!sd.contains(e.target) && !sd.previousElementSibling?.contains?.(e.target)) sd.style.display = 'none';
    });
  });

  // final: expose some debug helpers on window for you (remove if you want)
  window.__theboiis = {
    showToast, safeFetch, openPanel, closePanel, setSheetState, getState: () => ({ currentSheetState, navigationState })
  };

  showToast('Maps ready', 'success', 1600);
}); // end DOMContentLoaded
