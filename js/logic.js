// Minimal, robust UI wiring for Settings and Layers menus.
// Keeps both buttons visible and makes them open their own menus on all viewports.

(function () {
  const $ = (id) => document.getElementById(id);

  const settingsBtn = $("settings-btn");
  const layerBtn = $("layer-btn");
  const settingsMenu = $("settings-menu");
  const layersMenu = $("layers-menu");
  const menuOverlay = $("menu-overlay");
  const closeSettingsBtn = $("close-settings-btn");
  const closeLayersBtn = $("close-layers-btn");

  if (!settingsBtn || !layerBtn || !settingsMenu || !layersMenu || !menuOverlay) {
    console.warn("[logic.js] Missing one or more required elements.");
  }

  function closeAll() {
    settingsMenu && settingsMenu.classList.remove("open");
    layersMenu && layersMenu.classList.remove("open");
    menuOverlay && menuOverlay.classList.remove("open");
    if (settingsBtn) settingsBtn.setAttribute("aria-expanded", "false");
    if (layerBtn) layerBtn.setAttribute("aria-expanded", "false");
  }

  function openMenu(which) {
    if (!which) return;
    // Close the other menu first
    if (which === settingsMenu && layersMenu) layersMenu.classList.remove("open");
    if (which === layersMenu && settingsMenu) settingsMenu.classList.remove("open");

    which.classList.add("open");
    if (menuOverlay) menuOverlay.classList.add("open");
    if (which === settingsMenu && settingsBtn) settingsBtn.setAttribute("aria-expanded", "true");
    if (which === layersMenu && layerBtn) layerBtn.setAttribute("aria-expanded", "true");
  }

  function toggleMenu(which) {
    if (!which) return;
    const isOpen = which.classList.contains("open");
    if (isOpen) {
      closeAll();
    } else {
      openMenu(which);
    }
  }

  // Button handlers
  settingsBtn && settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(settingsMenu);
  });

  layerBtn && layerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(layersMenu);
  });

  closeSettingsBtn && closeSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
  });

  closeLayersBtn && closeLayersBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
  });

  // Clicking overlay or pressing ESC closes any open menu
  menuOverlay && menuOverlay.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // Prevent clicks inside menus from closing them via event bubbling
  [settingsMenu, layersMenu].forEach((el) => {
    el && el.addEventListener("click", (e) => e.stopPropagation());
  });

  // Defensive: close menus when the page navigates or the map captures focus changes
  window.addEventListener("hashchange", closeAll);
  window.addEventListener("blur", () => {
    // Don't force-close on desktop alt-tab; only collapse overlay to keep UI tidy.
    menuOverlay && menuOverlay.classList.remove("open");
  });
})();
