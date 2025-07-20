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

// Nominatim API request function
async function nominatim(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": "TheBoiisMCMaps/1.0",
        Referer: "https://maps.theboiismc.com",
      },
    }
  );
  const data = await response.json();
  return data.map((place) => ({
    name: place.display_name,
    lat: place.lat,
    lon: place.lon,
    type: place.type,
  }));
}

// Utility function for handling panel visibility based on desktop or mobile
function updateMainSearchVisibility() {
  const isDesktop = window.innerWidth > 768;
  const isPanelOpen = panel.classList.contains("open");

  if (isDesktop) {
    // On desktop, the main search bar should be visible unless the panel is open
    if (isPanelOpen) {
      mainSearchContainer.classList.add("hidden");
    } else {
      mainSearchContainer.classList.remove("hidden");
    }
  } else {
    // On mobile, always show the search bar
    mainSearchContainer.classList.remove("hidden");
  }
}

// Update when screen loads or resizes
window.addEventListener("load", updateMainSearchVisibility);
window.addEventListener("resize", updateMainSearchVisibility);

// Panel toggle and close button functionality
panelArrow.addEventListener("click", () => {
  panel.classList.toggle("open");
  updateMainSearchVisibility();
  panelArrow.innerHTML = panel.classList.contains("open") ? "&gt;" : "&lt;";
  panel.setAttribute("aria-hidden", panel.classList.contains("open") ? "false" : "true");
});

closeBtn.addEventListener("click", () => {
  panel.classList.remove("open");
  updateMainSearchVisibility();
  panelArrow.innerHTML = "&lt;";
  panel.setAttribute("aria-hidden", "true");
});

// Handle search input for main search and side panel search
mainSearchInput.addEventListener("input", debounce(handleSearch, 300));
panelInfoSearchInput.addEventListener("input", debounce(handleSearch, 300));

// Handle search suggestions
async function handleSearch(event) {
  const searchTerm = event.target.value;
  const isPanelSearch = event.target === panelInfoSearchInput;

  if (!searchTerm) {
    (isPanelSearch ? panelInfoSuggestionsEl : mainSuggestionsEl).innerHTML = "";
    return;
  }

  // Fetch results from Fuse.js (recent searches)
  const fuseResults = fuse.search(searchTerm);
  let results = fuseResults.map((result) => result.item);

  // Fetch results from Nominatim if Fuse results are less than 5
  if (results.length < 5) {
    const nominatimResults = await nominatim(searchTerm);
    nominatimResults.forEach((place) => {
      if (!results.find((r) => r.name === place.name)) {
        results.push(place);
      }
    });
  }

  // Render the results to the appropriate suggestion list
  const suggestionsEl = isPanelSearch ? panelInfoSuggestionsEl : mainSuggestionsEl;
  suggestionsEl.innerHTML = results
    .map(
      (place) => `
        <div class="suggestion" data-id="${place.name}">
          ${place.name}
        </div>
      `
    )
    .join("");

  const suggestionItems = suggestionsEl.querySelectorAll(".suggestion");
  suggestionItems.forEach((item) =>
    item.addEventListener("click", () => {
      const selectedPlace = results.find(
        (suggestion) => suggestion.name === item.dataset.id
      );
      showPlaceInfo(selectedPlace);
      updateMainSearchVisibility();
      panel.classList.add("open");
    })
  );
}

// Show place info when selected from the search results
function showPlaceInfo(place) {
  currentPlace = place;
  placeName.innerText = place.name;
  placeDesc.innerText = place.type || "No type available.";
  placeWeather.innerText = "Weather data will be here."; // Add actual weather data if available
  placeImages.innerHTML = place.images
    ? place.images.map(
        (img) => `<img src="${img}" alt="Image of ${place.name}" style="width: 100%" />`
      )
    : `<p>No images available.</p>`;
  panelInfoSection.hidden = false;
  dirSection.hidden = true;
  routeSection.hidden = true;
}

// Handle directions form submission
form.addEventListener("submit", (event) => {
  event.preventDefault();
  getDirections();
});

// Fetch directions and show route steps
function getDirections() {
  // Example logic for directions
  if (!fromCoords || !toCoords) {
    resultEl.innerText = "Please set both origin and destination.";
    return;
  }

  // This would involve calling your routing service/API
  const route = [
    { step: "Head north", distance: "500m" },
    { step: "Turn left", distance: "300m" },
    { step: "Your destination is on the right", distance: "50m" },
  ];

  stepsList.innerHTML = route
    .map(
      (step) =>
        `<li>${step.step} (${step.distance})</li>`
    )
    .join("");
  routeSection.hidden = false;
  dirSection.hidden = true;
}

// Back to the info panel
backBtn.addEventListener("click", () => {
  panelInfoSection.hidden = false;
  dirSection.hidden = true;
  routeSection.hidden = true;
});

// Exit navigation
exitBtn.addEventListener("click", () => {
  routeSection.hidden = true;
  panel.classList.remove("open");
  updateMainSearchVisibility();
  panelArrow.innerHTML = "&lt;";
  panel.setAttribute("aria-hidden", "true");
});

// Set user's location as starting point
myLocBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    geoCtrl.trigger();
    setTimeout(() => {
      const coords = geoCtrl._lastKnownPosition;
      if (coords) {
        const loc = [coords.coords.longitude, coords.coords.latitude];
        if (activeField === "from") {
          fromCoords = loc;
          fromInput.value = "My Location";
        } else if (activeField === "to") {
          toCoords = loc;
          toInput.value = "My Location";
        }
      }
    }, 500);
  });
});

// Handle the "From" and "To" fields toggling
fromInput.addEventListener("focus", () => {
  activeField = "from";
});
toInput.addEventListener("focus", () => {
  activeField = "to";
});
