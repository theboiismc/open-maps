// TheBoiisMC - Full dynamic place images + fuzzy search everywhere + smooth UI

const MAP_CENTER = [-95, 39];
const MAP_ZOOM = 4;
const PHOTON_API = "https://photon.komoot.io/api/";

const RECENT_STORAGE_KEY = "theboiismc_recent_searches";
const RECENT_SEARCH_LIMIT = 7;
const DEBOUNCE_DELAY = 250;

// Initialize map
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
});

// Elements
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

// State
let recentSearches = [];
let lastSuggestions = [];
let currentPlace = null;
let panelExpanded = false;
let directionsMode = false;

////////////////////////
// Utils
////////////////////////

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function removeAllChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function saveRecentSearch(place) {
  recentSearches = recentSearches.filter((p) => p.place_id !== place.place_id);
  recentSearches.unshift(place);
  if (recentSearches.length > RECENT_SEARCH_LIMIT) recentSearches = recentSearches.slice(0, RECENT_SEARCH_LIMIT);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentSearches));
}

function loadRecentSearches() {
  try {
    const data = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY));
    if (Array.isArray(data)) recentSearches = data;
    else recentSearches = [];
  } catch {
    recentSearches = [];
  }
}

function createSuggestionElement(place, onClick, isRecent = false) {
  const div = document.createElement("div");
  div.className = isRecent ? "recent-item" : "suggestion";
  div.textContent = place.name;
  div.tabIndex = 0;
  div.setAttribute("role", "option");
  div.addEventListener("click", () => onClick(place));
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(place);
    }
  });
  return div;
}

function showSuggestions(places) {
  removeAllChildren(suggestionsEl);
  if (!places.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  for (const place of places) {
    suggestionsEl.appendChild(createSuggestionElement(place, onSuggestionClick));
  }
  suggestionsEl.style.display = "block";
}

function showRecentSearches() {
  removeAllChildren(recentSearchesEl);
  if (!recentSearches.length) {
    recentSearchesEl.style.display = "none";
    return;
  }
  for (const place of recentSearches) {
    recentSearchesEl.appendChild(createSuggestionElement(place, onSuggestionClick, true));
  }
  recentSearchesEl.style.display = "block";
}

function hideDropdowns() {
  suggestionsEl.style.display = "none";
  recentSearchesEl.style.display = "none";
}

////////////////////////
// Fetch helpers
////////////////////////

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("Fetch error:", e);
    return null;
  }
}

async function searchPhoton(query) {
  if (!query) return [];
  const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&limit=7&lang=en`;
  const data = await fetchJSON(url);
  if (!data || !data.features) return [];
  return data.features.map((f) => ({
    place_id: f.properties.osm_id + f.properties.osm_type,
    name: f.properties.name || "Unknown place",
    city: f.properties.city || f.properties.town || f.properties.village || "",
    state: f.properties.state || "",
    country: f.properties.country || "",
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    description: `${f.properties.name || "Place"} in ${f.properties.city || f.properties.state || f.properties.country || ""}`,
    weather: "Weather data TBD",
  }));
}

////////////////////////
// Fuse.js fuzzy search setup
////////////////////////
let fuse = null;
let fuseRecent = null;

function setupFuse() {
  const options = {
    keys: ["name", "city", "state", "country"],
    threshold: 0.4,
    ignoreLocation: true,
  };
  fuseRecent = new Fuse(recentSearches, options);
}

async function combinedFuzzySearch(query) {
  // Fuse recent searches first
  const recentResults = fuseRecent ? fuseRecent.search(query).map((r) => r.item) : [];

  // Photon search
  const photonResults = await searchPhoton(query);

  // Combine & dedupe by place_id
  const combined = [...recentResults];
  const existingIds = new Set(recentResults.map((p) => p.place_id));
  for (const p of photonResults) {
    if (!existingIds.has(p.place_id)) combined.push(p);
  }

  return combined;
}

////////////////////////
// Set place and fetch dynamic image from Wikipedia
////////////////////////

async function fetchWikiImage(placeName) {
  try {
    // Search for the page
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        placeName
      )}&format=json&origin=*`
    );
    const searchJson = await searchRes.json();
    if (!searchJson.query.search.length) return null;

    const pageTitle = searchJson.query.search[0].title;

    // Get page image thumbnail
    const imagesRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        pageTitle
      )}&prop=pageimages&format=json&pithumbsize=600&origin=*`
    );
    const imagesJson = await imagesRes.json();
    const pages = imagesJson.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pages[pageId]?.thumbnail?.source) return pages[pageId].thumbnail.source;

    return null;
  } catch {
    return null;
  }
}

async function setPlace(place) {
  currentPlace = place;
  placeNameEl.textContent = place.name;
  placeDesc.textContent = place.description || "No description available.";
  placeWeather.textContent = place.weather || "No weather data.";

  // Fetch Wikipedia image dynamically
  const imgUrl = await fetchWikiImage(place.name);
  placeImage.src = imgUrl || "https://cdn-icons-png.flaticon.com/512/684/684908.png";
}

////////////////////////
// Event handlers
////////////////////////

async function onSearchInput(e) {
  const val = e.target.value.trim();
  if (!val) {
    hideDropdowns();
    showRecentSearches();
    return;
  }

  const combinedResults = await combinedFuzzySearch(val);
  showSuggestions(combinedResults);
}

function onSearchFocus() {
  if (!searchInput.value.trim()) {
    showRecentSearches();
  }
}

function onSearchBlur() {
  setTimeout(() => {
    hideDropdowns();
  }, 250);
}

function onSuggestionClick(place) {
  saveRecentSearch(place);
  hideDropdowns();
  searchInput.value = place.name;
  openPanel();
  setPlace(place);
  map.flyTo({ center: [place.lon, place.lat], zoom: 14, speed: 1.4, curve: 1.4 });
}

////////////////////////
// Panel open/close/expand/collapse
////////////////////////

function openPanel() {
  sidePanel.classList.remove("hidden");
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.4}px)`; // initial collapsed height
  } else {
    sidePanel.style.transform = "translateX(0)";
  }
}

function expandPanel() {
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.2}px)`; // expanded height
  } else {
    sidePanel.style.width = "380px";
  }
  panelExpanded = true;
  panelArrow.textContent = "▲";
}

function collapsePanel() {
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${window.innerHeight * 0.4}px)`; // collapsed height
  }
  panelExpanded = false;
  panelArrow.textContent = "▼";
}

function closePanel() {
  sidePanel.classList.add("hidden");
  sidePanel.style.transform = "";
  panelExpanded = false;
  directionsMode = false;
  infoContent.style.display = "flex";
  directionsContent.style.display = "none";
  directionsBtn.style.display = "flex";
  panelArrow.style.display = "flex";
  panelSearchIcon.style.display = "flex";
}

////////////////////////
// Directions panel & input fuzzy search
////////////////////////

async function dirSearch(inputEl, suggestionsEl, query) {
  if (!query) {
    suggestionsEl.style.display = "none";
    return;
  }

  const results = await combinedFuzzySearch(query);
  removeAllChildren(suggestionsEl);

  if (!results.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  for (const place of results) {
    const div = document.createElement("div");
    div.className = "dir-suggestion-item";
    div.textContent = place.name;
    div.tabIndex = 0;
    div.setAttribute("role", "option");
    div.addEventListener("click", () => {
      inputEl.value = place.name;
      suggestionsEl.style.display = "none";
    });
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputEl.value = place.name;
        suggestionsEl.style.display = "none";
      }
    });
    suggestionsEl.appendChild(div);
  }
  suggestionsEl.style.display = "block";
}

function openDirections() {
  directionsMode = true;
  infoContent.style.display = "none";
  directionsContent.style.display = "flex";
  directionsBtn.style.display = "none";
  panelArrow.style.display = "none";
  panelSearchIcon.style.display = "none";

  // Autofill start point with current place
  if (currentPlace) dirStartInput.value = currentPlace.name;
  dirEndInput.value = "";

  dirStartSuggestions.style.display = "none";
  dirEndSuggestions.style.display = "none";

  openPanel();
}

function closeDirections() {
  directionsMode = false;
  infoContent.style.display = "flex";
  directionsContent.style.display = "none";
  directionsBtn.style.display = "flex";
  panelArrow.style.display = "flex";
  panelSearchIcon.style.display = "flex";
  collapsePanel();
}

////////////////////////
// Your location button handler
////////////////////////

yourLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by your browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;

      // Reverse geocode user's location with Photon
      const url = `${PHOTON_API}?lat=${latitude}&lon=${longitude}&limit=1`;
      const data = await fetchJSON(url);
      if (data && data.features && data.features.length) {
        const place = data.features[0];
        dirStartInput.value = place.properties.name || "Your Location";
      } else {
        dirStartInput.value = "Your Location";
      }
      dirStartSuggestions.style.display = "none";
    },
    () => {
      alert("Unable to get your location.");
    }
  );
});

////////////////////////
// Event listeners setup
////////////////////////

searchInput.addEventListener("input", debounce(onSearchInput, DEBOUNCE_DELAY));
searchInput.addEventListener("focus", onSearchFocus);
searchInput.addEventListener("blur", onSearchBlur);
searchIcon.addEventListener("click", () => {
  if (searchInput.value.trim()) onSuggestionClick({ name: searchInput.value.trim(), lat: MAP_CENTER[1], lon: MAP_CENTER[0], description: "", weather: "" });
});

directionsBtn.addEventListener("click", openDirections);
directionsBackBtn.addEventListener("click", closeDirections);

dirStartInput.addEventListener("input", debounce((e) => dirSearch(dirStartInput, dirStartSuggestions, e.target.value.trim()), DEBOUNCE_DELAY));
dirEndInput.addEventListener("input", debounce((e) => dirSearch(dirEndInput, dirEndSuggestions, e.target.value.trim()), DEBOUNCE_DELAY));

sidePanel.addEventListener("touchstart", onTouchStart);
sidePanel.addEventListener("touchmove", onTouchMove);
sidePanel.addEventListener("touchend", onTouchEnd);

panelArrow.addEventListener("click", () => {
  if (panelExpanded) collapsePanel();
  else expandPanel();
});

panelSearchIcon.addEventListener("click", () => {
  searchInput.focus();
});

map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

map.on("click", () => {
  if (!directionsMode) closePanel();
});

////////////////////////
// Recent searches load and Fuse init
////////////////////////
loadRecentSearches();
setupFuse();
showRecentSearches();

////////////////////////
// Swipe panel stuff (same as before)
////////////////////////

let startY, currentY;
const MAX_TRANSLATE_Y_COLLAPSED = window.innerHeight * 0.4;
const MAX_TRANSLATE_Y_EXPANDED = window.innerHeight * 0.2;

function onTouchStart(e) {
  if (window.innerWidth >= 769) return; // only mobile

  startY = e.touches[0].clientY;
  currentY = startY;
  sidePanel.style.transition = "none";
}

function onTouchMove(e) {
  if (window.innerWidth >= 769) return; // only mobile

  currentY = e.touches[0].clientY;
  let diff = currentY - startY;

  let translateY = panelExpanded ? MAX_TRANSLATE_Y_EXPANDED + diff : MAX_TRANSLATE_Y_COLLAPSED + diff;
  translateY = Math.min(Math.max(translateY, MAX_TRANSLATE_Y_EXPANDED), MAX_TRANSLATE_Y_COLLAPSED);
  sidePanel.style.transform = `translateY(${translateY}px)`;
}

function onTouchEnd() {
  if (window.innerWidth >= 769) return; // only mobile

  sidePanel.style.transition = "transform 0.3s ease-out";

  let finalTranslate = panelExpanded ? MAX_TRANSLATE_Y_EXPANDED : MAX_TRANSLATE_Y_COLLAPSED;
  if (currentY - startY < -30) {
    // flicked up
    finalTranslate = MAX_TRANSLATE_Y_EXPANDED;
    panelExpanded = true;
  } else if (currentY - startY > 30) {
    // flicked down
    finalTranslate = MAX_TRANSLATE_Y_COLLAPSED;
    panelExpanded = false;
  }

  sidePanel.style.transform = `translateY(${finalTranslate}px)`;
}

////////////////////////
// Utils continued
////////////////////////

function openPanel() {
  sidePanel.classList.remove("hidden");
  if (window.innerWidth < 769) {
    sidePanel.style.transform = `translateY(${MAX_TRANSLATE_Y_COLLAPSED}px)`;
  } else {
    sidePanel.style.transform = "translateX(0)";
  }
  panelExpanded = false;
}

////////////////////////
// Set place when user clicks suggestion
////////////////////////

function onSuggestionClick(place) {
  saveRecentSearch(place);
  hideDropdowns();
  searchInput.value = place.name;
  openPanel();
  setPlace(place);
  map.flyTo({ center: [place.lon, place.lat], zoom: 14, speed: 1.4, curve: 1.4 });
}

////////////////////////
// Helper functions
////////////////////////

function hideDropdowns() {
  suggestionsEl.style.display = "none";
  recentSearchesEl.style.display = "none";
  dirStartSuggestions.style.display = "none";
  dirEndSuggestions.style.display = "none";
}

function removeAllChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

////////////////////////
// Feather Icons Setup (optional)
////////////////////////

// Replace feather icons if you add feather icon usage anywhere (currently just your location icon svg inline)

