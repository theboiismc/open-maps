// app.js

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

// 2) Elements
const $ = id => document.getElementById(id);
const searchInput = $("search"),
  suggestionsEl = $("suggestions"),
  recentEl = $("recent-searches"),
  panel = $("side-panel"),
  closeBtn = $("close-side-panel"),
  panelArrow = $("panel-arrow"),
  panelSearch = $("panel-search-icon"),
  placeName = $("place-name"),
  placeDesc = $("place-description"),
  placeWeather = $("place-weather"),
  placeImages = $("place-images"),
  directionsBtn = $("directions-btn"),
  infoSection = $("place-info-section"),
  dirSection = $("directions-section"),
  form = $("directions-form"),
  fromInput = $("from-input"),
  toInput = $("to-input"),
  fromSug = $("from-suggestions"),
  toSug = $("to-suggestions"),
  resultEl = $("directions-result"),
  backBtn = $("back-to-info-btn"),
  routeSection = $("route-section"),
  stepsList = $("route-steps"),
  exitBtn = $("exit-route-btn"),
  myLocBtns = document.querySelectorAll(".my-loc-btn");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
let fromCoords = null, toCoords = null, activeField = "from";

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
  return (await res.json()).map(r => ({
    name: r.display_name,
    lat: +r.lat,
    lon: +r.lon,
  }));
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    {
      headers: {
        "User-Agent": "TheBoiisMCMaps/1.0",
        Referer: "https://maps.theboiismc.com",
      },
    }
  );
  const j = await res.json();
  return j.display_name;
}

function render(list, container, cb) {
  container.innerHTML = "";
  list.forEach(p => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name;
    d.onclick = () => {
      cb(p);
      container.style.display = "none";
    };
    container.appendChild(d);
  });
  container.style.display = list.length ? "block" : "none";
}

// 4) Main search + recents
function showRecent() {
  suggestionsEl.style.display = "none";
  if (!searchInput.value.trim() && recentSearches.length) {
    recentEl.innerHTML = "";
    recentSearches.forEach(p => {
      const d = document.createElement("div");
      d.className = "suggestion recent";
      d.textContent = p.name;
      d.onclick = () => selectPlace(p);
      recentEl.appendChild(d);
    });
    recentEl.style.display = "block";
  }
}

searchInput.addEventListener("focus", showRecent);

searchInput.addEventListener("input", debounce(async () => {
  const q = searchInput.value.trim();
  if (!q) return showRecent();

  let list = fuse.search(q).map(r => r.item);
  if (list.length < 5) {
    (await nominatim(q)).forEach(e => {
      if (!list.find(r => r.name === e.name)) list.push(e);
    });
  }

  if (list.length === 0) {
    render([{ name: `Did you mean: ${q}?` }], suggestionsEl, selectPlace);
  } else {
    render(list, suggestionsEl, selectPlace);
  }
}, 150));

document.addEventListener("click", e => {
  if (!e.target.closest(".search-bar") &&
    !e.target.closest("#suggestions") &&
    !e.target.closest("#recent-searches")) {
    suggestionsEl.style.display = recentEl.style.display = "none";
  }
});

// 5) Panel toggles
function togglePanel(open) {
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", (!open).toString());
  map.resize();
}

// Handle panel drag on mobile
let isDragging = false;
let startDragY = 0;
let panelStartPosition = 0;

panel.addEventListener("touchstart", (e) => {
  if (window.innerWidth <= 768) {
    isDragging = true;
    startDragY = e.touches[0].clientY;
    panelStartPosition = parseInt(getComputedStyle(panel).bottom, 10);
  }
});

panel.addEventListener("touchmove", (e) => {
  if (isDragging) {
    const moveDistance = e.touches[0].clientY - startDragY;
    const newBottom = panelStartPosition - moveDistance;

    if (newBottom > 0) {
      panel.style.bottom = `${newBottom}px`;
    }
  }
});

panel.addEventListener("touchend", () => {
  isDragging = false;
  const bottomPosition = parseInt(getComputedStyle(panel).bottom, 10);

  if (bottomPosition > 150) {
    panel.style.bottom = `0`;
  } else {
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
  }
});

// Panel Toggle Button for Mobile and Desktop
closeBtn.addEventListener("click", () => togglePanel(false));
panelArrow.addEventListener("click", () => togglePanel(!panel.classList.contains("open")));

// Initial State on Window Load
window.addEventListener("load", () => {
  if (window.innerWidth > 768) {
    togglePanel(false);
  } else {
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
  }
});

// Adjust panel position on resize
window.addEventListener("resize", () => {
  if (window.innerWidth > 768 && !panel.classList.contains("open")) {
    panel.style.left = `calc(-1 * var(--panel-width))`;
    panel.setAttribute("aria-hidden", "true");
  }
  if (window.innerWidth <= 768 && !panel.classList.contains("open")) {
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
    panel.setAttribute("aria-hidden", "false");
  }
});
