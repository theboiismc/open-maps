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

const $ = (id) => document.getElementById(id);

const mainSearchInput = $("main-search");
const mainSuggestionsEl = $("main-suggestions");
const mainSearchContainer = $("main-search-container");
const panel = $("side-panel");
const closeBtn = $("close-side-panel");

const placeName = $("place-name");
const placeDesc = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");
const routeBtn = $("route-btn");
const routeSteps = $("route-steps");
const backToInfoBtn = $("back-to-info-btn");
const exitRouteBtn = $("exit-route-btn");

let selectedPlace = null;

// Main search input listener with debounce
mainSearchInput.addEventListener(
  "input",
  debounce(async () => {
    const q = mainSearchInput.value.trim();
    if (!q) {
      mainSuggestionsEl.style.display = "none";
      return;
    }

    const results = await nominatim(q);
    renderSuggestions(results, mainSuggestionsEl);
  }, 300)
);

// Render suggestions for main search input
function renderSuggestions(results, suggestionsEl) {
  suggestionsEl.innerHTML = "";
  if (results.length) {
    suggestionsEl.style.display = "block";
    results.forEach((result) => {
      const suggestionItem = document.createElement("div");
      suggestionItem.className = "suggestion";
      suggestionItem.textContent = result.name;
      suggestionItem.addEventListener("click", () => {
        mainSearchInput.value = result.name;
        selectPlace(result);
        suggestionsEl.style.display = "none";
      });
      suggestionsEl.appendChild(suggestionItem);
    });
  } else {
    suggestionsEl.style.display = "none";
  }
}

// Handle place selection
function selectPlace(place) {
  selectedPlace = place;
  placeName.textContent = place.name;
  placeDesc.textContent = place.description || "No description available.";
  placeWeather.textContent = "Weather: Unknown"; // Add weather data if possible
  placeImages.innerHTML = "<img src='" + place.image + "' alt='" + place.name + "' />";
  directionsBtn.disabled = false;
}

// Show/hide the panel
function openPanel() {
  panel.classList.add("open");
  mainSearchContainer.classList.add("hidden");
}

function closePanel() {
  panel.classList.remove("open");
  mainSearchContainer.classList.remove("hidden");
}

// Add event listeners for opening and closing the panel
closeBtn.addEventListener("click", closePanel);

// Route functionality (mock)
routeBtn.addEventListener("click", (e) => {
  e.preventDefault();
  routeSteps.innerHTML = `<li>Step 1: Start at ${fromInput.value}</li>
    <li>Step 2: Go to ${toInput.value}</li>`;
  panel.querySelector("#route-section").style.display = "block";
  panel.querySelector("#directions-section").style.display = "none";
});

// Back to the info section
backToInfoBtn.addEventListener("click", () => {
  panel.querySelector("#place-info-section").style.display = "block";
  panel.querySelector("#directions-section").style.display = "none";
  panel.querySelector("#route-section").style.display = "none";
});

// Exit navigation
exitRouteBtn.addEventListener("click", () => {
  panel.querySelector("#place-info-section").style.display = "block";
  panel.querySelector("#directions-section").style.display = "none";
  panel.querySelector("#route-section").style.display = "none";
  closePanel();
});
