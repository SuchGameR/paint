/** Nest object submenu + ensure panel menu works after integrate */
(function () {
  function enhance() {
    var nav = document.querySelector('.navigation-menu');
    if (!nav) return;
    var items = nav.querySelectorAll('.navigation-submenu');
    items.forEach(function (det) {
      var sum = det.querySelector(':scope > .submenu-toggle');
      if (!sum || sum.textContent.indexOf('オブジェクト') < 0) return;
      var ul = det.querySelector(':scope > .submenu-menu');
      if (!ul || ul.querySelector('.nav-nested')) return;
      ul.innerHTML =
        '<li><details class="nav-nested"><summary>グループ <span class="submenu-chevron" aria-hidden="true"></span></summary><ul>' +
        '<li><button class="menu-command" type="button" data-act="group">グループ化</button></li>' +
        '<li><button class="menu-command" type="button" data-act="ungroup">グループ解除</button></li></ul></details></li>' +
        '<li><details class="nav-nested"><summary>重ね順 <span class="submenu-chevron" aria-hidden="true"></span></summary><ul>' +
        '<li><button class="menu-command" type="button" data-act="bring-front">最前面へ</button></li>' +
        '<li><button class="menu-command" type="button" data-act="bring-forward">前面へ</button></li>' +
        '<li><button class="menu-command" type="button" data-act="send-backward">背面へ</button></li>' +
        '<li><button class="menu-command" type="button" data-act="send-back">最背面へ</button></li></ul></details></li>' +
        '<li><details class="nav-nested"><summary>変形 <span class="submenu-chevron" aria-hidden="true"></span></summary><ul>' +
        '<li><button class="menu-command" type="button" data-act="flip-h">左右反転</button></li>' +
        '<li><button class="menu-command" type="button" data-act="flip-v">上下反転</button></li></ul></details></li>' +
        '<li><details class="nav-nested"><summary>マスク・変換 <span class="submenu-chevron" aria-hidden="true"></span></summary><ul>' +
        '<li><button class="menu-command" type="button" data-act="mask">マスクに設定</button></li>' +
        '<li><button class="menu-command" type="button" data-act="clear-mask">マスク解除</button></li>' +
        '<li><button class="menu-command" type="button" data-act="to-raster">ラスター化</button></li>' +
        '<li><button class="menu-command" type="button" data-act="to-vector">ベクター化</button></li></ul></details></li>';
      ul.querySelectorAll('.menu-command').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var act = btn.getAttribute('data-act');
          var f = document.getElementById('engine-frame');
          if (f && f.contentWindow) {
            f.contentWindow.postMessage({ source: 'verse-new-ui', type: 'menu', action: act }, '*');
          }
        });
      });
    });
  }
  setTimeout(enhance, 200);
  setTimeout(enhance, 800);
})();
