const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(
  new maplibregl.GeolocateControl({ trackUserLocation: true }),
  "bottom-right"
);

const $ = (id) => document.getElementById(id);
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
const routeSection = $("route-section");

const directionsForm = $("directions-form");
const fromInput = $("from-input");
const toInput = $("to-input");
const directionsResult = $("directions-result");
const backToInfoBtn = $("back-to-info-btn");

const startMyLocBtn = $("start-my-location-btn");
const destMyLocBtn = $("dest-my-location-btn");

const routeStepsList = $("route-steps");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

let userCoords = null;
let routeLine = null;
let routeGeoJson = null;
let navWatchId = null;
let navIndex = 0;
let voiceSynth = window.speechSynthesis;

const errorMsg = document.createElement("div");
errorMsg.id = "error-message";
errorMsg.style.cssText = `
  background: #ff4d4d;
  color: white;
  padding: 8px 12px;
  margin-bottom: 10px;
  border-radius: 6px;
  font-weight: 600;
  display: none;
`;
panel.prepend(errorMsg);

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}
function clearError() {
  errorMsg.textContent = "";
  errorMsg.style.display = "none";
}

function saveRecent(p) {
  recentSearches = recentSearches.filter((r) => r.name !== p.name);
  recentSearches.unshift(p);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

function showRecent() {
  suggestionsEl.style.display = "none";
  if (!searchInput.value.trim() && recentSearches.length) {
    recentEl.innerHTML = "";
    recentSearches.forEach((p) => {
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
  list.forEach((p) => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name;
    d.addEventListener("click", () => selectPlace(p));
    suggestionsEl.appendChild(d);
  });
  suggestionsEl.style.display = "block";
}

async function fetchNominatim(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(
        q
      )}`,
      {
        headers: {
          "User-Agent": "TheBoiisMCMaps/1.0 (https://theboiismc.com)",
          Referer: "https://maps.theboiismc.com",
        },
      }
    );
    if (!res.ok) throw new Error("Nominatim search failed");
    const results = await res.json();
    return results.map((r) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    }));
  } catch {
    showError("Search service unavailable");
    return [];
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      {
        headers: {
          "User-Agent": "TheBoiisMCMaps/1.0 (https://theboiismc.com)",
          Referer: "https://maps.theboiismc.com",
        },
      }
    );
    if (!res.ok) throw new Error("Reverse geocode failed");
    const json = await res.json();
    return json.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch {
    showError("Could not get address for your location");
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

searchInput.addEventListener("focus", showRecent);
searchInput.addEventListener(
  "input",
  debounce(async () => {
    clearError();
    const q = searchInput.value.trim();
    if (!q) {
      showRecent();
      return;
    }
    let list = [];
    if (recentSearches.length) {
      list = fuseRecent.search(q).map((r) => r.item);
    }
    if (list.length < 5) {
      const extra = await fetchNominatim(q);
      extra.forEach((e) => {
        if (!list.find((r) => r.name === e.name)) list.push(e);
      });
    }
    renderSuggestions(list);
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

function togglePanel(open) {
  if (open) {
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    panelArrow.setAttribute("aria-expanded", "true");
  } else {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    panelArrow.setAttribute("aria-expanded", "false");
  }
  map.resize();
}

closeBtn.addEventListener("click", () => togglePanel(false));
panelArrow.addEventListener("click", () =>
  togglePanel(!panel.classList.contains("open"))
);
panelSearch.addEventListener("click", () => searchInput.focus());

async function selectPlace(p) {
  clearError();
  currentPlace = p;
  saveRecent(p);
  searchInput.value = p.name;

  if (window.placeMarker) window.placeMarker.remove();
  window.placeMarker = new maplibregl.Marker()
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  map.flyTo({ center: [p.lon, p.lat], zoom: 13 });

  await loadPlaceInfo(p);

  placeInfoSection.hidden = false;
  directionsSection.hidden = true;
  directionsSection.classList.remove("active");
  routeSection.hidden = true;
  routeSection.classList.remove("active");
  togglePanel(true);
}

async function loadPlaceInfo(p) {
  placeName.textContent = p.name;
  placeDesc.textContent = "Loading...";
  placeWeather.textContent = "";
  placeImages.innerHTML = "";

  // Wiki summary (~3 sentences max)
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.name)}`
    );
    const data = await res.json();

    if (data.extract) {
      const sentences = data.extract.match(/[^\.!\?]+[\.!\?]+/g) || [data.extract];
      let brief = sentences.slice(0, 3).join(" ").trim();

      const maxLen = 300;
      if (brief.length > maxLen) {
        brief = brief.slice(0, maxLen).trim();
        if (!brief.endsWith(".") && !brief.endsWith("!") && !brief.endsWith("?")) {
          brief += "…";
        }
      }
      placeDesc.textContent = brief;
    } else {
      placeDesc.textContent = "No description available.";
    }
  } catch {
    placeDesc.textContent = "No description available.";
  }

  // Wikipedia images
  try {
    const pg = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(
        p.name
      )}&format=json&origin=*`
    );
    const j = await pg.json();
    const page = j.query.pages[Object.keys(j.query.pages)[0]];
    const imgs = (page.images || []).slice(0, 5);
    for (let img of imgs) {
      if (/\.(jpg|jpeg|png)$/i.test(img.title)) {
        const info = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            img.title
          )}&prop=imageinfo&iiprop=url&format=json&origin=*`
        );
        const inf = await info.json();
        const u = inf.query.pages[Object.keys(inf.query.pages)[0]].imageinfo[0].url;
        const el = document.createElement("img");
        el.src = u;
        el.alt = p.name;
        placeImages.appendChild(el);
      }
    }
  } catch {}

  // Weather (Open-Meteo)
  try {
    const wr = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current_weather=true`
    );
    const wj = await wr.json();
    if (wj.current_weather) {
      const cw = wj.current_weather;
      placeWeather.textContent = `Temp: ${cw.temperature}°C, Wind: ${cw.windspeed} km/h`;
    } else placeWeather.textContent = "No weather info.";
  } catch {
    placeWeather.textContent = "No weather info.";
  }
}

// Directions panel toggle
directionsBtn.addEventListener("click", () => {
  clearError();
  placeInfoSection.hidden = true;
  directionsSection.hidden = false;
  directionsSection.classList.add("active");
  routeSection.hidden = true;
  routeSection.classList.remove("active");

  fromInput.value = "";
  toInput.value = currentPlace ? currentPlace.name : "";
  directionsResult.textContent = "";
});

// Back button
backToInfoBtn.addEventListener("click", () => {
  clearError();
  directionsSection.classList.remove("active");
  directionsSection.hidden = true;
  placeInfoSection.hidden = false;
  directionsResult.textContent = "";
  routeSection.hidden = true;
  routeSection.classList.remove("active");
  if (routeLine) {
    map.removeLayer("route");
    map.removeSource("route");
    routeLine = null;
  }
});

// Fuse.js setup for direction inputs suggestions
let fuseFrom = new Fuse([], { keys: ["name"], threshold: 0.3 });
let fuseTo = new Fuse([], { keys: ["name"], threshold: 0.3 });

async function updateFuseRecent() {
  fuseFrom = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
  fuseTo = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}
updateFuseRecent();

function setupDirectionInput(input, fuse, suggestionsContainer) {
  input.addEventListener(
    "input",
    debounce(async () => {
      clearError();
      const q = input.value.trim();
      if (!q) {
        suggestionsContainer.style.display = "none";
        return;
      }
      let list = fuse.search(q).map((r) => r.item);
      if (list.length < 5) {
        const extra = await fetchNominatim(q);
        extra.forEach((e) => {
          if (!list.find((r) => r.name === e.name)) list.push(e);
        });
      }
      renderDirSuggestions(list, suggestionsContainer, input);
    }, 150)
  );

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(`#${suggestionsContainer.id}`) &&
      e.target !== input
    ) {
      suggestionsContainer.style.display = "none";
    }
  });
}

function renderDirSuggestions(list, container, input) {
  container.innerHTML = "";
  list.forEach((p) => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name;
    d.addEventListener("click", () => {
      input.value = p.name;
      container.style.display = "none";
    });
    container.appendChild(d);
  });
  container.style.display = list.length ? "block" : "none";
}

setupDirectionInput(fromInput, fuseFrom, $("from-suggestions"));
setupDirectionInput(toInput, fuseTo, $("to-suggestions"));

// "My Location" buttons for directions inputs

async function fillInputWithUserLocation(input) {
  clearError();
  if (!navigator.geolocation) {
    showError("Geolocation not supported");
    return;
  }
  input.disabled = true;
  input.value = "Loading your location...";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      userCoords = { lat: latitude, lon: longitude };
      const address = await reverseGeocode(latitude, longitude);
      input.value = address;
      input.disabled = false;
    },
    (err) => {
      input.disabled = false;
      input.value = "";
      showError("Failed to get your location");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

startMyLocBtn.addEventListener("click", () => fillInputWithUserLocation(fromInput));
destMyLocBtn.addEventListener("click", () => fillInputWithUserLocation(toInput));

// Directions form submit & routing

directionsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  directionsResult.textContent = "";
  routeStepsList.innerHTML = "";

  const fromQ = fromInput.value.trim();
  const toQ = toInput.value.trim();
  if (!fromQ || !toQ) {
    showError("Both start and destination are required.");
    return;
  }

  directionsResult.textContent = "Loading route...";
  try {
    let fromCoords;
    let toCoords;

    // If "My Location" used for from or to, use userCoords or geolocate again
    if (
      (fromQ.toLowerCase().includes("my location") || fromQ === "") &&
      userCoords
    ) {
      fromCoords = userCoords;
    } else {
      const res = await fetchNominatim(fromQ);
      if (!res.length) throw new Error("Could not find start location");
      fromCoords = { lat: res[0].lat, lon: res[0].lon };
    }

    if (
      (toQ.toLowerCase().includes("my location") || toQ === "") &&
      userCoords
    ) {
      toCoords = userCoords;
    } else {
      const res2 = await fetchNominatim(toQ);
      if (!res2.length) throw new Error("Could not find destination location");
      toCoords = { lat: res2[0].lat, lon: res2[0].lon };
    }

    // Save recent places
    saveRecent({ name: fromQ, lat: fromCoords.lat, lon: fromCoords.lon });
    saveRecent({ name: toQ, lat: toCoords.lat, lon: toCoords.lon });
    await updateFuseRecent();

    // Fetch route from openrouteservice demo endpoint (no API key)
    const url =
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

    const body = {
      coordinates: [
        [fromCoords.lon, fromCoords.lat],
        [toCoords.lon, toCoords.lat],
      ],
    };

    const resRoute = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resRoute.ok) throw new Error("Routing service error");

    const json = await resRoute.json();

    if (!json.features || !json.features.length)
      throw new Error("No route found");

    if (routeLine) {
      map.removeLayer("route");
      map.removeSource("route");
      routeLine = null;
    }

    routeGeoJson = json.features[0].geometry;

    map.addSource("route", {
      type: "geojson",
      data: json.features[0],
    });

    map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#1a73e8",
        "line-width": 6,
      },
    });

    routeLine = true;

    // Zoom to route
    const bounds = new maplibregl.LngLatBounds();
    routeGeoJson.coordinates.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 60 });

    // Show route steps in route panel
    directionsResult.textContent = "";
    routeStepsList.innerHTML = "";
    routeSection.hidden = false;
    routeSection.classList.add("active");
    directionsSection.hidden = true;
    directionsSection.classList.remove("active");
    placeInfoSection.hidden = true;

    // Fill steps from properties.segments[0].steps if exists
    const steps = json.features[0].properties.segments[0].steps || [];
    if (!steps.length) {
      routeStepsList.innerHTML = "<li>No step details available.</li>";
    } else {
      steps.forEach((step, idx) => {
        const li = document.createElement("li");
        li.textContent = `${idx + 1}. ${step.instruction} (${(
          step.distance / 1000
        ).toFixed(2)} km)`;
        routeStepsList.appendChild(li);
      });
    }
  } catch (err) {
    directionsResult.textContent = "";
    showError(err.message || "Failed to get route");
  }
});

// Tooltip code

const tooltip = document.createElement("div");
tooltip.style.cssText = `
  position: fixed;
  padding: 6px 10px;
  background: #222;
  color: #eee;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10000;
  display: none;
  max-width: 220px;
`;
document.body.appendChild(tooltip);

function showTooltip(text, e) {
  tooltip.textContent = text;
  let x = e.clientX + 12;
  let y = e.clientY + 12;

  if (x + 220 > window.innerWidth) x = e.clientX - 220;
  if (y + 40 > window.innerHeight) y = e.clientY - 40;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.style.display = "block";
}
function hideTooltip() {
  tooltip.style.display = "none";
}

[
  { el: searchInput, text: "Search places" },
  { el: closeBtn, text: "Close the side panel" },
  { el: panelArrow, text: "Toggle side panel" },
  { el: panelSearch, text: "Focus main search input" },
  { el: directionsBtn, text: "Switch to directions mode" },
  { el: backToInfoBtn, text: "Back to place info" },
  { el: startMyLocBtn, text: "Use your location for start" },
  { el: destMyLocBtn, text: "Use your location for destination" },
].forEach(({ el, text }) => {
  if (!el) return;
  el.addEventListener("mouseenter", (e) => showTooltip(text, e));
  el.addEventListener("mousemove", (e) => showTooltip(text, e));
  el.addEventListener("mouseleave", hideTooltip);
  el.addEventListener("focus", (e) => showTooltip(text, e));
  el.addEventListener("blur", hideTooltip);
});
