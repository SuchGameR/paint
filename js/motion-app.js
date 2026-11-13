/**
 * VerseMotion — frame-by-frame + keyframe motion graphics studio
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const state = {
    width: Math.max(64, Number(params.get('w')) || 1920),
    height: Math.max(64, Number(params.get('h')) || 1080),
    fps: Math.max(1, Math.min(60, Number(params.get('fps')) || 24)),
    duration: 48,
    frame: 0,
    playing: false,
    tool: 'select',
    onion: true,
    onionBefore: 2,
    onionAfter: 1,
    layers: [],
    selectedLayerId: null,
    selectedObjectId: null,
    objects: [], // motion objects with keyframes
    zoom: 1,
    dpr: Math.min(window.devicePixelRatio || 1, 2)
  };

  let layerSeq = 1;
  let objSeq = 1;
  let playTimer = null;
  let drawing = false;
  let lastPt = null;

  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  const tlCanvas = document.getElementById('tl-canvas');
  const tlCtx = tlCanvas.getContext('2d');

  // ---------- Easing ----------
  const EASING = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => t * (2 - t),
    easeInOut: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    cubicIn: t => t * t * t,
    cubicOut: t => (--t) * t * t + 1,
    cubicInOut: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1)
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  function sampleProp(keys, frame, fallback) {
    if (!keys || !keys.length) return fallback;
    const sorted = keys.slice().sort((a, b) => a.f - b.f);
    if (frame <= sorted[0].f) return sorted[0].v;
    if (frame >= sorted[sorted.length - 1].f) return sorted[sorted.length - 1].v;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (frame >= a.f && frame <= b.f) {
        const t = (frame - a.f) / Math.max(1, b.f - a.f);
        const ease = EASING[a.easing || 'easeOut'] || EASING.linear;
        return lerp(a.v, b.v, ease(t));
      }
    }
    return fallback;
  }

  function evalObject(o, frame) {
    return {
      x: sampleProp(o.keys.x, frame, o.x),
      y: sampleProp(o.keys.y, frame, o.y),
      rotation: sampleProp(o.keys.rotation, frame, o.rotation || 0),
      scale: sampleProp(o.keys.scale, frame, o.scale != null ? o.scale : 1),
      opacity: sampleProp(o.keys.opacity, frame, o.opacity != null ? o.opacity : 1)
    };
  }

  // ---------- Layers / objects ----------
  function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 9); }

  function addLayer(kind) {
    const layer = {
      id: uid('layer'),
      name: kind === 'cel' ? ('セル ' + layerSeq++) : ('モーション ' + layerSeq++),
      kind: kind, // 'cel' | 'motion'
      visible: true,
      cels: {}, // frame -> ImageData or canvas dataURL for hand-drawn
      objectIds: []
    };
    state.layers.push(layer);
    state.selectedLayerId = layer.id;
    if (kind === 'motion') {
      const o = createMotionObject(state.width / 2, state.height / 2);
      state.objects.push(o);
      layer.objectIds.push(o.id);
      state.selectedObjectId = o.id;
    }
    renderAll();
    return layer;
  }

  function createMotionObject(x, y) {
    return {
      id: uid('obj'),
      name: 'オブジェクト ' + (objSeq++),
      x: x, y: y, rotation: 0, scale: 1, opacity: 1,
      w: 120, h: 80,
      color: '#3b82f6',
      image: null, // optional imported raster
      keys: { x: [], y: [], rotation: [], scale: [], opacity: [] }
    };
  }

  function selectedLayer() {
    return state.layers.find(l => l.id === state.selectedLayerId) || null;
  }
  function selectedObject() {
    return state.objects.find(o => o.id === state.selectedObjectId) || null;
  }

  // ---------- Render stage ----------
  function resizeStageDisplay() {
    const wrap = document.getElementById('stage-wrap');
    const maxW = wrap.clientWidth - 32;
    const maxH = wrap.clientHeight - 32;
    const s = Math.min(maxW / state.width, maxH / state.height, 1);
    stage.style.width = (state.width * s) + 'px';
    stage.style.height = (state.height * s) + 'px';
  }

  function getCelCanvas(layer, frame, create) {
    const key = String(frame);
    if (!layer._celCanvases) layer._celCanvases = {};
    if (!layer._celCanvases[key] && create) {
      const c = document.createElement('canvas');
      c.width = state.width;
      c.height = state.height;
      layer._celCanvases[key] = c;
      if (layer.cels[key]) {
        const img = new Image();
        img.onload = () => {
          c.getContext('2d').drawImage(img, 0, 0);
          renderStage();
        };
        img.src = layer.cels[key];
      }
    }
    return layer._celCanvases[key] || null;
  }

  function renderStage() {
    stage.width = state.width;
    stage.height = state.height;
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, state.width, state.height);

    // Onion skins for cel layers
    if (state.onion) {
      state.layers.forEach(layer => {
        if (!layer.visible || layer.kind !== 'cel') return;
        for (let d = state.onionBefore; d >= 1; d--) {
          const f = state.frame - d;
          if (f < 0) continue;
          const cel = getCelCanvas(layer, f, false);
          if (!cel) continue;
          ctx.save();
          ctx.globalAlpha = 0.15 * (1 - (d - 1) / Math.max(1, state.onionBefore));
          ctx.drawImage(cel, 0, 0);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(239,68,68,0.35)';
          ctx.fillRect(0, 0, state.width, state.height);
          ctx.restore();
        }
        for (let d = 1; d <= state.onionAfter; d++) {
          const f = state.frame + d;
          if (f >= state.duration) continue;
          const cel = getCelCanvas(layer, f, false);
          if (!cel) continue;
          ctx.save();
          ctx.globalAlpha = 0.12 * (1 - (d - 1) / Math.max(1, state.onionAfter));
          ctx.drawImage(cel, 0, 0);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(34,197,94,0.35)';
          ctx.fillRect(0, 0, state.width, state.height);
          ctx.restore();
        }
      });
    }

    // Current frame cels
    state.layers.forEach(layer => {
      if (!layer.visible || layer.kind !== 'cel') return;
      const cel = getCelCanvas(layer, state.frame, false);
      if (cel) ctx.drawImage(cel, 0, 0);
    });

    // Motion objects
    state.layers.forEach(layer => {
      if (!layer.visible || layer.kind !== 'motion') return;
      layer.objectIds.forEach(id => {
        const o = state.objects.find(x => x.id === id);
        if (!o) return;
        const t = evalObject(o, state.frame);
        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.translate(t.x, t.y);
        ctx.rotate((t.rotation || 0) * Math.PI / 180);
        ctx.scale(t.scale, t.scale);
        if (o.image) {
          ctx.drawImage(o.image, -o.w / 2, -o.h / 2, o.w, o.h);
        } else {
          ctx.fillStyle = o.color || '#3b82f6';
          roundRect(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 12);
          ctx.fill();
        }
        if (o.id === state.selectedObjectId) {
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 2 / t.scale;
          ctx.strokeRect(-o.w / 2 - 4, -o.h / 2 - 4, o.w + 8, o.h + 8);
        }
        ctx.restore();
      });
    });

    updateStatus();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Timeline UI ----------
  function renderLayerList() {
    const host = document.getElementById('tl-layer-names');
    host.innerHTML = '';
    state.layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'tl-layer-row' + (layer.id === state.selectedLayerId ? ' active' : '');
      row.innerHTML = '<span class="truncate">' + escapeHtml(layer.name) + '</span>' +
        '<span class="ml-auto text-[9px] text-geist-500">' + (layer.kind === 'cel' ? 'CEL' : 'KF') + '</span>';
      row.onclick = () => {
        state.selectedLayerId = layer.id;
        if (layer.kind === 'motion' && layer.objectIds[0]) state.selectedObjectId = layer.objectIds[0];
        renderAll();
      };
      host.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderTimeline() {
    const rowH = 28;
    const leftGutter = 0;
    const frameW = 12;
    const w = Math.max(state.duration * frameW + 40, document.getElementById('tl-scroll').clientWidth || 800);
    const h = Math.max(state.layers.length * rowH + 24, 160);
    tlCanvas.width = w;
    tlCanvas.height = h;
    tlCtx.clearRect(0, 0, w, h);
    tlCtx.fillStyle = '#0a0a0a';
    tlCtx.fillRect(0, 0, w, h);

    // frame numbers
    tlCtx.fillStyle = '#525252';
    tlCtx.font = '10px ui-monospace, monospace';
    for (let f = 0; f < state.duration; f += 6) {
      const x = f * frameW + 2;
      tlCtx.fillText(String(f + 1), x, 12);
    }

    state.layers.forEach((layer, li) => {
      const y = 18 + li * rowH;
      tlCtx.fillStyle = layer.id === state.selectedLayerId ? 'rgba(59,130,246,0.12)' : 'transparent';
      tlCtx.fillRect(0, y, w, rowH);

      // cel markers / keyframes
      if (layer.kind === 'cel') {
        Object.keys(layer.cels).forEach(fk => {
          const f = Number(fk);
          const x = f * frameW;
          tlCtx.fillStyle = '#f97316';
          tlCtx.fillRect(x + 1, y + 6, frameW - 2, rowH - 12);
        });
      } else {
        layer.objectIds.forEach(oid => {
          const o = state.objects.find(x => x.id === oid);
          if (!o) return;
          const frames = new Set();
          Object.values(o.keys).forEach(arr => arr.forEach(k => frames.add(k.f)));
          frames.forEach(f => {
            const x = f * frameW;
            tlCtx.fillStyle = '#60a5fa';
            tlCtx.beginPath();
            tlCtx.arc(x + frameW / 2, y + rowH / 2, 4, 0, Math.PI * 2);
            tlCtx.fill();
          });
        });
      }
    });

    // playhead
    const px = state.frame * frameW + frameW / 2;
    tlCtx.strokeStyle = '#ef4444';
    tlCtx.lineWidth = 2;
    tlCtx.beginPath();
    tlCtx.moveTo(px, 0);
    tlCtx.lineTo(px, h);
    tlCtx.stroke();
  }

  function renderAll() {
    renderLayerList();
    renderTimeline();
    renderStage();
    resizeStageDisplay();
    syncProps();
  }

  function updateStatus() {
    const el = document.getElementById('motion-status');
    if (el) el.textContent = (state.frame + 1) + ' / ' + state.duration + ' · ' + state.fps + 'fps';
  }

  function syncProps() {
    const o = selectedObject();
    const target = document.getElementById('prop-target');
    if (!o) {
      if (target) target.textContent = '未選択';
      return;
    }
    if (target) target.textContent = o.name;
    const t = evalObject(o, state.frame);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v * 1000) / 1000; };
    set('prop-x', t.x);
    set('prop-y', t.y);
    set('prop-rot', t.rotation);
    set('prop-scale', t.scale);
    set('prop-opacity', t.opacity);
  }

  function setFrame(f) {
    state.frame = Math.max(0, Math.min(state.duration - 1, f));
    renderAll();
  }

  function togglePlay() {
    if (state.playing) {
      clearInterval(playTimer);
      playTimer = null;
      state.playing = false;
      document.getElementById('tl-play').innerHTML = '<i class="fa-solid fa-play"></i>';
    } else {
      state.playing = true;
      document.getElementById('tl-play').innerHTML = '<i class="fa-solid fa-pause"></i>';
      playTimer = setInterval(() => {
        let n = state.frame + 1;
        if (n >= state.duration) n = 0;
        setFrame(n);
      }, 1000 / state.fps);
    }
  }

  function addKeyAtCurrent() {
    const o = selectedObject();
    if (!o) return;
    const easing = (document.getElementById('prop-easing') || {}).value || 'easeOut';
    const t = evalObject(o, state.frame);
    ['x','y','rotation','scale','opacity'].forEach(prop => {
      const arr = o.keys[prop];
      const existing = arr.find(k => k.f === state.frame);
      if (existing) {
        existing.v = t[prop];
        existing.easing = easing;
      } else {
        arr.push({ f: state.frame, v: t[prop], easing });
      }
    });
    // also bake base
    o.x = t.x; o.y = t.y; o.rotation = t.rotation; o.scale = t.scale; o.opacity = t.opacity;
    renderAll();
  }

  // ---------- Drawing on cel ----------
  function canvasPoint(e) {
    const rect = stage.getBoundingClientRect();
    const sx = state.width / rect.width;
    const sy = state.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy
    };
  }

  function ensureCelForDraw() {
    let layer = selectedLayer();
    if (!layer || layer.kind !== 'cel') {
      layer = state.layers.find(l => l.kind === 'cel') || addLayer('cel');
      state.selectedLayerId = layer.id;
    }
    return getCelCanvas(layer, state.frame, true);
  }

  function saveCel(layer, frame) {
    const c = getCelCanvas(layer, frame, false);
    if (c) layer.cels[String(frame)] = c.toDataURL('image/png');
  }

  stage.addEventListener('pointerdown', e => {
    if (state.tool === 'brush') {
      drawing = true;
      lastPt = canvasPoint(e);
      const c = ensureCelForDraw();
      const cctx = c.getContext('2d');
      cctx.strokeStyle = '#111';
      cctx.lineWidth = 4;
      cctx.lineCap = 'round';
      cctx.lineJoin = 'round';
      cctx.beginPath();
      cctx.moveTo(lastPt.x, lastPt.y);
      stage.setPointerCapture(e.pointerId);
    } else if (state.tool === 'select' || state.tool === 'move') {
      // hit test motion objects
      const pt = canvasPoint(e);
      let hit = null;
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const o = state.objects[i];
        const t = evalObject(o, state.frame);
        const dx = pt.x - t.x, dy = pt.y - t.y;
        if (Math.abs(dx) < o.w * t.scale / 2 && Math.abs(dy) < o.h * t.scale / 2) {
          hit = o; break;
        }
      }
      if (hit) {
        state.selectedObjectId = hit.id;
        const layer = state.layers.find(l => l.objectIds.includes(hit.id));
        if (layer) state.selectedLayerId = layer.id;
        if (state.tool === 'move') {
          stage._drag = { o: hit, ox: pt.x - evalObject(hit, state.frame).x, oy: pt.y - evalObject(hit, state.frame).y };
        }
        renderAll();
      }
    }
  });

  stage.addEventListener('pointermove', e => {
    if (drawing && state.tool === 'brush') {
      const pt = canvasPoint(e);
      const layer = selectedLayer();
      const c = getCelCanvas(layer, state.frame, false);
      if (!c) return;
      const cctx = c.getContext('2d');
      cctx.lineTo(pt.x, pt.y);
      cctx.stroke();
      lastPt = pt;
      renderStage();
    } else if (stage._drag) {
      const pt = canvasPoint(e);
      const o = stage._drag.o;
      o.x = pt.x - stage._drag.ox;
      o.y = pt.y - stage._drag.oy;
      // live update current keys if exist
      const bump = (prop, v) => {
        const arr = o.keys[prop];
        const k = arr.find(k => k.f === state.frame);
        if (k) k.v = v;
      };
      bump('x', o.x); bump('y', o.y);
      renderStage();
      syncProps();
    }
  });

  stage.addEventListener('pointerup', e => {
    if (drawing) {
      drawing = false;
      const layer = selectedLayer();
      if (layer) saveCel(layer, state.frame);
      renderTimeline();
    }
    stage._drag = null;
  });

  // ---------- UI bindings ----------
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('btn-onion').onclick = () => {
    state.onion = !state.onion;
    document.getElementById('btn-onion').classList.toggle('active', state.onion);
    document.getElementById('onion-badge').textContent = state.onion
      ? ('Onion ON · 前' + state.onionBefore + ' / 後' + state.onionAfter)
      : 'Onion OFF';
    renderStage();
  };

  document.getElementById('onion-before').onchange = e => {
    state.onionBefore = Math.max(0, Number(e.target.value) || 0);
    renderStage();
  };
  document.getElementById('onion-after').onchange = e => {
    state.onionAfter = Math.max(0, Number(e.target.value) || 0);
    renderStage();
  };

  document.getElementById('btn-add-key').onclick = addKeyAtCurrent;

  ['prop-x','prop-y','prop-rot','prop-scale','prop-opacity'].forEach(id => {
    document.getElementById(id).onchange = e => {
      const o = selectedObject();
      if (!o) return;
      const v = Number(e.target.value);
      const map = { 'prop-x':'x', 'prop-y':'y', 'prop-rot':'rotation', 'prop-scale':'scale', 'prop-opacity':'opacity' };
      const prop = map[id];
      o[prop] = v;
      const arr = o.keys[prop];
      const k = arr.find(k => k.f === state.frame);
      if (k) k.v = v;
      else arr.push({ f: state.frame, v, easing: (document.getElementById('prop-easing')||{}).value || 'easeOut' });
      renderStage();
    };
  });

  document.getElementById('tl-prev').onclick = () => setFrame(state.frame - 1);
  document.getElementById('tl-next').onclick = () => setFrame(state.frame + 1);
  document.getElementById('tl-play').onclick = togglePlay;
  document.getElementById('tl-fps').onchange = e => {
    state.fps = Math.max(1, Math.min(60, Number(e.target.value) || 24));
    updateStatus();
  };
  document.getElementById('tl-duration').onchange = e => {
    state.duration = Math.max(1, Math.min(600, Number(e.target.value) || 48));
    if (state.frame >= state.duration) state.frame = state.duration - 1;
    renderAll();
  };

  document.getElementById('tl-add-layer').onclick = () => {
    const kind = confirm('OK = モーション(キーフレーム) / キャンセル = 手描きセル') ? 'motion' : 'cel';
    addLayer(kind);
  };
  document.getElementById('tl-add-cel').onclick = () => {
    const layer = selectedLayer() || state.layers.find(l => l.kind === 'cel');
    if (!layer || layer.kind !== 'cel') return addLayer('cel');
    getCelCanvas(layer, state.frame, true);
    saveCel(layer, state.frame);
    renderAll();
  };

  document.getElementById('btn-import-draw').onclick = () => document.getElementById('import-file').click();
  document.getElementById('import-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const layer = addLayer('motion');
        const o = state.objects.find(x => x.id === layer.objectIds[0]);
        o.image = img;
        o.w = Math.min(state.width * 0.5, img.width);
        o.h = o.w * (img.height / img.width);
        o.name = file.name;
        renderAll();
      };
      img.src = url;
      return;
    }
    // JSON project from VersePaint
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const layer = addLayer('motion');
        if (data.objects && data.objects.length) {
          data.objects.slice(0, 20).forEach((src, i) => {
            if (i === 0) {
              const o = state.objects.find(x => x.id === layer.objectIds[0]);
              o.x = src.x != null ? src.x : state.width / 2;
              o.y = src.y != null ? src.y : state.height / 2;
              o.w = src.w || 100;
              o.h = src.h || 80;
              o.name = src.type || 'import';
              o.color = src.color || '#a78bfa';
            } else {
              const o = createMotionObject(src.x || 100 + i * 20, src.y || 100 + i * 10);
              o.w = src.w || 80; o.h = src.h || 60;
              o.color = src.color || '#34d399';
              o.name = (src.type || 'obj') + '-' + i;
              state.objects.push(o);
              layer.objectIds.push(o.id);
            }
          });
        }
        alert('プロジェクトをモーション素材として読み込みました（位置をキーフレームで動かせます）');
        renderAll();
      } catch (err) {
        alert('読み込みに失敗: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  document.getElementById('btn-export-anim').onclick = () => {
    const a = document.createElement('a');
    a.download = 'versemotion-frame-' + state.frame + '.png';
    a.href = stage.toDataURL('image/png');
    a.click();
  };

  window.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowLeft') setFrame(state.frame - 1);
    if (e.key === 'ArrowRight') setFrame(state.frame + 1);
    if (e.key === 'b' || e.key === 'B') {
      state.tool = 'brush';
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'brush'));
    }
    if (e.key === 'v' || e.key === 'V') {
      state.tool = 'select';
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
    }
  });

  window.addEventListener('resize', () => resizeStageDisplay());

  // Init
  addLayer('cel');
  addLayer('motion');
  document.getElementById('tl-fps').value = state.fps;
  document.getElementById('tl-duration').value = state.duration;
  renderAll();
})();
