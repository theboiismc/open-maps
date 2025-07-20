// Initialize map and controls
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

// Select elements
const $ = (id) => document.getElementById(id);
const mainSearchInput = $("main-search");
const mainSuggestionsEl = $("main-suggestions");
const panel = $("side-panel");
const closeBtn = $("close-side-panel");
const directionsBtn = $("directions-btn");
const placeName = $("place-name");
const placeDesc = $("place-description");
const directionsForm = $("directions-form");
const fromInput = $("panel-from-input");
const toInput = $("panel-to-input");
const resultEl = $("directions-result");
const stepsList = $("route-steps");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

// Utilities
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

async function nominatim(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "TheBoiisMCMaps/1.0", Referer: "https://maps.theboiismc.com" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((el) => ({ name: el.display_name, lat: el.lat, lon: el.lon, type: el.type }));
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
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

function selectPlace(place) {
  if (!place) return;
  currentPlace = place;

  placeName.textContent = place.name || "Unknown place";
  placeDesc.textContent = `Type: ${place.type || "Unknown"}`;
  showPlaceInfoPanel();

  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });
  saveRecent(place);
}

function showPlaceInfoPanel() {
  panel.style.display = "block";
  panel.setAttribute("aria-hidden", "false");
}

function closePanel() {
  panel.style.display = "none";
  panel.setAttribute("aria-hidden", "true");
}

// Event handlers
mainSearchInput.addEventListener(
  "input",
  debounce(async () => {
    const query = mainSearchInput.value.trim();
    if (!query) return (mainSuggestionsEl.style.display = "none");

    let results = fuse.search(query).map((r) => r.item);
    if (results.length < 5) {
      const nominatimResults = await nominatim(query);
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
  if (recentSearches.length) {
    render(recentSearches, mainSuggestionsEl, (place) => {
      mainSearchInput.value = place.name;
      mainSuggestionsEl.style.display = "none";
      selectPlace(place);
    });
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#main-search-container") && !e.target.closest("#main-suggestions")) {
    mainSuggestionsEl.style.display = "none";
  }
});

// Directions form submit logic
directionsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fromCoords = [parseFloat(fromInput.value.split(",")[1]), parseFloat(fromInput.value.split(",")[0])];
  const toCoords = [parseFloat(toInput.value.split(",")[1]), parseFloat(toInput.value.split(",")[0])];
  
  if (!fromCoords || !toCoords) {
    resultEl.textContent = "Please enter valid 'from' and 'to' locations.";
    return;
  }
  resultEl.textContent = "Routing...";

  // Call OSRM or your routing service
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&steps=true`
    );
    const data = await r.json();
    if (data.code !== "Ok") throw new Error("Routing error");

    const route = data.routes[0];
    const steps = route.legs[0].steps;

    showRouteSteps(steps);
    resultEl.textContent = `Distance: ${(route.distance / 1000).toFixed(2)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;

    // Draw route on map (optional, add polyline layer)
  } catch (err) {
    resultEl.textContent = "Failed to get route. Try again.";
  }
});

// Show route steps
function showRouteSteps(steps) {
  stepsList.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step.maneuver.instruction || step.maneuver.type;
    stepsList.appendChild(li);
  });
  panel.style.display = "block";
  panel.setAttribute("aria-hidden", "false");
}

// Directions button on place info
directionsBtn.addEventListener("click", () => {
  // Prefill 'to' with current place
  if (currentPlace) {
    toInput.value = currentPlace.name;
    selectPlace(currentPlace);
  }
});

// Back button on directions panel
$("back-to-info-btn").addEventListener("click", () => {
  showPlaceInfoPanel();
});

// Exit route steps panel
$("exit-route-btn").addEventListener("click", () => {
  showPlaceInfoPanel();
});

// Close side panel
closeBtn.addEventListener("click", closePanel);
