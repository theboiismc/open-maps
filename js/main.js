import { initMap } from './map.js';

document.addEventListener('DOMContentLoaded', async () => {
  const { map } = initMap();
  console.log("Map initialized:", map);

  // Example: open side panel when menu button clicked
  const panel = document.getElementById('side-panel');
  const openBtn = document.getElementById('open-panel-btn');
  openBtn.addEventListener('click', () => panel.classList.toggle('open'));
});
