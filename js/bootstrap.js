// Polyfill requestIdleCallback for wider coverage
    window.requestIdleCallback ||= (cb)=>setTimeout(()=>cb({timeRemaining:()=>50, didTimeout:false}), 1);

    // Remove inert/hidden as soon as main thread is free to hydrate UI progressively
    const reveal = (id)=>{ const el=document.getElementById(id); if(el){ el.hidden=false; el.inert=false; }};

    // Show UI chrome immediately after DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      // Keep heavy panels inert until app signals ready
      // Map skeleton will be removed by map init
      // Preconnect any auth domain late (keeps first paint clean)
      const link = document.createElement('link');
      link.rel = 'preconnect'; link.href = 'https://accounts.theboiismc.com'; link.crossOrigin = '';
      requestIdleCallback(()=>document.head.appendChild(link));
    });

    // After the page becomes interactive, progressively reveal UI
    window.addEventListener('load', () => {
      requestIdleCallback(() => {
        reveal('side-panel');
        reveal('navigation-status');
        reveal('settings-menu');
        reveal('menu-overlay');
      }, { timeout: 3000 });
    });

    // If your map init removes the skeleton, keep a safety timeout
    setTimeout(() => {
      const sk = document.getElementById('map-skeleton');
      if (sk && window.maplibregl) sk.remove();
    }, 5000);

    // Optional: register service worker after idle (keeps FCP/TTI clean)
    if ('serviceWorker' in navigator) {
      requestIdleCallback(() => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
    }
