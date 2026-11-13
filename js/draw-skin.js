/**
 * UI skin only — does not remove features, only rearranges / simplifies chrome
 */
(function () {
  function boot() {
    var animBtn = document.getElementById('mode-anim-btn');
    if (animBtn) animBtn.remove();
    var animBar = document.getElementById('anim-bar');
    if (animBar) { animBar.style.display = 'none'; animBar.setAttribute('aria-hidden', 'true'); }

    var brand = document.querySelector('#app-menubar > span, #app-menubar [translate="no"]');
    if (brand) {
      brand.style.cursor = 'pointer';
      brand.title = 'メニュー';
      brand.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var fileBtn = document.querySelector('#app-menubar [data-menu="file"] .menu-btn, #app-menubar .menu-root[data-menu="file"] > button');
        if (fileBtn) fileBtn.click();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
    document.addEventListener('DOMContentLoaded', boot);
  }
  setTimeout(boot, 800);
})();
