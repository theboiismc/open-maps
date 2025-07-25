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

document.getElementById("locate-btn").addEventListener("click", () => {
  geoCtrl.trigger();
});

// 2) Handle Search (Nominatim)
const searchInput = document.getElementById("search-input");
const resultsBox = document.getElementById("search-results");

searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  if (!query) {
    resultsBox.innerHTML = "";
    return;
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&addressdetails=1&limit=5`;
  const res = await fetch(url, {
    headers: { "User-Agent": "theboiismc.com/maps" },
  });
  const data = await res.json();

  resultsBox.innerHTML = "";
  data.forEach((item) => {
    const option = document.createElement("div");
    option.className = "search-result";
    option.textContent = item.display_name;
    option.addEventListener("click", () => {
      map.flyTo({
        center: [item.lon, item.lat],
        zoom: 14,
      });
      resultsBox.innerHTML = "";
      searchInput.value = item.display_name;
    });
    resultsBox.appendChild(option);
  });
});

// Hide dropdown on blur
searchInput.addEventListener("blur", () => {
  setTimeout(() => {
    resultsBox.innerHTML = "";
  }, 200);
});

// 3) Routing (OSRM)
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const routeBtn = document.getElementById("route-btn");
const stopBtn = document.getElementById("stop-btn");

let routeLine = null;

routeBtn.addEventListener("click", async () => {
  const start = startInput.value.trim();
  const end = endInput.value.trim();
  if (!start || !end) return alert("Enter both start and end locations");

  const startRes = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      start
    )}&format=json&limit=1`
  );
  const startData = await startRes.json();
  const endRes = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      end
    )}&format=json&limit=1`
  );
  const endData = await endRes.json();

  if (!startData[0] || !endData[0]) return alert("Could not geocode locations");

  const startCoord = [startData[0].lon, startData[0].lat];
  const endCoord = [endData[0].lon, endData[0].lat];

  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${startCoord.join(
    ","
  )};${endCoord.join(",")}?overview=full&geometries=geojson&steps=true`;

  const routeRes = await fetch(routeUrl);
  const routeData = await routeRes.json();
  const route = routeData.routes[0];

  if (routeLine) {
    map.removeLayer("route-line");
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
    id: "route-line",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#1db954",
      "line-width": 6,
    },
  });

  map.fitBounds([
    [startCoord[0], startCoord[1]],
    [endCoord[0], endCoord[1]],
  ], { padding: 50 });

  routeLine = true;
});

// Stop navigation
stopBtn.addEventListener("click", () => {
  if (routeLine) {
    map.removeLayer("route-line");
    map.removeSource("route");
    routeLine = null;
  }
});
