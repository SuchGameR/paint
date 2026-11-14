/**
 * Engine iframe bridge: pressure ON + multi-touch pan/pinch + tool/color from parent
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function click(el) { if (el) { el.click(); return true; } return false; }

  var TOOL_MAP = {
    cursor: 'tool-select', select: 'tool-select',
    brush: 'tool-brush', pen: 'tool-pen', eraser: 'tool-eraser',
    hand: 'tool-hand', eyedropper: 'tool-eyedropper',
    bucket: 'tool-fill', fill: 'tool-fill',
    text: 'tool-text', shapes: 'tool-shapes', lasso: 'tool-select'
  };

  function getState() {
    return window.__VP_STATE || null;
  }

  function redraw() {
    if (typeof window.__VP_RENDER === 'function') {
      try { window.__VP_RENDER(); return; } catch (e) {}
    }
    var st = getState();
    var c = $('canvas-container') || document.querySelector('canvas');
    if (!st || !c) return;
    var z = st.zoom, px = st.panX, py = st.panY;
    try {
      c.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -1, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2,
        bubbles: true, cancelable: true
      }));
      st.zoom = z; st.panX = px; st.panY = py;
      if (typeof window.__VP_RENDER === 'function') window.__VP_RENDER();
    } catch (e) {}
  }

  function hideChrome() {
    document.body.classList.add('engine-embedded');
    [
      'start-screen', 'app-menubar', 'top-bar', 'left-toolbar', 'left-paint-panel',
      'compact-tools', 'anim-bar', 'status-bar', 'mode-anim-btn', 'hud-coords'
    ].forEach(function (id) {
      var el = $(id);
      if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
    });
    var cc = $('canvas-container');
    if (cc) {
      cc.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;margin:0;border:none;touch-action:none;';
    }
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
  }

  function enablePressure() {
    var st = getState();
    if (st) {
      st.pressureEnabled = true;
      if (st.pressureMin == null) st.pressureMin = 0.2;
      if (st.pressureCurve == null) st.pressureCurve = 1;
    }
    ['pressure-toggle', 'pressure-toggle-left'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
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
    enablePressure();
  }

  var active = new Map();
  var gesture = null;

  function containerEl() {
    return $('canvas-container') || document.querySelector('#canvas-container') || document.body;
  }

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function ptsFromActive() {
    var arr = [];
    active.forEach(function (p) { arr.push(p); });
    return arr;
  }

  function beginGesture() {
    var st = getState();
    if (!st || active.size < 2) return;
    var pts = ptsFromActive();
    var a = pts[0], b = pts[1];
    gesture = {
      mode: 'panzoom',
      startDist: Math.max(1, dist(a, b)),
      startZoom: st.zoom,
      startPanX: st.panX,
      startPanY: st.panY,
      startMid: mid(a, b)
    };
    st.isDrawing = false;
    st.isPanning = false;
    st.currentObj = null;
  }

  function updateGesture() {
    var st = getState();
    if (!st || !gesture || active.size < 2) return;
    var pts = ptsFromActive();
    var a = pts[0], b = pts[1];
    var d = Math.max(1, dist(a, b));
    var m = mid(a, b);
    var scale = d / gesture.startDist;
    var newZoom = Math.min(16, Math.max(0.08, gesture.startZoom * scale));
    var dx = m.x - gesture.startMid.x;
    var dy = m.y - gesture.startMid.y;
    st.zoom = newZoom;
    var zoomRatio = newZoom / gesture.startZoom;
    st.panX = m.x - (m.x - (gesture.startPanX + dx)) * zoomRatio;
    st.panY = m.y - (m.y - (gesture.startPanY + dy)) * zoomRatio;
    redraw();
  }

  function endGesture() {
    gesture = null;
  }

  function onPointerDownCapture(e) {
    active.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (active.size >= 2) {
      e.preventDefault();
      e.stopPropagation();
      beginGesture();
      try {
        var st = getState();
        if (st) { st.isDrawing = false; st.isPanning = false; }
      } catch (err) {}
    }
  }

  function onPointerMoveCapture(e) {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (active.size >= 2 || gesture) {
      e.preventDefault();
      e.stopPropagation();
      updateGesture();
    }
  }

  function onPointerUpCapture(e) {
    active.delete(e.pointerId);
    if (active.size < 2) endGesture();
  }

  function installGestures() {
    var el = containerEl();
    if (!el || el.__vpGestures) return;
    el.__vpGestures = true;
    el.style.touchAction = 'none';
    var opts = { capture: true, passive: false };
    el.addEventListener('pointerdown', onPointerDownCapture, opts);
    el.addEventListener('pointermove', onPointerMoveCapture, opts);
    el.addEventListener('pointerup', onPointerUpCapture, opts);
    el.addEventListener('pointercancel', onPointerUpCapture, opts);
    el.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opts);
    el.addEventListener('gesturechange', function (e) { e.preventDefault(); }, opts);
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opts);
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
    var st = getState();
    if (st) st.color = hex;
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
    var st = getState();
    if (st) st.strokeWidth = n;
    document.querySelectorAll('#size-slider-left, #size-slider, #brush-size, input[type="range"][id*="size"]').forEach(function (s) {
      s.value = String(n);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function menuAction(action) {
    var idMap = {
      undo: 'btn-undo', redo: 'btn-redo', export: 'btn-export',
      clear: 'btn-clear', open: 'btn-load-project', insert: 'btn-insert-image',
      grid: 'btn-grid-toggle'
    };
    if (idMap[action] && click($(idMap[action]))) return;
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
    if (k) document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true }, k)));
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
    enablePressure();
    installGestures();
    setTimeout(hideChrome, 800);
    setTimeout(function () {
      hideChrome();
      enablePressure();
      installGestures();
    }, 2000);
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
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(hideChrome, 100);
    setTimeout(installGestures, 500);
  });
})();
