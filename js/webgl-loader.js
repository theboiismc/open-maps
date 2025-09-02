/**
 * webgl-loader.js
 *
 * WebGL detection + progressive (lazy) map asset loader.
 * - Replaces only the #map container content with a friendly fallback when WebGL isn't usable.
 * - Lazy-loads MapLibre, Turf, and OIDC only when WebGL is acceptable.
 * - Exposes `initMapLoader()` on window so you can call it manually if desired.
 *
 * USAGE:
 * 1. Include this file near the end of <body> (defer is fine):
 *    <script src="js/webgl-loader.js" defer></script>
 *
 * 2. Provide your map initialization function on window:
 *    window.initMap = async function () { /* use global `maplibregl` here */ }
 *
 * 3. This loader auto-runs. To control it manually call:
 *    window.initMapLoader({ containerId: 'map', autoRetryOnLoad: true });
 *
 * NOTES:
 * - No telemetry. No extra external pings beyond loading vendor libs (if allowed).
 * - Keep heavy library <script> tags out of the head if you rely on this loader.
 */

(function () {
  'use strict';

  // ----- USER-CONFIG ----- change URLs if you host libs locally -----
  var LIBS = {
    maplibre: 'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
    turf: 'https://npmcdn.com/@turf/turf/turf.min.js',
    oidc: 'https://cdn.jsdelivr.net/npm/oidc-client-ts@2.2.0/dist/browser/oidc-client-ts.min.js',
    maplibreCSS: 'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css'
  };

  // ----- small helpers to inject scripts/styles and wait for them -----
  function loadScript(url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      if (options.async) s.async = true;
      if (options.defer || (!options.async && !options.defer)) s.defer = true;
      if (options.crossorigin) s.crossOrigin = options.crossorigin;
      // optional: set fetchPriority if available (non-essential)
      if (options.fetchpriority && ('fetchPriority' in HTMLScriptElement.prototype)) {
        try { s.fetchPriority = options.fetchpriority; } catch (e) {} // defensive
      }
      s.onload = function () { resolve(s); };
      s.onerror = function (e) { reject(new Error('Failed to load script: ' + url)); };
      document.head.appendChild(s);
    });
  }

  function loadStyle(url) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      // non-blocking swap technique
      link.media = 'print';
      link.onload = function () { link.media = 'all'; resolve(link); };
      link.onerror = function () { reject(new Error('Failed to load style: ' + url)); };
      document.head.appendChild(link);
    });
  }

  // ----- WebGL detection (returns an info object) -----
  function detectWebGL() {
    var info = {
      webglSupported: false,
      webglVersion: null, // 2 or 1
      renderer: null,
      vendor: null,
      majorPerformanceCaveat: false,
      softwareRendererLikely: false
    };

    try {
      var canvas = document.createElement('canvas');
      var ctx = null;

      // Try WebGL2 with strict flag to detect majorPerformanceCaveat early
      try { ctx = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }); } catch (e) { ctx = null; }
      if (ctx) {
        info.webglSupported = true;
        info.webglVersion = 2;
      } else {
        // Try WebGL1 strict
        try { ctx = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) || canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true }); } catch (e) { ctx = null; }
        if (ctx) {
          info.webglSupported = true;
          info.webglVersion = 1;
        } else {
          // Strict failed; attempt again without strict to detect software renderer
          try { ctx = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch (e) { ctx = null; }
          if (ctx) {
            info.webglSupported = true;
            // determine version
            if (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext) info.webglVersion = 2;
            else info.webglVersion = 1;
            info.majorPerformanceCaveat = true;
          } else {
            info.webglSupported = false;
          }
        }
      }

      // If we have a context, try to read renderer info (may be blocked)
      if (ctx && typeof ctx.getExtension === 'function') {
        try {
          var dbg = ctx.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            try {
              info.renderer = ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
              info.vendor = ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
            } catch (e) {
              // permission blocked or otherwise unavailable
            }
          } else {
            // fallback (less informative)
            try {
              info.renderer = ctx.getParameter(ctx.RENDERER);
              info.vendor = ctx.getParameter(ctx.VENDOR);
            } catch (e) { /* ignore */ }
          }

          var r = (info.renderer || '').toLowerCase();
          if (r.indexOf('swiftshader') !== -1 || r.indexOf('llvmpipe') !== -1 || r.indexOf('software') !== -1 || r.indexOf('gdi generic') !== -1) {
            info.softwareRendererLikely = true;
            info.majorPerformanceCaveat = true;
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // no webgl at all
    }

    return info;
  }

  // ----- build an accessible fallback UI inside #map (replaces only map root contents) -----
  function showWebGLFallback(container, info) {
    try {
      container.classList.add('map-fallback');
      // Clear container children but keep container element itself (so header/footer remain)
      while (container.firstChild) container.removeChild(container.firstChild);

      var wrapper = document.createElement('div');
      wrapper.setAttribute('role', 'status');
      wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;height:100%;padding:18px;text-align:center;color:inherit;background:transparent';

      var title = document.createElement('h2');
      title.textContent = '⚠️ WebGL unavailable';
      title.style.margin = '0 0 6px';

      var p = document.createElement('p');
      p.style.margin = 0;
      p.style.maxWidth = '52ch';
      if (info.webglSupported) {
        p.innerHTML = 'Your browser reports WebGL but it looks like a software or slow renderer. Try enabling hardware acceleration, switching browsers, or choose "Load anyway" (software fallback may be slow).';
      } else {
        p.innerHTML = 'Your browser or device does not appear to support WebGL. The interactive map requires WebGL. Try a modern browser or enable hardware acceleration.';
      }

      var controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.marginTop = '12px';
      controls.style.flexWrap = 'wrap';
      controls.style.justifyContent = 'center';

      var retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.textContent = 'Retry check';
      retryBtn.style.padding = '8px 10px';
      retryBtn.onclick = function () { attemptWebGLLoad(container); };

      var webglTest = document.createElement('a');
      webglTest.textContent = 'Open WebGL test';
      webglTest.href = 'https://get.webgl.org/';
      webglTest.target = '_blank';
      webglTest.rel = 'noopener noreferrer';
      webglTest.style.display = 'inline-block';
      webglTest.style.padding = '8px 10px';
      webglTest.style.border = '1px solid rgba(255,255,255,0.08)';
      webglTest.style.borderRadius = '6px';
      webglTest.style.color = 'inherit';
      webglTest.style.textDecoration = 'none';

      var forceBtn = document.createElement('button');
      forceBtn.type = 'button';
      forceBtn.textContent = 'Load map anyway (software)';
      forceBtn.style.padding = '8px 10px';
      forceBtn.onclick = function () { attemptWebGLLoad(container, { forceSoftware: true }); };

      controls.appendChild(retryBtn);
      controls.appendChild(webglTest);
      controls.appendChild(forceBtn);

      // Debug info (aria-hidden)
      var debug = document.createElement('pre');
      debug.style.opacity = '0.75';
      debug.style.fontSize = '12px';
      debug.style.maxWidth = '72ch';
      debug.style.overflowX = 'auto';
      debug.style.marginTop = '12px';
      debug.setAttribute('aria-hidden', 'true');
      try { debug.textContent = JSON.stringify(info, null, 2); } catch (e) { debug.textContent = 'debug unavailable'; }

      wrapper.appendChild(title);
      wrapper.appendChild(p);
      wrapper.appendChild(controls);
      wrapper.appendChild(debug);

      container.appendChild(wrapper);
    } catch (e) {
      // If fallback rendering fails, as last resort write a minimal message
      container.innerHTML = '<div style="padding:16px">Map not available (WebGL required).</div>';
    }
  }

  // ----- main: detect + lazy load libs + call user's init function -----
  function attemptWebGLLoad(container, opts) {
    opts = opts || { forceSoftware: false };

    return new Promise(function (resolve) {
      var info = detectWebGL();
      var acceptable = info.webglSupported && (!info.majorPerformanceCaveat || opts.forceSoftware);

      if (!acceptable) {
        showWebGLFallback(container, info);
        resolve({ ok: false, info: info });
        return;
      }

      // WebGL okish — lazy load resources
      // We try loading CSS first (non-blocking), then maplibre (required), and best-effort for other libs.
      loadStyle(LIBS.maplibreCSS).catch(function () { /* ignore style fail */ });

      // Start loading other libraries; ensure maplibre is awaited before init
      var oidcP = loadScript(LIBS.oidc, { defer: true }).catch(function () { return null; });
      var turfP = loadScript(LIBS.turf, { defer: true }).catch(function () { return null; });

      loadScript(LIBS.maplibre, { defer: true }).then(function () {
        // remove skeleton if present
        try {
          var sk = container.querySelector('#map-skeleton');
          if (sk) sk.remove();
        } catch (e) { /* ignore */ }

        // Call user's initMap/init function if provided. Allow async functions.
        var called = false;
        try {
          if (typeof window.initMap === 'function') {
            var maybePromise = window.initMap();
            if (maybePromise && typeof maybePromise.then === 'function') {
              maybePromise.then(function () { resolve({ ok: true, info: info }); }, function (e) { console.error('initMap rejected', e); resolve({ ok: false, info: info, error: e }); });
              called = true;
            } else {
              // sync completion
              resolve({ ok: true, info: info });
              called = true;
            }
          } else if (typeof window.init === 'function') {
            var mp = window.init();
            if (mp && typeof mp.then === 'function') {
              mp.then(function () { resolve({ ok: true, info: info }); }, function (e) { console.error('init rejected', e); resolve({ ok: false, info: info, error: e }); });
              called = true;
            } else {
              resolve({ ok: true, info: info });
              called = true;
            }
          }
        } catch (e) {
          console.error('Error while calling init function:', e);
          resolve({ ok: false, info: info, error: e });
          called = true;
        }

        // if no init function found, resolve but warn
        if (!called) {
          console.warn('WebGL OK & libs loaded but no initMap/init function found on window. Provide window.initMap() to initialize the map.');
          resolve({ ok: true, info: info, warning: 'no-init-found' });
        }

        // fire-and-forget wait for other libs (best-effort)
        Promise.all([oidcP, turfP]).catch(function () { /* ignore */ });
      }).catch(function (err) {
        console.error('Failed to load maplibre script:', err);
        showWebGLFallback(container, { ok: false, error: String(err) });
        resolve({ ok: false, info: info, error: err });
      });
    });
  }

  // ----- convenience initializer: ensures skeleton, tries once, retries on visibilitychange if desired -----
  function initMapLoader(opts) {
    opts = opts || {};
    var containerId = opts.containerId || 'map';
    var autoRetryOnLoad = (typeof opts.autoRetryOnLoad === 'undefined') ? true : !!opts.autoRetryOnLoad;

    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('initMapLoader: container not found: #' + containerId);
      return;
    }

    // add lightweight skeleton if missing to avoid CLS
    if (!container.querySelector('#map-skeleton')) {
      var sk = document.createElement('div');
      sk.id = 'map-skeleton';
      sk.className = 'map-skeleton';
      sk.textContent = 'Loading map…';
      container.appendChild(sk);
    }

    // Try once now (fast synchronous check)
    attemptWebGLLoad(container);

    // Optionally retry once when page becomes visible (user may have enabled accel)
    if (autoRetryOnLoad) {
      var retried = false;
      document.addEventListener('visibilitychange', function () {
        if (!retried && document.visibilityState === 'visible') {
          retried = true;
          // small delay to let system settle
          setTimeout(function () { attemptWebGLLoad(container); }, 250);
        }
      });
    }
  }

  // ----- expose API for manual control / debugging -----
  window.initMapLoader = initMapLoader;
  window.attemptWebGLLoad = attemptWebGLLoad;
  window.detectWebGL = detectWebGL;

  // ----- auto-run when DOM ready (defer-safe) -----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      // slight idle scheduling to keep first paint snappy
      if ('requestIdleCallback' in window) {
        requestIdleCallback(function () { initMapLoader({ containerId: 'map', autoRetryOnLoad: true }); });
      } else {
        setTimeout(function () { initMapLoader({ containerId: 'map', autoRetryOnLoad: true }); }, 50);
      }
    });
  } else {
    // already ready
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { initMapLoader({ containerId: 'map', autoRetryOnLoad: true }); });
    } else {
      setTimeout(function () { initMapLoader({ containerId: 'map', autoRetryOnLoad: true }); }, 50);
    }
  }

})();
