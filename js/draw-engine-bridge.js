/**
 * Inside engine iframe — full VersePaint features, chrome hidden, parent drives UI
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function click(el) {
    if (!el) return false;
    el.click();
    return true;
  }

  var TOOL_MAP = {
    cursor: 'tool-select',
    select: 'tool-select',
    brush: 'tool-brush',
    pen: 'tool-pen',
    eraser: 'tool-eraser',
    hand: 'tool-hand',
    eyedropper: 'tool-eyedropper',
    bucket: 'tool-fill',
    fill: 'tool-fill',
    text: 'tool-text',
    shapes: 'tool-shapes',
    lasso: 'tool-select'
  };

  function hideChrome() {
    document.body.classList.add('engine-embedded');
    [
      'start-screen', 'app-menubar', 'top-bar', 'left-toolbar', 'left-paint-panel',
      'compact-tools', 'anim-bar', 'status-bar', 'mode-anim-btn', 'hud-coords'
    ].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
    var cc = $('canvas-container');
    if (cc) {
      cc.style.cssText = 'position:fixed;inset:0;left:0;top:0;right:0;bottom:0;width:100%;height:100%;margin:0;border:none;';
    }
  }

  function ensureInfiniteAndStart() {
    var inf = $('start-infinite');
    if (inf) {
      inf.checked = true;
      inf.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var btn = $('btn-start-create');
    if (btn) btn.click();
    var ss = $('start-screen');
    if (ss) ss.style.display = 'none';
    hideChrome();
  }

  function setTool(name) {
    var id = TOOL_MAP[name] || TOOL_MAP.brush;
    click($(id));
    if (name === 'brush' || name === 'eraser' || name === 'pen') click($('mode-paint-btn'));
    if (name === 'cursor' || name === 'select' || name === 'shapes' || name === 'text' || name === 'lasso') {
      click($('mode-vector-btn'));
    }
  }

  function setColor(hex) {
    if (!hex) return;
    if (String(hex).startsWith('rgb')) {
      var m = String(hex).match(/\d+/g);
      if (m) hex = '#' + m.slice(0, 3).map(function (n) {
        return Number(n).toString(16).padStart(2, '0');
      }).join('');
    }
    document.querySelectorAll('input[type="color"], #brush-panel-color').forEach(function (inp) {
      try {
        inp.value = hex;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    });
  }

  function setBrushSize(n) {
    n = Number(n);
    if (!n) return;
    document.querySelectorAll('#size-slider-left, #brush-size, input[type="range"][id*="size"]').forEach(function (s) {
      s.value = String(n);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function menuAction(action) {
    var idMap = {
      undo: 'btn-undo',
      redo: 'btn-redo',
      export: 'btn-export',
      clear: 'btn-clear',
      open: 'btn-load-project',
      insert: 'btn-insert-image',
      grid: 'btn-grid-toggle'
    };
    if (idMap[action]) {
      click($(idMap[action]));
      return;
    }
    var keyMap = {
      undo: { key: 'z', ctrlKey: true },
      redo: { key: 'z', ctrlKey: true, shiftKey: true },
      selectAll: { key: 'a', ctrlKey: true },
      copy: { key: 'c', ctrlKey: true },
      paste: { key: 'v', ctrlKey: true },
      cut: { key: 'x', ctrlKey: true },
      save: { key: 's', ctrlKey: true }
    };
    var k = keyMap[action];
    if (k) {
      document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true }, k)));
    }
  }

  function zoom(dir) {
    if (dir === 'in') click($('zoom-in'));
    else if (dir === 'out') click($('zoom-out'));
    else click($('zoom-reset'));
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.source !== 'verse-new-ui') return;
    switch (data.type) {
      case 'tool': setTool(data.tool); break;
      case 'color': setColor(data.color); break;
      case 'brushSize': setBrushSize(data.size); break;
      case 'menu': menuAction(data.action); break;
      case 'zoom': zoom(data.dir); break;
      case 'ping':
        if (ev.source) ev.source.postMessage({ source: 'verse-engine', type: 'pong', ready: true }, '*');
        break;
    }
  });

  function boot() {
    hideChrome();
    ensureInfiniteAndStart();
    setTimeout(hideChrome, 800);
    setTimeout(hideChrome, 2000);
    setTimeout(function () {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'verse-engine', type: 'ready' }, '*');
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(hideChrome, 100); });
})();
