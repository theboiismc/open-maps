/**
 * logic.js
 * Full UI wiring for TheBoiisMC Maps (buttons, menus, panels, suggestions, basic routing flow)
 *
 * Focus: robust settings menu behavior (desktop + mobile) that respects your styles.css.
 *
 * Date: 2025-09-02
 */
(() => {
  'use strict';

  /* ----------------- tiny DOM helpers ----------------- */
  const $ = (sel, ctx = document) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel || ''));
  const on = (el, ev, fn, opts = false) => { if (!el) return; el.addEventListener(ev, fn, opts); };
  const once = (el, ev, fn) => { if (!el) return; const w = (e) => { el.removeEventListener(ev, w); fn(e); }; el.addEventListener(ev, w); };

  /* ----------------- startup ----------------- */
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

  /* ----------------- SETTINGS MENU (desktop + mobile) ----------------- */
  function initSettingsMenu() {
    const settingsBtns = $$('.js-settings-btn'); // should include desktop gear + mobile layers
    const settingsMenu = $('#settings-menu');
    const menuOverlay = $('#menu-overlay');
    const closeBtn = $('#close-settings-btn');

    if (!settingsMenu) {
      console.warn('settings-menu not found');
      return;
    }

    // small helpers for breakpoint detection using the same media query you used in styles.css
    const isMobile = () => window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;
    const isDesktop = () => !isMobile();

    let isOpen = false;
    let previouslyFocused = null;
    let lastTrigger = null;

    function openMenu(triggerBtn) {
      if (isOpen) return;
      lastTrigger = triggerBtn || document.querySelector('.js-settings-btn');
      previouslyFocused = document.activeElement;

      // Add open class so CSS transforms/opacity apply
      settingsMenu.classList.add('open');
      settingsMenu.setAttribute('aria-hidden', 'false');

      // If mobile: enable overlay (CSS handles transform for mobile)
      if (menuOverlay) {
        if (isMobile()) {
          menuOverlay.classList.add('open');
          // ensure overlay visible in case media queries hide it via 'display:none'
          menuOverlay.style.display = 'block';
        } else {
          // on desktop we don't want a full-screen overlay; remove the open class
          menuOverlay.classList.remove('open');
          menuOverlay.style.display = ''; // clear any inline display we set earlier
        }
      }

      // Positioning for desktop: anchor the menu to the trigger button visually
      if (isDesktop() && lastTrigger) {
        // Make the menu displayable so offsetWidth/height are measurable
        settingsMenu.style.visibility = 'hidden';
        settingsMenu.style.left = '';
        settingsMenu.style.right = '';
        settingsMenu.style.top = '';
        settingsMenu.style.bottom = '';
        // Force browser to render so offsets are available
        // (class 'open' already applied so display:block per your CSS)
        requestAnimationFrame(() => {
          const rect = lastTrigger.getBoundingClientRect();
          const menuW = settingsMenu.offsetWidth || 280;
          const menuH = settingsMenu.offsetHeight || 200;
          // position top near bottom of the button
          let top = rect.bottom + 6;
          let left = rect.right - menuW;
          // clamp to viewport
          const pad = 8;
          if (left < pad) left = pad;
          if (left + menuW > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - menuW - pad);
          // If menu would run off bottom, prefer placing above the button
          if (top + menuH > window.innerHeight - pad) {
            top = rect.top - menuH - 6;
            if (top < pad) top = pad;
          }
          settingsMenu.style.position = 'absolute';
          settingsMenu.style.top = `${Math.round(top)}px`;
          settingsMenu.style.left = `${Math.round(left)}px`;
          settingsMenu.style.right = 'auto';
          settingsMenu.style.visibility = 'visible';
          // focus the close button for keyboard users
          if (closeBtn) {
            try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); }
          }
        });
      } else {
        // mobile: let CSS handle bottom sheet layout; focus close button
        settingsMenu.style.position = '';
        settingsMenu.style.top = '';
        settingsMenu.style.left = '';
        settingsMenu.style.right = '';
        settingsMenu.style.visibility = 'visible';
        if (closeBtn) {
          try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); }
        }
      }

      // Prevent background scroll on mobile when menu open
      if (isMobile()) document.documentElement.style.overflow = 'hidden';
      isOpen = true;
      console.debug('settings: opened', { trigger: lastTrigger, mobile: isMobile() });
    }

    function closeMenu() {
      if (!isOpen) return;
      settingsMenu.classList.remove('open');
      settingsMenu.setAttribute('aria-hidden', 'true');

      // restore overlay only if we used it
      if (menuOverlay) {
        menuOverlay.classList.remove('open');
        menuOverlay.style.display = '';
      }

      // clear any inline positioning to let CSS manage layout again
      settingsMenu.style.position = '';
      settingsMenu.style.top = '';
      settingsMenu.style.left = '';
      settingsMenu.style.right = '';
      settingsMenu.style.visibility = '';

      // restore scrolling
      document.documentElement.style.overflow = '';

      // restore focus
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus({ preventScroll: true }); } catch (e) { previouslyFocused.focus(); }
      }
      isOpen = false;
      lastTrigger = null;
      console.debug('settings: closed');
    }

    // Attach click listeners directly to all .js-settings-btn buttons
    if (Array.isArray(settingsBtns) && settingsBtns.length) {
      settingsBtns.forEach(btn => {
        // ensure it's keyboard-focusable & accessible
        if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');
        if (!btn.hasAttribute('role')) btn.setAttribute('role', 'button');
        on(btn, 'click', (ev) => {
          ev.stopPropagation(); // prevent document click close race
          // toggle behavior: reopen if same button clicked (close), else open for new
          if (isOpen && lastTrigger === btn) {
            closeMenu();
          } else {
            openMenu(btn);
          }
        });
        // keyboard activation
        on(btn, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
        });
      });
    } else {
      // Fallback: if no buttons found, try delegation (unlikely)
      on(document, 'click', (e) => {
        const closest = e.target.closest && e.target.closest('.js-settings-btn');
        if (closest) {
          e.stopPropagation();
          openMenu(closest);
        }
      });
    }

    // Close when clicking outside the menu or pressing Escape
    on(document, 'click', (e) => {
      // if click inside menu or on a settings button, ignore (we already handle settings-btn clicks)
      if (settingsMenu.contains(e.target) || e.target.closest && e.target.closest('.js-settings-btn')) return;
      closeMenu();
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          closeMenu();
        }
      }
    });

    // overlay click (mainly for mobile)
    if (menuOverlay) {
      on(menuOverlay, 'click', (e) => {
        e.stopPropagation();
        closeMenu();
      });
    }

    // When window resizes, if menu open re-position properly or close if crossing breakpoints
    let resizeTO = null;
    on(window, 'resize', () => {
      clearTimeout(resizeTO);
      resizeTO = setTimeout(() => {
        if (!isOpen) return;
        // Close and reopen to recalc position for new viewport
        const trigger = lastTrigger;
        closeMenu();
        // small delay to ensure CSS recalcs and media queries settle
        setTimeout(() => openMenu(trigger), 40);
      }, 120);
    });
  }

  /* ----------------- PROFILE DROPDOWN ----------------- */
  function initProfileDropdown() {
    const profileBtn = $('#profile-button');
    const profileDropdown = $('#profile-dropdown');

    if (!profileBtn || !profileDropdown) return;

    on(profileBtn, 'click', (e) => {
      e.stopPropagation();
      // toggle visibility using attribute (your CSS hides #profile-dropdown by default)
      const isHidden = profileDropdown.hasAttribute('data-open');
      // ensure settings menu closes when opening profile
      const settings = $('#settings-menu');
      if (settings) settings.classList.remove('open');

      if (isHidden) {
        profileDropdown.removeAttribute('data-open');
        profileDropdown.style.display = 'none';
      } else {
        profileDropdown.setAttribute('data-open', 'true');
        profileDropdown.style.display = 'block';
      }
    });

    on(profileBtn, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); profileBtn.click(); } });

    // clicking outside hides dropdown
    on(document, 'click', (e) => {
      if (!profileDropdown.contains(e.target) && !e.target.closest('.js-settings-btn') && !e.target.closest('#profile-button')) {
        profileDropdown.style.display = 'none';
        profileDropdown.removeAttribute('data-open');
      }
    });

    on(profileDropdown, 'click', (e) => e.stopPropagation());
  }

  /* ----------------- SIDE PANEL FLOW ----------------- */
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
      // move search into panel placeholder when opened on desktop/mobile
      if (panelSearchPlaceholder && mainSearchContainer && !panelSearchPlaceholder.contains(mainSearchContainer)) {
        panelSearchPlaceholder.hidden = false;
        panelSearchPlaceholder.appendChild(mainSearchContainer);
      }
    }
    function hideSidePanel() {
      sidePanel.classList.remove('open');
      const topWrapper = $('#top-search-wrapper');
      if (topWrapper && mainSearchContainer && !topWrapper.contains(mainSearchContainer)) {
        topWrapper.appendChild(mainSearchContainer);
      }
    }

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

    const endNavBtn = $('#end-navigation-btn');
    if (endNavBtn) on(endNavBtn, 'click', (e) => { e.preventDefault(); stopNavigation(); });

    const swapBtn = $('#swap-btn');
    const panelFrom = $('#panel-from-input');
    const panelTo = $('#panel-to-input');
    if (swapBtn && panelFrom && panelTo) on(swapBtn, 'click', (e) => {
      e.preventDefault();
      const a = panelFrom.value; panelFrom.value = panelTo.value; panelTo.value = a; panelFrom.focus();
    });

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

    if (panelGrabber) {
      panelGrabber.style.cursor = 'pointer';
      panelGrabber.setAttribute('role', 'button');
      panelGrabber.setAttribute('tabindex', '0');
      on(panelGrabber, 'click', () => sidePanel.classList.toggle('open'));
      on(panelGrabber, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') panelGrabber.click(); });
    }

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
          const li = document.createElement('li'); li.textContent = s; stepsList.appendChild(li);
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

  /* ----------------- SEARCH SUGGESTIONS ----------------- */
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
      on(inputEl, 'keydown', (e) => { if (e.key === 'Escape') hide(); });

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
          on(row, 'click', (ev) => { ev.preventDefault(); inputEl.value = text; hide(); inputEl.dispatchEvent(new Event('change', { bubbles: true })); });
          on(row, 'keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); row.click(); } });
          containerEl.appendChild(row);
        });
        containerEl.style.display = items.length ? 'block' : 'none';
      }

      function hide() { containerEl.innerHTML = ''; containerEl.style.display = 'none'; }

      function generateSuggestions(q) {
        const seed = ['Coffee Shop','Gas Station','Library','City Hall','Museum','Park','Restaurant','Hotel'];
        const lower = q.toLowerCase();
        const matches = seed.filter(s => s.toLowerCase().includes(lower));
        return [q, ...matches.filter(m => m.toLowerCase() !== lower).slice(0, 5)];
      }
    }
  }

  /* ----------------- MISC BUTTON ENHANCEMENTS ----------------- */
  function initButtonEnhancements() {
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

    const infoSave = $('#info-save-btn');
    if (infoSave) on(infoSave, 'click', (e) => {
      e.preventDefault();
      const pressed = infoSave.getAttribute('aria-pressed') === 'true';
      infoSave.setAttribute('aria-pressed', String(!pressed));
      infoSave.classList.toggle('saved', !pressed);
      flash('Saved toggled');
    });

    const shareRoute = $('#share-route-btn');
    if (shareRoute) on(shareRoute, 'click', async (e) => {
      e.preventDefault();
      const shareUrl = window.location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          flash('Copied link to clipboard');
        } else {
          const ta = document.createElement('textarea'); ta.value = shareUrl; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          flash('Copied link to clipboard (fallback)');
        }
      } catch (err) {
        console.warn('share: copy failed', err); flash('Copy failed');
      }
    });

    $$('a[href="#"]').forEach(a => on(a, 'click', (e) => e.preventDefault()));
  }

  /* ----------------- ACCESSIBILITY POLYFILLS ----------------- */
  function initAccessibilityPolyfills() {
    $$('svg').forEach(svg => {
      const p = svg.parentElement;
      if (!p) return;
      const tag = p.tagName.toLowerCase();
      if ((tag === 'div' || tag === 'span') && !p.hasAttribute('role')) p.setAttribute('role', 'button');
      if ((tag === 'div' || tag === 'span') && !p.hasAttribute('tabindex')) p.tabIndex = p.tabIndex || 0;
      if ((tag === 'div' || tag === 'span')) {
        p.style.cursor = p.style.cursor || 'pointer';
        on(p, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.click(); } });
      }
    });
  }

  /* ----------------- GLOBAL HANDLERS ----------------- */
  function initGlobalHandlers() {
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const pd = $('#profile-dropdown'); if (pd) pd.style.display = 'none';
        const sm = $('#settings-menu'); if (sm) sm.classList.remove('open');
        const mo = $('#menu-overlay'); if (mo) mo.classList.remove('open');
      }
    });

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
  function flash(msg) { if (window._mapsFlash) window._mapsFlash(msg); }

})();
