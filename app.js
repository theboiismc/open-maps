
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-95, 39],
  zoom: 4
});

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
const geoCtrl = new maplibregl.GeolocateControl({
  trackUserLocation: true,
  showUserHeading: true,
  positionOptions: { enableHighAccuracy: true }
});
map.addControl(geoCtrl, 'bottom-right');

const panel = document.getElementById('panel');
document.getElementById('toggle-panel').onclick = () => {
  panel.classList.toggle('open');
};

const searchInput = document.getElementById('searchbox');
const resultsList = document.getElementById('results');
let timeout;
searchInput.addEventListener('input', () => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    const q = searchInput.value;
    if (!q) return resultsList.innerHTML = '';
    fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json`)
      .then(res => res.json())
      .then(data => {
        resultsList.innerHTML = '';
        data.slice(0, 5).forEach(place => {
          const li = document.createElement('li');
          li.textContent = place.display_name;
          li.onclick = () => {
            map.flyTo({ center: [place.lon, place.lat], zoom: 15 });
            resultsList.innerHTML = '';
          };
          resultsList.appendChild(li);
        });
      });
  }, 300);
});
