// 1) Initialize map
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

// Manually trigger geolocation
document.querySelectorAll(".my-loc-btn").forEach((btn, index) => {
  btn.addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        if (index === 0) {
          document.getElementById("panel-from-input").value = coords;
        } else {
          document.getElementById("panel-to-input").value = coords;
        }
      },
      () => alert("Unable to get your location.")
    );
  });
});

// 2) Nominatim search (main input)
const searchInput = document.getElementById("main-search");
const resultsBox = document.getElementById("main-suggestions");

searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  if (!query) {
    resultsBox.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, {
      headers: { "User-Agent": "TheBoiisMC/1.0 (maps.theboiismc.com)" }
    });
    const data = await res.json();
    resultsBox.innerHTML = "";

    data.forEach(item => {
      const el = document.createElement("div");
      el.className = "search-result";
      el.textContent = item.display_name;
      el.addEventListener("click", () => {
        map.flyTo({
          center: [parseFloat(item.lon), parseFloat(item.lat)],
          zoom: 14
        });
        searchInput.value = item.display_name;
        resultsBox.innerHTML = "";
      });
      resultsBox.appendChild(el);
    });

    resultsBox.style.display = data.length > 0 ? "block" : "none";
  } catch (e) {
    console.error("Nominatim search failed", e);
  }
});

searchInput.addEventListener("blur", () => {
  setTimeout(() => resultsBox.innerHTML = "", 200);
});

// 3) Routing with OSRM
const startInput = document.getElementById("panel-from-input");
const endInput = document.getElementById("panel-to-input");
const routeBtn = document.getElementById("get-route-btn");
const stopBtn = document.getElementById("exit-route-btn");

let routeLine = null;

routeBtn.addEventListener("click", async () => {
  const from = startInput.value.trim();
  const to = endInput.value.trim();
  if (!from || !to) return alert("Please enter both start and end locations.");

  const [start, end] = await Promise.all(
    [from, to].map(async (place) => {
      if (place.includes(",")) return place.split(",").map(Number); // already coords
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`);
      const data = await res.json();
      if (!data[0]) throw new Error(`Could not find location: ${place}`);
      return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    })
  );

  const url = `https://router.project-osrm.org/route/v1/driving/${start.join(",")};${end.join(",")}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];

  if (!route) return alert("No route found.");

  // Remove existing line
  if (routeLine) {
    map.removeLayer("route-line");
    map.removeSource("route");
  }

  // Add new route
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

  routeLine = true;

  // Fit bounds
  map.fitBounds([
    [Math.min(start[0], end[0]), Math.min(start[1], end[1])],
    [Math.max(start[0], end[0]), Math.max(start[1], end[1])],
  ], { padding: 50 });

  // Show steps
  const stepsEl = document.getElementById("route-steps");
  stepsEl.innerHTML = "";
  route.legs[0].steps.forEach(step => {
    const li = document.createElement("li");
    li.textContent = step.maneuver.instruction;
    stepsEl.appendChild(li);
  });

  showPanel("route-section");
});

stopBtn.addEventListener("click", () => {
  if (routeLine) {
    map.removeLayer("route-line");
    map.removeSource("route");
    routeLine = null;
  }
  showPanel("place-info-section");
});

// Utility: Show only one section inside the panel
function showPanel(sectionId) {
  const sections = [
    "welcome-section",
    "place-info-section",
    "directions-section",
    "route-section",
  ];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = id !== sectionId;
  });
}
