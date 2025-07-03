const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
  hash: false,
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
}), 'bottom-right');

let satelliteVisible = false;

map.on('load', () => {
  map.addSource('satellite', {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
  });
  map.addLayer({
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    paint: { 'raster-opacity': 1 },
  });
  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
});

const regularToggleBtn = document.getElementById('regular-toggle');
const satelliteToggleBtn = document.getElementById('satellite-toggle');

regularToggleBtn.onclick = () => {
  if (satelliteVisible) {
    map.setLayoutProperty('satellite-layer', 'visibility', 'none');
    satelliteVisible = false;
    regularToggleBtn.classList.add('active');
    satelliteToggleBtn.classList.remove('active');
  }
};

satelliteToggleBtn.onclick = () => {
  if (!satelliteVisible) {
    map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
    satelliteVisible = true;
    satelliteToggleBtn.classList.add('active');
    regularToggleBtn.classList.remove('active');
  }
};
