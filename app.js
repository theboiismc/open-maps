// app.js

// 1) Init map + controls
const map = new maplibre.gl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibre.gl.NavigationControl(), "bottom-right");
const geoCtrl = new maplibre.gl.GeolocateControl({
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

// 4) Event handlers & logic

// Main search bar logic (front & center)
mainSearchInput.addEventListener(
  "input",
  debounce(async () => {
    const q = mainSearchInput.value.trim();
    if (!q) {
      mainSuggestionsEl.style.display = "none";
      return;
    }

    // Search recent first with fuse
    let results = fuse.search(q).map((r) => r.item);

    // Fill with nominatim if less than 5
    if (results.length < 5) {
      const nominatimResults = await nominatim(q);
      nominatimResults.forEach((e) => {
        if (!results.find((r) => r.name === e.name)) results.push(e);
      });
    }

    render(results, mainSuggestionsEl, (place) => {
      mainSearchInput.value = place.name;
      mainSuggestionsEl.style.display = "none";
      selectPlace(place);
    });
  }, 150)
);

mainSearchInput.addEventListener("focus", () => {
  // Optionally show recent suggestions on focus
  if (recentSearches.length) {
    render(recentSearches, mainSuggestionsEl, (place) => {
      mainSearchInput.value = place.name;
      mainSuggestionsEl.style.display = "none";
      selectPlace(place);
    });
  }
});

document.addEventListener("click", (e) => {
  if (
    !e.target.closest("#main-search-container") &&
    !e.target.closest("#main-suggestions")
  ) {
    mainSuggestionsEl.style.display = "none";
  }
});

mainSearchIcon.addEventListener("click", () => {
  mainSearchInput.focus();
});

// Panel info search bar logic
panelInfoSearchInput.addEventListener(
  "input",
  debounce(async () => {
    const q = panelInfoSearchInput.value.trim();
    if (!q) {
      panelInfoSuggestionsEl.style.display = "none";
      return;
    }
    const results = await nominatim(q);
    render(results, panelInfoSuggestionsEl, (place) => {
      panelInfoSearchInput.value = place.name;
      panelInfoSuggestionsEl.style.display = "none";
      selectPlace(place);
    });
  }, 150)
);

panelInfoSearchInput.addEventListener("focus", () => {
  // optionally show recent here too
});

document.addEventListener("click", (e) => {
  if (
    !e.target.closest("#panel-info-search") &&
    !e.target.closest("#panel-info-suggestions")
  ) {
    panelInfoSuggestionsEl.style.display = "none";
  }
});

panelInfoSearchIcon.addEventListener("click", () => {
  panelInfoSearchInput.focus();
});

// Directions panel inputs autocomplete logic
function setupDirectionsAutocomplete(inputEl, sugEl, updateFn) {
  inputEl.addEventListener(
    "input",
    debounce(async () => {
      const q = inputEl.value.trim();
      if (!q) {
        sugEl.style.display = "none";
        return;
      }
      const results = await nominatim(q);
      render(results, sugEl, (place) => {
        inputEl.value = place.name;
        updateFn(place);
        sugEl.style.display = "none";
      });
    }, 150)
  );

  inputEl.addEventListener("focus", () => {
    // could show recent here if you want
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(`#panel-from-search`) && !e.target.closest(`#panel-from-suggestions`)) {
      sugEl.style.display = "none";
    }
  });
}

// Setting up autocomplete for the 'from' and 'to' input fields
setupDirectionsAutocomplete(fromInput, fromSug, (place) => {
  fromCoords = [place.lon, place.lat];
  toInput.focus();
});

setupDirectionsAutocomplete(toInput, toSug, (place) => {
  toCoords = [place.lon, place.lat];
});
