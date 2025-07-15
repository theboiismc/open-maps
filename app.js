// == app.js ==

const PHOTON_API = "https://photon.komoot.io/api/";

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

const $ = (id) => document.getElementById(id);
const searchInput = $("search");
const suggestionsEl = $("suggestions");
const recentSearchesEl = $("recent-searches");
const sidePanel = $("side-panel");
const closeSidePanelBtn = $("close-side-panel");
const placeName = $("place-name");
const placeDescription = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");

// Recent searches storage
let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuse = null;
let currentPlace = null;
let panelExpanded = false;
let directionsMode = false;

// Fuse.js setup
function updateFuse() {
  if (recentSearches.length) {
    fuse = new Fuse(recentSearches, {
      keys: ["name"],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  } else {
    fuse = null;
  }
}
updateFuse();

// Helper: debounce
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Fetch from photon API
async function fetchPhoton(query) {
  try {
    const res = await fetch(`${PHOTON_API}?q=${encodeURIComponent(query)}&limit=8`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.features || [];
  } catch {
    return [];
  }
}

// Search places - fuse on recent + photon fallback
async function searchPlaces(query) {
  if (!query) return [];
  let results = [];

  // Fuse local search
  if (fuse) {
    results = fuse.search(query).map((r) => r.item);
  }

  // Fetch from photon if not enough results
  if (results.length < 5) {
    const photonResults = await fetchPhoton(query);
    photonResults.forEach((r) => {
      const placeObj = {
        name:
          r.properties.name +
          (r.properties.state ? ", " + r.properties.state : "") +
          (r.properties.country ? ", " + r.properties.country : ""),
        lat: r.geometry.coordinates[1],
        lon: r.geometry.coordinates[0],
        raw: r,
      };
      if (!results.some((p) => p.name === placeObj.name)) {
        results.push(placeObj);
      }
    });
  }
  return results.slice(0, 8);
}

// Render suggestion list
function renderSuggestions(items) {
  suggestionsEl.innerHTML = "";
  if (!items.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.textContent = item.name;
    div.tabIndex = 0;
    div.setAttribute("role", "option");
    div.addEventListener("click", () => onSuggestionClick(item));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSuggestionClick(item);
      }
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = "block";
}

// Save recent search and update fuse
function saveRecentSearch(place) {
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  updateFuse();
}

// Show recent searches dropdown
function showRecentSearches() {
  if (directionsMode) {
    recentSearchesEl.style.display = "none";
    return;
  }
  if (recentSearches.length === 0) {
    recentSearchesEl.style.display = "none";
    return;
  }
  recentSearchesEl.innerHTML = "";
  recentSearches.forEach((place) => {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.textContent = place.name;
    div.tabIndex = 0;
    div.addEventListener("click", () => onSuggestionClick(place));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSuggestionClick(place);
      }
    });
    recentSearchesEl.appendChild(div);
  });
  recentSearchesEl.style.display = "block";
}

// Handle suggestion click
async function onSuggestionClick(place) {
  searchInput.value = place.name;
  suggestionsEl.style.display = "none";
  recentSearchesEl.style.display = "none";

  currentPlace = place;
  saveRecentSearch(place);

  showPlaceOnMap(place);
  openSidePanel();
  await loadPlaceInfo(place);
}

// Show place on map
function showPlaceOnMap(place) {
  if (!place) return;
  const lat = place.lat || (place.raw && place.raw.geometry.coordinates[1]);
  const lon = place.lon || (place.raw && place.raw.geometry.coordinates[0]);
  if (lat && lon) {
    map.flyTo({ center: [lon, lat], zoom: 13, speed: 1.2 });
    if (window.placeMarker) window.placeMarker.remove();
    window.placeMarker = new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
  }
}

// Load place info into panel with images, desc, etc
async function loadPlaceInfo(place) {
  placeName.textContent = place.name || "Unknown place";
  placeDescription.textContent = "Loading description...";
  placeWeather.textContent = "Loading weather...";
  placeImages.innerHTML = "";

  // Wikipedia description
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(place.name)}`
    );
    const wikiData = await wikiRes.json();
    placeDescription.textContent = wikiData.extract || "No description available.";
  } catch {
    placeDescription.textContent = "No description available.";
  }

  // Wikimedia images via MediaWiki API, fallback to default
  try {
    const imgRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=images&titles=${encodeURIComponent(
        place.name
      )}`
    );
    const imgData = await imgRes.json();
    const pages = imgData.query.pages;
    const pageId = Object.keys(pages)[0];
    const images = pages[pageId]?.images || [];

    // Filter valid image files (.jpg, .jpeg, .png, .gif)
    const validImages = images.filter((img) => /\.(jpg|jpeg|png|gif)$/i.test(img.title)).slice(0, 5);

    placeImages.innerHTML = "";
    for (const imgObj of validImages) {
      try {
        const infoRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(
            imgObj.title
          )}&prop=imageinfo&iiprop=url`
        );
        const infoData = await infoRes.json();
        const pagesInfo = infoData.query.pages;
        const pageIdInfo = Object.keys(pagesInfo)[0];
        const imgUrl = pagesInfo[pageIdInfo]?.imageinfo?.[0]?.url;
        if (imgUrl) {
          const imgEl = document.createElement("img");
          imgEl.src = imgUrl;
          imgEl.alt = `Image of ${place.name}`;
          placeImages.appendChild(imgEl);
        }
      } catch {}
    }

    // If no images loaded, fallback
    if (!placeImages.hasChildNodes()) {
      const imgEl = document.createElement("img");
      imgEl.src = "default.jpg";
      imgEl.alt = "Default image";
      placeImages.appendChild(imgEl);
    }
  } catch {
    placeImages.innerHTML = "";
    const imgEl = document.createElement("img");
    imgEl.src = "default.jpg";
    imgEl.alt = "Default image";
    placeImages.appendChild(imgEl);
  }

  // Weather placeholder
  placeWeather.textContent = "Weather info not available yet.";
}

// Panel open/close
function openSidePanel() {
  sidePanel.classList.add("open");
  panelExpanded = false;
  // Reset to collapsed height on mobile
  if (window.innerWidth < 769) {
    sidePanel.style.height = "40vh";
  } else {
    sidePanel.style.width = "350px";
  }
}

function closeSidePanel() {
  sidePanel.classList.remove("open");
  if (window.innerWidth < 769) {
    sidePanel.style.height = "0";
  } else {
    sidePanel.style.width = "0";
  }
  panelExpanded = false;
  if (window.placeMarker) {
    window.placeMarker.remove();
    window.placeMarker = null;
  }
}

// Debounce for input
const debouncedSearch = debounce(async () => {
  const query = searchInput.value.trim();
  if (!query) {
    suggestionsEl.style.display = "none";
    return;
  }
  const results = await searchPlaces(query);
  renderSuggestions(results);
}, 150);

// Search input events
searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("focus", showRecentSearches);
searchInput.addEventListener("click", showRecentSearches);

// Hide suggestions and recent when clicking outside
document.addEventListener("click", (e) => {
  if (
    !suggestionsEl.contains(e.target) &&
    !searchInput.contains(e.target) &&
    !recentSearchesEl.contains(e.target)
  ) {
    suggestionsEl.style.display = "none";
    recentSearchesEl.style.display = "none";
  }
});

// Close panel button
closeSidePanelBtn.addEventListener("click", closeSidePanel);

// Initialize panel closed on load
closeSidePanel();
