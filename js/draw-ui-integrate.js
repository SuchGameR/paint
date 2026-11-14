/**
 * Expand new-ui menus with full engine feature surface (non-destructive).
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function send(msg) {
    var f = document.getElementById('engine-frame');
    if (f && f.contentWindow) {
      f.contentWindow.postMessage(Object.assign({ source: 'verse-new-ui' }, msg), '*');
    }
  }

  var MENU_HTML = `
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">ファイル<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="new">新規作成</button></li>
              <li><button class="menu-command" type="button" data-act="open">開く…</button></li>
              <li><button class="menu-command" type="button" data-act="insert">画像を挿入</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="export">書き出し (PNG/SVG)</button></li>
              <li><button class="menu-command" type="button" data-act="export-region">範囲を書き出し…</button></li>
              <li><button class="menu-command" type="button" data-act="save-project">プロジェクト保存</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="to-motion">モーションへ送る</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">編集<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="undo">元に戻す</button></li>
              <li><button class="menu-command" type="button" data-act="redo">やり直し</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="cut">切り取り</button></li>
              <li><button class="menu-command" type="button" data-act="copy">コピー</button></li>
              <li><button class="menu-command" type="button" data-act="paste">貼り付け</button></li>
              <li><button class="menu-command" type="button" data-act="duplicate">複製</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="delete">選択を削除</button></li>
              <li><button class="menu-command" type="button" data-act="clear">キャンバスクリア</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">選択<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="select-all">すべて選択</button></li>
              <li><button class="menu-command" type="button" data-act="deselect">選択解除</button></li>
              <li><button class="menu-command" type="button" data-act="tool-select">選択ツール</button></li>
              <li><button class="menu-command" type="button" data-act="tool-lasso">投げ縄</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">オブジェクト<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="group">グループ化</button></li>
              <li><button class="menu-command" type="button" data-act="ungroup">グループ解除</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="bring-front">最前面へ</button></li>
              <li><button class="menu-command" type="button" data-act="bring-forward">前面へ</button></li>
              <li><button class="menu-command" type="button" data-act="send-backward">背面へ</button></li>
              <li><button class="menu-command" type="button" data-act="send-back">最背面へ</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="flip-h">左右反転</button></li>
              <li><button class="menu-command" type="button" data-act="flip-v">上下反転</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="mask">マスクに設定</button></li>
              <li><button class="menu-command" type="button" data-act="clear-mask">マスク解除</button></li>
              <li><button class="menu-command" type="button" data-act="to-raster">ラスター化</button></li>
              <li><button class="menu-command" type="button" data-act="to-vector">ベクター化</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">効果<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="effect-more">Effect More…</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">表示<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="zoom-in">ズームイン</button></li>
              <li><button class="menu-command" type="button" data-act="zoom-out">ズームアウト</button></li>
              <li><button class="menu-command" type="button" data-act="zoom-reset">ズームリセット</button></li>
              <li><button class="menu-command" type="button" data-act="zoom-fit">画面に合わせる</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="grid">グリッド表示</button></li>
              <li><button class="menu-command" type="button" data-act="pixel-grid">ピクセルグリッド</button></li>
              <li><button class="menu-command" type="button" data-act="mode-vector">ベクターモード</button></li>
              <li><button class="menu-command" type="button" data-act="mode-paint">描画モード</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">パネル<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="panel-color">カラーパレット</button></li>
              <li><button class="menu-command" type="button" data-act="panel-layers">レイヤー</button></li>
              <li><button class="menu-command" type="button" data-act="panel-regions">リージョン</button></li>
              <li><button class="menu-command" type="button" data-act="panel-props">プロパティ</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="add-layer">レイヤー追加</button></li>
              <li><button class="menu-command" type="button" data-act="pressure-on">筆圧オン</button></li>
              <li><button class="menu-command" type="button" data-act="settings">設定</button></li>
              <li><button class="menu-command" type="button" data-act="region-save">リージョン保存</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">ツール<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="tool-brush">ブラシ</button></li>
              <li><button class="menu-command" type="button" data-act="tool-pen">ベジェペン</button></li>
              <li><button class="menu-command" type="button" data-act="tool-eraser">消しゴム</button></li>
              <li><button class="menu-command" type="button" data-act="tool-fill">塗りつぶし</button></li>
              <li><button class="menu-command" type="button" data-act="tool-text">テキスト</button></li>
              <li><button class="menu-command" type="button" data-act="tool-shapes">図形</button></li>
              <li><button class="menu-command" type="button" data-act="tool-eyedropper">スポイト</button></li>
              <li><button class="menu-command" type="button" data-act="tool-hand">手のひら</button></li>
            </ul>
          </details>
        </li>
        <li class="menu-divider"></li>
        <li><button class="exit-command" type="button" data-act="quit">終了</button></li>
  `;

  function closeMenus() {
    $all('details.navigation-submenu[open], details.main-navigation[open]').forEach(function (d) {
      d.open = false;
    });
  }

  function handleAct(act) {
    if (!act) return;
    if (act === 'quit') { location.href = './index.html'; return; }
    if (act === 'to-motion') {
      send({ type: 'menu', action: 'export-png-session' });
      setTimeout(function () { location.href = './motion.html?w=1920&h=1080&fps=24'; }, 200);
      return;
    }
    if (act.indexOf('tool-') === 0) {
      var tool = act.slice(5);
      send({ type: 'tool', tool: tool === 'fill' ? 'bucket' : tool });
      return;
    }
    if (act === 'panel-color' || act === 'panel-layers' || act === 'panel-regions' || act === 'panel-props') {
      var pid = act.replace('panel-', '');
      if (window.VersePanels) window.VersePanels.toggle(pid);
      return;
    }
    if (act === 'zoom-in') { send({ type: 'zoom', dir: 'in' }); return; }
    if (act === 'zoom-out') { send({ type: 'zoom', dir: 'out' }); return; }
    if (act === 'zoom-reset' || act === 'zoom-fit') { send({ type: 'zoom', dir: 'reset' }); return; }
    send({ type: 'menu', action: act });
  }

  function integrate() {
    var nav = document.querySelector('.navigation-menu');
    if (nav) nav.innerHTML = MENU_HTML;

    $all('.menu-command, .exit-command').forEach(function (btn) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMenus();
        handleAct(btn.getAttribute('data-act') || '');
      });
    });

    $all('.tool-button[data-tool]').forEach(function (btn) {
      if (btn.__vpWired) return;
      btn.__vpWired = true;
      btn.addEventListener('click', function () {
        send({ type: 'tool', tool: btn.getAttribute('data-tool') });
      });
    });
  }

  if (document.querySelector('.navigation-menu')) integrate();
  else {
    document.addEventListener('DOMContentLoaded', integrate);
    setTimeout(integrate, 0);
    setTimeout(integrate, 100);
  }
})();
