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
  fitBoundsOptions: { maxZoom: 15 },
});
map.addControl(geoCtrl, "bottom-right");

// 2) Routing engine setup
const osrmBackend = "https://router.project-osrm.org";
let currentRoute = null;
let navMarker = null;

// 3) DOM elements
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const panel = document.getElementById("sidePanel");
const toggleBtn = document.getElementById("togglePanel");
const directionsForm = document.getElementById("directionsForm");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");

// 4) Fuse.js for fuzzy history search
let history = JSON.parse(localStorage.getItem("searchHistory") || "[]");
const fuse = new Fuse(history, { includeScore: true, threshold: 0.4 });

// 5) Nominatim Search
searchInput.addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    searchResults.innerHTML = "";
    return;
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();

  searchResults.innerHTML = data
    .map(
      (item) => `
      <div class="result" data-lon="${item.lon}" data-lat="${item.lat}">
        ${item.display_name}
      </div>`
    )
    .join("");

  document.querySelectorAll(".result").forEach((el) => {
    el.addEventListener("click", () => {
      const { lon, lat } = el.dataset;
      map.flyTo({ center: [lon, lat], zoom: 15 });

      // Add to history
      const newItem = { name: el.innerText, lon, lat };
      history.unshift(newItem);
      localStorage.setItem("searchHistory", JSON.stringify(history));
      fuse.setCollection(history);

      searchInput.value = "";
      searchResults.innerHTML = "";
    });
  });
});

// 6) Panel toggle
toggleBtn.addEventListener("click", () => {
  panel.classList.toggle("open");
});

// 7) Routing (directions)
directionsForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const startQuery = startInput.value.trim();
  const endQuery = endInput.value.trim();
  if (!startQuery || !endQuery) return;

  const [startCoords, endCoords] = await Promise.all([
    geocode(startQuery),
    geocode(endQuery),
  ]);

  if (!startCoords || !endCoords) return alert("Failed to geocode inputs.");

  const url = `${osrmBackend}/route/v1/driving/${startCoords.join(",")};${endCoords.join(",")}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];

  if (currentRoute) {
    map.removeLayer("route");
    map.removeSource("route");
  }

  map.addSource("route", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: route.geometry,
    },
  });

  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    paint: {
      "line-width": 6,
      "line-color": "#4a90e2",
    },
  });

  currentRoute = route;

  map.fitBounds([
    startCoords,
    endCoords,
  ], { padding: 60 });

  // Nav marker
  if (!navMarker) {
    navMarker = new maplibregl.Marker({ color: "#e91e63" }).setLngLat(startCoords).addTo(map);
  } else {
    navMarker.setLngLat(startCoords);
  }
});

// 8) Geocode helper
async function geocode(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!data || !data[0]) return null;
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

// 9) Close search dropdown on blur
searchInput.addEventListener("blur", () => {
  setTimeout(() => (searchResults.innerHTML = ""), 100); // allow click to register
});
