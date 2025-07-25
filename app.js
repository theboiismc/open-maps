// 1) Initialize map
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, showUserHeading: true }), "bottom-right");

// Manually trigger geolocation for directions
document.querySelectorAll(".my-loc-btn").forEach((btn, index) => {
  btn.addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.longitude},${pos.coords.latitude}`;
        const input = index === 0 ? document.getElementById("panel-from-input") : document.getElementById("panel-to-input");
        input.value = "My Location";
        input.dataset.coords = coords; // Store coords separately
      },
      () => alert("Unable to get your location.")
    );
  });
});

// 2) Search Logic & UI
const searchInput = document.getElementById("main-search");
const resultsBox = document.getElementById("main-suggestions");
const searchIcon = document.getElementById("main-search-icon");
const sidePanel = document.getElementById("side-panel");

/**
 * Processes a single place result from Nominatim to update the map and panel.
 * @param {object} place - The Nominatim result object.
 */
function processPlaceResult(place) {
  if (!place) return;
  
  map.flyTo({
    center: [parseFloat(place.lon), parseFloat(place.lat)],
    zoom: 14
  });

  searchInput.value = place.display_name;
  resultsBox.innerHTML = "";
  resultsBox.style.display = "none";
  
  document.getElementById("place-name").textContent = place.display_name.split(',')[0];
  document.getElementById("place-description").textContent = place.display_name;
  showPanel("place-info-section");

  if (window.innerWidth > 768) {
    sidePanel.classList.add("open");
  } else {
    sidePanel.classList.remove("open");
    sidePanel.classList.add("peek");
  }
}

/**
 * Performs a "smart search" for the given query, taking the top result.
 * @param {string} query - The search term.
 */
async function performSmartSearch(query) {
  if (!query) return;

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
      headers: { "User-Agent": "TheBoiisMC/1.0 (maps.theboiismc.com)" }
    });
    const data = await res.json();
    if (data.length > 0) {
      processPlaceResult(data[0]);
    } else {
      alert("No results found for your search.");
    }
  } catch (e) {
    console.error("Smart search failed", e);
    alert("There was an error with your search.");
  }
}

// Show suggestions while typing
searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  if (!query) {
    resultsBox.style.display = "none";
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
      el.addEventListener("click", () => processPlaceResult(item));
      resultsBox.appendChild(el);
    });

    resultsBox.style.display = data.length > 0 ? "block" : "none";
  } catch (e) {
    console.error("Suggestion fetch failed", e);
  }
});

searchIcon.addEventListener("click", () => performSmartSearch(searchInput.value.trim()));
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") performSmartSearch(searchInput.value.trim()); });
searchInput.addEventListener("blur", () => { setTimeout(() => { resultsBox.style.display = "none"; }, 200); });

// 3) Routing with OSRM
const routeBtn = document.getElementById("get-route-btn");
const stopBtn = document.getElementById("exit-route-btn");
let routeLine = null;

async function geocode(place) {
    const inputElement = (place === 'from') ? document.getElementById('panel-from-input') : document.getElementById('panel-to-input');
    // Check if we used "My Location" button
    if (inputElement.dataset.coords) {
        return inputElement.dataset.coords.split(',').map(Number);
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(inputElement.value)}&format=json&limit=1`, { headers: { "User-Agent": "TheBoiisMC/1.0" } });
    const data = await res.json();
    if (!data[0]) throw new Error(`Could not find location: ${inputElement.value}`);
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}


routeBtn.addEventListener("click", async () => {
  const fromInput = document.getElementById("panel-from-input").value.trim();
  const toInput = document.getElementById("panel-to-input").value.trim();
  if (!fromInput || !toInput) return alert("Please enter both start and end locations.");

  try {
      const [start, end] = await Promise.all([geocode('from'), geocode('to')]);
    
      const url = `https://router.project-osrm.org/route/v1/driving/${start.join(",")};${end.join(",")}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      const route = data.routes[0];
    
      if (!route) return alert("No route found.");
    
      if (routeLine) {
        map.removeLayer("route-line");
        map.removeSource("route");
      }
    
      map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: route.geometry } });
      map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#1db954", "line-width": 6 } });
      routeLine = true;
    
      const bounds = new maplibregl.LngLatBounds(start, end);
      map.fitBounds(bounds, { padding: { top: 50, bottom: 180, left: 50, right: 50 }});
    
      const stepsEl = document.getElementById("route-steps");
      stepsEl.innerHTML = "";
      route.legs[0].steps.forEach(step => {
        const li = document.createElement("li");
        li.textContent = step.maneuver.instruction;
        stepsEl.appendChild(li);
      });
    
      showPanel("route-section");
  } catch (err) {
      alert(err.message);
  }
});

stopBtn.addEventListener("click", () => {
  if (routeLine) {
    map.removeLayer("route-line");
    map.removeSource("route");
    routeLine = null;
  }
  showPanel("place-info-section");
});

// 4) Panel UI and Interaction Logic
function showPanel(sectionId) {
  ["welcome-section", "place-info-section", "directions-section", "route-section"].forEach(id => {
    document.getElementById(id).hidden = id !== sectionId;
  });
}

document.getElementById("close-side-panel").addEventListener("click", () => {
    sidePanel.classList.remove("open", "peek");
});

document.getElementById("directions-btn").addEventListener("click", () => {
    const toInput = document.getElementById("panel-to-input");
    toInput.value = document.getElementById("place-description").textContent;
    toInput.dataset.coords = ''; // Clear coords in case it was set
    document.getElementById('panel-from-input').value = '';
    document.getElementById('panel-from-input').dataset.coords = '';
    showPanel("directions-section");
});

document.getElementById("back-to-info-btn").addEventListener("click", () => {
    showPanel("place-info-section");
});

// 5) Mobile-only panel drag functionality
if (window.innerWidth <= 768) {
    const grabber = document.getElementById("panel-grabber");
    let startY, startBottom;

    grabber.addEventListener('touchstart', (e) => {
        startY = e.touches[0].pageY;
        startBottom = parseInt(getComputedStyle(sidePanel).bottom, 10);
        sidePanel.style.transition = 'none';
    }, { passive: true });

    grabber.addEventListener('touchmove', (e) => {
        if (startY === undefined) return;
        const currentY = e.touches[0].pageY;
        let newBottom = startBottom + (startY - currentY);
        
        const panelHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-height'));
        const peekHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-mobile-peek'));
        const minBottom = -(panelHeight - peekHeight);
        
        if (newBottom < minBottom) newBottom = minBottom;
        if (newBottom > 0) newBottom = 0;

        sidePanel.style.bottom = `${newBottom}px`;
    }, { passive: true });

    grabber.addEventListener('touchend', () => {
        if (startY === undefined) return;
        startY = undefined;
        sidePanel.style.transition = 'bottom 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)';
        
        const currentBottom = parseInt(sidePanel.style.bottom);
        sidePanel.style.bottom = ''; // Let classes take over

        const threshold = -180; // Snap point threshold

        if (currentBottom > threshold) {
            sidePanel.classList.add("open");
            sidePanel.classList.remove("peek");
        } else {
            sidePanel.classList.remove("open");
            sidePanel.classList.add("peek");
        }
    });
}
