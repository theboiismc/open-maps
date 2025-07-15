const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95, 39],
  zoom: 4
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'bottom-right');

const $ = id => document.getElementById(id);
const search = $('search');
const suggestions = $('suggestions');
const sidePanel = $('side-panel');
const closeSidePanel = $('close-side-panel');
const placeName = $('place-name');
const placeDescription = $('place-description');
const placeWeather = $('place-weather');
const placeImage = $('place-image');

let panelMaxHeight = window.innerHeight * 0.8;
let collapsedTranslateY = panelMaxHeight * 0.75;
const expandedTranslateY = 0;

let dragging = false;
let startY = 0;
let lastY = 0;
let lastTime = 0;
let velocity = 0;

function updatePanelSizes() {
  panelMaxHeight = window.innerHeight * 0.8;
  collapsedTranslateY = panelMaxHeight * 0.75;
  if (sidePanel.classList.contains('expanded')) {
    sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
  } else if (sidePanel.classList.contains('collapsed')) {
    sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
  } else {
    sidePanel.style.transform = `translateY(${panelMaxHeight}px)`;
  }
}

window.addEventListener('resize', () => {
  updatePanelSizes();
});

function openPanel() {
  sidePanel.classList.remove('hidden');
  sidePanel.classList.add('collapsed');
  sidePanel.classList.remove('expanded');
  sidePanel.style.transition = 'transform 0.25s ease';
  sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
}

function closePanel() {
  sidePanel.style.transition = 'transform 0.25s ease';
  sidePanel.style.transform = `translateY(${panelMaxHeight}px)`;
  setTimeout(() => {
    sidePanel.classList.add('hidden');
    sidePanel.classList.remove('expanded', 'collapsed');
    sidePanel.style.transition = '';
  }, 300);
}

closeSidePanel.addEventListener('click', closePanel);

search.addEventListener('input', debounce(async () => {
  const query = search.value.trim();
  if (!query) {
    suggestions.innerHTML = '';
    return;
  }
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
  const json = await res.json();
  suggestions.innerHTML = '';
  json.features.forEach(f => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = `${f.properties.name}, ${f.properties.state || ''}, ${f.properties.country || ''}`;
    div.addEventListener('click', () => {
      search.value = div.textContent;
      suggestions.innerHTML = '';
      const [lon, lat] = f.geometry.coordinates;
      loadPlaceInfo(f.properties.name, lat, lon);
      openPanel();
    });
    suggestions.appendChild(div);
  });
}, 300));

async function loadPlaceInfo(name, lat, lon) {
  placeName.textContent = name;
  try {
    const imageRes = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=url`);
    const imageData = await imageRes.json();
    const pages = imageData.query.pages;
    const pageId = Object.keys(pages)[0];
    const imageUrl = pages[pageId]?.imageinfo?.[0]?.url;
    placeImage.src = imageUrl || 'default.jpg';
  } catch {
    placeImage.src = 'default.jpg';
  }
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    const wikiData = await wikiRes.json();
    placeDescription.textContent = wikiData.extract || 'No description available.';
  } catch {
    placeDescription.textContent = 'No description available.';
  }
  placeWeather.textContent = 'Weather info would be here';
}

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Swipe Drag + Flick handling

sidePanel.addEventListener('touchstart', e => {
  if (window.innerWidth > 768) return;
  dragging = true;
  startY = e.touches[0].clientY;
  lastY = startY;
  lastTime = performance.now();
  sidePanel.style.transition = 'none';
});

sidePanel.addEventListener('touchmove', e => {
  if (!dragging) return;
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;

  let newTranslateY = collapsedTranslateY + deltaY;
  newTranslateY = Math.min(Math.max(expandedTranslateY, newTranslateY), panelMaxHeight);

  sidePanel.style.transform = `translateY(${newTranslateY}px)`;

  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 0) {
    velocity = (currentY - lastY) / dt;
    lastY = currentY;
    lastTime = now;
  }
});

sidePanel.addEventListener('touchend', e => {
  if (!dragging) return;
  dragging = false;
  sidePanel.style.transition = 'transform 0.25s ease';

  const matrix = window.getComputedStyle(sidePanel).transform;
  let translateY = collapsedTranslateY;
  if (matrix && matrix !== 'none') {
    const values = matrix.match(/matrix.*\((.+)\)/)[1].split(', ');
    translateY = parseFloat(values[5]);
  }

  const threshold = panelMaxHeight / 3;
  const flickThreshold = 0.3;

  if (velocity < -flickThreshold) {
    sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
    sidePanel.classList.add('expanded');
    sidePanel.classList.remove('collapsed');
  } else if (velocity > flickThreshold) {
    closePanel();
  } else {
    if (translateY < threshold) {
      sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
      sidePanel.classList.add('expanded');
      sidePanel.classList.remove('collapsed');
    } else {
      sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
      sidePanel.classList.add('collapsed');
      sidePanel.classList.remove('expanded');
    }
  }
});

$('panel-arrow').addEventListener('click', () => {
  const isExpanded = sidePanel.classList.contains('expanded');
  if (isExpanded) {
    sidePanel.style.transition = 'transform 0.25s ease';
    sidePanel.style.transform = `translateY(${collapsedTranslateY}px)`;
    sidePanel.classList.remove('expanded');
    sidePanel.classList.add('collapsed');
  } else {
    sidePanel.style.transition = 'transform 0.25s ease';
    sidePanel.style.transform = `translateY(${expandedTranslateY}px)`;
    sidePanel.classList.add('expanded');
    sidePanel.classList.remove('collapsed');
  }
});

// Initial panel state:
sidePanel.classList.add('hidden');
updatePanelSizes();
