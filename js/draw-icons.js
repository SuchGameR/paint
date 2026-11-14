/**
 * Load Lucide (or text fallback) after new-ui is mounted via DOMParser.
 */
(function () {
  'use strict';

  var FALLBACK = {
    'mouse-pointer-2': '↖',
    pen: '✎',
    eraser: '⌫',
    lasso: '○',
    pipette: '💧',
    type: 'T',
    shapes: '△',
    'paint-bucket': '◼',
    hand: '✋',
    'settings-2': '⚙',
    plus: '+',
    copy: '⧉',
    move: '✥',
    'maximize-2': '⛶',
    image: '🖼',
    'pen-tool': '✎',
    'lasso-select': '○',
    'square-dashed': '□',
    waypoints: '⬡',
    'scan-search': '⌕',
    minus: '─',
    square: '□',
    circle: '○',
    hexagon: '⬡',
    star: '★'
  };

  function applyFallback() {
    document.querySelectorAll('[data-lucide]').forEach(function (el) {
      if (el.querySelector('svg')) return;
      var name = el.getAttribute('data-lucide') || '';
      var label = FALLBACK[name] || '•';
      el.textContent = label;
      el.style.fontStyle = 'normal';
      el.style.fontSize = el.classList.contains('tool-icon') ? '16px' : '12px';
      el.style.lineHeight = '1';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
    });
  }

  function createIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
        return true;
      } catch (e) {
        console.warn('lucide.createIcons failed', e);
      }
    }
    return false;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  var CDNS = [
    'https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js',
    'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js',
    'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js'
  ];

  function boot() {
    if (createIcons()) return;

    var i = 0;
    function tryNext() {
      if (i >= CDNS.length) {
        console.warn('Lucide CDN failed; using text fallbacks for tool icons.');
        applyFallback();
        return;
      }
      loadScript(CDNS[i++])
        .then(function () {
          if (!createIcons()) applyFallback();
          setTimeout(function () { createIcons() || applyFallback(); }, 400);
        })
        .catch(tryNext);
    }
    tryNext();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
  setTimeout(boot, 500);
  setTimeout(function () { createIcons() || applyFallback(); }, 1500);
})();
