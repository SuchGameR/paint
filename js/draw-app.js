/**
 * VersePaint Draw — sketch-aligned illustration workspace
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const state = {
    width: Math.max(64, Number(params.get('w')) || 1920),
    height: Math.max(64, Number(params.get('h')) || 1080),
    tool: 'brush',
    color: '#111111',
    size: 4,
    layers: [],
    activeLayer: 0,
    drawing: false,
    last: null,
    pan: { x: 0, y: 0 },
    zoom: 1,
    history: [],
    historyIdx: -1,
    maxHistory: 40
  };

  let layerSeq = 1;
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const wrap = document.getElementById('canvas-wrap');

  function makeLayer(name) {
    const c = document.createElement('canvas');
    c.width = state.width;
    c.height = state.height;
    return {
      id: 'L' + (layerSeq++),
      name: name || ('レイヤー ' + layerSeq),
      canvas: c,
      ctx: c.getContext('2d'),
      visible: true
    };
  }

  function addLayer(name) {
    const L = makeLayer(name);
    state.layers.push(L);
    state.activeLayer = state.layers.length - 1;
    renderLayersUI();
    composite();
    pushHistory();
    return L;
  }

  function active() {
    return state.layers[state.activeLayer] || null;
  }

  function renderLayersUI() {
    const host = document.getElementById('layer-list');
    host.innerHTML = '';
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const L = state.layers[i];
      const row = document.createElement('div');
      row.className = 'layer-row' + (i === state.activeLayer ? ' active' : '');
      row.innerHTML =
        '<button class="vis ' + (L.visible ? 'on' : '') + '" title="表示">' +
          '<i class="fa-solid ' + (L.visible ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
        '<span class="truncate flex-1">' + escapeHtml(L.name) + '</span>';
      row.onclick = (e) => {
        if (e.target.closest('.vis')) {
          L.visible = !L.visible;
          renderLayersUI();
          composite();
          return;
        }
        state.activeLayer = i;
        renderLayersUI();
      };
      host.appendChild(row);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function composite() {
    canvas.width = state.width;
    canvas.height = state.height;
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, state.width, state.height);
    state.layers.forEach(L => {
      if (!L.visible) return;
      ctx.drawImage(L.canvas, 0, 0);
    });
    fitCanvas();
  }

  function fitCanvas() {
    const maxW = wrap.clientWidth - 48;
    const maxH = wrap.clientHeight - 72;
    const s = Math.min(maxW / state.width, maxH / state.height, 1) * state.zoom;
    canvas.style.width = (state.width * s) + 'px';
    canvas.style.height = (state.height * s) + 'px';
  }

  function pushHistory() {
    const snap = state.layers.map(L => L.canvas.toDataURL('image/png'));
    state.history = state.history.slice(0, state.historyIdx + 1);
    state.history.push(snap);
    if (state.history.length > state.maxHistory) state.history.shift();
    state.historyIdx = state.history.length - 1;
  }

  function restoreHistory(idx) {
    const snap = state.history[idx];
    if (!snap) return;
    snap.forEach((url, i) => {
      if (!state.layers[i]) return;
      const img = new Image();
      img.onload = () => {
        state.layers[i].ctx.clearRect(0, 0, state.width, state.height);
        state.layers[i].ctx.drawImage(img, 0, 0);
        if (i === snap.length - 1) composite();
      };
      img.src = url;
    });
    state.historyIdx = idx;
  }

  function drawPaletteRing() {
    const c = document.getElementById('palette-ring');
    if (!c) return;
    const g = c.getContext('2d');
    const cx = 28, cy = 28, r = 26;
    for (let a = 0; a < 360; a++) {
      const rad = (a - 90) * Math.PI / 180;
      g.strokeStyle = 'hsl(' + a + ',85%,55%)';
      g.beginPath();
      g.moveTo(cx + Math.cos(rad) * 10, cy + Math.sin(rad) * 10);
      g.lineTo(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
      g.stroke();
    }
    g.fillStyle = '#0c0c0c';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
  }

  function setColor(hex) {
    state.color = hex;
    const sw = document.getElementById('palette-swatch');
    if (sw) sw.style.background = hex;
    const inp = document.getElementById('color-hex');
    if (inp) inp.value = hex;
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = state.width / rect.width;
    const sy = state.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * sx,
      y: (src.clientY - rect.top) * sy
    };
  }

  function strokeTo(pt) {
    const L = active();
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
    if (!state.last) {
      c.beginPath();
      c.moveTo(pt.x, pt.y);
      c.lineTo(pt.x + 0.01, pt.y);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(state.last.x, state.last.y);
      c.lineTo(pt.x, pt.y);
      c.stroke();
    }
    state.last = pt;
    composite();
  }

  function onDown(e) {
    e.preventDefault();
    if (state.tool === 'hand') return;
    if (state.tool === 'eyedrop') {
      const pt = canvasPoint(e);
      const d = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
      const hex = '#' + [d[0], d[1], d[2]].map(x => x.toString(16).padStart(2, '0')).join('');
      setColor(hex);
      return;
    }
    if (state.tool === 'fill') {
      const L = active();
      if (!L) return;
      const pt = canvasPoint(e);
      L.ctx.fillStyle = state.color;
      L.ctx.beginPath();
      L.ctx.arc(pt.x, pt.y, state.size * 3, 0, Math.PI * 2);
      L.ctx.fill();
      composite();
      pushHistory();
      return;
    }
    if (state.tool === 'brush' || state.tool === 'eraser') {
      state.drawing = true;
      state.last = null;
      strokeTo(canvasPoint(e));
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  function onMove(e) {
    if (!state.drawing) return;
    e.preventDefault();
    strokeTo(canvasPoint(e));
  }

  function onUp() {
    if (state.drawing) {
      state.drawing = false;
      state.last = null;
      pushHistory();
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
    });
  });

  document.getElementById('btn-undo').onclick = () => {
    if (state.historyIdx > 0) restoreHistory(state.historyIdx - 1);
  };
  document.getElementById('btn-redo').onclick = () => {
    if (state.historyIdx < state.history.length - 1) restoreHistory(state.historyIdx + 1);
  };

  const sizeInput = document.getElementById('brush-size');
  const sizeVal = document.getElementById('brush-size-val');
  const sizeLabel = document.getElementById('size-label');
  sizeInput.oninput = () => {
    state.size = Number(sizeInput.value) || 4;
    sizeVal.textContent = String(state.size);
    if (sizeLabel) sizeLabel.textContent = state.size + 'px';
  };

  document.getElementById('color-hex').oninput = e => setColor(e.target.value);
  document.querySelectorAll('.swatch').forEach(b => {
    b.onclick = () => setColor(b.dataset.c);
  });
  document.getElementById('palette-ring').onclick = e => {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left - 28;
    const y = e.clientY - rect.top - 28;
    let ang = Math.atan2(y, x) * 180 / Math.PI + 90;
    if (ang < 0) ang += 360;
    setColor(hslToHex(ang, 85, 55));
  };

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = x => Math.round(255 * f(x)).toString(16).padStart(2, '0');
    return '#' + to(0) + to(8) + to(4);
  }

  document.getElementById('layer-plate-toggle').onclick = () => {
    document.getElementById('layer-plate').classList.toggle('open');
  };
  document.getElementById('btn-add-layer').onclick = () => addLayer();

  const menu = document.getElementById('logo-menu');
  document.getElementById('btn-logo').onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  };
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target.id !== 'btn-logo') {
      menu.classList.add('hidden');
    }
  });
  menu.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      menu.classList.add('hidden');
      if (act === 'quit') {
        location.href = './index.html';
      } else if (act === 'new') {
        if (confirm('キャンバスをクリアしますか？')) {
          state.layers.forEach(L => L.ctx.clearRect(0, 0, state.width, state.height));
          composite();
          pushHistory();
        }
      } else if (act === 'export') {
        const a = document.createElement('a');
        a.download = 'versepaint.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      } else if (act === 'save') {
        const data = {
          width: state.width,
          height: state.height,
          layers: state.layers.map(L => ({
            name: L.name,
            visible: L.visible,
            data: L.canvas.toDataURL('image/png')
          }))
        };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = document.createElement('a');
        a.download = 'versepaint-project.json';
        a.href = URL.createObjectURL(blob);
        a.click();
      } else if (act === 'open') {
        document.getElementById('file-open').click();
      } else if (act === 'to-motion') {
        sessionStorage.setItem('vp-import-png', canvas.toDataURL('image/png'));
        location.href = './motion.html?w=' + state.width + '&h=' + state.height + '&fps=24';
      }
    };
  });

  document.getElementById('file-open').onchange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const L = active() || addLayer('読み込み');
        L.ctx.drawImage(img, 0, 0);
        composite();
        pushHistory();
      };
      img.src = url;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.width) { state.width = data.width; state.height = data.height; }
          state.layers = [];
          layerSeq = 1;
          (data.layers || []).forEach((src, i) => {
            const L = makeLayer(src.name || ('レイヤー ' + (i + 1)));
            L.visible = src.visible !== false;
            const img = new Image();
            img.onload = () => {
              L.ctx.drawImage(img, 0, 0);
              composite();
            };
            img.src = src.data;
            state.layers.push(L);
          });
          if (!state.layers.length) addLayer('レイヤー 1');
          state.activeLayer = state.layers.length - 1;
          renderLayersUI();
          pushHistory();
        } catch (err) {
          alert('読み込み失敗: ' + err.message);
        }
      };
      reader.readAsText(file);
    }
  };

  window.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'b') clickTool('brush');
    if (k === 'e') clickTool('eraser');
    if (k === 'v') clickTool('select');
    if (k === 'h') clickTool('hand');
    if (k === 'i') clickTool('eyedrop');
    if (k === 'g') clickTool('fill');
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) document.getElementById('btn-redo').click();
      else document.getElementById('btn-undo').click();
    }
  });

  function clickTool(t) {
    const btn = document.querySelector('.tool-btn[data-tool="' + t + '"]');
    if (btn) btn.click();
  }

  window.addEventListener('resize', fitCanvas);

  drawPaletteRing();
  setColor('#111111');
  addLayer('レイヤー 1');
  pushHistory();
  fitCanvas();
})();
