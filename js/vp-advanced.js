(function () {
  'use strict';

  var PREFS_KEY = 'verse.vpAdvanced';
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { prefs = {}; }
  if (prefs.autosave == null) prefs.autosave = true;
  if (prefs.compactDock == null) prefs.compactDock = true;
  if (prefs.rightClickMenu == null) prefs.rightClickMenu = true;

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
    try { localStorage.setItem('verse.vp.autosave', prefs.autosave ? 'true' : 'false'); } catch (e) {}
  }

  function frame() {
    return document.getElementById('engine-frame');
  }

  function send(message) {
    var f = frame();
    if (f && f.contentWindow) f.contentWindow.postMessage(Object.assign({ source: 'verse-new-ui' }, message), '*');
  }

  function showToast(text, kind) {
    var host = document.getElementById('vp-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'vp-toast-host';
      document.body.appendChild(host);
    }
    var toast = document.createElement('div');
    toast.className = 'vp-toast' + (kind ? ' vp-toast--' + kind : '');
    toast.textContent = text;
    host.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 220);
    }, 2200);
  }

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function injectStyles() {
    if (document.getElementById('vp-advanced-style')) return;
    var style = document.createElement('style');
    style.id = 'vp-advanced-style';
    style.textContent = [
      '.palette-stage[data-design="wheel"]{grid-template-rows:132px 16px;height:158px;place-items:center;background:transparent;}',
      '.palette-stage[data-design="wheel"] .palette-sv{width:132px;height:132px;max-width:100%;max-height:132px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#fff 0%,rgba(255,255,255,0) 70%),conic-gradient(from 90deg,#f00 0deg,#ff0 60deg,#0f0 120deg,#0ff 180deg,#00f 240deg,#f0f 300deg,#f00 360deg);box-shadow:inset 0 0 0 1px #fff2,0 6px 18px #0006;}',
      '.palette-stage[data-design="wheel"] .palette-cursor{width:14px;height:14px;border-color:#fff;box-shadow:0 0 0 1px #000b,0 2px 6px #0009;}',
      '.vp-wheel-value{display:none;width:132px;align-items:center;gap:6px;color:#8f9a91;font-size:9px;}',
      '.palette-stage[data-design="wheel"] .vp-wheel-value{display:flex;}',
      '.vp-wheel-value input{flex:1;height:12px;accent-color:#22c55e;cursor:pointer;}',
      '#vp-toast-host{position:fixed;left:50%;bottom:28px;z-index:200;display:flex;flex-direction:column;gap:6px;transform:translateX(-50%);pointer-events:none;}',
      '.vp-toast{padding:8px 14px;border:1px solid #355040;border-radius:999px;background:#111a14f2;color:#dff7e6;font:12px/1.35 var(--system-font,system-ui,sans-serif);box-shadow:0 10px 28px #0008;opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;}',
      '.vp-toast.is-visible{opacity:1;transform:translateY(0);}',
      '.vp-toast--error{border-color:#5a3232;color:#ffd7d7;}',
      '#vp-cursor-menu{position:fixed;z-index:210;min-width:188px;padding:6px;border:1px solid #344239;border-radius:11px;background:#111712f5;box-shadow:0 18px 44px #000c;backdrop-filter:blur(10px);font:12px/1.3 var(--system-font,system-ui,sans-serif);color:#dbe6de;}',
      '#vp-cursor-menu .vp-menu-title{padding:5px 8px 6px;color:#88988c;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}',
      '#vp-cursor-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;}',
      '#vp-cursor-menu button:hover,#vp-cursor-menu button:focus-visible{outline:none;background:#22c55e22;color:#fff;}',
      '#vp-cursor-menu button[aria-checked="true"]{color:#5ee08a;}',
      '#vp-cursor-menu .vp-menu-key{margin-left:auto;color:#7f8d83;font-size:9px;}',
      '#vp-cursor-menu .vp-menu-sep{height:1px;margin:5px 4px;background:#2c3931;}',
      '#vp-cursor-menu kbd{font:inherit;color:#8c9a8f;}',
      '.vp-settings-grid{display:grid;gap:8px;margin-top:10px;}',
      '.vp-settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:1px solid #2c3831;border-radius:9px;background:#121713;}',
      '.vp-settings-row span{min-width:0;}',
      '.vp-settings-row strong{display:block;font-size:12px;color:#dfe7e1;font-weight:600;}',
      '.vp-settings-row small{display:block;margin-top:2px;color:#8a978d;font-size:10px;line-height:1.4;}',
      '.vp-settings-row input[type="checkbox"]{width:34px;height:18px;accent-color:#22c55e;flex:0 0 auto;}',
      '.vp-settings-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}',
      '.vp-settings-btn{padding:8px 12px;border:1px solid #34453a;border-radius:8px;background:#141b16;color:#dfe7e1;font:11px var(--system-font,system-ui,sans-serif);cursor:pointer;}',
      '.vp-settings-btn:hover,.vp-settings-btn:focus-visible{outline:none;border-color:#4b6b56;background:#1a241d;}',
      '.vp-settings-btn--accent{border-color:#2f7a4b;background:#16311f;color:#c8f7d8;}'
    ].join('');
    document.head.appendChild(style);
  }

  // ===== Color wheel value control =====
  function hexToHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: h, s: max ? d / max : 0, v: max };
  }

  function hsvToHex(h, s, v) {
    var c = v * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    function toHex(n) { return Math.round((n + m) * 255).toString(16).padStart(2, '0'); }
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function setupWheelValue() {
    var stage = document.querySelector('#palette-stage');
    var input = document.querySelector('#palette-color');
    if (!stage || !input) return;
    if (stage.querySelector('.vp-wheel-value')) return;
    var wrap = document.createElement('label');
    wrap.className = 'vp-wheel-value';
    wrap.title = '明るさ';
    var label = document.createElement('span');
    label.textContent = '明';
    var range = document.createElement('input');
    range.type = 'range';
    range.min = '5';
    range.max = '100';
    range.step = '1';
    range.value = String(Math.round((hexToHsv(input.value || '#ff6600').v || 1) * 100));
    range.setAttribute('aria-label', '色の明るさ');
    range.addEventListener('input', function () {
      var hsv = hexToHsv(input.value || '#ff6600');
      input.value = hsvToHex(hsv.h, hsv.s, Number(range.value) / 100);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrap.append(label, range);
    stage.appendChild(wrap);
    function sync() {
      var hsv = hexToHsv(input.value || '#ff6600');
      range.value = String(Math.max(5, Math.round(hsv.v * 100)));
    }
    input.addEventListener('input', sync);
    window.addEventListener('message', function (ev) {
      if (ev.data && ev.data.source === 'verse-engine' && ev.data.type === 'state' && ev.data.color) sync();
    });
    sync();
  }

  // ===== Right-click cursor shortcut menu =====
  var engineState = { selectedCount: 0, tool: 'cursor' };
  var cursorMenu = null;

  function closeCursorMenu() {
    if (cursorMenu) { cursorMenu.remove(); cursorMenu = null; }
  }

  var CURSOR_TOOLS = [
    ['cursor', 'カーソル / 選択', 'V'],
    ['brush', 'ペン / ブラシ', 'B'],
    ['eraser', '消しゴム', 'E'],
    ['lasso', '投げ縄選択', 'L'],
    ['eyedropper', 'スポイト', 'I'],
    ['hand', '手のひら・移動', 'H'],
    ['text', 'テキスト', 'T'],
    ['shapes', '図形', 'R'],
    ['bucket', 'バケツ塗り', 'G']
  ];

  function buildCursorMenu(x, y) {
    closeCursorMenu();
    var menu = document.createElement('div');
    menu.id = 'vp-cursor-menu';
    menu.setAttribute('role', 'menu');
    var title = document.createElement('div');
    title.className = 'vp-menu-title';
    title.textContent = 'カーソルモード';
    menu.appendChild(title);

    CURSOR_TOOLS.forEach(function (tool) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', String(engineState.tool === tool[0]));
      btn.innerHTML = '<span>' + tool[1] + '</span><span class="vp-menu-key"><kbd>' + tool[2] + '</kbd></span>';
      btn.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
      btn.addEventListener('click', function () {
        var target = document.querySelector('.tool-button[data-tool="' + tool[0] + '"]');
        if (target) target.click();
        else send({ type: 'tool', tool: tool[0] });
        closeCursorMenu();
      });
      menu.appendChild(btn);
    });

    var sep = document.createElement('div');
    sep.className = 'vp-menu-sep';
    menu.appendChild(sep);

    [['undo', '元に戻す', 'Ctrl+Z'], ['redo', 'やり直す', 'Ctrl+Y'], ['zoom-reset', '表示をリセット', '0'], ['save', 'プロジェクトを保存 (.vpc)', 'Ctrl+S']].forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = '<span>' + item[1] + '</span><span class="vp-menu-key">' + item[2] + '</span>';
      btn.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
      btn.addEventListener('click', function () {
        closeCursorMenu();
        if (item[0] === 'save') send({ type: 'project', action: 'save' });
        else send({ type: 'menu', action: item[0] });
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    var left = Math.max(6, Math.min(x, window.innerWidth - rect.width - 6));
    var top = Math.max(6, Math.min(y, window.innerHeight - rect.height - 6));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    cursorMenu = menu;
  }

  function attachFrameHooks() {
    var f = frame();
    if (!f) return;
    f.addEventListener('load', function () { setTimeout(attachFrameDocument, 80); });
    attachFrameDocument();
    function attachFrameDocument() {
      var doc;
      try { doc = f.contentDocument; } catch (e) { return; }
      if (!doc || doc.__vpAdvancedAttached) return;
      doc.__vpAdvancedAttached = true;
      doc.addEventListener('contextmenu', function (event) {
        if (!prefs.rightClickMenu) return;
        if (engineState.selectedCount > 0) return;
        event.preventDefault();
        event.stopPropagation();
        var frect = f.getBoundingClientRect();
        buildCursorMenu(frect.left + event.clientX, frect.top + event.clientY);
      }, true);
      try {
        f.contentWindow.addEventListener('versepaint:autosaved', function () { showToast('自動保存しました'); });
        f.contentWindow.addEventListener('versepaint:autorestore', function () { showToast('前回の自動保存を復元しました'); });
      } catch (e) {}
    }
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.source !== 'verse-engine') return;
    if (data.type === 'state') {
      engineState.selectedCount = data.selectedCount || 0;
      engineState.tool = data.tool || engineState.tool;
    } else if (data.type === 'brush-export' && data.payload) {
      var name = String(data.payload.name || 'brush').replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, '_') + '.vpb';
      download(name, new Blob([JSON.stringify(data.payload, null, 2)], { type: 'application/json' }));
      showToast('ブラシを書き出しました');
    } else if (data.type === 'brush-imported') {
      showToast('ブラシ「' + (data.name || '') + '」を読み込みました');
    } else if (data.type === 'brush-error') {
      showToast('ブラシの読み込みに失敗しました', 'error');
    } else if (data.type === 'autosave-restored') {
      showToast(data.ok ? '自動保存を復元しました' : '自動保存が見つかりません', data.ok ? '' : 'error');
    }
  });

  document.addEventListener('pointerdown', function (event) {
    if (cursorMenu && !cursorMenu.contains(event.target)) closeCursorMenu();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeCursorMenu();
  }, true);
  window.addEventListener('resize', closeCursorMenu);
  window.addEventListener('blur', closeCursorMenu);

  // ===== Settings additions =====
  function injectSettings() {
    var content = document.querySelector('#settings-dialog .settings-modal-content');
    if (!content || document.getElementById('vp-advanced-settings')) return;
    var section = document.createElement('section');
    section.className = 'settings-modal-section';
    section.id = 'vp-advanced-settings';
    section.innerHTML = [
      '<h3>プロジェクトと自動保存</h3>',
      '<p class="settings-modal-description">.vpc はキャンバス・レイヤー・ブラシ・プレビューをまとめたVersePaintのプロジェクト形式です。編集中は自動保存され、次回起動時に復元できます。</p>',
      '<div class="vp-settings-grid">',
      '  <label class="vp-settings-row"><span><strong>自動保存</strong><small>30秒ごとと画面を離れたときに保存します</small></span><input type="checkbox" id="vp-autosave-toggle"></label>',
      '</div>',
      '<div class="vp-settings-actions">',
      '  <button class="vp-settings-btn vp-settings-btn--accent" type="button" id="vp-save-project">プロジェクトを保存 (.vpc)</button>',
      '  <button class="vp-settings-btn" type="button" id="vp-open-project">プロジェクトを開く</button>',
      '  <button class="vp-settings-btn" type="button" id="vp-restore-autosave">自動保存を復元</button>',
      '</div>',
      '<input type="file" id="vp-project-file" accept=".vpc,.vpcz,.zip,.json" hidden>',
      '<h3 style="margin-top:20px">ブラシ</h3>',
      '<p class="settings-modal-description">VPB形式のブラシを読み込み、現在のブラシ設定を書き出せます。読み込んだブラシはこのプロジェクトと .vpc に保存されます。</p>',
      '<div class="vp-settings-actions">',
      '  <button class="vp-settings-btn" type="button" id="vp-import-brush">ブラシを読み込む (.vpb)</button>',
      '  <button class="vp-settings-btn" type="button" id="vp-export-brush">現在のブラシを書き出す</button>',
      '</div>',
      '<input type="file" id="vp-brush-file" accept=".vpb,.json,application/json" hidden>',
      '<h3 style="margin-top:20px">ワークスペース</h3>',
      '<div class="vp-settings-grid">',
      '  <label class="vp-settings-row"><span><strong>ドックをアイコン表示</strong><small>ヘッダー・フッター・ツール内のセクションを小さなアイコンにし、クリックでカード表示します</small></span><input type="checkbox" id="vp-compact-dock"></label>',
      '  <label class="vp-settings-row"><span><strong>右クリックのカーソルメニュー</strong><small>選択がない場所で右クリックするとツール切り替えメニューを表示します</small></span><input type="checkbox" id="vp-right-click"></label>',
      '</div>'
    ].join('');
    var footer = content.querySelector('#panel-settings-title') && content.querySelector('#panel-settings-title').closest('.settings-modal-section');
    if (footer && footer.nextSibling) content.insertBefore(section, footer.nextSibling);
    else content.appendChild(section);

    var autosave = section.querySelector('#vp-autosave-toggle');
    var compact = section.querySelector('#vp-compact-dock');
    var rightClick = section.querySelector('#vp-right-click');
    autosave.checked = prefs.autosave !== false;
    compact.checked = prefs.compactDock !== false;
    rightClick.checked = prefs.rightClickMenu !== false;

    autosave.addEventListener('change', function () {
      prefs.autosave = autosave.checked;
      savePrefs();
      send({ type: 'settings', autosave: prefs.autosave });
      showToast(prefs.autosave ? '自動保存を有効にしました' : '自動保存を無効にしました');
    });
    compact.addEventListener('change', function () {
      prefs.compactDock = compact.checked;
      savePrefs();
      window.dispatchEvent(new CustomEvent('verse:vp-advanced', { detail: { compactDock: prefs.compactDock } }));
    });
    rightClick.addEventListener('change', function () {
      prefs.rightClickMenu = rightClick.checked;
      savePrefs();
      if (!prefs.rightClickMenu) closeCursorMenu();
    });

    section.querySelector('#vp-save-project').addEventListener('click', function () {
      send({ type: 'project', action: 'save' });
      showToast('プロジェクトを書き出しています');
    });
    var projectFile = section.querySelector('#vp-project-file');
    section.querySelector('#vp-open-project').addEventListener('click', function () { projectFile.click(); });
    projectFile.addEventListener('change', function () {
      var file = projectFile.files && projectFile.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        send({ type: 'project', action: 'open-file', name: file.name, buffer: reader.result });
        showToast('プロジェクトを読み込んでいます');
      };
      reader.readAsArrayBuffer(file);
      projectFile.value = '';
    });
    section.querySelector('#vp-restore-autosave').addEventListener('click', function () {
      send({ type: 'project', action: 'restore-autosave' });
    });

    var brushFile = section.querySelector('#vp-brush-file');
    section.querySelector('#vp-import-brush').addEventListener('click', function () { brushFile.click(); });
    brushFile.addEventListener('change', function () {
      var file = brushFile.files && brushFile.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          send({ type: 'brush', action: 'import', brush: parsed });
        } catch (e) {
          showToast('VPBファイルを解析できません', 'error');
        }
      };
      reader.readAsText(file);
      brushFile.value = '';
    });
    section.querySelector('#vp-export-brush').addEventListener('click', function () {
      send({ type: 'brush', action: 'export' });
    });
  }

  function boot() {
    injectStyles();
    setupWheelValue();
    injectSettings();
    attachFrameHooks();
    savePrefs();
    send({ type: 'settings', autosave: prefs.autosave !== false });
    setTimeout(setupWheelValue, 400);
    setTimeout(injectSettings, 800);
    setTimeout(attachFrameHooks, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 120); });
  else setTimeout(boot, 120);
})();
