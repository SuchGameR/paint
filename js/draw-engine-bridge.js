/**
 * Engine bridge: tools, pressure, gestures, zoom uncapped, API for parent panels
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function click(el) { if (el) { el.click(); return true; } return false; }

  var TOOL_MAP = {
    cursor: 'select', select: 'select',
    brush: 'brush', pen: 'pen', eraser: 'eraser',
    hand: 'hand', eyedropper: 'eyedropper',
    bucket: 'fill', fill: 'fill',
    text: 'text', shapes: 'shapes', lasso: 'select'
  };

  function getState() { return window.__VP_STATE || null; }

  function redraw() {
    if (typeof window.__VP_RENDER === 'function') {
      try { window.__VP_RENDER(); } catch (e) {}
    }
  }

  function hideChrome() {
    document.body.classList.add('engine-embedded');
    [
      'start-screen', 'app-menubar', 'top-bar', 'left-toolbar', 'left-paint-panel',
      'compact-tools', 'anim-bar', 'status-bar', 'mode-anim-btn', 'hud-coords',
      'mobile-dock', 'props-panel', 'minimap-wrap'
    ].forEach(function (id) {
      var el = $(id);
      if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; el.style.visibility = 'hidden'; }
    });
    var cc = $('canvas-container');
    if (cc) {
      cc.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;margin:0;border:none;touch-action:none;z-index:1;';
    }
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
    ['effect-more-sheet', 'export-region-modal', 'settings-modal', 'shapes-menu', 'ctx-menu'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.zIndex = '300';
      if (el.classList.contains('hidden')) {
        el.style.display = 'none';
      }
    });
  }

  function enablePressure() {
    var st = getState();
    if (st) {
      st.pressureEnabled = true;
      if (st.pressureMin == null) st.pressureMin = 0.2;
    }
    ['pressure-toggle', 'pressure-toggle-left'].forEach(function (id) {
      var el = $(id);
      if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  function centerBoard() {
    var st = getState();
    if (!st) return;
    st.infiniteCanvas = false;
    if (!st.canvasBg || st.canvasBg === 'transparent') st.canvasBg = '#ffffff';
    st.canvasWidth = st.canvasWidth || 1920;
    st.canvasHeight = st.canvasHeight || 1080;
    var w = Math.max(window.innerWidth || 0, 320);
    var h = Math.max(window.innerHeight || 0, 240);
    var z = Math.min(w / st.canvasWidth, h / st.canvasHeight) * 0.82;
    st.zoom = Math.max(0.05, Math.min(4, z));
    st.panX = (w - st.canvasWidth * st.zoom) / 2;
    st.panY = (h - st.canvasHeight * st.zoom) / 2;
    if (!st.color || st.color === '#171717') st.color = '#ff6600';
    redraw();
  }

  function ensureBoardAndStart() {
    var inf = $('start-infinite');
    if (inf) {
      inf.checked = false;
      inf.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var fields = $('start-size-fields');
    if (fields) {
      fields.style.opacity = '1';
      fields.style.pointerEvents = 'auto';
    }
    var btn = $('btn-start-create');
    if (btn) btn.click();
    var ss = $('start-screen');
    if (ss) { ss.style.display = 'none'; ss.classList.add('hidden'); }
    var mm = $('minimap-wrap');
    if (mm) mm.style.display = 'none';
    hideChrome();
    enablePressure();
    centerBoard();
  }

  var active = new Map();
  var gesture = null;
  var ZOOM_MAX = 256;
  var ZOOM_MIN = 0.02;

  function containerEl() {
    return $('canvas-container') || document.body;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function pts() {
    var a = [];
    active.forEach(function (p) { a.push(p); });
    return a;
  }

  function cancelActiveStroke(st) {
    if (!st) return;
    var hadStroke = !!(st.isDrawing || st._paintStroke || st.currentObj);
    st.isDrawing = false;
    st.isPanning = false;
    st.currentObj = null;
    st.activeStrokeCanvas = null;
    st._paintStroke = false;
    st._rasterErase = false;
    st._penDragging = false;
    st._dragMove = false;
    st._lastPaint = null;
    st._lastErase = null;
    if (hadStroke && st.undoStack && st.undoStack.length) {
      var u = $('btn-undo');
      if (u && !u.disabled) u.click();
    }
    redraw();
  }

  function beginGesture() {
    var st = getState();
    if (!st || active.size < 2) return;
    var p = pts();
    gesture = {
      startDist: Math.max(1, dist(p[0], p[1])),
      startZoom: st.zoom,
      startPanX: st.panX,
      startPanY: st.panY,
      startMid: mid(p[0], p[1])
    };
    cancelActiveStroke(st);
  }

  function updateGesture() {
    var st = getState();
    if (!st || !gesture || active.size < 2) return;
    var p = pts();
    var d = Math.max(1, dist(p[0], p[1]));
    var m = mid(p[0], p[1]);
    var newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, gesture.startZoom * (d / gesture.startDist)));
    var dx = m.x - gesture.startMid.x;
    var dy = m.y - gesture.startMid.y;
    var zoomRatio = newZoom / gesture.startZoom;
    st.zoom = newZoom;
    st.panX = m.x - (m.x - (gesture.startPanX + dx)) * zoomRatio;
    st.panY = m.y - (m.y - (gesture.startPanY + dy)) * zoomRatio;
    redraw();
  }

  function onPointerDownCapture(e) {
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size >= 2) {
      e.preventDefault();
      e.stopPropagation();
      beginGesture();
    }
  }
  function onPointerMoveCapture(e) {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size >= 2 && gesture) {
      e.preventDefault();
      e.stopPropagation();
      updateGesture();
    }
  }
  function onPointerUpCapture(e) {
    active.delete(e.pointerId);
    if (active.size < 2) gesture = null;
  }

  function installGestures() {
    var el = containerEl();
    if (!el || el.__vpGestures) return;
    el.__vpGestures = true;
    el.style.touchAction = 'none';
    var o = { capture: true, passive: false };
    el.addEventListener('pointerdown', onPointerDownCapture, o);
    el.addEventListener('pointermove', onPointerMoveCapture, o);
    el.addEventListener('pointerup', onPointerUpCapture, o);
    el.addEventListener('pointercancel', onPointerUpCapture, o);
  }

  function installWheel() {
    if (window.__vpWheel) return;
    window.__vpWheel = true;
    window.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var st = getState();
      if (!st) return;
      e.preventDefault();
      e.stopPropagation();
      var step = e.deltaY < 0 ? 2 : -2;
      var n = Math.round(Math.max(1, Math.min(500, (Number(st.strokeWidth) || 1) + step)));
      st.strokeWidth = n;
      ['size-slider', 'size-slider-left'].forEach(function (id) {
        var el = $(id); if (el) el.value = String(n);
      });
      ['size-val', 'size-val-left'].forEach(function (id) {
        var el = $(id); if (el) el.textContent = String(n);
      });
      redraw();
      if (window.parent && window.parent !== window) {
        try { window.parent.postMessage({ source: 'verse-engine', type: 'brushSize', size: n }, '*'); } catch (_) {}
      }
    }, { capture: true, passive: false });
  }

  function setTool(name) {
    var engineName = TOOL_MAP[name] || name || 'brush';
    if (engineName === 'shapes') engineName = 'rect';
    var vectorTools = { select: 1, pen: 1, text: 1, rect: 1 };
    if (vectorTools[engineName]) click($('mode-vector-btn'));
    var btnId = 'tool-' + (engineName === 'rect' ? 'shapes' : engineName);
    var btn = $(btnId);
    if (btn) btn.click();
    var st = getState();
    if (st) st.tool = engineName;
  }

  function setColor(hex) {
    if (!hex) return;
    if (String(hex).indexOf('rgb') === 0) {
      var m = String(hex).match(/\d+/g);
      if (m) hex = '#' + m.slice(0, 3).map(function (n) {
        return Number(n).toString(16).padStart(2, '0');
      }).join('');
    }
    var st = getState();
    if (st) st.color = hex;
    var inp = $('color-input');
    if (inp) {
      try {
        inp.value = hex;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }
    redraw();
  }

  function setBrushSize(n) {
    n = Number(n);
    if (!n) return;
    var st = getState();
    if (st) st.strokeWidth = n;
    document.querySelectorAll('#size-slider-left, #size-slider, #brush-size').forEach(function (s) {
      s.value = String(n);
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function postState() {
    if (!window.parent || window.parent === window) return;
    var st = getState();
    if (!st) return;
    try {
      var layers = (st.layers || []).map(function (L) {
        return { id: L.id, name: L.name, visible: L.visible !== false, locked: !!L.locked, type: L.type || 'layer' };
      });
      var regions = (st.regions || []).map(function (r) {
        return { id: r.id, name: r.name || r.id };
      });
      window.parent.postMessage({
        source: 'verse-engine', type: 'state',
        tool: st.tool, mode: st.mode, color: st.color, strokeWidth: st.strokeWidth,
        zoom: st.zoom, infiniteCanvas: st.infiniteCanvas, activeLayerId: st.activeLayerId,
        layers: layers, regions: regions,
        selectedCount: st.selectedIds ? st.selectedIds.size : 0
      }, '*');
    } catch (e) {}
  }

  window.VerseEngineAPI = {
    setTool: setTool, setColor: setColor, setBrushSize: setBrushSize,
    getState: getState, redraw: redraw,
    click: function (id) { return click($(id)); },
    postState: postState
  };

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || data.source !== 'verse-new-ui') return;
    switch (data.type) {
      case 'tool': setTool(data.tool); postState(); break;
      case 'color': setColor(data.color); break;
      case 'brushSize': setBrushSize(data.size); break;
      case 'zoom':
        if (data.dir === 'in') click($('zoom-in'));
        else if (data.dir === 'out') click($('zoom-out'));
        else click($('zoom-reset'));
        postState();
        break;
      case 'api':
        if (data.method === 'click' && data.id) click($(data.id));
        var state = getState();
        if (data.method === 'addLayer') {
          click($('btn-add-layer'));
          postState();
        } else if (data.method === 'setActiveLayer' && state) {
          if ((state.layers || []).some(function (layer) { return layer.id === data.id; })) {
            state.activeLayerId = data.id;
            postState();
            redraw();
          }
        } else if (data.method === 'toggleLayerVis' && state) {
          var visibleLayer = (state.layers || []).find(function (layer) { return layer.id === data.id; });
          if (visibleLayer) {
            visibleLayer.visible = visibleLayer.visible === false;
            postState();
            redraw();
          }
        } else if (data.method === 'toggleLayerLock' && state) {
          var lockedLayer = (state.layers || []).find(function (layer) { return layer.id === data.id; });
          if (lockedLayer) {
            lockedLayer.locked = !lockedLayer.locked;
            postState();
            redraw();
          }
        } else if (data.method === 'moveLayer' && state) {
          var layerIndex = (state.layers || []).findIndex(function (layer) { return layer.id === data.id; });
          var nextIndex = layerIndex + Number(data.direction);
          if (layerIndex >= 0 && nextIndex >= 0 && nextIndex < state.layers.length) {
            var movedLayer = state.layers[layerIndex];
            state.layers[layerIndex] = state.layers[nextIndex];
            state.layers[nextIndex] = movedLayer;
            postState();
            redraw();
          }
        } else if (data.method === 'renameLayer' && state) {
          var renamedLayer = (state.layers || []).find(function (layer) { return layer.id === data.id; });
          var nextName = typeof data.name === 'string' ? data.name.trim() : '';
          if (renamedLayer && nextName) {
            renamedLayer.name = nextName;
            (state.animFrames || []).forEach(function (frame) {
              (frame.layers || []).forEach(function (layer) {
                if (layer.id === data.id) layer.name = nextName;
              });
            });
            postState();
            redraw();
          }
        }
        break;
      case 'ping':
        postState();
        if (ev.source) ev.source.postMessage({ source: 'verse-engine', type: 'pong', ready: true }, '*');
        break;
    }
  });

  function boot() {
    hideChrome();
    ensureBoardAndStart();
    enablePressure();
    installGestures();
    installWheel();
    setTimeout(hideChrome, 600);
    setTimeout(function () {
      hideChrome();
      enablePressure();
      installGestures();
      installWheel();
      setTool('brush');
      centerBoard();
      postState();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'verse-engine', type: 'ready' }, '*');
      }
    }, 1200);
    setInterval(postState, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
})();
