const PHOTON_API = "https://photon.komoot.io/api/";

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});

map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");

// DOM elements
const searchInput = document.getElementById("search");
const suggestionsEl = document.getElementById("suggestions");
const recentSearchesEl = document.getElementById("recent-searches");
const sidePanel = document.getElementById("side-panel");
const closeSidePanelBtn = document.getElementById("close-side-panel");
const placeName = document.getElementById("place-name");
const placeDescription = document.getElementById("place-description");
const placeImages = document.getElementById("place-images");
const placeWeather = document.getElementById("place-weather");
const directionsBtn = document.getElementById("directions-btn");
const panelArrow = document.getElementById("panel-arrow");
const panelSearchIcon = document.getElementById("panel-search-icon");

const directionsContent = document.getElementById("directions-content");
const dirStartInput = document.getElementById("dir-start");
const dirEndInput = document.getElementById("dir-end");
const dirStartSuggestions = document.getElementById("dir-start-suggestions");
const dirEndSuggestions = document.getElementById("dir-end-suggestions");
const directionsBackBtn = document.getElementById("directions-back-btn");
const yourLocationBtn = document.getElementById("your-location-btn");

let currentPlace = null;
let panelExpanded = false;
let directionsMode = false;

let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");

// Helper debounce fn
function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Save recent search (keep unique max 10)
function saveRecentSearch(place) {
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
}

// Load recent searches to dropdown
function showRecentSearches() {
  if (!recentSearches.length) {
    recentSearchesEl.style.display = "none";
    return;
  }
  recentSearchesEl.innerHTML = "";
  recentSearches.forEach((place) => {
    const div = document.createElement("div");
    div.className = "recent-item";
    div.textContent = place.name;
    div.tabIndex = 0;
    div.setAttribute("role", "option");
    div.addEventListener("click", () => {
      onSuggestionClick(place);
      recentSearchesEl.style.display = "none";
    });
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSuggestionClick(place);
        recentSearchesEl.style.display = "none";
      }
    });
    recentSearchesEl.appendChild(div);
  });
  recentSearchesEl.style.display = "block";
}

// Photon API fuzzy search with Fuse.js for quick local + API hybrid search
const fuseOptions = {
  keys: ["properties.name", "properties.city", "properties.state", "properties.country"],
  threshold: 0.35,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

let fuse = null;

async function fetchPhoton(query) {
  if (!query) return [];
  const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&limit=8`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.features || [];
  } catch {
    return [];
  }
}

async function searchPlaces(query) {
  // Local + Fuse.js search on recentSearches first
  if (!fuse && recentSearches.length) {
    fuse = new Fuse(recentSearches, {
      keys: ["name"],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  let results = [];
  if (fuse) {
    results = fuse.search(query).map((r) => recentSearches.find((p) => p.name === r.item.name));
  }

  // If results are not enough or empty, call photon
  if (results.length < 5) {
    const photonResults = await fetchPhoton(query);
    photonResults.forEach((r) => {
      const placeObj = {
        name: r.properties.name + (r.properties.state ? ", " + r.properties.state : "") + (r.properties.country ? ", " + r.properties.country : ""),
        lat: r.geometry.coordinates[1],
        lon: r.geometry.coordinates[0],
        raw: r,
      };
      // Avoid duplicates
      if (!results.some((p) => p.name === placeObj.name)) {
        results.push(placeObj);
      }
    });
  }

  return results.slice(0, 8);
}

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

// Show place on map & fly there
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

// Load place info for side panel
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
    if (wikiData.extract) placeDescription.textContent = wikiData.extract;
    else placeDescription.textContent = "No description available.";
  } catch {
    placeDescription.textContent = "No description available.";
  }

  // Wikimedia images via MediaWiki API, fallback to default image
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

    // Filter valid image files (.jpg, .jpeg, .png)
    const validImages = images
      .filter((img) => /\.(jpg|jpeg|png|gif)$/i.test(img.title))
      .slice(0, 5);

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

  // Weather placeholder (can hook to API later)
  placeWeather.textContent = "Weather info not available yet.";
}

// Panel open/close & expand/collapse logic
function openSidePanel() {
  sidePanel.style.transform = "translateY(0)";
  sidePanel.classList.remove("hidden");
  panelExpanded = false;
  sidePanel.classList.remove("expanded");
  directionsMode = false;
  directionsContent.classList.remove("active");
  directionsBtn.style.display = "flex";
}

function closeSidePanel() {
  sidePanel.style.transform = window.innerWidth >= 769 ? "translateX(-100%)" : "translateY(100%)";
  sidePanel.classList.add("hidden");
  panelExpanded = false;
  directionsMode = false;
  directionsContent.classList.remove("active");
  directionsBtn.style.display = "flex";
  if (window.placeMarker) {
    window.placeMarker.remove();
    window.placeMarker = null;
  }
}

// Panel expand/collapse toggle on arrow click
function togglePanelExpand() {
  if (!panelExpanded) {
    sidePanel.classList.add("expanded");
    panelArrow.textContent = "⬆️";
    panelExpanded = true;
  } else {
    sidePanel.classList.remove("expanded");
    panelArrow.textContent = "⬇️";
    panelExpanded = false;
  }
}

// Handle swipe gestures for mobile panel expand/collapse
let touchStartY = 0;
let currentTranslateY = 0;

function onTouchStart(e) {
  if (window.innerWidth >= 769) return; // desktop no swipe
  touchStartY = e.touches[0].clientY;
  sidePanel.style.transition = "none";
}

function onTouchMove(e) {
  if (window.innerWidth >= 769) return;
  const touchCurrentY = e.touches[0].clientY;
  let diff = touchCurrentY - touchStartY;
  // Prevent swipe above top (expand) or below initial (collapse)
  if (panelExpanded) {
    diff = Math.min(diff, 0);
    diff = Math.max(diff, -window.innerHeight * 0.35);
  } else {
    diff = Math.max(diff, 0);
    diff = Math.min(diff, window.innerHeight * 0.35);
  }
  currentTranslateY = diff;
  sidePanel.style.transform = `translateY(${diff}px)`;
}

function onTouchEnd() {
  if (window.innerWidth >= 769) return;
  sidePanel.style.transition = "transform 0.3s ease-out";
  // If dragged more than 50px, toggle expand/collapse
  if (!panelExpanded && currentTranslateY > 50) {
    togglePanelExpand();
    sidePanel.style.transform = "translateY(0)";
  } else if (panelExpanded && currentTranslateY < -50) {
    togglePanelExpand();
    sidePanel.style.transform = "translateY(0)";
  } else {
    sidePanel.style.transform = "translateY(0)";
  }
  currentTranslateY = 0;
}

// Search bar events
searchInput.addEventListener("focus", () => {
  if (!directionsMode) showRecentSearches();
});

searchInput.addEventListener(
  "input",
  debounce(async () => {
    recentSearchesEl.style.display = "none";
    const query = searchInput.value.trim();
    if (!query) {
      suggestionsEl.style.display = "none";
      return;
    }
    const results = await searchPlaces(query);
    renderSuggestions(results);
  }, 150)
);

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    suggestionsEl.style.display = "none";
    recentSearchesEl.style.display = "none";
  }
});

suggestionsEl.addEventListener("mouseleave", () => {
  suggestionsEl.style.display = "none";
});

recentSearchesEl.addEventListener("mouseleave", () => {
  recentSearchesEl.style.display = "none";
});

closeSidePanelBtn.addEventListener("click", closeSidePanel);

panelArrow.addEventListener("click", togglePanelExpand);
panelArrow.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") togglePanelExpand();
});
panelSearchIcon.addEventListener("click", () => {
  searchInput.focus();
});

// Directions button click: switch panel to directions mode
directionsBtn.addEventListener("click", () => {
  directionsMode = true;
  directionsContent.classList.add("active");
  directionsBtn.style.display = "none";

  // Fill starting point with current place if any
  if (currentPlace) {
    dirStartInput.value = currentPlace.name;
  }

  placeImages.style.display = "none";
  placeDescription.style.display = "none";
  placeWeather.style.display = "none";
  document.getElementById("quick-facts").style.display = "none";
  placeName.textContent = "Directions";
});

// Back button on directions panel: go back to place info
directionsBackBtn.addEventListener("click", () => {
  directionsMode = false;
  directionsContent.classList.remove("active");
  directionsBtn.style.display = "flex";

  placeImages.style.display = "";
  placeDescription.style.display = "";
  placeWeather.style.display = "";
  document.getElementById("quick-facts").style.display = "";
  if (currentPlace) placeName.textContent = currentPlace.name;
  else placeName.textContent = "Loading...";
});

// Your location button: get current GPS location and reverse geocode with photon
yourLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by your browser.");
    return;
  }
  yourLocationBtn.disabled = true;
  yourLocationBtn.title = "Finding your location...";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      // Reverse geocode with photon
      const res = await fetch(
        `${PHOTON_API}?lat=${latitude}&lon=${longitude}&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features.length) {
        const feat = data.features[0];
        const nameParts = [
          feat.properties.name,
          feat.properties.city,
          feat.properties.state,
          feat.properties.country,
        ].filter(Boolean);
        dirStartInput.value = nameParts.join(", ");
        dirStartInput.focus();
      } else {
        dirStartInput.value = "Your location";
      }
      yourLocationBtn.disabled = false;
      yourLocationBtn.title = "Use your location";
    },
    (err) => {
      alert("Could not get your location.");
      yourLocationBtn.disabled = false;
      yourLocationBtn.title = "Use your location";
    }
  );
});

// Directions input fuzzy search and suggestions with Photon API & Fuse.js
async function handleDirInput(inputEl, suggestionsEl) {
  const query = inputEl.value.trim();
  if (!query) {
    suggestionsEl.style.display = "none";
    return;
  }
  const results = await fetchPhoton(query);
  if (!results.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  suggestionsEl.innerHTML = "";
  results.forEach((r) => {
    const div = document.createElement("div");
    div.className = "dir-suggestion-item";
    const name = [
      r.properties.name,
      r.properties.city,
      r.properties.state,
      r.properties.country,
    ]
      .filter(Boolean)
      .join(", ");
    div.textContent = name;
    div.tabIndex = 0;
    div.addEventListener("click", () => {
      inputEl.value = name;
      suggestionsEl.style.display = "none";
    });
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputEl.value = name;
        suggestionsEl.style.display = "none";
      }
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = "block";
}

dirStartInput.addEventListener(
  "input",
  debounce(() => handleDirInput(dirStartInput, dirStartSuggestions), 200)
);
dirEndInput.addEventListener(
  "input",
  debounce(() => handleDirInput(dirEndInput, dirEndSuggestions), 200)
);

dirStartInput.addEventListener("blur", () => {
  setTimeout(() => (dirStartSuggestions.style.display = "none"), 150);
});
dirEndInput.addEventListener("blur", () => {
  setTimeout(() => (dirEndSuggestions.style.display = "none"), 150);
});

// Side panel swipe gestures (mobile only)
sidePanel.addEventListener("touchstart", onTouchStart);
sidePanel.addEventListener("touchmove", onTouchMove);
sidePanel.addEventListener("touchend", onTouchEnd);

// Hide suggestions/recent when clicking outside
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

// Initialize panel hidden
closeSidePanel();

// Show recent searches on click/focus
searchInput.addEventListener("click", showRecentSearches);
searchInput.addEventListener("focus", showRecentSearches);

