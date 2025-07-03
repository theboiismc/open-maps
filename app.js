const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 0],       // Center globe on load
  zoom: 1.5,            // Zoomed out full world view
  pitch: 0,
  bearing: 0,
  hash: false,          // No URL hash syncing
  dragRotate: true,
  touchZoomRotate: true,
  scrollZoom: true,
  maxZoom: 18,
  minZoom: 1,
  zoomAnimation: true,
  rotationAnimation: true,
});

// Add controls bottom right
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
}), 'bottom-right');

let regularVisible = true;
let satelliteVisible = false;

// Add satellite source & layer but hide by default
map.on('load', () => {
  // Satellite Layer (ESRI imagery)
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
    paint: { 'raster-opacity': 1 }
  });
  map.setLayoutProperty('satellite-layer', 'visibility', 'none'); // hide initially

  // Force center & zoom on load in case style reset happens
  map.jumpTo({ center: [0, 0], zoom: 1.5 });
});

// Layer toggles
const regularToggleBtn = document.getElementById('regular-toggle');
const satelliteToggleBtn = document.getElementById('satellite-toggle');

regularToggleBtn.onclick = () => {
  if (!regularVisible) {
    map.setStyle('https://tiles.openfreemap.org/styles/liberty');
    regularVisible = true;
    satelliteVisible = false;
    regularToggleBtn.classList.add('active');
    satelliteToggleBtn.classList.remove('active');

    // Wait style load to hide satellite layer (it resets layers)
    map.once('styledata', () => {
      if (map.getLayer('satellite-layer')) {
        map.setLayoutProperty('satellite-layer', 'visibility', 'none');
      }
    });
  }
};

satelliteToggleBtn.onclick = () => {
  if (!satelliteVisible) {
    // Switching to satellite layer: set liberty style and show satellite overlay
    map.setStyle('https://tiles.openfreemap.org/styles/liberty');

    map.once('styledata', () => {
      // Add satellite source & layer if missing (because style reset)
      if (!map.getSource('satellite')) {
        map.addSource('satellite', {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        });
      }
      if (!map.getLayer('satellite-layer')) {
        map.addLayer({
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          paint: { 'raster-opacity': 1 }
        });
      }
      map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
    });

    satelliteVisible = true;
    regularVisible = false;
    satelliteToggleBtn.classList.add('active');
    regularToggleBtn.classList.remove('active');
  }
};
