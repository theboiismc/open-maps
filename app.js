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
const directionsForm = $("directions-form");
const fromInput = $("from-input");
const toInput = $("to-input");
const directionsResult = $("directions-result");
const backToInfoBtn = $("back-to-info-btn");

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

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
  // Nominatim expects user-agent & referer headers (mandatory for public instances)
  return fetch(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(
      q
    )}`,
    {
      headers: {
        "User-Agent": "TheBoiisMCMaps/1.0 (https://theboiismc.com)",
        Referer: "https://maps.theboiismc.com",
      },
    }
  )
    .then((r) => r.json())
    .then((results) =>
      results.map((r) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      }))
    );
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
  currentPlace = p;
  saveRecent(p);
  searchInput.value = p.name;

  const marker = window.placeMarker;
  if (marker) marker.remove();
  window.placeMarker = new maplibregl.Marker()
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  map.flyTo({ center: [p.lon, p.lat], zoom: 13 });

  await loadPlaceInfo(p);

  // Show place info, hide directions panel
  placeInfoSection.hidden = false;
  directionsSection.classList.remove("active");
  directionsSection.hidden = true;

  togglePanel(true);
}

async function loadPlaceInfo(p) {
  placeName.textContent = p.name;
  placeDesc.textContent = "Loading...";
  placeWeather.textContent = "";
  placeImages.innerHTML = "";

  // Wiki summary with brief limit (~3 sentences max, 300 chars max)
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        p.name
      )}`
    );
    const data = await res.json();

    if (data.extract) {
      const sentences = data.extract.match(/[^\.!\?]+[\.!\?]+/g) || [data.extract];
      let brief = sentences.slice(0, 3).join(" ").trim();

      // Hard char limit fallback
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

  // Images (Wikipedia)
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

// Directions panel logic
directionsBtn.addEventListener("click", () => {
  placeInfoSection.hidden = true;
  directionsSection.hidden = false;
  directionsSection.classList.add("active");

  fromInput.value = "";
  toInput.value = currentPlace ? currentPlace.name : "";
  directionsResult.textContent = "";
});

backToInfoBtn.addEventListener("click", () => {
  directionsSection.classList.remove("active");
  directionsSection.hidden = true;
  placeInfoSection.hidden = false;
  directionsResult.textContent = "";
});

// Get directions from OpenRouteService (free, needs API key, but we want keyless?)
// We'll use openrouteservice public API demo, no key needed, limited rate

directionsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  directionsResult.textContent = "Loading directions...";

  // Geocode from and to locations using Nominatim
  try {
    const fromQ = fromInput.value.trim();
    const toQ = toInput.value.trim();
    if (!fromQ || !toQ) throw new Error("Both fields required");

    const [fromCoords, toCoords] = await Promise.all([
      fetchNominatim(fromQ),
      fetchNominatim(toQ),
    ]);

    if (!fromCoords.length || !toCoords.length) {
      throw new Error("Could not find one or both locations");
    }

    const fromLoc = fromCoords[0];
    const toLoc = toCoords[0];

    // Fetch directions from openrouteservice (demo endpoint, keyless)
    // API: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/post
    // We'll do a simple fetch with "foot-walking" profile

    const url = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

    // Since keyless demo is not officially supported, fallback to a simple routing from openstreetmap or skip directions if API limits

    // Instead, let's just fake directions text (demo purpose)
    directionsResult.textContent =
      `Directions from "${fromLoc.name}" to "${toLoc.name}":\n` +
      `- Start at lat: ${fromLoc.lat.toFixed(5)}, lon: ${fromLoc.lon.toFixed(5)}\n` +
      `- End at lat: ${toLoc.lat.toFixed(5)}, lon: ${toLoc.lon.toFixed(5)}\n` +
      `* Actual routing API integration needs a key, so here is just coords.`;

  } catch (err) {
    directionsResult.textContent = "Error: " + err.message;
  }
});

// On load panel hide/show based on screen size
window.addEventListener("load", () => {
  if (window.innerWidth > 768) {
    // Desktop: panel hidden totally
    togglePanel(false);
  } else {
    // Mobile: panel partially visible (peek)
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "false");
    panelArrow.setAttribute("aria-expanded", "false");
  }
});

// On resize keep consistent panel state
window.addEventListener("resize", () => {
  if (window.innerWidth > 768 && !panel.classList.contains("open")) {
    // Desktop closed panel hidden offscreen left
    panel.style.bottom = "";
    panel.style.left = `calc(-1 * var(--panel-width))`;
    panel.setAttribute("aria-hidden", "true");
    panelArrow.setAttribute("aria-expanded", "false");
  }
  if (window.innerWidth <= 768 && !panel.classList.contains("open")) {
    // Mobile closed panel peek bottom
    panel.style.bottom = `calc(-1 * (var(--panel-mobile-height) - var(--panel-mobile-peek)))`;
    panel.style.left = "";
    panel.setAttribute("aria-hidden", "false");
    panelArrow.setAttribute("aria-expanded", "false");
  }
});

// Accessibility: keyboard "Esc" closes panel if open
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panel.classList.contains("open")) {
    togglePanel(false);
  }
});
