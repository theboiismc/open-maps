const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

const $ = id => document.getElementById(id);
const searchInput = $("search");
const suggestionsEl = $("suggestions");
const recentEl = $("recent-searches");
const panel = $("side-panel");
const closeBtn = $("close-side-panel");
const panelArrow = $("panel-arrow");
const panelSearch = $("panel-search-icon");
const placeName = $("place-name");
const placeDesc = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");

const placeInfoSection = $("place-info-section");
const directionsSection = $("directions-section");
const backToInfoBtn = $("back-to-info");
const directionsForm = $("directions-form");
const fromInput = $("from-input");
const toInput = $("to-input");
const directionsResult = $("directions-result");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

function saveRecent(p) {
  recentSearches = recentSearches.filter(r => r.name !== p.name);
  recentSearches.unshift(p);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

function showRecent() {
  suggestionsEl.style.display = "none";
  if (!searchInput.value.trim() && recentSearches.length) {
    recentEl.innerHTML = "";
    recentSearches.forEach(p => {
      const d = document.createElement("div");
      d.className = "suggestion recent";
      d.textContent = p.name;
      d.addEventListener("click", () => selectPlace(p));
      recentEl.appendChild(d);
    });
    recentEl.style.display = "block";
  }
}

function renderSuggestions(list) {
  recentEl.style.display = "none";
  suggestionsEl.innerHTML = "";
  list.forEach(p => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name;
    d.addEventListener("click", () => selectPlace(p));
    suggestionsEl.appendChild(d);
  });
  suggestionsEl.style.display = "block";
}

async function fetchNominatim(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'theboiismc-maps-app'
    }
  });
  const json = await res.json();
  return json.map(place => ({
    name: place.display_name,
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
  }));
}

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

searchInput.addEventListener("focus", showRecent);
searchInput.addEventListener("input", debounce(async () => {
  const q = searchInput.value.trim();
  if (!q) {
    showRecent();
    return;
  }
  let list = [];
  if (recentSearches.length) {
    list = fuseRecent.search(q).map(r => r.item);
  }
  if (list.length < 5) {
    const extra = await fetchNominatim(q);
    extra.forEach(e => {
      if (!list.find(r => r.name === e.name)) list.push(e);
    });
  }
  renderSuggestions(list);
}, 150));

document.addEventListener("click", e => {
  if (!e.target.closest(".search-bar") &&
      !e.target.closest("#suggestions") &&
      !e.target.closest("#recent-searches")) {
    suggestionsEl.style.display = recentEl.style.display = "none";
  }
});

function togglePanel(open) {
  if (window.innerWidth <= 768) {
    // MOBILE
    if (open) {
      panel.classList.add("open");
      panel.style.bottom = "0";
    } else {
      panel.classList.remove("open");
      panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
    }
  } else {
    // DESKTOP
    if (open) {
      panel.classList.add("open");
      panel.style.left = "0";
    } else {
      panel.classList.remove("open");
      panel.style.left = `calc(-1 * var(--panel-width))`;
    }
  }
  panel.setAttribute("aria-hidden", open ? "false" : "true");
  panelArrow.setAttribute("aria-expanded", open ? "true" : "false");
  map.resize();
}

closeBtn.addEventListener("click", () => togglePanel(false));
panelArrow.addEventListener("click", () => togglePanel(!panel.classList.contains("open")));
panelArrow.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    togglePanel(!panel.classList.contains("open"));
  }
});
panelSearch.addEventListener("click", () => searchInput.focus());

async function selectPlace(p) {
  currentPlace = p;
  saveRecent(p);
  searchInput.value = p.name;
  const marker = window.placeMarker;
  if (marker) marker.remove();
  window.placeMarker = new maplibregl.Marker().setLngLat([p.lon, p.lat]).addTo(map);
  map.flyTo({ center: [p.lon, p.lat], zoom: 13 });
  await loadPlaceInfo(p);

  // Show place info section, hide directions section
  placeInfoSection.hidden = false;
  directionsSection.classList.remove("active");
  directionsSection.hidden = true;

  togglePanel(true);
}

async function loadPlaceInfo(p) {
  placeName.textContent = p.name;
  placeDesc.textContent = "Loading...";
  placeWeather.textContent = "";
  placeImages.innerHTML = "";

  // Wiki summary
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.name)}`);
    const data = await res.json();
    placeDesc.textContent = data.extract || "No description available.";
  } catch {
    placeDesc.textContent = "No description available.";
  }

  // TODO: Add weather & images if you want (can be added later)
}

directionsBtn.addEventListener("click", () => {
  // Switch to directions panel
  placeInfoSection.hidden = true;
  directionsSection.classList.add("active");
  directionsSection.hidden = false;
  if (currentPlace) {
    fromInput.value = currentPlace.name;
    toInput.value = "";
    directionsResult.textContent = "";
  }
});

backToInfoBtn.addEventListener("click", () => {
  // Back to place info panel
  directionsSection.classList.remove("active");
  directionsSection.hidden = true;
  placeInfoSection.hidden = false;
});

// Dummy directions routing (for example)
directionsForm.addEventListener("submit", e => {
  e.preventDefault();
  if (!toInput.value.trim()) return;
  directionsResult.textContent = `Routing from "${fromInput.value}" to "${toInput.value}"... (demo, no real routing yet)`;
});

// On load: set panel hidden according to viewport size
function initPanelState() {
  if (window.innerWidth <= 768) {
    // mobile: partially visible panel
    panel.classList.remove("open");
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
    panel.style.left = "0";
    panel.setAttribute("aria-hidden", "true");
    panelArrow.setAttribute("aria-expanded", "false");
  } else {
    // desktop: fully hidden panel (offscreen left)
    panel.classList.remove("open");
    panel.style.left = `calc(-1 * var(--panel-width))`;
    panel.style.bottom = "";
    panel.setAttribute("aria-hidden", "true");
    panelArrow.setAttribute("aria-expanded", "false");
  }
  map.resize();
}

// On window resize, reset panel state (optional)
window.addEventListener("resize", initPanelState);

initPanelState();
