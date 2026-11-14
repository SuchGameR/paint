/**
 * VersePaint lite engine — mounts into new-ui.html, no heavy main.js
 */
(function () {
  'use strict';

  const state = {
    width: 1920,
    height: 1080,
    tool: 'brush',
    color: '#111111',
    size: 8,
    hardness: 1,
    drawing: false,
    last: null,
    pan: { x: 0, y: 0 },
    zoom: 1,
    layers: [],
    active: 0,
    history: [],
    histIdx: -1,
    maxHist: 30,
    shapeStart: null
  };

  let layerSeq = 1;
  let canvas, ctx, wrap;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function makeLayer(name) {
    const c = document.createElement('canvas');
    c.width = state.width;
    c.height = state.height;
    return { id: 'L' + layerSeq++, name: name || ('レイヤー ' + layerSeq), canvas: c, ctx: c.getContext('2d'), visible: true };
  }

  function activeLayer() { return state.layers[state.active] || null; }

  function composite() {
    if (!canvas) return;
    canvas.width = state.width;
    canvas.height = state.height;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, state.width, state.height);
    state.layers.forEach(L => {
      if (L.visible) ctx.drawImage(L.canvas, 0, 0);
    });
    fit();
  }

  function fit() {
    if (!wrap || !canvas) return;
    const maxW = wrap.clientWidth - 16;
    const maxH = wrap.clientHeight - 16;
    const s = Math.min(maxW / state.width, maxH / state.height, 1) * state.zoom;
    canvas.style.width = (state.width * s) + 'px';
    canvas.style.height = (state.height * s) + 'px';
  }

  function pushHist() {
    const snap = state.layers.map(L => L.canvas.toDataURL('image/png'));
    state.history = state.history.slice(0, state.histIdx + 1);
    state.history.push(snap);
    if (state.history.length > state.maxHist) state.history.shift();
    state.histIdx = state.history.length - 1;
  }

  function restoreHist(i) {
    const snap = state.history[i];
    if (!snap) return;
    let left = snap.length;
    snap.forEach((url, idx) => {
      if (!state.layers[idx]) return;
      const img = new Image();
      img.onload = () => {
        state.layers[idx].ctx.clearRect(0, 0, state.width, state.height);
        state.layers[idx].ctx.drawImage(img, 0, 0);
        if (--left === 0) composite();
      };
      img.src = url;
    });
    state.histIdx = i;
  }

  function pt(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (state.width / rect.width),
      y: (src.clientY - rect.top) * (state.height / rect.height)
    };
  }

  function stroke(p) {
    const L = activeLayer();
    if (!L) return;
    const c = L.ctx;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = state.size;
    if (state.tool === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = state.color;
    }
    c.beginPath();
    if (!state.last) {
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + 0.01, p.y);
    } else {
      c.moveTo(state.last.x, state.last.y);
      c.lineTo(p.x, p.y);
    }
    c.stroke();
    state.last = p;
    composite();
  }

  function floodFill(x, y, fillColor) {
    const L = activeLayer();
    if (!L) return;
    const w = state.width, h = state.height;
    const img = L.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const sx = Math.floor(x), sy = Math.floor(y);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const i0 = (sy * w + sx) * 4;
    const tr = d[i0], tg = d[i0+1], tb = d[i0+2], ta = d[i0+3];
    const hex = fillColor.replace('#','');
    const fr = parseInt(hex.slice(0,2),16), fg = parseInt(hex.slice(2,4),16), fb = parseInt(hex.slice(4,6),16);
    if (tr===fr && tg===fg && tb===fb && ta===255) return;
    const stack = [[sx,sy]];
    const seen = new Uint8Array(w*h);
    const tol = 24;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const i = cy * w + cx;
      if (seen[i]) continue;
      seen[i] = 1;
      const p = i * 4;
      if (Math.abs(d[p]-tr)>tol || Math.abs(d[p+1]-tg)>tol || Math.abs(d[p+2]-tb)>tol) continue;
      d[p]=fr; d[p+1]=fg; d[p+2]=fb; d[p+3]=255;
      if (cx>0) stack.push([cx-1,cy]);
      if (cx<w-1) stack.push([cx+1,cy]);
      if (cy>0) stack.push([cx,cy-1]);
      if (cy<h-1) stack.push([cx,cy+1]);
    }
    L.ctx.putImageData(img, 0, 0);
    composite();
  }

  function onDown(e) {
    e.preventDefault();
    const p = pt(e);
    if (state.tool === 'hand') {
      state.drawing = true;
      state.last = { x: e.clientX, y: e.clientY, panX: state.pan.x, panY: state.pan.y };
      return;
    }
    if (state.tool === 'eyedropper') {
      const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor('#' + [d[0],d[1],d[2]].map(x => x.toString(16).padStart(2,'0')).join(''));
      return;
    }
    if (state.tool === 'bucket') {
      floodFill(p.x, p.y, state.color);
      pushHist();
      return;
    }
    if (state.tool === 'shapes') {
      state.drawing = true;
      state.shapeStart = p;
      return;
    }
    if (state.tool === 'brush' || state.tool === 'eraser' || state.tool === 'pen') {
      state.drawing = true;
      state.last = null;
      stroke(p);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  function onMove(e) {
    if (!state.drawing) return;
    e.preventDefault();
    if (state.tool === 'hand') return;
    if (state.tool === 'brush' || state.tool === 'eraser' || state.tool === 'pen') {
      stroke(pt(e));
    }
  }

  function onUp(e) {
    if (!state.drawing) return;
    if (state.tool === 'shapes' && state.shapeStart) {
      const p = pt(e);
      const L = activeLayer();
      if (L) {
        const c = L.ctx;
        c.strokeStyle = state.color;
        c.lineWidth = state.size;
        c.strokeRect(
          Math.min(state.shapeStart.x, p.x),
          Math.min(state.shapeStart.y, p.y),
          Math.abs(p.x - state.shapeStart.x),
          Math.abs(p.y - state.shapeStart.y)
        );
        composite();
      }
      state.shapeStart = null;
      pushHist();
    } else if (state.tool === 'brush' || state.tool === 'eraser' || state.tool === 'pen') {
      pushHist();
    }
    state.drawing = false;
    state.last = null;
  }

  function setTool(name) {
    state.tool = name === 'pen' ? 'brush' : name;
    $all('.tool-button[data-tool]').forEach(b => {
      b.setAttribute('aria-pressed', b.getAttribute('data-tool') === name ? 'true' : 'false');
    });
    $all('[data-quick-settings]').forEach(el => {
      const key = el.getAttribute('data-quick-settings');
      el.hidden = key !== name && !(name === 'brush' && key === 'brush');
    });
    const stage = $('#tool-preview-stage');
    if (stage) stage.setAttribute('data-tool', name);
    const nameEl = $('#active-tool-name');
    if (nameEl) {
      const labels = { cursor:'選択', brush:'ペン', eraser:'消しゴム', hand:'手のひら', eyedropper:'スポイト', bucket:'バケツ', shapes:'図形', text:'テキスト', lasso:'選択' };
      nameEl.textContent = labels[name] || name;
    }
  }

  function setColor(hex) {
    if (!hex) return;
    if (hex.startsWith('rgb')) {
      const m = hex.match(/\d+/g);
      if (m) hex = '#' + m.slice(0,3).map(n => Number(n).toString(16).padStart(2,'0')).join('');
    }
    state.color = hex;
    document.documentElement.style.setProperty('--preview-color', hex);
    const hexRow = $('[data-color-format="hex"] .color-code-value');
    if (hexRow) hexRow.textContent = hex.toUpperCase();
  }

  function setSize(n) {
    state.size = Math.max(1, Math.min(128, Number(n) || 8));
    const a = $('#quick-brush-size-number');
    const b = $('#quick-brush-size-range');
    if (a) a.value = state.size;
    if (b) b.value = state.size;
  }

  function exportPng() {
    composite();
    const a = document.createElement('a');
    a.download = 'versepaint.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function saveProject() {
    const data = {
      width: state.width, height: state.height,
      layers: state.layers.map(L => ({ name: L.name, visible: L.visible, data: L.canvas.toDataURL('image/png') }))
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = 'versepaint.json';
    a.href = URL.createObjectURL(blob);
    a.click();
  }

  function clearAll() {
    if (!confirm('キャンバスをクリアしますか？')) return;
    state.layers.forEach(L => L.ctx.clearRect(0, 0, state.width, state.height));
    composite();
    pushHist();
  }

  function wireMenus() {
    const nav = document.querySelector('.navigation-menu');
    if (nav) {
      nav.innerHTML = `
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">ファイル<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="new">新規作成</button></li>
              <li><button class="menu-command" type="button" data-act="open">開く…</button></li>
              <li><button class="menu-command" type="button" data-act="export">PNG書き出し</button></li>
              <li><button class="menu-command" type="button" data-act="save">プロジェクト保存</button></li>
              <li class="menu-divider"></li>
              <li><button class="menu-command" type="button" data-act="motion">モーションへ送る</button></li>
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
              <li><button class="menu-command" type="button" data-act="clear">キャンバスクリア</button></li>
            </ul>
          </details>
        </li>
        <li>
          <details class="navigation-submenu">
            <summary class="submenu-toggle">表示<span class="submenu-chevron" aria-hidden="true"></span></summary>
            <ul class="submenu-menu">
              <li><button class="menu-command" type="button" data-act="zoom-in">ズームイン</button></li>
              <li><button class="menu-command" type="button" data-act="zoom-out">ズームアウト</button></li>
              <li><button class="menu-command" type="button" data-act="zoom-reset">100% にリセット</button></li>
            </ul>
          </details>
        </li>
        <li class="menu-divider"></li>
        <li><button class="exit-command" type="button" data-act="quit">終了</button></li>
      `;
    }

    function closeMenus() {
      $all('details[open]').forEach(d => {
        if (d.classList.contains('navigation-submenu') || d.classList.contains('main-navigation')) d.open = false;
      });
    }

    $all('.menu-command, .exit-command').forEach(btn => {
      btn.disabled = false;
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMenus();
        const act = btn.getAttribute('data-act') || '';
        const t = (btn.textContent || '').trim();
        if (act === 'quit' || /終了|QUIT/i.test(t)) { location.href = './index.html'; return; }
        if (act === 'new' || /新規/.test(t)) { clearAll(); return; }
        if (act === 'export' || act === 'save' || /保存|書き出|PNG/i.test(t)) {
          if (act === 'save') saveProject(); else exportPng();
          return;
        }
        if (act === 'open' || /開く/.test(t)) { const f = $('#vp-file-open'); if (f) f.click(); return; }
        if (act === 'undo' || /元に戻す/.test(t)) { if (state.histIdx > 0) restoreHist(state.histIdx - 1); return; }
        if (act === 'redo' || /やり直/.test(t)) { if (state.histIdx < state.history.length - 1) restoreHist(state.histIdx + 1); return; }
        if (act === 'clear') { clearAll(); return; }
        if (act === 'zoom-in' || /ズームイン/.test(t)) { state.zoom = Math.min(4, state.zoom * 1.25); fit(); return; }
        if (act === 'zoom-out' || /ズームアウト/.test(t)) { state.zoom = Math.max(0.2, state.zoom / 1.25); fit(); return; }
        if (act === 'zoom-reset') { state.zoom = 1; fit(); return; }
        if (act === 'motion' || /モーション/.test(t)) {
          sessionStorage.setItem('vp-import-png', canvas.toDataURL('image/png'));
          location.href = './motion.html?w=' + state.width + '&h=' + state.height + '&fps=24';
        }
      };
    });
  }

  function mount() {
    wrap = document.getElementById('canvas');
    if (!wrap) return console.error('no #canvas');
    wrap.innerHTML = '';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.overflow = 'hidden';
    wrap.style.position = 'relative';
    wrap.style.background = '#3d3d3d';

    canvas = document.createElement('canvas');
    canvas.id = 'vp-main-canvas';
    canvas.style.background = '#fff';
    canvas.style.boxShadow = '0 8px 32px rgba(0,0,0,.35)';
    canvas.style.touchAction = 'none';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    wrap.appendChild(canvas);
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!$('#vp-file-open')) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.id = 'vp-file-open';
      inp.accept = 'image/*,.json,application/json';
      inp.hidden = true;
      document.body.appendChild(inp);
      inp.onchange = function () {
        const file = inp.files && inp.files[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const L = activeLayer();
            if (L) { L.ctx.drawImage(img, 0, 0); composite(); pushHist(); }
          };
          img.src = url;
        }
      };
    }

    state.layers = [];
    state.layers.push(makeLayer('レイヤー 1'));
    state.active = 0;
    composite();
    pushHist();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', fit);

    $all('.tool-button[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.getAttribute('data-tool')));
    });
    setTool('brush');

    ['quick-brush-size-range','quick-brush-size-number','quick-eraser-size-range','brush-size'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => setSize(el.value));
    });

    document.addEventListener('click', e => {
      const sw = e.target.closest('.swatch, [data-color], .recent-color');
      if (!sw) return;
      const c = sw.getAttribute('data-color') || sw.getAttribute('data-swatch') || getComputedStyle(sw).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') setColor(c);
    });

    window.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'b') setTool('brush');
      if (k === 'e') setTool('eraser');
      if (k === 'h') setTool('hand');
      if (k === 'i') setTool('eyedropper');
      if (k === 'g' || k === 'f') setTool('bucket');
      if (k === 'v') setTool('cursor');
      if ((e.metaKey || e.ctrlKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) { if (state.histIdx < state.history.length - 1) restoreHist(state.histIdx + 1); }
        else if (state.histIdx > 0) restoreHist(state.histIdx - 1);
      }
      if ((e.metaKey || e.ctrlKey) && k === 's') { e.preventDefault(); exportPng(); }
    });

    wireMenus();
    fit();
  }

  function start() {
    if (window.__VP_LITE_MOUNTED) return;
    if (!document.getElementById('canvas')) return;
    window.__VP_LITE_MOUNTED = true;
    mount();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  setTimeout(start, 100);
})();
