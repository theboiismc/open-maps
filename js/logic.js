
 {
  'use strict';

  // ------- tiny DOM helpers -------
  const $ = (sel, ctx = document) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel) || []);
  const on = (el, ev, fn, opts = false) => { if (!el) return; el.addEventListener(ev, fn, opts); };
  const onAll = (sel, ev, fn) => $$(sel).forEach(el => on(el, ev, fn));
  const once = (el, ev, fn) => {
    if (!el) return;
    const wrapped = (e) => { el.removeEventListener(ev, wrapped); fn(e); };
    el.addEventListener(ev, wrapped);
  };

  // -------- init --------
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initSettingsMenu();
    initProfileDropdown();
    initSidePanelFlow();
    initSearchSuggestions();
    initButtonEnhancements();
    initGlobalHandlers();
    initAccessibilityPolyfills();
    console.debug('logic.js: initialized');
  }

  // ---------------------------
  // Settings menu (desktop + mobile)
  // ---------------------------
  function initSettingsMenu() {
    const settingsMenu = $('#settings-menu');
    const menuOverlay = $('#menu-overlay');
    const closeBtn = $('#close-settings-btn');

    if (!settingsMenu || !menuOverlay) {
      console.warn('settings-menu or menu-overlay not found in DOM');
      return;
    }

    let previouslyFocused = null;
    let isOpen = false;

    // Ensure visual stacking & pointer events to avoid other elements blocking clicks
    function styleForOpen() {
      // these z-index values are conservative; feel free to match your CSS system
      menuOverlay.style.display = 'block';
      menuOverlay.style.pointerEvents = 'auto';
      menuOverlay.style.zIndex = '99990';

      settingsMenu.classList.add('open');
      settingsMenu.setAttribute('aria-hidden', 'false');
      settingsMenu.style.zIndex = '99999';

      // trap background scroll (useful on mobile)
      document.body.style.overflow = 'hidden';
    }

    function styleForClose() {
      menuOverlay.style.display = '';
      menuOverlay.style.pointerEvents = '';
      menuOverlay.style.zIndex = '';

      settingsMenu.classList.remove('open');
      settingsMenu.setAttribute('aria-hidden', 'true');
      settingsMenu.style.zIndex = '';

      document.body.style.overflow = '';
    }

    function openSettings(triggerEl) {
      if (isOpen) return;
      previouslyFocused = document.activeElement;
      styleForOpen();
      isOpen = true;

      // focus the close button for keyboard users
      if (closeBtn) {
        try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); }
      }

      console.debug('settings: opened', triggerEl || null);
    }

    function closeSettings() {
      if (!isOpen) return;
      styleForClose();
      isOpen = false;

      // restore focus to previous element if still in document
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus({ preventScroll: true }); } catch (e) { previouslyFocused.focus(); }
      }

      console.debug('settings: closed');
    }

    // Primary: event delegation — catches clicks on any current or future .js-settings-btn
    on(document, 'click', (e) => {
      const btn = e.target.closest && e.target.closest('.js-settings-btn');
      if (!btn) return;
      e.stopPropagation();
      openSettings(btn);
    });

    // Also listen for touchstart for devices where touchstart fires earlier/higher priority
    on(document, 'touchstart', (e) => {
      const btn = e.target.closest && e.target.closest('.js-settings-btn');
      if (!btn) return;
      // don't call preventDefault here; just open
      openSettings(btn);
    }, { passive: true });

    // Close via overlay or close button
    on(menuOverlay, 'click', (e) => {
      e.stopPropagation();
      closeSettings();
    });
    on(closeBtn, 'click', (e) => {
      e.stopPropagation();
      closeSettings();
    });

    // Avoid overlay clicks when clicking inside the menu
    on(settingsMenu, 'click', (e) => e.stopPropagation());

    // Close on ESC when open
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeSettings();
      }
    });

    // Make sure any existing .js-settings-btn are keyboard-focusable & accessible
    $$('.js-settings-btn').forEach(btn => {
      if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');
      if (!btn.hasAttribute('role')) btn.setAttribute('role', 'button');
      // keyboard enter/space support
      on(btn, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
      });
    });

    // Safety: ensure overlay receives pointer-events only when active
    const observer = new MutationObserver(() => {
      menuOverlay.style.pointerEvents = menuOverlay.style.display === 'block' ? 'auto' : 'none';
    });
    observer.observe(menuOverlay, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // ---------------------------
  // Profile dropdown
  // ---------------------------
  function initProfileDropdown() {
    const profileBtn = $('#profile-button');
    const profileDropdown = $('#profile-dropdown');

    if (!profileBtn || !profileDropdown) return;

    on(profileBtn, 'click', (e) => {
      e.stopPropagation();
      profileDropdown.hidden = !profileDropdown.hidden;
    });

    on(profileBtn, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); profileBtn.click(); }
    });

    on(document, 'click', () => { profileDropdown.hidden = true; });
    on(profileDropdown, 'click', (e) => e.stopPropagation());

    // profile actions (placeholders for integration)
    const savedBtn = $('#saved-places-btn');
    const logoutBtn = $('#logout-btn');
    if (savedBtn) on(savedBtn, 'click', (e) => { e.preventDefault(); profileDropdown.hidden = true; console.debug('profile: saved-places clicked'); });
    if (logoutBtn) on(logoutBtn, 'click', (e) => { e.preventDefault(); profileDropdown.hidden = true; console.debug('profile: logout clicked'); });
  }

  // ---------------------------
  // Side panel (info/directions/route) flow
  // ---------------------------
  function initSidePanelFlow() {
    const sidePanel = $('#side-panel');
    if (!sidePanel) return;

    const panelGrabber = $('#panel-grabber');
    const panelSearchPlaceholder = $('#panel-search-placeholder');
    const mainSearchContainer = $('#main-search-container');

    const panels = {
      info: $('#info-panel-redesign'),
      directions: $('#directions-panel-redesign'),
      preview: $('#route-preview-panel'),
      route: $('#route-section')
    };

    function showPanel(name) {
      Object.values(panels).forEach(p => { if (p) p.hidden = true; });
      if (panels[name]) panels[name].hidden = false;
      sidePanel.classList.add('open');

      // Move the main search input into the panel placeholder if available
      if (panelSearchPlaceholder && mainSearchContainer && !panelSearchPlaceholder.contains(mainSearchContainer)) {
        panelSearchPlaceholder.hidden = false;
        panelSearchPlaceholder.appendChild(mainSearchContainer);
      }
    }

    function hideSidePanel() {
      sidePanel.classList.remove('open');
      // move search container back
      const topWrapper = $('#top-search-wrapper');
      if (topWrapper && mainSearchContainer && !topWrapper.contains(mainSearchContainer)) {
        topWrapper.appendChild(mainSearchContainer);
      }
    }

    // Wire buttons
    const infoDirections = $('#info-directions-btn');
    const backToInfo = $('#back-to-info-btn');
    const getRouteBtn = $('#get-route-btn');
    const startNav = $('#start-navigation-btn');
    const backToDirectionsBtn = $('#back-to-directions-btn');
    const exitRouteBtn = $('#exit-route-btn');

    if (infoDirections) on(infoDirections, 'click', (e) => { e.preventDefault(); showPanel('directions'); });
    if (backToInfo) on(backToInfo, 'click', (e) => { e.preventDefault(); showPanel('info'); });
    if (getRouteBtn) on(getRouteBtn, 'click', (e) => { e.preventDefault(); generateRoutePreview(); });
    if (backToDirectionsBtn) on(backToDirectionsBtn, 'click', (e) => { e.preventDefault(); showPanel('directions'); });
    if (exitRouteBtn) on(exitRouteBtn, 'click', (e) => { e.preventDefault(); showPanel('info'); });
    if (startNav) on(startNav, 'click', (e) => { e.preventDefault(); startNavigation(); });

    // End navigation
    const endNavBtn = $('#end-navigation-btn');
    if (endNavBtn) on(endNavBtn, 'click', (e) => { e.preventDefault(); stopNavigation(); });

    // Swap origin/destination
    const swapBtn = $('#swap-btn');
    const panelFrom = $('#panel-from-input');
    const panelTo = $('#panel-to-input');
    if (swapBtn && panelFrom && panelTo) on(swapBtn, 'click', (e) => {
      e.preventDefault();
      const a = panelFrom.value;
      panelFrom.value = panelTo.value;
      panelTo.value = a;
      panelFrom.focus();
    });

    // Use my location
    const useMyLocation = $('#dir-use-my-location');
    if (useMyLocation && panelFrom) on(useMyLocation, 'click', async (e) => {
      e.preventDefault();
      panelFrom.value = 'My location';
      try {
        const pos = await getCurrentPosition({ timeout: 8000 });
        panelFrom.dataset.lat = pos.coords.latitude;
        panelFrom.dataset.lon = pos.coords.longitude;
        console.debug('dir: got current position', pos.coords);
      } catch (err) {
        console.warn('dir: geolocation failed', err);
      }
    });

    // Panel grabber for mobile
    if (panelGrabber) {
      panelGrabber.style.cursor = 'pointer';
      panelGrabber.setAttribute('role', 'button');
      panelGrabber.setAttribute('tabindex', '0');
      on(panelGrabber, 'click', () => sidePanel.classList.toggle('open'));
      on(panelGrabber, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') panelGrabber.click(); });
    }

    // simple route preview placeholder
    function generateRoutePreview() {
      const from = panelFrom?.value || '';
      const to = panelTo?.value || '';
      const isMyLoc = (from || '').toLowerCase().includes('my location');

      const distance = Math.max(1, Math.round(((from.length + to.length) / 2) * 0.2));
      const minutes = Math.max(1, Math.round(distance * 3 + (isMyLoc ? 0 : 4)));

      const summaryTime = $('#route-summary-time');
      const summaryDist = $('#route-summary-distance');
      if (summaryTime) summaryTime.textContent = `${minutes} min`;
      if (summaryDist) summaryDist.textContent = `${distance} mi`;

      const stepsList = $('#route-steps');
      if (stepsList) {
        stepsList.innerHTML = '';
        const steps = [
          `Start at ${from || 'your location'}`,
          `Continue for ${Math.max(1, Math.round(distance / 2))} miles`,
          `Follow signs toward ${to || 'destination'}`,
          `Arrive at ${to || 'destination'}`
        ];
        steps.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          stepsList.appendChild(li);
        });
      }

      showPanel('preview');
    }

    function startNavigation() {
      const navStatus = $('#navigation-status');
      if (navStatus) navStatus.classList.add('active');
      sidePanel.classList.remove('open');
      const instruction = $('#navigation-instruction');
      if (instruction) instruction.textContent = 'Navigation started';
      console.debug('navigation: started');
    }

    function stopNavigation() {
      const navStatus = $('#navigation-status');
      if (navStatus) navStatus.classList.remove('active');
      showPanel('info');
      const instruction = $('#navigation-instruction');
      if (instruction) instruction.textContent = 'Navigation stopped';
      console.debug('navigation: stopped');
    }

    function getCurrentPosition(options = {}) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('geolocation-not-supported'));
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    }
  }

  // ---------------------------
  // Search suggestions UI
  // ---------------------------
  function initSearchSuggestions() {
    const mainInput = $('#main-search');
    const mainSug = $('#main-suggestions');

    const panelFrom = $('#panel-from-input');
    const panelTo = $('#panel-to-input');
    const panelFromSug = $('#panel-from-suggestions');
    const panelToSug = $('#panel-to-suggestions');

    if (mainInput && mainSug) wireSuggest(mainInput, mainSug);
    if (panelFrom && panelFromSug) wireSuggest(panelFrom, panelFromSug);
    if (panelTo && panelToSug) wireSuggest(panelTo, panelToSug);

    function wireSuggest(inputEl, containerEl) {
      if (!inputEl || !containerEl) return;
      containerEl.setAttribute('role', 'listbox');
      containerEl.style.display = 'none';
      containerEl.style.maxHeight = '240px';
      containerEl.style.overflowY = 'auto';

      on(inputEl, 'input', () => {
        const q = inputEl.value.trim();
        if (!q) return hide();
        const items = generateSuggestions(q);
        render(items);
      });

      on(inputEl, 'focus', () => {
        const q = inputEl.value.trim();
        if (q) render(generateSuggestions(q));
      });

      on(inputEl, 'keydown', (e) => {
        if (e.key === 'Escape') hide();
      });

      // prevent blur on mousedown in dropdown so clicks register
      on(containerEl, 'mousedown', e => e.preventDefault());

      // hide when clicking outside
      on(document, 'click', (e) => {
        if (!containerEl.contains(e.target) && e.target !== inputEl) hide();
      });

      function render(items) {
        containerEl.innerHTML = '';
        items.forEach((text) => {
          const row = document.createElement('div');
          row.className = 'suggestion-item';
          row.setAttribute('role', 'option');
          row.tabIndex = 0;
          row.textContent = text;
          row.dataset.value = text;

          on(row, 'click', (ev) => {
            ev.preventDefault();
            inputEl.value = text;
            hide();
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          });
          on(row, 'keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); row.click(); } });

          containerEl.appendChild(row);
        });
        containerEl.style.display = items.length ? 'block' : 'none';
      }

      function hide() {
        containerEl.innerHTML = '';
        containerEl.style.display = 'none';
      }

      function generateSuggestions(q) {
        const seed = [
          'Coffee Shop',
          'Gas Station',
          'Library',
          'City Hall',
          'Museum',
          'Park',
          'Restaurant',
          'Hotel'
        ];
        const lower = q.toLowerCase();
        const matches = seed.filter(s => s.toLowerCase().includes(lower));
        return [q, ...matches.filter(m => m.toLowerCase() !== lower).slice(0, 5)];
      }
    }
  }

  // ---------------------------
  // Misc button wiring + small features
  // ---------------------------
  function initButtonEnhancements() {
    // Make .btn-wrapper and .icon-wrapper keyboard focusable if they're divs
    $$('.btn-wrapper').forEach(el => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.style.cursor = 'pointer';
      on(el, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });

    $$('.icon-wrapper').forEach(el => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.style.cursor = 'pointer';
      on(el, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });

    // Info save button toggle
    const infoSave = $('#info-save-btn');
    if (infoSave) on(infoSave, 'click', (e) => {
      e.preventDefault();
      const pressed = infoSave.getAttribute('aria-pressed') === 'true';
      infoSave.setAttribute('aria-pressed', String(!pressed));
      infoSave.classList.toggle('saved', !pressed);
      flash('Saved toggled');
    });

    // Share route: copy current URL to clipboard
    const shareRoute = $('#share-route-btn');
    if (shareRoute) on(shareRoute, 'click', async (e) => {
      e.preventDefault();
      const shareUrl = window.location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          flash('Copied link to clipboard');
        } else {
          // fallback
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          flash('Copied link to clipboard (fallback)');
        }
      } catch (err) {
        console.warn('share: copy failed', err);
        flash('Copy failed');
      }
    });

    // Prevent anchor jump for anchors with href="#"
    $$('a[href="#"]').forEach(a => on(a, 'click', (e) => e.preventDefault()));
  }

  // ---------------------------
  // Accessibility helpers
  // ---------------------------
  function initAccessibilityPolyfills() {
    // ensure svgs inside non-button parents are focusable/clickable
    $$('svg').forEach(svg => {
      const p = svg.parentElement;
      if (!p) return;
      const tag = p.tagName.toLowerCase();
      if ((tag === 'div' || tag === 'span' || tag === 'button') && !p.hasAttribute('role')) {
        // if parent is a button element, role is implicit; only set for non-button parents
        if (tag !== 'button') p.setAttribute('role', 'button');
      }
      if ((tag === 'div' || tag === 'span') && !p.hasAttribute('tabindex')) {
        p.tabIndex = p.tabIndex || 0;
      }
      if ((tag === 'div' || tag === 'span')) {
        p.style.cursor = p.style.cursor || 'pointer';
        on(p, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.click(); } });
      }
    });
  }

  // ---------------------------
  // Global handlers (escape, etc.)
  // ---------------------------
  function initGlobalHandlers() {
    // global ESC: close things (profile + settings)
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const pd = $('#profile-dropdown'); if (pd) pd.hidden = true;
        const sm = $('#settings-menu'); if (sm) sm.classList.remove('open');
        const mo = $('#menu-overlay'); if (mo) mo.classList.remove('active');
      }
    });

    // Simple flash snackbar utility
    function flash(msg, duration = 1600) {
      let el = $('#global-flash');
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-flash';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
        el.style.bottom = '18px';
        el.style.padding = '8px 12px';
        el.style.background = 'rgba(0,0,0,0.85)';
        el.style.color = '#fff';
        el.style.borderRadius = '10px';
        el.style.zIndex = 99999;
        el.style.transition = 'opacity 180ms ease';
        el.style.opacity = 0;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = 1;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = 0; }, duration);
    }
    window._mapsFlash = flash;
  }

  // small local helper to call global flash
  function flash(msg) { if (window._mapsFlash) window._mapsFlash(msg); }

})();
