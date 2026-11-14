/**
 * Runs inside draw-engine iframe. Maps parent UI commands to full VersePaint tools.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function clickEl(el) { if (el) { el.click(); return true; } return false; }

  var TOOL_MAP = {
    cursor: 'tool-select',
    brush: 'tool-brush',
    eraser: 'tool-eraser',
    hand: 'tool-hand',
    eyedropper: 'tool-eyedropper',
    bucket: 'tool-fill',
    text: 'tool-text',
    shapes: 'tool-shapes',
    lasso: 'tool-select',
    pen: 'tool-pen'
  };

  function setTool(name) {
    var id = TOOL_MAP[name] || TOOL_MAP.brush;
    var el = $(id);
    if (!clickEl(el)) {
      var btn = document.querySelector('[data-tool="' + name + '"], #' + id);
      clickEl(btn);
    }
    if (name === 'brush' || name === 'eraser' || name === 'pen') {
      clickEl($('mode-paint-btn'));
    }
    if (name === 'cursor' || name === 'shapes' || name === 'text') {
      clickEl($('mode-vector-btn'));
    }
  }

  function setColor(hex) {
    if (!hex) return;
    try {
      var inputs = document.querySelectorAll('input[type="color"], #brush-panel-color, #color-input');
      inputs.forEach(function (inp) {
        inp.value = hex;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } catch (e) {}
  }

  function setBrushSize(n) {
    n = Number(n);
    if (!n) return;
    var sliders = document.querySelectorAll('#size-slider-left, #brush-size, input[type="range"][id*="size"]');
    sliders.forEach(function (s) {
      s.value = String(n);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function menuAction(act) {
    var map = {
      undo: 'btn-undo',
      redo: 'btn-redo',
      export: 'btn-export',
      clear: 'btn-clear',
      open: 'btn-load-project',
      insert: 'btn-insert-image'
    };
    if (map[act]) clickEl($(map[act]));
    if (act === 'undo') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    if (act === 'redo') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.source !== 'verse-new-ui') return;
    if (data.type === 'tool') setTool(data.tool);
    if (data.type === 'color') setColor(data.color);
    if (data.type === 'brushSize') setBrushSize(data.size);
    if (data.type === 'menu') menuAction(data.action);
    if (data.type === 'ping') {
      ev.source && ev.source.postMessage({ source: 'verse-engine', type: 'pong' }, '*');
    }
  });

  function hideChrome() {
    document.body.classList.add('engine-embedded');
    ['app-menubar','top-bar','left-toolbar','left-paint-panel','compact-tools','anim-bar','start-screen'].forEach(function (id) {
      var el = $(id);
      if (el) el.style.display = 'none';
    });
    var cc = $('canvas-container');
    if (cc) {
      cc.style.cssText = 'position:fixed;inset:0;left:0;top:0;right:0;bottom:0;width:100%;height:100%;';
    }
  }
  setTimeout(hideChrome, 600);
  setTimeout(hideChrome, 1500);
  document.addEventListener('DOMContentLoaded', hideChrome);

  setTimeout(function () {
    var btn = $('btn-start-create');
    if (btn) btn.click();
    var ss = $('start-screen');
    if (ss) ss.style.display = 'none';
  }, 500);
})();
