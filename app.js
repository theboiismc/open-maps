const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

const $ = (id) => document.getElementById(id);
const search = $("search");
const suggestions = $("suggestions");
const recentEl = $("recent-searches");
const panel = $("side-panel");
const closeBtn = $("close-side-panel");
const placeName = $("place-name");
const placeDesc = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");
const panelArrow = $("panel-arrow");
const panelSearchIcon = $("panel-search-icon");

let recent = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuse;
let currentPlace = null;

// Update fuse for recent
function updateFuse() {
  if (recent.length) {
    fuse = new Fuse(recent, {
      keys: ["name", "state", "country"],
      threshold: 0.3,
    });
  } else fuse = null;
}
updateFuse();

function saveRecent(p) {
  recent = recent.filter((r) => r.name !== p.name);
  recent.unshift(p);
  if (recent.length > 10) recent.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recent));
  updateFuse();
}

function showRecent() {
  suggestions.style.display = "none";
  if (!recent.length || search.value.trim()) return;
  recentEl.innerHTML = "";
  recent.forEach((p) => {
    const d = document.createElement("div");
    d.className = "suggestion recent";
    d.textContent = p.name + (p.state ? ", " + p.state : "") + (p.country ? ", " + p.country : "");
    d.addEventListener("click", () => selectPlace(p));
    recentEl.appendChild(d);
  });
  recentEl.style.display = "block";
}

function renderSuggestions(list) {
  recentEl.style.display = "none";
  suggestions.innerHTML = "";
  if (!list.length) {
    suggestions.style.display = "none";
    return;
  }
  list.forEach((p) => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = p.name + (p.state ? ", " + p.state : "") + (p.country ? ", " + p.country : "");
    d.addEventListener("click", () => selectPlace(p));
    suggestions.appendChild(d);
  });
  suggestions.style.display = "block";
}

async function fetchPhoton(q) {
  if (!q) return [];
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`);
  const j = await res.json();
  return j.features.map((f) => ({
    name: `${f.properties.name}`,
    state: f.properties.state,
    country: f.properties.country,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

search.addEventListener("focus", showRecent);
search.addEventListener("input", debounce(async () => {
  const q = search.value.trim();
  if (!q) {
    renderSuggestions([]);
    showRecent();
    return;
  }

  let results = [];
  if (fuse) {
    results = fuse.search(q).map((r) => r.item);
  }
  if (results.length < 5) {
    const photon = await fetchPhoton(q);
    photon.forEach((f) => {
      if (!results.find((r) => r.name === f.name)) results.push(f);
    });
  }
  renderSuggestions(results);
}, 150));

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".search-bar") &&
    !e.target.closest("#suggestions") &&
    !e.target.closest("#recent-searches")
  ) {
    suggestions.style.display = "none";
    recentEl.style.display = "none";
  }
});

closeBtn.addEventListener("click", () => {
  panel.classList.remove("open");
  panel.classList.remove("expanded");
  if (window.placeMarker) placeMarker.remove();
  adjustMap();
  currentPlace = null;
});

panelArrow.addEventListener("click", () => {
  panel.classList.toggle("expanded");
});

panelSearchIcon.addEventListener("click", () => {
  search.focus();
});

function selectPlace(p) {
  search.value = p.name;
  suggestions.style.display = "none"; recentEl.style.display = "none";

  currentPlace = p;
  saveRecent(p);
  showRecent();

  map.flyTo({ center: [p.lon, p.lat], zoom: 14, speed:1.2 });
  if (window.placeMarker) placeMarker.remove();
  window.placeMarker = new maplibregl.Marker().setLngLat([p.lon, p.lat]).addTo(map);

  loadPlaceInfo(p);
  panel.classList.add("open");
  adjustMap();
}

window.addEventListener("resize", adjustMap);
function adjustMap() {
  if (panel.classList.contains("open") && window.innerWidth >= 769) {
    document.getElementById("map").style.left = "360px";
  } else {
    document.getElementById("map").style.left = "0";
  }
  map.resize();
}

async function loadPlaceInfo(place) {
  placeName.textContent = place.name;
  placeDesc.textContent = "Loading description...";
  placeWeather.textContent = "Loading weather...";
  placeImages.innerHTML = "";

  try {
    const sr = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(place.name)}&format=json&origin=*`
    );
    const js = await sr.json();
    const t = js.query.search?.[0]?.title;
    if (t) {
      const sm = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`
      );
      const sd = await sm.json();
      placeDesc.textContent = sd.extract || "No description available.";
    } else placeDesc.textContent = "No description available.";
  } catch {
    placeDesc.textContent = "No description available.";
  }

  try {
    const sr2 = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=images&titles=${encodeURIComponent(place.name)}`
    );
    const j2 = await sr2.json();
    const pg = j2.query.pages;
    const pid = Object.keys(pg)[0];
    const imgs = pg[pid]?.images || [];
    const valid = imgs.filter((i) => /\.(jpg|jpeg|png|gif)$/i.test(i.title)).slice(0,5);
    for (let i of valid) {
      try {
        const info = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(i.title)}&prop=imageinfo&iiprop=url`
        );
        const ji = await info.json();
        const id = Object.keys(ji.query.pages)[0];
        const url = ji.query.pages[id]?.imageinfo?.[0]?.url;
        if (url) {
          const imgEl = document.createElement("img");
          imgEl.src = url;
          imgEl.alt = place.name;
          placeImages.appendChild(imgEl);
        }
      } catch {}
    }
    if (!placeImages.childNodes.length) {
      const imgEl = document.createElement("img");
      imgEl.src = "/53e87aea-e737-4098-a968-363c73a31175.png";
      imgEl.alt = "Default";
      placeImages.appendChild(imgEl);
    }
  } catch {
    const imgEl = document.createElement("img");
    imgEl.src = "/53e87aea-e737-4098-a968-363c73a31175.png";
    imgEl.alt = "Default";
    placeImages.appendChild(imgEl);
  }

  try {
    if (!place.lat || !place.lon) throw "no coords";
    const wr = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current_weather=true`
    );
    const wj = await wr.json();
    const cw = wj.current_weather;
    if (cw) {
      placeWeather.textContent = `Temp: ${cw.temperature}°C, Wind: ${cw.windspeed} km/h`;
    } else placeWeather.textContent = "Weather info not available.";
  } catch {
    placeWeather.textContent = "Weather info not available.";
  }
}

// Init
adjustMap();
