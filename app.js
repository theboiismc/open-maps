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
const $ = (id) => document.getElementById(id);
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
  return (await res.json()).map((r) => ({
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
  list.forEach((p) => {
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
    recentSearches.forEach((p) => {
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
searchInput.addEventListener(
  "input",
  debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) return showRecent();
    let list = fuse.search(q).map((r) => r.item);
    if (list.length < 5) {
      (await nominatim(q)).forEach((e) => {
        if (!list.find((r) => r.name === e.name)) list.push(e);
      });
    }
    render(list, suggestionsEl, selectPlace);
  }, 150)
);
document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".search-bar") &&
    !e.target.closest("#suggestions") &&
    !e.target.closest("#recent-searches")
  ) {
    suggestionsEl.style.display = recentEl.style.display = "none";
  }
});

// 5) Panel toggles & responsive sliding panel

function togglePanel(open) {
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", (!open).toString());

  if (window.innerWidth <= 768) {
    // mobile: slide up/down by controlling bottom
    panel.style.left = "0";
    panel.style.bottom = open
      ? "0"
      : `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
  } else {
    // desktop: slide left/right by controlling left
    panel.style.bottom = "auto";
    panel.style.left = open ? "0" : `calc(-1 * var(--panel-width))`;
  }

  map.resize();
}

function resetPanelOnResize() {
  if (window.innerWidth <= 768) {
    if (!panel.classList.contains("open")) {
      panel.style.left = "0";
      panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
      panel.setAttribute("aria-hidden", "false"); // partial peek visible on mobile closed
    } else {
      panel.style.left = "0";
      panel.style.bottom = "0";
      panel.setAttribute("aria-hidden", "false");
    }
  } else {
    if (!panel.classList.contains("open")) {
      panel.style.bottom = "auto";
      panel.style.left = `calc(-1 * var(--panel-width))`;
      panel.setAttribute("aria-hidden", "true"); // fully hidden on desktop closed
    } else {
      panel.style.bottom = "auto";
      panel.style.left = "0";
      panel.setAttribute("aria-hidden", "false");
    }
  }
  map.resize();
}

window.addEventListener("load", resetPanelOnResize);
window.addEventListener("resize", resetPanelOnResize);

// close button handler
closeBtn.onclick = () => togglePanel(false);
// panel arrow toggler (can open/close)
panelArrow.onclick = () => togglePanel(!panel.classList.contains("open"));
// search icon focuses input
panelSearch.onclick = () => searchInput.focus();

// 6) Place select & info load
async function selectPlace(p) {
  currentPlace = p;
  recentSearches = recentSearches.filter((r) => r.name !== p.name);
  recentSearches.unshift(p);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuse = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
  searchInput.value = p.name;
  if (window.placeMarker) placeMarker.remove();
  window.placeMarker = new maplibregl.Marker().setLngLat([p.lon, p.lat]).addTo(map);
  map.flyTo({ center: [p.lon, p.lat], zoom: 13 });
  await loadInfo(p);
  infoSection.hidden = false;
  dirSection.hidden = true;
  routeSection.hidden = true;
  togglePanel(true);
}

async function loadInfo(p) {
  placeName.textContent = p.name;
  placeDesc.textContent = "Loading…";
  placeWeather.textContent = "";
  placeImages.innerHTML = "";
  try {
    let r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.name)}`
    );
    let j = await r.json();
    let s = j.extract.match(/[^\.!\?]+[\.!\?]+/g) || [j.extract];
    let b = s.slice(0, 3).join(" ").trim();
    if (b.length > 300) b = b.slice(0, 300) + "…";
    placeDesc.textContent = b || "No description.";
  } catch {
    placeDesc.textContent = "No description.";
  }
  try {
    let r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(
        p.name
      )}&format=json&origin=*`
    );
    let j = await r.json(),
      pg = j.query.pages[Object.keys(j.query.pages)[0]];
    (pg.images || [])
      .slice(0, 5)
      .forEach(async (img) => {
        if (/\.(jpg|jpeg|png)$/i.test(img.title)) {
          let r2 = await fetch(
            `https://wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
              img.title
            )}&prop=imageinfo&iiprop=url&format=json&origin=*`
          );
          let j2 = await r2.json();
          let url = j2.query.pages[Object.keys(j2.query.pages)[0]].imageinfo[0].url;
          let el = document.createElement("img");
          el.src = url;
          el.alt = p.name;
          placeImages.appendChild(el);
        }
      });
  } catch {}

  try {
    let wr = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current_weather=true`
    );
    let wj = await wr.json();
    if (wj.current_weather)
      placeWeather.textContent = `Temp: ${wj.current_weather.temperature}°C, Wind: ${wj.current_weather.windspeed} km/h`;
    else placeWeather.textContent = "No weather.";
  } catch {
    placeWeather.textContent = "No weather.";
  }
}

// 7) Enter Directions mode
directionsBtn.onclick = () => {
  infoSection.hidden = true;
  dirSection.hidden = false;
  routeSection.hidden = true;
  fromInput.value = "";
  toInput.value = currentPlace.name;
  resultEl.textContent = "";
  fromSug.style.display = toSug.style.display = "none";
  fromCoords = toCoords = [currentPlace.lon, currentPlace.lat];
};

// 8) Track focused field
[fromInput, toInput].forEach((inp) =>
  inp.addEventListener("focus", () => (activeField = inp.id.startsWith("from") ? "from" : "to"))
);

// 9) My Location buttons
myLocBtns.forEach((btn) =>
  btn.addEventListener("click", async () => {
    geoCtrl.trigger();
    const pos = await new Promise((res) => geoCtrl.once("geolocate", res));
    const { latitude, longitude } = pos.coords;
    const addr = await reverseGeocode(latitude, longitude);
    if (activeField === "from") {
      fromInput.value = addr;
      fromCoords = [longitude, latitude];
    } else {
      toInput.value = addr;
      toCoords = [longitude, latitude];
    }
  })
);

// 10) Autocomplete both fields
fromInput.addEventListener(
  "input",
  debounce(async () => {
    const q = fromInput.value.trim();
    if (!q) return (fromSug.style.display = "none");
    const list = await nominatim(q);
    render(list, fromSug, (p) => {
      fromInput.value = p.name;
      fromCoords = [p.lon, p.lat];
    });
  }, 200)
);

toInput.addEventListener(
  "input",
  debounce(async () => {
    const q = toInput.value.trim();
    if (!q) return (toSug.style.display = "none");
    const list = await nominatim(q);
    render(list, toSug, (p) => {
      toInput.value = p.name;
      toCoords = [p.lon, p.lat];
    });
  }, 200)
);

document.addEventListener("click", (e) => {
  if (!e.target.closest("#directions-section")) fromSug.style.display = toSug.style.display = "none";
});

// 11) Back & Exit
backBtn.onclick = () => {
  dirSection.hidden = true;
  infoSection.hidden = false;
};

exitBtn.onclick = () => {
  routeSection.hidden = true;
  infoSection.hidden = false;
  if (map.getSource("route")) {
    map.removeLayer("route-line");
    map.removeSource("route");
  }
};

// 12) Fetch & draw route (OSRM)
form.onsubmit = async (e) => {
  e.preventDefault();
  resultEl.textContent = "Routing…";
  if (!fromCoords || !toCoords) return (resultEl.textContent = "Pick valid points.");
  const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=full&geometries=geojson&steps=true`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.code !== "Ok") return (resultEl.textContent = "Routing error.");
  const geo = j.routes[0].geometry;
  if (map.getSource("route")) {
    map.removeLayer("route-line");
    map.removeSource("route");
  }
  map.addSource("route", { type: "geojson", data: geo });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": 4, "line-color": "#1a73e8" },
  });
  stepsList.innerHTML = "";
  j.routes[0].legs[0].steps.forEach((st) => {
    const li = document.createElement("li");
    li.textContent = st.maneuver.instruction;
    stepsList.appendChild(li);
  });
  dirSection.hidden = true;
  routeSection.hidden = false;
};

// 13) Mobile drag-to-open/close logic
function setupMobileDrag() {
  if (window.innerWidth > 768) return;

  let startY = 0;
  let currentBottom = 0;
  let dragging = false;

  const panelHeight = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--panel-mobile-height")
  );
  const panelPeek = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--panel-mobile-peek")
  );

  panel.addEventListener("touchstart", (e) => {
    if (!panel.classList.contains("open")) return;
    dragging = true;
    startY = e.touches[0].clientY;
    currentBottom = parseFloat(panel.style.bottom) || 0;
    panel.style.transition = "none"; // disable transition during drag
  });

  panel.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    let newBottom = currentBottom - dy;
    newBottom = Math.min(newBottom, 0); // don't drag above fully open
    newBottom = Math.max(newBottom, -1 * (panelHeight - panelPeek)); // don't drag below peek
    panel.style.bottom = `${newBottom}px`;
  });

  panel.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = ""; // restore transition

    // Snap logic: if dragged more than halfway down, close; else open
    const bottomPx = parseFloat(panel.style.bottom);
    if (bottomPx < -((panelHeight - panelPeek) / 2)) {
      togglePanel(false);
    } else {
      togglePanel(true);
    }
  });
}

window.addEventListener("load", setupMobileDrag);
window.addEventListener("resize", setupMobileDrag);
