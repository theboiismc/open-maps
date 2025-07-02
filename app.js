import "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";

const middleOfUSA = [-100, 40];

async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(middleOfUSA);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      () => resolve(middleOfUSA)
    );
  });
}

async function init() {
  const map = new maplibregl.Map({
    container: "map",
    style: "https://demotiles.maplibre.org/style.json",
    center: middleOfUSA,
    zoom: 2,
  });

  const location = await getLocation();
  if (location !== middleOfUSA) {
    map.flyTo({ center: location, zoom: 10 });
    new maplibregl.Popup({ closeOnClick: false })
      .setLngLat(location)
      .setHTML("<h3>You are approximately here!</h3>")
      .addTo(map);
  }

  // Search handler
  const searchInput = document.getElementById("search");
  searchInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const query = encodeURIComponent(searchInput.value.trim());
      if (!query) return;

      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        const { lon, lat, display_name } = data[0];
        const coords = [parseFloat(lon), parseFloat(lat)];
        map.flyTo({ center: coords, zoom: 12 });
        new maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`<strong>${display_name}</strong>`)
          .addTo(map);
      }
    }
  });

  // Locate button
  const locateBtn = document.getElementById("locate-btn");
  locateBtn.addEventListener("click", async () => {
    const loc = await getLocation();
    map.flyTo({ center: loc, zoom: 12 });
    new maplibregl.Popup()
      .setLngLat(loc)
      .setHTML("<h3>You are approximately here!</h3>")
      .addTo(map);
  });
}

init();
