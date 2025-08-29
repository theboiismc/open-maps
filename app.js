/* ========= APP.JS - COMPLETE VERSION ========= */

/* ========= CONFIG ========= */
const authConfig = {
  authority: "https://accounts.theboiismc.com/application/o/maps/",
  client_id: "MA8UF8AMFlBWFYeyT7pC",
  redirect_uri: window.location.origin + "/callback.html",
  response_type: "code",
  scope: "openid profile email",
};

const themeKey = "mapsAppTheme";

/* ========= UTILS ========= */
function showToast(message, type = "info", duration = 4000) {
  const toastContainer = document.getElementById("toast-container") || createToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.id = "toast-container";
  container.style.position = "fixed";
  container.style.bottom = "1rem";
  container.style.right = "1rem";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "0.5rem";
  container.style.zIndex = "9999";
  document.body.appendChild(container);
  return container;
}

/* ========= THEME ========= */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(themeKey, theme);
}

function initTheme() {
  const saved = localStorage.getItem(themeKey);
  if (saved) applyTheme(saved);
  else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

/* ========= AUTH ========= */
async function initAuth() {
  try {
    // check login state, redirect if necessary
    const token = sessionStorage.getItem("mapsAccessToken");
    if (!token) {
      showToast("Not logged in. Redirecting...", "warning");
      window.location.href = "/login.html";
    }
  } catch (err) {
    console.error(err);
    showToast("Auth error: " + err.message, "error");
  }
}

/* ========= MAP ========= */
let map, userMarker, bottomSheet;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 0, lng: 0 },
    zoom: 15,
    disableDefaultUI: true,
  });

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setCenter({ lat: latitude, lng: longitude });
        if (!userMarker) {
          userMarker = new google.maps.Marker({
            position: { lat: latitude, lng: longitude },
            map,
            title: "You are here",
          });
        } else userMarker.setPosition({ lat: latitude, lng: longitude });
      },
      (err) => showToast("Geolocation error: " + err.message, "error"),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  } else showToast("Geolocation not supported.", "error");
}

/* ========= BOTTOM SHEET ========= */
function initBottomSheet() {
  bottomSheet = document.getElementById("bottom-sheet");
  if (!bottomSheet) return;

  let startY, currentY, sheetHeight;
  const minHeight = 100;
  const maxHeight = window.innerHeight * 0.9;
  const midHeight = window.innerHeight * 0.5;

  bottomSheet.style.height = `${minHeight}px`;

  bottomSheet.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    sheetHeight = bottomSheet.offsetHeight;
  });

  bottomSheet.addEventListener("touchmove", (e) => {
    currentY = e.touches[0].clientY;
    let newHeight = sheetHeight - (currentY - startY);
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    bottomSheet.style.height = `${newHeight}px`;
  });

  bottomSheet.addEventListener("touchend", () => {
    const h = bottomSheet.offsetHeight;
    if (h < midHeight) bottomSheet.style.height = `${minHeight}px`;
    else if (h < maxHeight * 0.75) bottomSheet.style.height = `${midHeight}px`;
    else bottomSheet.style.height = `${maxHeight}px`;
  });
}

/* ========= SEARCH ========= */
function initSearch() {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  if (!input || !results) return;

  input.addEventListener("input", async () => {
    const query = input.value.trim();
    results.innerHTML = "";
    if (!query) return;

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      data.forEach((item) => {
        const div = document.createElement("div");
        div.className = "search-result";
        div.textContent = item.name;
        div.addEventListener("click", () => {
          map.setCenter({ lat: item.lat, lng: item.lng });
          bottomSheet.style.height = `${minHeight}px`;
        });
        results.appendChild(div);
      });
    } catch (err) {
      console.error(err);
      showToast("Search error: " + err.message, "error");
    }
  });
}

/* ========= NAVIGATION ========= */
let navPolyline;

function startNavigation(route) {
  if (!map) return;
  if (navPolyline) navPolyline.setMap(null);

  const path = route.map((p) => ({ lat: p.lat, lng: p.lng }));
  navPolyline = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: "#4285F4",
    strokeOpacity: 0.8,
    strokeWeight: 6,
  });
  navPolyline.setMap(map);
  map.fitBounds(new google.maps.LatLngBounds(
    path[0],
    path[path.length - 1]
  ));
}

/* ========= INIT ========= */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initAuth();
  initMap();
  initBottomSheet();
  initSearch();
  showToast("Maps app ready!", "success");
});
