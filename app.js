// 1) Init map + controls
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
const geoCtrl = new maplibregl.GeolocateControl({
  trackUserLocation: true,
  showUserHeading: true,
});
map.addControl(geoCtrl, "bottom-right");

// 2) Elements & selectors
const $ = (id) => document.getElementById(id);

const mainSearchInput = $("main-search");
const mainSuggestionsEl = $("main-suggestions");
const mainSearchContainer = $("main-search-container");
const mainSearchIcon = $("main-search-icon");

const panel = $("side-panel");
const closeBtn = $("close-side-panel");
const panelArrow = $("panel-arrow");

const panelInfoSection = $("place-info-section");
const panelInfoSearchInput = $("panel-info-search");
const panelInfoSuggestionsEl = $("panel-info-suggestions");
const panelInfoSearchIcon = $("panel-info-search-icon");

const placeName = $("place-name");
const placeDesc = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");

const dirSection = $("directions-section");
const routeSection = $("route-section");

const form = $("directions-form");
const fromInput = $("panel-from-input");
const toInput = $("panel-to-input");
const fromSug = $("panel-from-suggestions");
const toSug = $("panel-to-suggestions");
const backBtn = $("back-to-info-btn");
const resultEl = $("directions-result");
const stepsList = $("route-steps");
const exitBtn = $("exit-route-btn");

const myLocBtns = document.querySelectorAll(".my-loc-btn");

let currentPlace = null;

let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

let fromCoords = null,
  toCoords = null,
  activeField = "from";

// 3) Utilities
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

async function nominatim(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
      q
    )}`,
    {
      headers: {
        "User-Agent": "TheBoiisMCMaps/1.0",
        Referer: "https://maps.theboiismc.com",
      },
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((el) => ({
    name: el.display_name,
    lat: el.lat,
    lon: el.lon,
    type: el.type,
  }));
}

function render(list, container, cb) {
  if (!list.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  container.style.display = "block";
  container.innerHTML = list
    .map(
      (item, i) =>
        `<div class="suggestion" role="option" tabindex="0" data-index="${i}">${item.name}</div>`
    )
    .join("");
  // Attach click handlers to suggestions
  container.querySelectorAll(".suggestion").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = +el.getAttribute("data-index");
      cb(list[idx]);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const idx = +el.getAttribute("data-index");
        cb(list[idx]);
      }
    });
  });
}

function saveRecent(place) {
  // Save unique by name
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

function selectPlace(place) {
  if (!place) return;
  currentPlace = place;

  // Update panel info
  placeName.textContent = place.name || "Unknown place";
  placeDesc.textContent = `Type: ${place.type || "Unknown"}`;
  placeWeather.textContent = "";
  placeImages.innerHTML = "";

  showPlaceInfoPanel();

  // Center map
  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });

  saveRecent(place);
}

function showPlaceInfoPanel() {
  panelInfoSection.hidden = false;
  dirSection.hidden = true;
  routeSection.hidden = true;
  panel.setAttribute("aria-hidden", "false");
  openPanel();
  updateMainSearchVisibility();
}

function showDirectionsPanel() {
  panelInfoSection.hidden = true;
  dirSection.hidden = false;
  routeSection.hidden = true;
  panel.setAttribute("aria-hidden", "false");
  openPanel();
  updateMainSearchVisibility();
}

function showRouteSteps(steps) {
  panelInfoSection.hidden = true;
  dirSection.hidden = true;
  routeSection.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  openPanel();
  updateMainSearchVisibility();

  stepsList.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step.maneuver.instruction || step.maneuver.type;
    stepsList.appendChild(li);
  });
}

function openPanel() {
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  updateMainSearchVisibility();
}

function closePanel() {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  updateMainSearchVisibility();
}

function updateMainSearchVisibility() {
  const isDesktop = window.innerWidth > 768;
  const isPanelOpen = panel.classList.contains("open");
  if (isDesktop && isPanelOpen) {
    mainSearchContainer.classList.add("hidden");
  } else {
    mainSearchContainer.classList.remove("hidden");
  }
}

function hidePanel() {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  updateMainSearchVisibility();
}

function handleDirectionSearchInput(e) {
  const searchText = e.target.value;
  const results = fuse.search(searchText).map((res) => res.item);
  render(results, panelInfoSuggestionsEl, selectPlace);
}

function handlePanelInput(e) {
  if (e.target === fromInput) {
    activeField = "from";
  } else if (e.target === toInput) {
    activeField = "to";
  }
  handleDirectionSearchInput(e);
}

mainSearchInput.addEventListener("input", handleDirectionSearchInput);
panelInfoSearchInput.addEventListener("input", handleDirectionSearchInput);

// Handle direction selection for "from" and "to" fields
fromInput.addEventListener("input", handlePanelInput);
toInput.addEventListener("input", handlePanelInput);

// Handle panel toggle
panelArrow.addEventListener("click", () => {
  if (panel.classList.contains("open")) closePanel();
  else openPanel();
});

// Handle close panel button
closeBtn.addEventListener("click", closePanel);

// Back button in directions section
backBtn.addEventListener("click", showPlaceInfoPanel);
