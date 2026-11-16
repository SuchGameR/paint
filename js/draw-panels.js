/** Dockable panels — default hidden; open from パネル menu */
(function () {
  'use strict';
  var GRID = 12;
  var panels = {};
  var engineState = { layers: [], regions: [], color: '#171717', zoom: 1, tool: 'brush' };
  var layerRenderKey = '';
  var regionRenderKey = '';
  var propsRenderKey = '';
  var PALETTES = {
    vercel: ['#171717', '#0070f3', '#7928ca', '#ff0080', '#f5a623', '#50e3c2'],
    mono: ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#ffffff'],
    pastel: ['#2b2d42', '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f8edeb'],
    earth: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#d8f3dc'],
    neon: ['#0a0a0a', '#00f0ff', '#ff00aa', '#aaff00', '#ff5500', '#ffffff']
  };
  function send(msg) {
    var f = document.getElementById('engine-frame');
    if (f && f.contentWindow) f.contentWindow.postMessage(Object.assign({ source: 'verse-new-ui' }, msg), '*');
  }
  function ensureStyles() {
    if (!document.getElementById('vp-panel-styles')) {
      var s = document.createElement('style');
      s.id = 'vp-panel-styles';
    s.textContent = '#vp-dock-root{position:fixed;left:0;right:0;top:60px;bottom:0;z-index:20;pointer-events:none;display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:repeat(12,1fr);gap:8px;padding:8px;box-sizing:border-box}.vp-panel{pointer-events:auto;background:#171717;border:1px solid #2a2a2a;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.4);display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;color:#e8e8e8;font:12px/1.4 system-ui,sans-serif}.vp-panel[hidden]{display:none!important}.vp-panel.is-dragging{will-change:transform;opacity:.94}.vp-panel-hd{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2a2a2a;cursor:grab;user-select:none;flex-shrink:0}.vp-panel.is-dragging .vp-panel-hd{cursor:grabbing}.vp-panel-title{font-weight:600;font-size:12px;flex:1}.vp-panel-x{border:0;background:transparent;color:#888;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px}.vp-panel-bd{padding:10px;overflow:auto;flex:1}.vp-swatch-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.vp-swatch{aspect-ratio:1;border-radius:6px;border:1px solid rgba(255,255,255,.12);cursor:pointer}.vp-layer-row,.vp-region-row{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;cursor:pointer}.vp-layer-row:hover{background:#222}.vp-layer-row.active{background:#292929}.vp-layer-select{flex:1;min-width:0;overflow:hidden;border:0;background:transparent;color:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vp-layer-action{min-width:24px;padding:4px!important}.vp-btn{border:0;background:#292929;color:#eee;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px}.vp-btn-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.vp-muted{color:#8a8a8a;font-size:11px}.vp-field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}.vp-field label{font-size:10px;color:#8a8a8a}.vp-field input[type=range]{width:100%}.vp-field input[type=color]{width:100%;height:32px;border:0;background:transparent;padding:0}';
    document.head.appendChild(s);
    }
    ensureLayersSectionStyles();
  }
  function ensureLayersSectionStyles() {
    if (document.getElementById('vp-layers-section-styles')) return;
    var s = document.createElement('style');
    s.id = 'vp-layers-section-styles';
    s.textContent = [
      '#layers-section{margin-bottom:12px;padding-bottom:11px;border-bottom:1px solid #292929;position:relative;}',
      '.vp-layers-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;padding-right:26px;}',
      '.vp-layers-title{font-size:12px;font-weight:600;color:#e8e8e8;letter-spacing:.02em;}',
      '.vp-layers-add{width:22px;height:22px;border:1px solid #374138;border-radius:6px;background:#121613;color:#cfe8d8;cursor:pointer;font-size:13px;line-height:1;display:grid;place-items:center;}',
      '.vp-layers-add:hover{border-color:#4d6253;background:#182019;}',
      '.vp-layers-list{display:flex;flex-direction:column;gap:3px;max-height:240px;overflow:auto;padding-right:2px;}',
      '.vp-side-layer{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:7px;border:1px solid transparent;background:#151a16;color:#c9d3cc;font:11px/1.2 system-ui,sans-serif;cursor:grab;touch-action:none;user-select:none;}',
      '.vp-side-layer:hover{background:#1b211c;border-color:#2c3a30;}',
      '.vp-side-layer.is-active{border-color:#2f6b46;background:#1b2a20;color:#eafff1;}',
      '.vp-side-layer.is-dragging{opacity:.55;cursor:grabbing;}',
      '.vp-side-layer-vis,.vp-side-layer-lock{flex:0 0 auto;width:18px;height:18px;border:0;border-radius:5px;background:transparent;color:#9fb0a4;cursor:pointer;font-size:10px;display:grid;place-items:center;padding:0;}',
      '.vp-side-layer-vis:hover,.vp-side-layer-lock:hover{background:#26312a;color:#eafff1;}',
      '.vp-side-layer-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.vp-side-layer-count{flex:0 0 auto;font-size:9px;color:#7f8c83;background:#0e120f;border-radius:999px;padding:1px 5px;}',
      '.vp-layers-empty{font-size:11px;color:#7f8c83;padding:6px 4px;}'
    ].join('');
    document.head.appendChild(s);
  }
  function ensureRoot() {
    var root = document.getElementById('vp-dock-root');
    if (!root) { root = document.createElement('div'); root.id = 'vp-dock-root'; document.body.appendChild(root); }
    return root;
  }
  function snap(v, max) { return Math.max(1, Math.min(max, Math.round(v))); }
  function place(el, col, row, cs, rs) {
    el.style.gridColumn = col + ' / span ' + cs;
    el.style.gridRow = row + ' / span ' + rs;
    el.dataset.col = col; el.dataset.row = row; el.dataset.colSpan = cs; el.dataset.rowSpan = rs;
  }
  function makeDraggable(panel) {
    var hd = panel.querySelector('.vp-panel-hd');
    if (!hd) return;
    var dragging = false, frame = 0;
    var startX = 0, startY = 0, lastX = 0, lastY = 0;
    var startCol = 1, startRow = 1, colSpan = 1, rowSpan = 1;
    var rootRect = null;
    function move() {
      frame = 0;
      if (!dragging) return;
      panel.style.transform = 'translate3d(' + (lastX - startX) + 'px,' + (lastY - startY) + 'px,0)';
    }
    function finish(e, cancel) {
      if (!dragging) return;
      if (!cancel) {
        lastX = e.clientX;
        lastY = e.clientY;
      }
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!cancel) move();
      panel.style.transform = '';
      if (cancel) {
        place(panel, startCol, startRow, colSpan, rowSpan);
      } else {
        var cellW = rootRect.width / GRID;
        var cellH = rootRect.height / GRID;
        var col = snap(startCol + (lastX - startX) / cellW, GRID - colSpan + 1);
        var row = snap(startRow + (lastY - startY) / cellH, GRID - rowSpan + 1);
        place(panel, col, row, colSpan, rowSpan);
      }
      dragging = false;
      panel.classList.remove('is-dragging');
      if (hd.hasPointerCapture(e.pointerId)) hd.releasePointerCapture(e.pointerId);
      hd.removeEventListener('pointermove', onMove);
      hd.removeEventListener('pointerup', onUp);
      hd.removeEventListener('pointercancel', onCancel);
    }
    function onMove(e) {
      if (!dragging) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!frame) frame = requestAnimationFrame(move);
    }
    function onUp(e) { finish(e, false); }
    function onCancel(e) { finish(e, true); }
    hd.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.vp-panel-x')) return;
      e.preventDefault();
      dragging = true;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      rootRect = ensureRoot().getBoundingClientRect();
      startCol = Number(panel.dataset.col);
      startRow = Number(panel.dataset.row);
      colSpan = Number(panel.dataset.colSpan);
      rowSpan = Number(panel.dataset.rowSpan);
      panel.classList.add('is-dragging');
      hd.setPointerCapture(e.pointerId);
      hd.addEventListener('pointermove', onMove);
      hd.addEventListener('pointerup', onUp);
      hd.addEventListener('pointercancel', onCancel);
    });
  }
  function createPanel(id, title, col, row, cs, rs) {
    var el = document.createElement('section');
    el.className = 'vp-panel'; el.id = 'vp-panel-' + id; el.hidden = true;
    el.innerHTML = '<div class="vp-panel-hd"><span class="vp-panel-title"></span><button type="button" class="vp-panel-x">×</button></div><div class="vp-panel-bd"></div>';
    el.querySelector('.vp-panel-title').textContent = title;
    el.querySelector('.vp-panel-x').onclick = function () { setPanel(id, false); };
    place(el, col, row, cs, rs);
    ensureRoot().appendChild(el);
    makeDraggable(el);
    panels[id] = el;
    return el;
  }
  function setPanel(id, show) {
    var el = panels[id]; if (!el) return;
    el.hidden = !show;
    try { localStorage.setItem('vp-panel-' + id, show ? '1' : '0'); } catch (e) {}
    if (id === 'layers' && show) send({ type: 'ping' });
  }
  function togglePanel(id) {
    var el = panels[id]; if (!el) return;
    setPanel(id, el.hidden);
  }
  function renderLayers() {
    var el = panels.layers; if (!el) return;
    var layers = engineState.layers || [];
    var renderKey = JSON.stringify([
      engineState.activeLayerId,
      layers.map(function (layer) {
        return [layer.id, layer.name, layer.visible, layer.locked, layer.type, layer.folderId];
      })
    ]);
    if (renderKey === layerRenderKey) return;
    layerRenderKey = renderKey;
    var bd = el.querySelector('.vp-panel-bd');
    bd.replaceChildren();
    if (!layers.length) {
      var empty = document.createElement('p');
      empty.className = 'vp-muted';
      empty.textContent = 'レイヤーなし';
      bd.appendChild(empty);
    }
    layers.slice().reverse().forEach(function (layer) {
      var row = document.createElement('div');
      row.className = 'vp-layer-row' + (layer.id === engineState.activeLayerId ? ' active' : '');

      var select = document.createElement('button');
      select.type = 'button';
      select.className = 'vp-layer-select';
      select.textContent = layer.name || layer.id;
      select.setAttribute('aria-pressed', String(layer.id === engineState.activeLayerId));
      select.onclick = function () {
        send({ type: 'api', method: 'setActiveLayer', id: layer.id });
      };
      select.ondblclick = function () {
        var name = window.prompt('レイヤー名', layer.name || '');
        if (name && name.trim()) {
          send({ type: 'api', method: 'renameLayer', id: layer.id, name: name.trim() });
        }
      };

      var visibility = document.createElement('button');
      visibility.type = 'button';
      visibility.className = 'vp-btn vp-layer-action';
      visibility.textContent = layer.visible === false ? '◌' : '●';
      visibility.title = layer.visible === false ? 'レイヤーを表示' : 'レイヤーを非表示';
      visibility.setAttribute('aria-label', visibility.title);
      visibility.setAttribute('aria-pressed', String(layer.visible !== false));
      visibility.onclick = function () {
        send({ type: 'api', method: 'toggleLayerVis', id: layer.id });
      };

      var lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'vp-btn vp-layer-action';
      lock.textContent = layer.locked ? '🔒' : '🔓';
      lock.title = layer.locked ? 'レイヤーのロックを解除' : 'レイヤーをロック';
      lock.setAttribute('aria-label', lock.title);
      lock.setAttribute('aria-pressed', String(!!layer.locked));
      lock.onclick = function () {
        send({ type: 'api', method: 'toggleLayerLock', id: layer.id });
      };

      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'vp-btn vp-layer-action';
      up.textContent = '↑';
      up.title = 'レイヤーを前面へ';
      up.setAttribute('aria-label', up.title);
      up.onclick = function () {
        send({ type: 'api', method: 'moveLayer', id: layer.id, direction: 1 });
      };

      var down = document.createElement('button');
      down.type = 'button';
      down.className = 'vp-btn vp-layer-action';
      down.textContent = '↓';
      down.title = 'レイヤーを背面へ';
      down.setAttribute('aria-label', down.title);
      down.onclick = function () {
        send({ type: 'api', method: 'moveLayer', id: layer.id, direction: -1 });
      };

      row.append(visibility, lock, select, up, down);
      bd.appendChild(row);
    });

    var actions = document.createElement('div');
    actions.className = 'vp-btn-row';
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'vp-btn';
    add.textContent = 'レイヤー追加';
    add.onclick = function () {
      send({ type: 'api', method: 'addLayer' });
      send({ type: 'ping' });
    };
    actions.appendChild(add);
    bd.appendChild(actions);
  }
  function renderRegions() {
    var el = panels.regions; if (!el) return;
    var regions = engineState.regions || [];
    var renderKey = JSON.stringify(regions.map(function (region) {
      return [region.id, region.name];
    }));
    if (renderKey === regionRenderKey) return;
    regionRenderKey = renderKey;
    var bd = el.querySelector('.vp-panel-bd');
    bd.innerHTML = (regions.map(function (r) {
      return '<div class="vp-region-row"><span style="flex:1">' + (r.name || r.id) + '</span></div>';
    }).join('') || '<p class="vp-muted">リージョン未保存</p>') +
      '<div class="vp-btn-row"><button type="button" class="vp-btn" data-act="region-save">現在を保存</button></div>';
    var b = bd.querySelector('[data-act="region-save"]');
    if (b) b.onclick = function () { send({ type: 'menu', action: 'region-save' }); };
  }
  function renderColor() {
    var el = panels.color; if (!el) return;
    var bd = el.querySelector('.vp-panel-bd');
    var html = '<div class="vp-field"><label>カラー</label><input type="color" id="vp-color-input" value="' + (engineState.color || '#171717') + '"></div>';
    Object.keys(PALETTES).forEach(function (k) {
      html += '<p class="vp-muted" style="margin:8px 0 4px">' + k + '</p><div class="vp-swatch-grid">';
      PALETTES[k].forEach(function (c) {
        html += '<button type="button" class="vp-swatch" data-color="' + c + '" style="background:' + c + '"></button>';
      });
      html += '</div>';
    });
    bd.innerHTML = html;
    var inp = bd.querySelector('#vp-color-input');
    if (inp) inp.oninput = function () { send({ type: 'color', color: inp.value }); };
    bd.querySelectorAll('.vp-swatch').forEach(function (sw) {
      sw.onclick = function () {
        var c = sw.getAttribute('data-color');
        send({ type: 'color', color: c });
        if (inp) inp.value = c;
      };
    });
  }
  function renderProps() {
    var el = panels.props; if (!el) return;
    var renderKey = JSON.stringify([engineState.strokeWidth, engineState.zoom, engineState.tool]);
    if (renderKey === propsRenderKey) return;
    propsRenderKey = renderKey;
    var bd = el.querySelector('.vp-panel-bd');
    bd.innerHTML =
      '<div class="vp-field"><label>サイズ <span id="vp-size-val">' + (engineState.strokeWidth || 8) + '</span></label>' +
      '<input type="range" id="vp-size" min="1" max="200" value="' + (engineState.strokeWidth || 8) + '"></div>' +
      '<p class="vp-muted">ズーム ' + Math.round((engineState.zoom || 1) * 100) + '% · ' + (engineState.tool || '') + '</p>' +
      '<div class="vp-btn-row"><button type="button" class="vp-btn" data-z="in">＋</button><button type="button" class="vp-btn" data-z="out">−</button><button type="button" class="vp-btn" data-z="reset">100%</button></div>' +
      '<div class="vp-btn-row"><button type="button" class="vp-btn" data-act="pressure-on">筆圧</button><button type="button" class="vp-btn" data-act="effect-more">Effect More</button></div>';
    var range = bd.querySelector('#vp-size');
    if (range) range.oninput = function () {
      bd.querySelector('#vp-size-val').textContent = range.value;
      send({ type: 'brushSize', size: range.value });
    };
    bd.querySelectorAll('[data-z]').forEach(function (b) {
      b.onclick = function () { send({ type: 'zoom', dir: b.getAttribute('data-z') }); };
    });
    bd.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () { send({ type: 'menu', action: b.getAttribute('data-act') }); };
    });
  }
  var sidebarLayersList = null;
  var sidebarLayerDragging = false;

  function ensureLayersSection() {
    var props = document.getElementById('properties');
    if (!props) return null;
    var section = document.getElementById('layers-section');
    if (!section) {
      section = document.createElement('section');
      section.id = 'layers-section';
      section.className = 'layers-section';
      section.setAttribute('aria-label', 'レイヤー');
      section.innerHTML =
        '<div class="vp-layers-head">' +
          '<span class="vp-layers-title">レイヤー</span>' +
          '<button type="button" class="vp-layers-add" title="レイヤー追加" aria-label="レイヤー追加">＋</button>' +
        '</div>' +
        '<div class="vp-layers-list" id="vp-sidebar-layers" role="list"></div>';
      props.insertBefore(section, props.firstChild);
    }
    var addBtn = section.querySelector('.vp-layers-add');
    if (addBtn && !addBtn.__vpWired) {
      addBtn.__vpWired = true;
      addBtn.onclick = function () {
        send({ type: 'api', method: 'addLayer' });
        send({ type: 'ping' });
      };
    }
    sidebarLayersList = section.querySelector('#vp-sidebar-layers');
    return section;
  }

  function sidebarLayerButton(className, label, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.onclick = function (event) {
      event.stopPropagation();
      onClick();
    };
    return b;
  }

  function wireSidebarLayerDrag(row) {
    row.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      if (event.target.closest('button')) return;
      event.preventDefault();
      var startY = event.clientY;
      var lastY = startY;
      var started = false;
      var frame = null;
      row.__vpJustDragged = false;

      function applyPosition() {
        frame = null;
        if (!sidebarLayersList) return;
        var rows = Array.prototype.slice.call(sidebarLayersList.children).filter(function (el) {
          return el !== row && el.classList.contains('vp-side-layer');
        });
        var insertBefore = null;
        for (var i = 0; i < rows.length; i++) {
          var rect = rows[i].getBoundingClientRect();
          if (lastY < rect.top + rect.height / 2) { insertBefore = rows[i]; break; }
        }
        if (insertBefore) sidebarLayersList.insertBefore(row, insertBefore);
        else sidebarLayersList.appendChild(row);
      }

      function onMove(moveEvent) {
        lastY = moveEvent.clientY;
        if (!started && Math.abs(lastY - startY) < 4) return;
        if (!started) {
          started = true;
          sidebarLayerDragging = true;
          row.classList.add('is-dragging');
        }
        if (!frame) frame = requestAnimationFrame(applyPosition);
      }

      function cleanup() {
        row.removeEventListener('pointermove', onMove);
        row.removeEventListener('pointerup', onUp);
        row.removeEventListener('pointercancel', onCancel);
        if (frame) cancelAnimationFrame(frame);
        frame = null;
        try {
          if (row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
        } catch (err) {}
      }

      function onUp() {
        cleanup();
        if (!started) return;
        sidebarLayerDragging = false;
        row.classList.remove('is-dragging');
        row.__vpJustDragged = true;
        var order = Array.prototype.slice.call(sidebarLayersList.children)
          .map(function (el) { return el.dataset.layerId; })
          .filter(Boolean)
          .reverse(); // displayed top-first -> engine bottom-first
        send({ type: 'api', method: 'setLayerOrder', order: order });
        send({ type: 'ping' });
      }

      function onCancel() {
        cleanup();
        if (started) {
          sidebarLayerDragging = false;
          row.classList.remove('is-dragging');
          renderSidebarLayers();
        }
      }

      try { row.setPointerCapture(event.pointerId); } catch (err) {}
      row.addEventListener('pointermove', onMove);
      row.addEventListener('pointerup', onUp);
      row.addEventListener('pointercancel', onCancel);
    });
  }

  function renderSidebarLayers() {
    ensureLayersSection();
    if (!sidebarLayersList || sidebarLayerDragging) return;
    var layers = engineState.layers || [];
    var activeId = engineState.activeLayerId;
    sidebarLayersList.replaceChildren();
    if (!layers.length) {
      var empty = document.createElement('p');
      empty.className = 'vp-layers-empty';
      empty.textContent = 'レイヤーなし';
      sidebarLayersList.appendChild(empty);
      return;
    }
    layers.slice().reverse().forEach(function (layer) {
      var row = document.createElement('div');
      row.className = 'vp-side-layer' + (layer.id === activeId ? ' is-active' : '');
      row.dataset.layerId = layer.id;
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-pressed', String(layer.id === activeId));

      var visibility = sidebarLayerButton(
        'vp-side-layer-vis',
        layer.visible === false ? '○' : '●',
        layer.visible === false ? 'レイヤーを表示' : 'レイヤーを非表示',
        function () { send({ type: 'api', method: 'toggleLayerVis', id: layer.id }); }
      );
      var lock = sidebarLayerButton(
        'vp-side-layer-lock',
        layer.locked ? '🔒' : '🔓',
        layer.locked ? 'ロックを解除' : 'レイヤーをロック',
        function () { send({ type: 'api', method: 'toggleLayerLock', id: layer.id }); }
      );
      var name = document.createElement('span');
      name.className = 'vp-side-layer-name';
      name.textContent = layer.name || layer.id;
      name.ondblclick = function (event) {
        event.stopPropagation();
        var next = window.prompt('レイヤー名', layer.name || '');
        if (next && next.trim()) {
          send({ type: 'api', method: 'renameLayer', id: layer.id, name: next.trim() });
        }
      };
      var count = document.createElement('span');
      count.className = 'vp-side-layer-count';
      count.textContent = layer.count != null ? String(layer.count) : '';

      row.append(visibility, lock, name, count);
      row.addEventListener('click', function () {
        if (row.__vpJustDragged) { row.__vpJustDragged = false; return; }
        send({ type: 'api', method: 'setActiveLayer', id: layer.id });
      });
      wireSidebarLayerDrag(row);
      sidebarLayersList.appendChild(row);
    });
  }

  function init() {
    ensureStyles();
    ensureLayersSection();
    if (!panels.color) createPanel('color', 'カラーパレット', 1, 1, 3, 5);
    if (!panels.layers) createPanel('layers', 'レイヤー', 1, 6, 3, 4);
    if (!panels.regions) createPanel('regions', 'リージョン', 1, 10, 3, 3);
    if (!panels.props) createPanel('props', 'プロパティ', 10, 1, 3, 5);
    ['color', 'layers', 'props', 'regions'].forEach(function (id) {
      var saved = null;
      try { saved = localStorage.getItem('vp-panel-' + id); } catch (e) {}
      setPanel(id, saved === '1');
    });
    renderColor(); renderLayers(); renderRegions(); renderProps(); renderSidebarLayers();
  }
  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'verse-engine' || ev.data.type !== 'state') return;
    engineState = Object.assign(engineState, ev.data);
    renderLayers(); renderRegions(); renderProps(); renderSidebarLayers();
  });
  window.VersePanels = { toggle: togglePanel, show: function (id) { setPanel(id, true); }, hide: function (id) { setPanel(id, false); }, init: init };
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
  setTimeout(init, 50);
})();
