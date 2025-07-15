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
const recentSearchesEl = $("recent-searches");
const sidePanel = $("side-panel");
const closeSidePanel = $("close-side-panel");
const placeName = $("place-name");
const placeDescription = $("place-description");
const placeWeather = $("place-weather");
const placeImages = $("place-images");
const directionsBtn = $("directions-btn");
const panelArrow = $("panel-arrow");
const panelSearchIcon = $("panel-search-icon");

let recentSearches = JSON.parse(localStorage.getItem("recentSearches") || "[]");
let fuseSuggestions;
let fuseRecent;

function saveRecentSearch(place) {
  // avoid duplicates by name
  recentSearches = recentSearches.filter((p) => p.name !== place.name);
  recentSearches.unshift(place);
  if (recentSearches.length > 10) recentSearches.pop();
  localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
  fuseRecent = new Fuse(recentSearches, {
    keys: ["name", "state", "country"],
    threshold: 0.3,
  });
}

function renderRecentSearches() {
  if (!recentSearches.length) {
    recentSearchesEl.style.display = "none";
    return;
  }
  recentSearchesEl.style.display = "block";
  recentSearchesEl.innerHTML = "";
  recentSearches.forEach((place) => {
    const div = document.createElement("div");
    div.className = "suggestion recent";
    div.textContent = `${place.name}, ${place.state || ""}, ${place.country || ""}`;
    div.addEventListener("click", () => {
      selectPlace(place);
      recentSearchesEl.style.display = "none";
    });
    recentSearchesEl.appendChild(div);
  });
}

function renderSuggestions(places) {
  suggestions.innerHTML = "";
  if (!places.length) {
    suggestions.style.display = "none";
    return;
  }
  suggestions.style.display = "block";
  places.forEach((f) => {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.textContent = `${f.name}, ${f.state || ""}, ${f.country || ""}`;
    div.addEventListener("click", () => {
      selectPlace(f);
      suggestions.style.display = "none";
    });
    suggestions.appendChild(div);
  });
}

async function fetchPhoton(query) {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
  );
  const json = await res.json();
  return json.features.map((f) => {
    return {
      name: f.properties.name,
      state: f.properties.state,
      country: f.properties.country,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    };
  });
}

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const onInput = debounce(async () => {
  const q = search.value.trim();
  if (!q) {
    renderSuggestions([]);
    renderRecentSearches();
    return;
  }
  if (!fuseSuggestions) {
    const places = await fetchPhoton(q);
    fuseSuggestions = new Fuse(places, {
      keys: ["name", "state", "country"],
      threshold: 0.3,
    });
    renderSuggestions(fuseSuggestions.search(q).map((r) => r.item));
  } else {
    renderSuggestions(fuseSuggestions.search(q).map((r) => r.item));
  }
  recentSearchesEl.style.display = "none";
});

search.addEventListener("focus", () => {
  if (!search.value.trim()) {
    renderRecentSearches();
    suggestions.style.display = "none";
  }
});
search.addEventListener("input", onInput);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-bar") && !e.target.closest("#suggestions") && !e.target.closest("#recent-searches")) {
    suggestions.style.display = "none";
    recentSearchesEl.style.display = "none";
  }
});

closeSidePanel.addEventListener("click", () => {
  sidePanel.classList.remove("open");
});

function selectPlace(place) {
  // Center map
  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });
  // Save recent
  saveRecentSearch(place);
  renderRecentSearches();
  // Update panel
  loadPlaceInfo(place);
  sidePanel.classList.add("open");
  search.value = `${place.name}, ${place.state || ""}, ${place.country || ""}`;
}

async function loadPlaceInfo(place) {
  placeName.textContent = place.name || "Unknown place";
  placeDescription.textContent = "Loading description...";
  placeWeather.textContent = "Loading weather...";
  placeImages.innerHTML = "";

  // Wikipedia search + summary (keyless, CORS-friendly)
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        place.name
      )}&format=json&origin=*`
    );
    const searchData = await searchRes.json();
    const bestTitle = searchData.query.search?.[0]?.title;
    if (bestTitle) {
      const summaryRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`
      );
      const summaryData = await summaryRes.json();
      placeDescription.textContent = summaryData.extract || "No description available.";
    } else {
      placeDescription.textContent = "No description available.";
    }
  } catch {
    placeDescription.textContent = "No description available.";
  }

  // Wikimedia images from that bestTitle (max 5)
  try {
    if (!bestTitle) throw new Error("No title for images");
    const imgRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=images&titles=${encodeURIComponent(
        bestTitle
      )}`
    );
    const imgData = await imgRes.json();
    const pages = imgData.query.pages;
    const pageId = Object.keys(pages)[0];
    const images = pages[pageId]?.images || [];

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

    if (!placeImages.hasChildNodes()) {
      placeImages.innerHTML = "";
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

  // Open-Meteo weather (US-based, keyless, CORS-friendly)
  try {
    if (!place.lat || !place.lon) throw new Error("No coordinates");
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current_weather=true`
    );
    const weatherData = await weatherRes.json();
    if (weatherData.current_weather) {
      const c = weatherData.current_weather.temperature;
      const w = weatherData.current_weather.windspeed;
      placeWeather.textContent = `Temp: ${c}°C, Wind: ${w} km/h`;
    } else {
      placeWeather.textContent = "Weather info not available.";
    }
  } catch {
    placeWeather.textContent = "Weather info not available.";
  }
}

// Panel toggle arrow
panelArrow.addEventListener("click", () => {
  if (sidePanel.classList.contains("expanded")) {
    sidePanel.classList.remove("expanded");
  } else {
    sidePanel.classList.add("expanded");
  }
});

panelSearchIcon.addEventListener("click", () => {
  search.focus();
});

renderRecentSearches();
