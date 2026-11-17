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

  function invalidateSceneCaches() {
    try {
      if (typeof window.VersePaintInvalidateScene === 'function') window.VersePaintInvalidateScene();
      if (typeof window.VersePaintInvalidateObjectIndex === 'function') window.VersePaintInvalidateObjectIndex();
    } catch (e) {}
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

  var layerThumbCache = { sig: '', map: {} };
  var THUMB_SIZE = 40;

  function objBounds(obj) {
    if (!obj) return null;
    if (obj.type === 'path' && obj.points && obj.points.length) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < obj.points.length; i++) {
        var p = obj.points[i];
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      if (!isFinite(minX)) return null;
      return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    }
    if (obj.type === 'bezier' && obj.anchors && obj.anchors.length) {
      var bminX = Infinity, bminY = Infinity, bmaxX = -Infinity, bmaxY = -Infinity;
      obj.anchors.forEach(function (a) {
        [[a.x, a.y], [a.x + (a.inX || 0), a.y + (a.inY || 0)], [a.x + (a.outX || 0), a.y + (a.outY || 0)]].forEach(function (pt) {
          if (pt[0] < bminX) bminX = pt[0]; if (pt[1] < bminY) bminY = pt[1];
          if (pt[0] > bmaxX) bmaxX = pt[0]; if (pt[1] > bmaxY) bmaxY = pt[1];
        });
      });
      if (!isFinite(bminX)) return null;
      return { x: bminX, y: bminY, w: Math.max(1, bmaxX - bminX), h: Math.max(1, bmaxY - bminY) };
    }
    if (obj.type === 'line' || obj.type === 'arrow') {
      return {
        x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2),
        w: Math.max(1, Math.abs(obj.x2 - obj.x1)), h: Math.max(1, Math.abs(obj.y2 - obj.y1))
      };
    }
    if (obj.w != null || obj.h != null || obj.x != null) {
      var w = Math.abs(obj.w || 0) || 1;
      var h = Math.abs(obj.h || obj.w || 0) || 1;
      return { x: Math.min(obj.x || 0, (obj.x || 0) + (obj.w || 0)), y: Math.min(obj.y || 0, (obj.y || 0) + (obj.h || 0)), w: w, h: h };
    }
    return null;
  }

  function drawThumbObject(ctx, obj, scale, ox, oy) {
    if (!obj) return;
    ctx.save();
    ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
    ctx.strokeStyle = obj.color || '#222';
    ctx.fillStyle = obj.fill || obj.color || '#222';
    ctx.lineWidth = Math.max(0.75, (obj.strokeWidth || 2) * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    function tx(v) { return (v - ox) * scale; }
    function ty(v) { return (v - oy) * scale; }
    if (obj.type === 'path' && obj.points && obj.points.length) {
      ctx.beginPath();
      obj.points.forEach(function (pt, idx) {
        if (idx) ctx.lineTo(tx(pt.x), ty(pt.y)); else ctx.moveTo(tx(pt.x), ty(pt.y));
      });
      if (obj.closed) ctx.closePath();
      if (obj.fill) ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'bezier' && obj.anchors && obj.anchors.length) {
      var anchors = obj.anchors;
      ctx.beginPath();
      ctx.moveTo(tx(anchors[0].x), ty(anchors[0].y));
      for (var i = 1; i < anchors.length; i++) {
        var a = anchors[i - 1], b = anchors[i];
        ctx.bezierCurveTo(
          tx(a.x + (a.outX || 0)), ty(a.y + (a.outY || 0)),
          tx(b.x + (b.inX || 0)), ty(b.y + (b.inY || 0)),
          tx(b.x), ty(b.y)
        );
      }
      if (obj.closed) ctx.closePath();
      if (obj.fill) ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'circle') {
      var cx = tx((obj.x || 0) + (obj.w || 0) / 2);
      var cy = ty((obj.y || 0) + (obj.h || obj.w || 0) / 2);
      var rx = Math.max(0.5, Math.abs(obj.w || 0) / 2 * scale);
      var ry = Math.max(0.5, Math.abs(obj.h || obj.w || 0) / 2 * scale);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (obj.fill) ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'rect' || obj.type === 'roundrect' || obj.type === 'image' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'hexagon') {
      var x = tx(Math.min(obj.x || 0, (obj.x || 0) + (obj.w || 0)));
      var y = ty(Math.min(obj.y || 0, (obj.y || 0) + (obj.h || 0)));
      var ww = Math.abs(obj.w || 0) * scale;
      var hh = Math.abs(obj.h || 0) * scale;
      ctx.beginPath();
      ctx.rect(x, y, Math.max(1, ww), Math.max(1, hh));
      if (obj.fill || obj.type === 'image') ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(tx(obj.x1), ty(obj.y1));
      ctx.lineTo(tx(obj.x2), ty(obj.y2));
      ctx.stroke();
    } else if (obj.type === 'text') {
      ctx.fillStyle = obj.color || '#222';
      ctx.font = Math.max(6, (obj.fontSize || 16) * scale * 0.6) + 'px sans-serif';
      ctx.fillText(String(obj.text || 'T').slice(0, 8), tx(obj.x || 0), ty(obj.y || 0));
    } else if (obj.type === 'group' && Array.isArray(obj.children)) {
      obj.children.forEach(function (child) { drawThumbObject(ctx, child, scale, ox, oy); });
    }
    ctx.restore();
  }

  function makeLayerThumb(st, layerId) {
    var objs = (st.objects || []).filter(function (o) { return o && o.layerId === layerId; });
    var canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.fillStyle = '#ececec';
    for (var y = 0; y < THUMB_SIZE; y += 6) {
      for (var x = 0; x < THUMB_SIZE; x += 6) {
        if (((x + y) / 6) % 2 === 0) ctx.fillRect(x, y, 6, 6);
      }
    }
    if (!objs.length) {
      // raster paint is shared; show a hint on the active layer when paint exists
      if (layerId === st.activeLayerId && st.paintChunks instanceof Map && st.paintChunks.size) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(8, 8, THUMB_SIZE - 16, THUMB_SIZE - 16);
        ctx.fillStyle = '#64748b';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('paint', THUMB_SIZE / 2, THUMB_SIZE / 2 + 3);
      }
      return canvas.toDataURL('image/png');
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objs.forEach(function (obj) {
      var b = objBounds(obj);
      if (!b) return;
      if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w; if (b.y + b.h > maxY) maxY = b.y + b.h;
    });
    if (!isFinite(minX)) return canvas.toDataURL('image/png');
    var pad = 4;
    var bw = Math.max(1, maxX - minX);
    var bh = Math.max(1, maxY - minY);
    var scale = Math.min((THUMB_SIZE - pad * 2) / bw, (THUMB_SIZE - pad * 2) / bh);
    var ox = minX - ((THUMB_SIZE / scale) - bw) / 2;
    var oy = minY - ((THUMB_SIZE / scale) - bh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.clip();
    objs.forEach(function (obj) { drawThumbObject(ctx, obj, scale, ox, oy); });
    ctx.restore();
    return canvas.toDataURL('image/png');
  }

  function layerThumbSignature(st, layerCounts) {
    var parts = [(st.paintRevision || 0), st.activeLayerId || ''];
    (st.layers || []).forEach(function (L) {
      parts.push(L.id, layerCounts[L.id] || 0);
    });
    (st.objects || []).forEach(function (o) {
      if (!o) return;
      parts.push(o.id, o.layerId || '', o.type || '', Math.round(o.x || 0), Math.round(o.y || 0), Math.round(o.w || 0), Math.round(o.h || 0));
    });
    return parts.join('|');
  }

  function postState() {
    if (!window.parent || window.parent === window) return;
    var st = getState();
    if (!st) return;
    try {
      var layerCounts = {};
      (st.objects || []).forEach(function (obj) {
        if (!obj || !obj.layerId) return;
        layerCounts[obj.layerId] = (layerCounts[obj.layerId] || 0) + 1;
      });
      var sig = layerThumbSignature(st, layerCounts);
      if (sig !== layerThumbCache.sig) {
        layerThumbCache.sig = sig;
        layerThumbCache.map = {};
        (st.layers || []).forEach(function (L) {
          try { layerThumbCache.map[L.id] = makeLayerThumb(st, L.id); } catch (err) { layerThumbCache.map[L.id] = ''; }
        });
      }
      var layers = (st.layers || []).map(function (L) {
        return {
          id: L.id,
          name: L.name,
          visible: L.visible !== false,
          locked: !!L.locked,
          type: L.type || 'layer',
          count: layerCounts[L.id] || 0,
          thumb: layerThumbCache.map[L.id] || ''
        };
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
          invalidateSceneCaches();
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
            invalidateSceneCaches();
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
            invalidateSceneCaches();
            postState();
            redraw();
          }
        } else if (data.method === 'setLayerOrder' && state) {
          var requestedOrder = Array.isArray(data.order) ? data.order : null;
          if (requestedOrder && requestedOrder.length) {
            var byId = {};
            (state.layers || []).forEach(function (layer) { byId[layer.id] = layer; });
            var nextLayers = [];
            requestedOrder.forEach(function (id) {
              if (byId[id]) { nextLayers.push(byId[id]); delete byId[id]; }
            });
            (state.layers || []).forEach(function (layer) {
              if (byId[layer.id]) { nextLayers.push(layer); delete byId[layer.id]; }
            });
            state.layers = nextLayers;
            (state.animFrames || []).forEach(function (frame) {
              if (!frame || !Array.isArray(frame.layers)) return;
              var frameById = {};
              frame.layers.forEach(function (layer) { frameById[layer.id] = layer; });
              var nextFrameLayers = [];
              requestedOrder.forEach(function (id) {
                if (frameById[id]) { nextFrameLayers.push(frameById[id]); delete frameById[id]; }
              });
              frame.layers.forEach(function (layer) {
                if (frameById[layer.id]) { nextFrameLayers.push(layer); delete frameById[layer.id]; }
              });
              frame.layers = nextFrameLayers;
            });
            layerThumbCache.sig = '';
            invalidateSceneCaches();
            postState();
            redraw();
          }
        } else if (data.method === 'moveLayer' && state) {
          // keep existing handler below; no-op duplicate guard
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
