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

const panel = $("side-panel");
const closeBtn = $("close-side-panel");
const panelArrow = $("panel-arrow");

const panelInfoSection = $("place-info-section");
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
let fromCoords = null, toCoords = null;

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
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
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
    description: el.excerpt,
  }));
}

function render(list, container, cb) {
  if (!list.length) {
    container.style.display = "none";
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
    el.addEventListener("click", () => cb(list[+el.dataset.index]));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cb(list[+el.dataset.index]);
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
  placeWeather.textContent = place.description || "";
  placeImages.innerHTML = "";
  showPlaceInfoPanel();
  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });
  saveRecent(place);
}

function showPlaceInfoPanel() {
  panelInfoSection.hidden = false;
  dirSection.hidden = true;
  routeSection.hidden = true;
  openPanel(false); // On mobile, just peek initially
}

function showDirectionsPanel() {
  panelInfoSection.hidden = true;
  dirSection.hidden = false;
  routeSection.hidden = true;
  openPanel(true); // Open fully
}

function showRouteSteps(steps) {
  panelInfoSection.hidden = true;
  dirSection.hidden = true;
  routeSection.hidden = false;
  openPanel(true); // Open fully

  stepsList.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step.maneuver.instruction || step.maneuver.type;
    stepsList.appendChild(li);
  });
}

function openPanel(fullyOpen = true) {
    const isMobile = window.innerWidth <= 768;
    panel.setAttribute("aria-hidden", "false");
    if (isMobile) {
        panel.classList.add("peek");
        if (fullyOpen) {
            panel.classList.add("open");
        }
    } else {
        panel.classList.add("open");
    }
    updateMainSearchVisibility();
}

function closePanel() {
    panel.classList.remove("open", "peek");
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

// Mobile Panel Drag Logic
let startY, startBottom, isDragging = false;
const peekHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
const panelHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-height'));

panel.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768) return;
    isDragging = true;
    startY = e.touches[0].clientY;
    startBottom = parseInt(getComputedStyle(panel).bottom, 10);
    panel.style.transition = 'none';
}, { passive: true });

panel.addEventListener('touchmove', (e) => {
    if (!isDragging || window.innerWidth > 768) return;
    const currentY = e.touches[0].clientY;
    let diffY = startY - currentY;
    panel.style.bottom = `${startBottom + diffY}px`;
}, { passive: true });

panel.addEventListener('touchend', () => {
    if (!isDragging || window.innerWidth > 768) return;
    isDragging = false;
    panel.style.transition = 'bottom 0.3s ease-in-out';
    const currentBottom = parseInt(getComputedStyle(panel).bottom, 10);
    const halfwayPoint = (peekHeight - panelHeight) / 2;
    
    // If dragged past halfway, open fully, otherwise, snap back to peek
    if (currentBottom > halfwayPoint) {
        panel.classList.add('open');
    } else {
        panel.classList.remove('open');
    }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!fromCoords || !toCoords) {
    resultEl.textContent = "Please enter valid 'from' and 'to' locations.";
    return;
  }
  resultEl.textContent = "Routing...";
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&steps=true`
    );
    const data = await r.json();
    if (data.code !== "Ok") throw new Error(data.message || "Routing error");
    const route = data.routes[0];
    const steps = route.legs[0].steps;
    showRouteSteps(steps);
    resultEl.textContent = `Distance: ${(route.distance / 1000).toFixed(2)} km, Duration: ${(route.duration / 60).toFixed(0)} min`;
  } catch (err) {
    resultEl.textContent = `Failed to get route: ${err.message}. Try again.`;
  }
});

directionsBtn.addEventListener("click", () => {
  if (currentPlace) {
    toInput.value = currentPlace.name;
    toCoords = [parseFloat(currentPlace.lon), parseFloat(currentPlace.lat)];
  }
  showDirectionsPanel();
});

backBtn.addEventListener("click", showPlaceInfoPanel);
exitBtn.addEventListener("click", () => {
  // Go back to place info or close if no place is selected
  if (currentPlace) {
    showPlaceInfoPanel();
  } else {
    closePanel();
  }
});
closeBtn.addEventListener("click", closePanel);
panelArrow.addEventListener("click", () => {
  if (panel.classList.contains("open")) closePanel();
  else openPanel(true);
});

mainSearchInput.addEventListener("input", debounce(async () => {
  const q = mainSearchInput.value.trim();
  if (!q) {
    mainSuggestionsEl.style.display = "none";
    return;
  }
  let results = fuse.search(q).map((r) => r.item);
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
}, 150));

mainSearchInput.addEventListener("focus", () => {
  if (recentSearches.length > 0 && mainSearchInput.value.trim() === "") {
    render(recentSearches, mainSuggestionsEl, (place) => {
      mainSearchInput.value = place.name;
      mainSuggestionsEl.style.display = "none";
      selectPlace(place);
    });
  }
});

document.addEventListener("click", (e) => {
  if (!mainSearchContainer.contains(e.target)) {
    mainSuggestionsEl.style.display = "none";
  }
});

function setupDirectionsAutocomplete(inputEl, sugEl, updateFn) {
  inputEl.addEventListener("input", debounce(async () => {
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
  }, 150));
}

setupDirectionsAutocomplete(fromInput, fromSug, (place) => {
  fromCoords = [parseFloat(place.lon), parseFloat(place.lat)];
});

setupDirectionsAutocomplete(toInput, toSug, (place) => {
  toCoords = [parseFloat(place.lon), parseFloat(place.lat)];
});

myLocBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    geoCtrl.trigger();
    geoCtrl.once("geolocate", (ev) => {
      const { longitude, latitude } = ev.coords;
      const isFromButton = btn.previousElementSibling.id === 'panel-from-input';
      if (isFromButton) {
        fromCoords = [longitude, latitude];
        fromInput.value = "My Location";
      } else {
        toCoords = [longitude, latitude];
        toInput.value = "My Location";
      }
    });
  });
});

window.addEventListener("load", updateMainSearchVisibility);
window.addEventListener("resize", updateMainSearchVisibility);
