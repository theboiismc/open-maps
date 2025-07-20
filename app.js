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

// 2) Utility function for selecting elements
const $ = (id) => document.getElementById(id);

// Elements & selectors
const mainSearchInput = $("main-search");
const mainSuggestionsEl = $("main-suggestions");
const panel = $("side-panel");
const fromInput = $("panel-from-input");
const toInput = $("panel-to-input");
const fromSug = $("panel-from-suggestions");
const toSug = $("panel-to-suggestions");

let fromCoords = null,
  toCoords = null;

// 3) Debounce function for better performance on input
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// Nominatim API call for search suggestions
async function nominatim(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
      q
    )}`,
    {
      headers: {
        "User-Agent": "TheBoiisMCMaps/1.0",
        Referer: "https://maps.theboiismc.com",
      },
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .map((el) => ({
      name: el.display_name,
      lat: el.lat,
      lon: el.lon,
      type: el.type,
    }))
    .filter((place) => place.name.toLowerCase().includes(q.toLowerCase()));
}

// Render search results in suggestions dropdown
function render(list, container, cb) {
  if (!list.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  container.style.display = "block";
  container.innerHTML = list
    .map(
      (item, i) =>
        `<div class="suggestion" role="option" tabindex="0" data-index="${i}">${item.name}</div>`
    )
    .join("");
  
  container.querySelectorAll(".suggestion").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = +el.getAttribute("data-index");
      cb(list[idx]);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const idx = +el.getAttribute("data-index");
        cb(list[idx]);
      }
    });
  });
}

// Update map view and set coordinates based on selection
function selectPlace(place, isFrom) {
  if (!place) return;
  if (isFrom) {
    fromCoords = [parseFloat(place.lon), parseFloat(place.lat)];
    fromInput.value = place.name;
  } else {
    toCoords = [parseFloat(place.lon), parseFloat(place.lat)];
    toInput.value = place.name;
  }

  // Fly to the selected place on map
  map.flyTo({ center: [place.lon, place.lat], zoom: 14 });
}

// Handle "Enter" key press for manual input
function handleEnterKey(inputEl, isFrom) {
  const place = inputEl.value.trim();
  if (place) {
    nominatim(place).then((results) => {
      if (results.length > 0) {
        selectPlace(results[0], isFrom);
      }
    });
  }
}

// Setup autocomplete functionality for From and To fields
function setupDirectionsAutocomplete(inputEl, sugEl, isFrom) {
  inputEl.addEventListener(
    "input",
    debounce(async () => {
      const q = inputEl.value.trim();
      if (!q) {
        sugEl.style.display = "none";
        return;
      }
      const results = await nominatim(q);
      render(results, sugEl, (place) => {
        selectPlace(place, isFrom);
        sugEl.style.display = "none";
      });
    }, 150)
  );

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim() && !sugEl.style.display) {
      sugEl.style.display = "none";
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleEnterKey(inputEl, isFrom);
    }
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(`#${inputEl.id}`) && !e.target.closest(`#${sugEl.id}`)
    ) {
      sugEl.style.display = "none";
    }
  });
}

// Set up input fields with autocomplete functionality
setupDirectionsAutocomplete(fromInput, fromSug, true);
setupDirectionsAutocomplete(toInput, toSug, false);

// Event listener for the directions form
document.addEventListener("DOMContentLoaded", () => {
  const directionsForm = $("directions-form");
  directionsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!fromCoords || !toCoords) {
      alert("Please enter valid 'from' and 'to' locations.");
      return;
    }

    // Fetch route from OSRM API or similar routing service
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&steps=true`;

    fetch(routeUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.code !== "Ok") {
          alert("Routing error. Try again.");
          return;
        }

        const route = data.routes[0];
        const steps = route.legs[0].steps;
        showRouteSteps(steps);
      })
      .catch((error) => {
        alert("Failed to fetch route.");
      });
  });
});

// Display route steps after fetching from OSRM API
function showRouteSteps(steps) {
  const stepsList = $("route-steps");
  stepsList.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step.maneuver.instruction || step.maneuver.type;
    stepsList.appendChild(li);
  });
  $("route-section").hidden = false;
}
