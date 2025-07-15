const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

const $ = id => document.getElementById(id);
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

let currentPlace = null;
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });

function saveRecent(p) {
  recentSearches = recentSearches.filter(r => r.name !== p.name);
  recentSearches.unshift(p);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuseRecent = new Fuse(recentSearches, { keys: ["name"], threshold: 0.3 });
}

function showRecent() {
  suggestionsEl.style.display = "none";
  if (!searchInput.value.trim() && recentSearches.length) {
    recentEl.innerHTML = "";
    recentSearches.forEach(p => {
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
  list.forEach(p => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name;
    d.addEventListener("click", () => selectPlace(p));
    suggestionsEl.appendChild(d);
  });
  suggestionsEl.style.display = "block";
}

async function fetchPhoton(q) {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
  const json = await res.json();
  return json.features.map(f => ({
    name: f.properties.name,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0]
  }));
}

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

searchInput.addEventListener("focus", showRecent);
searchInput.addEventListener("input", debounce(async () => {
  const q = searchInput.value.trim();
  if (!q) {
    showRecent();
    return;
  }
  let list = [];
  if (recentSearches.length) {
    list = fuseRecent.search(q).map(r => r.item);
  }
  if (list.length < 5) {
    const extra = await fetchPhoton(q);
    extra.forEach(e => {
      if (!list.find(r => r.name === e.name)) list.push(e);
    });
  }
  renderSuggestions(list);
}, 150));

document.addEventListener("click", e => {
  if (!e.target.closest(".search-bar") &&
      !e.target.closest("#suggestions") &&
      !e.target.closest("#recent-searches")) {
    suggestionsEl.style.display = recentEl.style.display = "none";
  }
});

function togglePanel(open) {
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", open ? "false" : "true");
  panelArrow.setAttribute("aria-expanded", open ? "true" : "false");
  map.resize();
}

closeBtn.addEventListener("click", () => togglePanel(false));
panelArrow.addEventListener("click", () => togglePanel(!panel.classList.contains("open")));
panelSearch.addEventListener("click", () => searchInput.focus());

async function selectPlace(p) {
  currentPlace = p;
  saveRecent(p);
  searchInput.value = p.name;
  const marker = window.placeMarker;
  if (marker) marker.remove();
  window.placeMarker = new maplibregl.Marker().setLngLat([p.lon, p.lat]).addTo(map);
  map.flyTo({ center: [p.lon, p.lat], zoom: 13 });
  await loadPlaceInfo(p);
  togglePanel(true);
}

async function loadPlaceInfo(p) {
  placeName.textContent = p.name;
  placeDesc.textContent = "Loading...";
  placeWeather.textContent = "";
  placeImages.innerHTML = "";

  // Wiki summary
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.name)}`);
    const data = await res.json();
    placeDesc.textContent = data.extract || "No description available.";
  } catch {
    placeDesc.textContent = "No description available.";
  }

  // Images (Wikipedia)
  try {
    const pg = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodeURIComponent(p.name)}&format=json&origin=*`);
    const j = await pg.json();
    const page = j.query.pages[Object.keys(j.query.pages)[0]];
    const imgs = (page.images || []).slice(0, 5);
    for (let img of imgs) {
      if (/\.(jpg|jpeg|png)$/i.test(img.title)) {
        const info = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`);
        const inf = await info.json();
        const u = inf.query.pages[Object.keys(inf.query.pages)[0]].imageinfo[0].url;
        const el = document.createElement("img");
        el.src = u; el.alt = p.name;
        placeImages.appendChild(el);
      }
    }
  } catch {}

  // Weather (Open-Meteo)
  try {
    const wr = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current_weather=true`);
    const wj = await wr.json();
    if (wj.current_weather) {
      const cw = wj.current_weather;
      placeWeather.textContent = `Temp: ${cw.temperature}°C, Wind: ${cw.windspeed} km/h`;
    } else placeWeather.textContent = "No weather info.";
  } catch {
    placeWeather.textContent = "No weather info.";
  }
}

window.addEventListener("load", () => {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  panelArrow.setAttribute("aria-expanded", "false");
  map.resize();
});
