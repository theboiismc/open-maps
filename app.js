const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95, 39],
  zoom: 4
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'bottom-right');

const $ = id => document.getElementById(id);

const search = $('search');
const suggestions = $('suggestions');
const recentSearchesDiv = $('recent-searches');

const sidePanel = $('side-panel');
const closeSidePanel = $('close-side-panel');
const placeName = $('place-name');
const placeDescription = $('place-description');
const placeWeather = $('place-weather');
const placeImage = $('place-image');
const directionsBtn = $('directions-btn');

let panelMaxHeight = window.innerHeight * 0.8;
let collapsedTranslateY = panelMaxHeight * 0.4;
const expandedTranslateY = 0;

let dragging = false;
let startY = 0;
let lastY = 0;
let lastTime = 0;
let velocity = 0;

let currentController = null;

let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
const cache = {};

let selectedPlace = null; // To keep the selected place info (name, lat, lon)

// -- RECENT SEARCHES + SEARCH SUGGESTIONS (same as before) --

function saveRecentSearch(term) {
  if (!term) return;
  recentSearches = recentSearches.filter(t => t.toLowerCase() !== term.toLowerCase());
  recentSearches.unshift(term);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
}

function showRecentSearches() {
  if (recentSearches.length === 0) {
    recentSearchesDiv.style.display = 'none';
    return;
  }
  recentSearchesDiv.innerHTML = '';
  recentSearches.forEach(term => {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.textContent = term;
    div.addEventListener('click', () => {
      search.value = term;
      recentSearchesDiv.style.display = 'none';
      doSearch(term);
    });
    recentSearchesDiv.appendChild(div);
  });
  recentSearchesDiv.style.display = 'block';
}

function hideRecentSearches() {
  recentSearchesDiv.style.display = 'none';
}

async function doSearch(query) {
  if (!query) {
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
    return;
  }

  if (cache[query]) {
    renderSuggestions(cache[query]);
    return;
  }

  if (currentController) currentController.abort();
  currentController = new AbortController();

  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`, { signal: currentController.signal });
    const json = await res.json();
    cache[query] = json.features;
    renderSuggestions(json.features);
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Search fetch error:', e);
    suggestions.innerHTML = '';
    suggestions.style.display = 'none';
  }
}

function renderSuggestions(features) {
  suggestions.innerHTML = '';
  features.forEach(f => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = `${f.properties.name}, ${f.properties.state || ''}, ${f.properties.country || ''}`;
    div.addEventListener('click', () => {
      const placeText = div.textContent;
      search.value = placeText;
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
      saveRecentSearch(placeText);
      loadPlaceInfo(f.properties.name, f.geometry.coordinates[1], f.geometry.coordinates[0]);
      openPanel();
      hideRecentSearches();
      selectedPlace = {
        name: f.properties.name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0]
      };
      showPlaceInfoPanel();
    });
    suggestions.appendChild(div);
  });
  suggestions.style.display = 'block';
}

// Search input events for main search bar

search.addEventListener('focus', () => {
  if (!search.value.trim()) showRecentSearches();
});

search.addEventListener('blur', () => {
  setTimeout(() => {
    suggestions.style.display = 'none';
    hideRecentSearches();
  }, 200);
});

search.addEventListener('input', debounce(() => {
  const query = search.value.trim();
  if (!query) {
    suggestions.style.display = 'none';
    showRecentSearches();
    return;
  }
  hideRecentSearches();
  doSearch(query);
}, 150));

// -- PANEL OPEN/CLOSE AND SWIPE LOGIC --

function updatePanelSizes() {
  panelMaxHeight = window.innerHeight * 0.8;
  collapsedTranslateY = panelMaxHeight * 0.4;
  if (sidePanel.classList.contains('expanded')) {
    sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
  } else if (sidePanel.classList.contains('collapsed')) {
    sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
  } else {
    sidePanel.style.transform = `translateY(${panelMaxHeight}px)`;
  }
}

window.addEventListener('resize', () => {
  updatePanelSizes();
});

function openPanel() {
  sidePanel.classList.remove('hidden');
  sidePanel.classList.add('collapsed');
  sidePanel.classList.remove('expanded');
  sidePanel.style.transition = 'transform 0.25s ease';
  sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
}

function closePanel() {
  sidePanel.style.transition = 'transform 0.25s ease';
  sidePanel.style.transform = `translateY(${panelMaxHeight}px)`;
  setTimeout(() => {
    sidePanel.classList.add('hidden');
    sidePanel.classList.remove('expanded', 'collapsed');
    sidePanel.style.transition = '';
  }, 300);
}

closeSidePanel.addEventListener('click', closePanel);

sidePanel.addEventListener('touchstart', e => {
  if (window.innerWidth > 768) return;
  dragging = true;
  startY = e.touches[0].clientY;
  lastY = startY;
  lastTime = performance.now();
  sidePanel.style.transition = 'none';
});

sidePanel.addEventListener('touchmove', e => {
  if (!dragging) return;
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;

  let newTranslateY = collapsedTranslateY + deltaY;
  newTranslateY = Math.min(Math.max(expandedTranslateY, newTranslateY), panelMaxHeight);

  sidePanel.style.transform = `translateY(${newTranslateY}px)`;

  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 0) {
    velocity = (currentY - lastY) / dt;
    lastY = currentY;
    lastTime = now;
  }
});

sidePanel.addEventListener('touchend', e => {
  if (!dragging) return;
  dragging = false;
  sidePanel.style.transition = 'transform 0.25s ease';

  const matrix = window.getComputedStyle(sidePanel).transform;
  let translateY = collapsedTranslateY;
  if (matrix && matrix !== 'none') {
    const values = matrix.match(/matrix.*\((.+)\)/)[1].split(', ');
    translateY = parseFloat(values[5]);
  }

  const threshold = panelMaxHeight / 3;
  const flickThreshold = 0.3;

  if (velocity < -flickThreshold) {
    sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
    sidePanel.classList.add('expanded');
    sidePanel.classList.remove('collapsed');
  } else if (velocity > flickThreshold) {
    sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
    sidePanel.classList.add('collapsed');
    sidePanel.classList.remove('expanded');
  } else {
    if (translateY < threshold) {
      sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
      sidePanel.classList.add('expanded');
      sidePanel.classList.remove('collapsed');
    } else {
      sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
      sidePanel.classList.add('collapsed');
      sidePanel.classList.remove('expanded');
    }
  }
});

// -- LOAD PLACE INFO PANEL CONTENT --

async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;

  try {
    const imageRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=url`);
    const imageData = await imageRes.json();
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.imageinfo?.[0]?.url;
    placeImage.src = imageUrl || 'default.jpg';
  } catch {
    placeImage.src = 'default.jpg';
  }

  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    const wikiData = await wikiRes.json();
    placeDescription.textContent = wikiData.extract || 'No description available.';
  } catch {
    placeDescription.textContent = 'No description available.';
  }

  placeWeather.textContent = 'Weather info would be here';
}

// -- PANEL MODES: INFO vs DIRECTIONS --

const panelContent = {
  info: $('info-content'),
  directions: $('directions-content')
};

function showPlaceInfoPanel() {
  panelContent.info.style.display = 'flex';
  panelContent.directions.style.display = 'none';
  directionsBtn.style.display = 'flex';
}

function showDirectionsPanel() {
  panelContent.info.style.display = 'none';
  panelContent.directions.style.display = 'flex';
  directionsBtn.style.display = 'none';
  initDirectionsPanel();
}

// -- DIRECTIONS PANEL ELEMENTS --

const startInput = $('start-input');
const destInput = $('dest-input');
const startSuggestions = $('start-suggestions');
const destSuggestions = $('dest-suggestions');
const yourLocationBtn = $('your-location-btn');
const directionsBackBtn = $('directions-back-btn');

directionsBtn.addEventListener('click', () => {
  showDirectionsPanel();
});

directionsBackBtn.addEventListener('click', () => {
  showPlaceInfoPanel();
});

// -- PHOTON AUTOCOMPLETE for directions inputs --

let dirCurrentController = null;

function setupAutocomplete(inputEl, suggestionsEl) {
  inputEl.addEventListener('input', debounce(async () => {
    const query = inputEl.value.trim();
    if (!query) {
      suggestionsEl.style.display = 'none';
      suggestionsEl.innerHTML = '';
      return;
    }
    if (dirCurrentController) dirCurrentController.abort();
    dirCurrentController = new AbortController();

    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`, { signal: dirCurrentController.signal });
      const json = await res.json();
      suggestionsEl.innerHTML = '';
      json.features.forEach(f => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.textContent = `${f.properties.name}, ${f.properties.state || ''}, ${f.properties.country || ''}`;
        div.addEventListener('click', () => {
          inputEl.value = div.textContent;
          suggestionsEl.style.display = 'none';
        });
        suggestionsEl.appendChild(div);
      });
      suggestionsEl.style.display = 'block';
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Directions autocomplete error:', e);
      suggestionsEl.innerHTML = '';
      suggestionsEl.style.display = 'none';
    }
  }, 200));

  inputEl.addEventListener('blur', () => {
    setTimeout(() => {
      suggestionsEl.style.display = 'none';
    }, 150);
  });
}

// -- YOUR LOCATION BUTTON LOGIC --

yourLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation not supported.');
    return;
  }
  yourLocationBtn.disabled = true;
  yourLocationBtn.textContent = 'Locating...';

  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    try {
      const res = await fetch(`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`);
      const json = await res.json();
      if (json.features && json.features.length > 0) {
        const locName = json.features[0].properties.name;
        startInput.value = locName || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      } else {
        startInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
    } catch {
      startInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
    yourLocationBtn.disabled = false;
    yourLocationBtn.textContent = 'Your Location';
  }, err => {
    alert('Error getting location');
    yourLocationBtn.disabled = false;
    yourLocationBtn.textContent = 'Your Location';
  });
});

// Initialize directions panel inputs and autocomplete

function initDirectionsPanel() {
  startInput.value = selectedPlace ? selectedPlace.name : '';
  destInput.value = '';
  startSuggestions.innerHTML = '';
  destSuggestions.innerHTML = '';
  startSuggestions.style.display = 'none';
  destSuggestions.style.display = 'none';

  setupAutocomplete(startInput, startSuggestions);
  setupAutocomplete(destInput, destSuggestions);
}

// -- UTILS --

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Initialize

sidePanel.classList.add('hidden');
updatePanelSizes();
showPlaceInfoPanel();
