// Init map
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-95, 39],
  zoom: 4,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

const geo = new maplibregl.GeolocateControl({
  trackUserLocation: true,
  showUserHeading: true,
});
map.addControl(geo);

// DOM refs
const mobilePanel = document.getElementById("mobile-panel");
const dragHandle = document.querySelector(".drag-handle");
const closeBtn = document.getElementById("close-panel");
const navigateBtn = document.getElementById("navigate-btn");

let startY, currentY, isDragging = false;

function openPanel() {
  mobilePanel.style.transform = "translateY(0)";
  mobilePanel.classList.remove("hidden");
}

function closePanel() {
  mobilePanel.style.transform = "translateY(100%)";
  setTimeout(() => mobilePanel.classList.add("hidden"), 300);
}

// Drag logic
dragHandle.addEventListener("touchstart", (e) => {
  isDragging = true;
  startY = e.touches[0].clientY;
  mobilePanel.style.transition = "none";
});

document.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  currentY = e.touches[0].clientY;
  const delta = currentY - startY;
  if (delta > 0) mobilePanel.style.transform = `translateY(${delta}px)`;
});

document.addEventListener("touchend", () => {
  if (!isDragging) return;
  isDragging = false;
  mobilePanel.style.transition = "transform 0.3s ease";
  const delta = currentY - startY;
  if (delta > 100) closePanel();
  else openPanel();
});

closeBtn.onclick = closePanel;

// Fuse search logic (same as original)
const input = document.getElementById("search-input");
const suggestionsEl = document.getElementById("suggestions");
const sampleData = [ /* custom places or geojson */ ];
const fuse = new Fuse(sampleData, { keys: ["name"], threshold: 0.4 });

input.addEventListener("input", () => {
  const results = fuse.search(input.value);
  suggestionsEl.innerHTML = "";
  results.forEach((r) => {
    const div = document.createElement("div");
    div.textContent = r.item.name;
    div.onclick = () => {
      map.flyTo({ center: r.item.center, zoom: 15 });
      openPanel();
      suggestionsEl.style.display = "none";
    };
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = results.length ? "block" : "none";
});

document.addEventListener("click", (e) => {
  if (!suggestionsEl.contains(e.target)) {
    suggestionsEl.style.display = "none";
  }
});

// Navigation
navigateBtn.onclick = () => {
  openPanel();
  // Insert routing logic with OSRM if needed
};
