// TheBoiisMC Full Glowed Up app.js
// Core libs
const maplibreglVersion = "2.4.0";

// Globals
const MAP_CENTER = [-95, 39];
const MAP_ZOOM = 4;
const PHOTON_API = "https://photon.komoot.io/api/";

const recentSearchLimit = 7;
const RECENT_STORAGE_KEY = "theboiismc_recent_searches";

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const fetchJSON = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("Fetch error:", e);
    return null;
  }
};

const getRecentSearches = () => {
  const raw = localStorage.getItem(RECENT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
};
const saveRecentSearch = (place) => {
  let recent = getRecentSearches();
  recent = recent.filter((r) => r.place_id !== place.place_id);
  recent.unshift(place);
  if (recent.length > recentSearchLimit) recent = recent.slice(0, recentSearchLimit);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
};

const removeAllChildren = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

const createSuggestionElement = (place, onClick, isRecent = false) => {
  const div = document.createElement("div");
  div.className = isRecent ? "recent-item" : "suggestion";
  div.textContent = place.name;
  div.setAttribute("role", "option");
  div.tabIndex = -1;
  div.addEventListener("click", () => onClick(place));
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(place);
    }
  });
  return div;
};

// Feather icon helper
const replaceIcons = () => feather.replace();

////////////////////////
// Map Initialization
////////////////////////
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
});

////////////////////////
// UI elements
////////////////////////
const searchInput = document.getElementById("search");
const searchIcon = document.getElementById("search-icon");
const suggestionsEl = document.getElementById("suggestions");
const recentSearchesEl = document.getElementById("recent-searches");
const sidePanel = document.getElementById("side-panel");
const placeNameEl = document.getElementById("place-name");
const placeImage = document.getElementById("place-image");
const placeDesc = document.getElementById("place-description");
const placeWeather = document.getElementById("place-weather");
const directionsBtn = document.getElementById("directions-btn");
const infoContent = document.getElementById("info-content");
const directionsContent = document.getElementById("directions-content");
const panelArrow = document.getElementById("panel-arrow");
const panelSearchIcon = document.getElementById("panel-search-icon");

const dirStartInput = document.getElementById("dir-start");
const dirEndInput = document.getElementById("dir-end");
const yourLocationBtn = document.getElementById("your-location-btn");
const dirStartSuggestions = document.getElementById("dir-start-suggestions");
const dirEndSuggestions = document.getElementById("dir-end-suggestions");
const directionsBackBtn = document.getElementById("directions-back-btn");

////////////////////////
// State
////////////////////////
let panelExpanded = false;
let currentPlace = null;
let selectedSuggestionIndex = -1;
let lastSuggestions = [];
let lastRecentSearches = [];
let directionsMode = false;

////////////////////////
// Utils
////////////////////////
const openPanel = () => {
  sidePanel.classList.remove("hidden");
  if (window.innerWidth < 769) {
    sidePanel.style.transform = "translateY(40vh)";
  } else {
    sidePanel.style.transform = "translateX(0)";
  }
};
const closePanel = () => {
  if (window.innerWidth < 769) {
    sidePanel.style.transform = "translateY(100vh)";
  } else {
    sidePanel.style.transform = "translateX(-100%)";
  }
  setTimeout(() => sidePanel.classList.add("hidden"), 300);
};
const expandPanel = () => {
  if (window.innerWidth < 769) {
    sidePanel.style.transform = "translateY(0)";
  } else {
    sidePanel.style.width = "380px";
  }
  panelExpanded = true;
  panelArrow.classList.add("expanded");
};
const collapsePanel = () => {
  if (window.innerWidth < 769) {
    sidePanel.style.transform = "translateY(40vh)";
  }
  panelExpanded = false;
  panelArrow.classList.remove("expanded");
};

const setPlace = (place) => {
  currentPlace = place;
  placeNameEl.textContent = place.name;
  placeDesc.textContent = place.description || "No description available.";
  placeWeather.textContent = place.weather || "No weather data.";

  // Load place image from Unsplash cors-safe with fallback
  // Use place.name + city/state/country for relevance
  const query = encodeURIComponent(place.name + (place.city ? ` ${place.city}` : "") + (place.state ? ` ${place.state}` : "") + (place.country ? ` ${place.country}` : ""));
  const unsplashURL = `https://source.unsplash.com/600x400/?${query}`;

  placeImage.src = unsplashURL;
  placeImage.onerror = () => {
    placeImage.src = "https://cdn-icons-png.flaticon.com/512/684/684908.png"; // fallback placeholder icon
  };
};

const showSuggestions = (places) => {
  removeAllChildren(suggestionsEl);
  if (!places.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  for (const place of places) {
    suggestionsEl.appendChild(createSuggestionElement(place, onSuggestionClick));
  }
  suggestionsEl.style.display = "block";
};

const showRecentSearches = () => {
  lastRecentSearches = getRecentSearches();
  removeAllChildren(recentSearchesEl);
  if (!lastRecentSearches.length) {
    recentSearchesEl.style.display = "none";
    return;
  }
  for (const place of lastRecentSearches) {
    recentSearchesEl.appendChild(createSuggestionElement(place, onSuggestionClick, true));
  }
  recentSearchesEl.style.display = "block";
};

const hideDropdowns = () => {
  suggestionsEl.style.display = "none";
  recentSearchesEl.style.display = "none";
  suggestionsEl.setAttribute("aria-expanded", "false");
  recentSearchesEl.setAttribute("aria-expanded", "false");
};

////////////////////////
// Search logic
////////////////////////

const searchPlaces = async (query) => {
  if (!query) {
    showSuggestions([]);
    return;
  }
  const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&limit=7&lang=en`;
  const data = await fetchJSON(url);
  if (!data || !data.features) {
    showSuggestions([]);
    return;
  }
  const places = data.features.map((f) => {
    return {
      place_id: f.properties.osm_id + f.properties.osm_type,
      name: f.properties.name || "Unknown place",
      city: f.properties.city || f.properties.town || f.properties.village || "",
      state: f.properties.state || "",
      country: f.properties.country || "",
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      description: `${f.properties.name || "Place"} in ${f.properties.city || f.properties.state || f.properties.country || ""}`,
      weather: "Weather data TBD",
    };
  });
  lastSuggestions = places;
  showSuggestions(places);
};

const onSuggestionClick = (place) => {
  saveRecentSearch(place);
  hideDropdowns();
  searchInput.value = place.name;
  openPanel();
  setPlace(place);
  // Center map on place coords
  map.flyTo({ center: [place.lon, place.lat], zoom: 14, speed: 1.4, curve: 1.4 });
};

const onSearchInput = debounce((e) => {
  const val = e.target.value.trim();
  if (!val) {
    showSuggestions([]);
    return;
  }
  searchPlaces(val);
}, 250);

const onSearchFocus = () => {
  if (!searchInput.value.trim()) {
    showRecentSearches();
  }
};

const onSearchBlur = () => {
  setTimeout(() => {
    hideDropdowns();
  }, 250);
};

////////////////////////
// Panel drag/swipe handlers
////////////////////////
let startY = 0;
let currentY = 0;
let panelStartTransform = 0;
let dragging = false;

const onTouchStart = (e) => {
  if (directionsMode) return; // disable drag on directions mode for now
  if (window.innerWidth >= 769) return; // desktop panel slide not draggable vertically
  dragging = true;
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  const style = window.getComputedStyle(sidePanel);
  const matrix = new WebKitCSSMatrix(style.transform);
  panelStartTransform = matrix.m42; // translateY in px
  sidePanel.style.transition = "none";
};
const onTouchMove = (e) => {
  if (!dragging) return;
  currentY = e.touches ? e.touches[0].clientY : e.clientY;
  let delta = currentY - startY;
  let newTransform = panelStartTransform + delta;
  const maxTranslate = window.innerHeight;
  const minTranslate = window.innerHeight * 0.2; // expanded height approx 20% from top
  if (newTransform < minTranslate) newTransform = minTranslate;
  if (newTransform > maxTranslate) newTransform = maxTranslate;
  sidePanel.style.transform = `translateY(${newTransform}px)`;
  e.preventDefault();
};
const onTouchEnd = (e) => {
  if (!dragging) return;
  dragging = false;
  sidePanel.style.transition = "transform 0.25s ease";
  const style = window.getComputedStyle(sidePanel);
  const matrix = new WebKitCSSMatrix(style.transform);
  const currentTranslateY = matrix.m42;
  const halfway = window.innerHeight * 0.5;
  if (currentTranslateY > halfway) {
    // snap back to collapsed
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.4}px)`;
    panelExpanded = false;
    panelArrow.classList.remove("expanded");
  } else {
    // snap expanded
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`;
    panelExpanded = true;
    panelArrow.classList.add("expanded");
  }
};

////////////////////////
// Panel toggle handlers
////////////////////////
panelArrow.addEventListener("click", () => {
  if (!panelExpanded) {
    sidePanel.style.transition = "transform 0.3s ease";
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`;
    panelExpanded = true;
    panelArrow.classList.add("expanded");
  } else {
    sidePanel.style.transition = "transform 0.3s ease";
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.4}px)`;
    panelExpanded = false;
    panelArrow.classList.remove("expanded");
  }
});

panelSearchIcon.addEventListener("click", () => {
  searchInput.focus();
  hideDropdowns();
});

////////////////////////
// Directions Panel Logic
////////////////////////
directionsBtn.addEventListener("click", () => {
  directionsMode = true;
  infoContent.style.display = "none";
  directionsContent.style.display = "flex";
  setDirectionsStart(currentPlace);
  sidePanel.style.transition = "transform 0.3s ease";
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`;
  }
  panelArrow.style.display = "none";
  panelSearchIcon.style.display = "none";
  directionsBtn.style.display = "none";
});

directionsBackBtn.addEventListener("click", () => {
  directionsMode = false;
  infoContent.style.display = "flex";
  directionsContent.style.display = "none";
  panelArrow.style.display = "flex";
  panelSearchIcon.style.display = "flex";
  directionsBtn.style.display = "flex";
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`;
  }
});

const setDirectionsStart = (place) => {
  if (!place) return;
  dirStartInput.value = place.name || "";
  dirEndInput.value = "";
  clearDirSuggestions();
};

const clearDirSuggestions = () => {
  removeAllChildren(dirStartSuggestions);
  dirStartSuggestions.style.display = "none";
  removeAllChildren(dirEndSuggestions);
  dirEndSuggestions.style.display = "none";
};

////////////////////////
// Directions autocomplete
////////////////////////

const showDirSuggestions = (inputEl, containerEl, places) => {
  removeAllChildren(containerEl);
  if (!places.length) {
    containerEl.style.display = "none";
    return;
  }
  for (const place of places) {
    const div = document.createElement("div");
    div.className = "dir-suggestion-item";
    div.textContent = place.name;
    div.tabIndex = -1;
    div.addEventListener("click", () => {
      inputEl.value = place.name;
      containerEl.style.display = "none";
    });
    containerEl.appendChild(div);
  }
  containerEl.style.display = "block";
};

const dirSearch = debounce(async (inputEl, containerEl, query) => {
  if (!query) {
    containerEl.style.display = "none";
    return;
  }
  const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&limit=7&lang=en`;
  const data = await fetchJSON(url);
  if (!data || !data.features) {
    containerEl.style.display = "none";
    return;
  }
  const places = data.features.map((f) => ({
    name: f.properties.name || "Unknown",
  }));
  showDirSuggestions(inputEl, containerEl, places);
}, 300);

dirStartInput.addEventListener("input", (e) => {
  dirSearch(dirStartInput, dirStartSuggestions, e.target.value.trim());
});
dirEndInput.addEventListener("input", (e) => {
  dirSearch(dirEndInput, dirEndSuggestions, e.target.value.trim());
});

yourLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      dirStartInput.value = "Your Location";
      dirStartSuggestions.style.display = "none";
    },
    (err) => {
      alert("Failed to get your location");
    }
  );
});

////////////////////////
// Search input events
////////////////////////
searchInput.addEventListener("input", onSearchInput);
searchInput.addEventListener("focus", onSearchFocus);
searchInput.addEventListener("blur", onSearchBlur);

searchIcon.addEventListener("click", () => {
  if (searchInput.value.trim()) {
    searchPlaces(searchInput.value.trim());
  }
});

////////////////////////
// Map click to close panel
////////////////////////
map.on("click", () => {
  if (!directionsMode) closePanel();
});

////////////////////////
// Side panel touch events for drag on mobile
////////////////////////
sidePanel.addEventListener("touchstart", onTouchStart);
sidePanel.addEventListener("touchmove", onTouchMove);
sidePanel.addEventListener("touchend", onTouchEnd);

////////////////////////
// On window resize update panel transform
////////////////////////
window.addEventListener("resize", () => {
  if (!sidePanel.classList.contains("hidden")) {
    if (window.innerWidth < 769) {
      if (panelExpanded) {
        sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`;
      } else {
        sidePanel.style.transform = `translateY(${window.innerHeight * 0.4}px)`;
      }
    } else {
      sidePanel.style.transform = "translateX(0)";
      panelArrow.classList.remove("expanded");
      panelArrow.style.display = "flex";
      panelSearchIcon.style.display = "flex";
      directionsBtn.style.display = "flex";
      directionsContent.style.display = "none";
      infoContent.style.display = "flex";
    }
  }
});

////////////////////////
// Initialize recent searches dropdown
////////////////////////
showRecentSearches();

////////////////////////
// Feather Icons replace after initial render
////////////////////////
replaceIcons();
