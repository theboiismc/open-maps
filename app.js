// 1) Init map + controls
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
const geoCtrl = new maplibregl.GeolocateControl({ trackUserLocation: true, showUserHeading: true });
map.addControl(geoCtrl, "bottom-right");

// 2) Elements & selectors
const $ = (id) => document.getElementById(id);
const mainSearchInput = $("main-search"), mainSuggestionsEl = $("main-suggestions"), mainSearchContainer = $("main-search-container");
const panel = $("side-panel"), closeBtn = $("close-side-panel");
const panelInfoSection = $("place-info-section"), placeName = $("place-name"), placeDesc = $("place-description");
const directionsBtn = $("directions-btn");
const dirSection = $("directions-section"), routeSection = $("route-section");
const form = $("directions-form"), fromInput = $("panel-from-input"), toInput = $("panel-to-input"), fromSug = $("panel-from-suggestions"), toSug = $("panel-to-suggestions"), backBtn = $("back-to-info-btn"), resultEl = $("directions-result"), stepsList = $("route-steps"), exitBtn = $("exit-route-btn"), myLocBtns = document.querySelectorAll(".my-loc-btn");

let currentPlace = null, recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]"), fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 }), fromCoords = null, toCoords = null;

// 3) Utilities
const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
async function nominatim(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "TheBoiisMCMaps/1.0", Referer: "https://maps.theboiismc.com" } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((el) => ({ name: el.display_name, lat: el.lat, lon: el.lon, type: el.type }));
}
function render(list, container, cb) {
  if (!list.length) { container.style.display = "none"; return; }
  container.style.display = "block";
  container.innerHTML = list.map((item, i) => `<div class="suggestion" role="option" tabindex="0" data-index="${i}">${item.name}</div>`).join("");
  container.querySelectorAll(".suggestion").forEach((el) => {
    el.addEventListener("click", () => cb(list[+el.dataset.index]));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") cb(list[+el.dataset.index]); });
  });
}
function saveRecent(place) {
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

// 4) Core App Logic & Panel Management
function selectPlace(place) {
  if (!place) return;
  currentPlace = place;
  placeName.textContent = place.name || "Unknown place";
  placeDesc.textContent = `Type: ${place.type || "Unknown"}`;
  showPanelContent('info');
  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });
  saveRecent(place);
}

function showPanelContent(section) {
    panelInfoSection.hidden = section !== 'info';
    dirSection.hidden = section !== 'directions';
    routeSection.hidden = section !== 'route';

    // Make the panel visible if it's not already
    panel.classList.add('visible');
    panel.setAttribute("aria-hidden", "false");
    
    updateMainSearchVisibility();
}

function setPanelOpen(isOpen) {
    panel.classList.toggle('open', isOpen);
    updateMainSearchVisibility();
}

function hidePanelCompletely() {
    panel.classList.remove('visible', 'open');
    panel.setAttribute("aria-hidden", "true");
    updateMainSearchVisibility();
}

function updateMainSearchVisibility() {
    const isDesktop = window.innerWidth > 768;
    const isPanelOpen = panel.classList.contains("open");
    mainSearchContainer.classList.toggle("hidden", isDesktop && isPanelOpen);
}

// --- Mobile Panel Drag Logic ---
let startY, startBottom, isDragging = false;
panel.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768) return;
    // Draggable area is the top 40px of the panel
    if (e.touches[0].clientY > panel.offsetTop + 40) return;
    isDragging = true;
    startY = e.touches[0].clientY;
    startBottom = parseInt(getComputedStyle(panel).bottom, 10);
    panel.style.transition = 'none';
}, { passive: true });

panel.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    let diffY = startY - currentY;
    const newBottom = startBottom + diffY;
    const peekPosition = -1 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-height')) - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek')));
    // Prevent dragging below the peeking state
    if (newBottom >= peekPosition) {
        panel.style.bottom = `${newBottom}px`;
    }
}, { passive: true });

panel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = 'bottom 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
    const currentBottom = parseInt(getComputedStyle(panel).bottom, 10);
    const peekPosition = -1 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-height')) - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek')));
    
    // Snap to open if dragged more than 60px up, otherwise snap back to peek
    if (currentBottom > peekPosition + 60) {
        setPanelOpen(true);
    } else {
        setPanelOpen(false);
    }
});

// 5) Event Listeners
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!fromCoords || !toCoords) { resultEl.textContent = "Please set start and end points."; return; }
  resultEl.textContent = "Routing...";
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&steps=true`);
    const data = await r.json();
    if (data.code !== "Ok") throw new Error(data.message || "Routing error");
    showPanelContent('route');
    setPanelOpen(true);
    stepsList.innerHTML = data.routes[0].legs[0].steps.map(step => `<li>${step.maneuver.instruction}</li>`).join('');
    resultEl.textContent = `Distance: ${(data.routes[0].distance / 1000).toFixed(2)} km, Duration: ${(data.routes[0].duration / 60).toFixed(0)} min`;
  } catch (err) { resultEl.textContent = `Failed to get route: ${err.message}.`; }
});

directionsBtn.addEventListener("click", () => {
  if (currentPlace) { toInput.value = currentPlace.name; toCoords = [parseFloat(currentPlace.lon), parseFloat(currentPlace.lat)]; }
  showPanelContent('directions');
  setPanelOpen(true);
});

backBtn.addEventListener("click", () => showPanelContent('info'));
exitBtn.addEventListener("click", () => { showPanelContent('info'); setPanelOpen(false); });
closeBtn.addEventListener("click", hidePanelCompletely);

mainSearchInput.addEventListener("input", debounce(async () => {
  const q = mainSearchInput.value.trim();
  if (!q) { mainSuggestionsEl.style.display = "none"; return; }
  let results = fuse.search(q).map((r) => r.item);
  if (results.length < 5) {
    const nominatimResults = await nominatim(q);
    nominatimResults.forEach((e) => { if (!results.find((r) => r.name === e.name)) results.push(e); });
  }
  render(results, mainSuggestionsEl, (place) => { mainSearchInput.value = place.name; mainSuggestionsEl.style.display = "none"; selectPlace(place); });
}, 150));

document.addEventListener("click", (e) => { if (!mainSearchContainer.contains(e.target)) { mainSuggestionsEl.style.display = "none"; } });
function setupDirectionsAutocomplete(inputEl, sugEl, updateFn) {
  inputEl.addEventListener("input", debounce(async () => {
    const q = inputEl.value.trim(); if (!q) { sugEl.style.display = "none"; return; }
    const results = await nominatim(q);
    render(results, sugEl, (place) => { inputEl.value = place.name; updateFn(place); sugEl.style.display = "none"; });
  }, 150));
}
setupDirectionsAutocomplete(fromInput, fromSug, (place) => fromCoords = [parseFloat(place.lon), parseFloat(place.lat)]);
setupDirectionsAutocomplete(toInput, toSug, (place) => toCoords = [parseFloat(place.lon), parseFloat(place.lat)]);

myLocBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    geoCtrl.trigger();
    geoCtrl.once("geolocate", (ev) => {
      const { longitude, latitude } = ev.coords;
      const isFromButton = btn.previousElementSibling.id === 'panel-from-suggestions';
      if (isFromButton) { fromCoords = [longitude, latitude]; fromInput.value = "My Location"; } 
      else { toCoords = [longitude, latitude]; toInput.value = "My Location"; }
    });
  });
});

window.addEventListener("load", updateMainSearchVisibility);
window.addEventListener("resize", updateMainSearchVisibility);
