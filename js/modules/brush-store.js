(function (global) {
    'use strict';

    const DEFAULT_CONFIG = {
        sizeScale: 1,
        opacity: 1,
        hardness: 0.9,
        spacing: 0.18,
        jitter: 0,
        scatter: 0,
        flow: 1,
        pressureSize: 1,
        pressureOpacity: 0,
        blend: 'source-over'
    };

    const BUILTINS = [
        { id: 'pen', name: 'ペン', config: { sizeScale: 1, hardness: 1, spacing: 0.12, flow: 1 } },
        { id: 'fineliner', name: '細ペン', config: { sizeScale: 0.55, hardness: 1, spacing: 0.1, pressureSize: 1.15 } },
        { id: 'ink', name: 'インク', config: { sizeScale: 1, hardness: 1, spacing: 0.1, flow: 1, pressureSize: 1.25 } },
        { id: 'pencil', name: '鉛筆', config: { sizeScale: 0.7, hardness: 0.55, spacing: 0.22, jitter: 0.08, flow: 0.55 } },
        { id: 'charcoal', name: '木炭', config: { sizeScale: 1.2, hardness: 0.25, spacing: 0.3, jitter: 0.2, scatter: 0.35, flow: 0.4 } },
        { id: 'crayon', name: 'クレヨン', config: { sizeScale: 1.1, hardness: 0.45, spacing: 0.28, jitter: 0.16, scatter: 0.2, flow: 0.55 } },
        { id: 'marker', name: 'マーカー', config: { sizeScale: 1.5, hardness: 0.8, spacing: 0.1, flow: 0.85, opacity: 0.9 } },
        { id: 'highlighter', name: '蛍光', config: { sizeScale: 2, hardness: 0.9, spacing: 0.1, flow: 0.5, opacity: 0.38 } },
        { id: 'watercolor', name: '水彩', config: { sizeScale: 1.6, hardness: 0.12, spacing: 0.3, scatter: 0.18, flow: 0.18 } },
        { id: 'oil', name: '油彩', config: { sizeScale: 1.5, hardness: 0.5, spacing: 0.26, jitter: 0.1, flow: 0.65 } },
        { id: 'airbrush', name: 'エア', config: { sizeScale: 2.2, hardness: 0.05, spacing: 0.2, flow: 0.14 } },
        { id: 'spray', name: 'スプレー', config: { sizeScale: 2.4, hardness: 0.2, spacing: 0.24, scatter: 0.7, flow: 0.22 } },
        { id: 'calligraphy', name: 'カリグラ', config: { sizeScale: 1.2, hardness: 1, spacing: 0.08, pressureSize: 1.4 } },
        { id: 'pixel', name: 'ピクセル', config: { sizeScale: 1, hardness: 1, spacing: 1, flow: 1, pixel: true } },
        { id: 'softpencil', name: 'ソフト鉛筆', config: { sizeScale: 0.85, hardness: 0.35, spacing: 0.2, jitter: 0.05, flow: 0.4 } },
        { id: 'roughink', name: 'ラフインク', config: { sizeScale: 1.1, hardness: 0.9, spacing: 0.14, jitter: 0.12, flow: 0.9 } }
    ];

    function initialize({ state, save }) {
        const mounts = [
            document.getElementById('brush-library'),
            document.getElementById('brush-library-left')
        ].filter(Boolean);
        if (!mounts.length) return null;

        if (!Array.isArray(state.customBrushes)) state.customBrushes = [];
        if (!state.brushId) state.brushId = state.paintPreset || 'pen';

        function all() {
            const custom = state.customBrushes.map(b => ({ ...b, custom: true }));
            return [...BUILTINS, ...custom];
        }

        function find(id) {
            return all().find(b => b.id === id) || BUILTINS[0];
        }

        function configOf(id) {
            const brush = find(id);
            return { ...DEFAULT_CONFIG, ...(brush.config || {}) };
        }

        function applyToState(id) {
            const brush = find(id);
            state.brushId = brush.id;
            if (BUILTINS.some(b => b.id === brush.id) || brush.custom) state.paintPreset = brush.id;
            state.brushConfig = configOf(brush.id);
            if (state.brushConfig && state.brushConfig.opacity != null) {
                state.opacity = Math.max(0.05, Math.min(1, state.brushConfig.opacity));
            }
            if (state.brushConfig && state.brushConfig.hardness != null) {
                state.hardness = state.brushConfig.hardness;
            }
            renderAll();
            if (save) save();
            return state.brushConfig;
        }

        function drawPreview(canvas, id) {
            const cfg = configOf(id);
            const dpr = Math.min(global.devicePixelRatio || 1, 2);
            const cssW = canvas.clientWidth || 220;
            const cssH = canvas.clientHeight || 54;
            canvas.width = Math.max(1, Math.round(cssW * dpr));
            canvas.height = Math.max(1, Math.round(cssH * dpr));
            const c = canvas.getContext('2d');
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, cssW, cssH);
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.strokeStyle = state.color || '#171717';
            c.fillStyle = state.color || '#171717';
            const base = Math.max(2, Math.min(18, cssH * 0.34 * (cfg.sizeScale || 1)));
            c.globalAlpha = Math.max(0.08, (cfg.opacity != null ? cfg.opacity : 1) * (cfg.flow != null ? cfg.flow : 1));
            if (cfg.pixel) {
                c.globalAlpha = 1;
                const step = Math.max(2, Math.round(base));
                for (let x = 10; x < cssW - 10; x += step) {
                    const y = cssH / 2 + Math.sin(x * 0.08) * cssH * 0.12;
                    c.fillRect(Math.round(x), Math.round(y), step, step);
                }
                return;
            }
            if ((cfg.hardness != null && cfg.hardness < 0.6) || cfg.scatter > 0.2) {
                const steps = Math.ceil((cssW - 20) / Math.max(2, base * 0.3));
                for (let i = 0; i <= steps; i++) {
                    const x = 10 + i * (cssW - 20) / steps;
                    const y = cssH / 2 + Math.sin(i * 0.5) * cssH * 0.12;
                    const r = base / 2 * (0.7 + Math.random() * 0.6);
                    const ox = (Math.random() - 0.5) * base * (cfg.scatter || 0);
                    const oy = (Math.random() - 0.5) * base * (cfg.scatter || 0);
                    const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                    g.addColorStop(0, state.color || '#171717');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    c.fillStyle = g;
                    c.beginPath();
                    c.arc(x + ox, y + oy, r, 0, Math.PI * 2);
                    c.fill();
                }
                return;
            }
            c.lineWidth = base;
            c.beginPath();
            c.moveTo(10, cssH / 2);
            c.bezierCurveTo(cssW * 0.3, cssH * 0.1, cssW * 0.65, cssH * 0.9, cssW - 10, cssH / 2);
            c.stroke();
        }

        function renderAll() {
            mounts.forEach((mount, index) => {
                mount.replaceChildren();
                const grid = document.createElement('div');
                grid.className = 'brush-lib-grid';
                all().forEach(brush => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'brush-lib-item' + (brush.id === state.brushId ? ' active' : '');
                    btn.title = brush.name;
                    const cv = document.createElement('canvas');
                    cv.className = 'brush-lib-preview';
                    const label = document.createElement('span');
                    label.textContent = brush.name;
                    btn.append(cv, label);
                    btn.addEventListener('click', () => applyToState(brush.id));
                    grid.appendChild(btn);
                    requestAnimationFrame(() => drawPreview(cv, brush.id));
                });
                mount.appendChild(grid);

                const previewWrap = document.createElement('div');
                previewWrap.className = 'brush-preview-wrap';
                const big = document.createElement('canvas');
                big.className = 'brush-preview-canvas';
                big.setAttribute('aria-label', '選択中ブラシのプレビュー');
                previewWrap.appendChild(big);
                mount.appendChild(previewWrap);
                requestAnimationFrame(() => drawPreview(big, state.brushId));

                const actions = document.createElement('div');
                actions.className = 'brush-lib-actions';
                const importBtn = document.createElement('button');
                importBtn.type = 'button';
                importBtn.className = 'geist-btn brush-lib-action';
                importBtn.innerHTML = '<i class="fa-solid fa-file-import" aria-hidden="true"></i> VPB読込';
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.vpb,application/json,.json';
                input.className = 'hidden';
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    importVPB(file);
                    input.value = '';
                });
                importBtn.addEventListener('click', () => input.click());
                const exportBtn = document.createElement('button');
                exportBtn.type = 'button';
                exportBtn.className = 'geist-btn brush-lib-action';
                exportBtn.innerHTML = '<i class="fa-solid fa-file-export" aria-hidden="true"></i> VPB書出';
                exportBtn.addEventListener('click', exportVPB);
                actions.append(importBtn, exportBtn, input);
                mount.appendChild(actions);

                const info = document.createElement('p');
                info.className = 'brush-lib-hint';
                info.textContent = 'VPBはVersePaint独自形式です。他社ブラシはVPBに変換して読み込めます。';
                mount.appendChild(info);

                if (index === 0) {
                    const sliderWrap = document.createElement('div');
                    sliderWrap.className = 'brush-lib-tuning';
                    const make = (label, key, min, max, step) => {
                        const row = document.createElement('label');
                        row.className = 'brush-tune-row';
                        const span = document.createElement('span');
                        span.textContent = label;
                        const range = document.createElement('input');
                        range.type = 'range';
                        range.min = min;
                        range.max = max;
                        range.step = step;
                        const cfg = configOf(state.brushId);
                        range.value = cfg[key] != null ? cfg[key] : DEFAULT_CONFIG[key];
                        const val = document.createElement('span');
                        val.className = 'brush-tune-val';
                        val.textContent = Number(range.value).toFixed(2);
                        range.addEventListener('input', () => {
                            const id = state.brushId;
                            const custom = state.customBrushes.find(b => b.id === id);
                            const target = custom || { id: 'custom-' + Date.now(), name: find(id).name + ' 調整', config: {} };
                            const cfgNow = configOf(id);
                            cfgNow[key] = Number(range.value);
                            target.config = { ...cfgNow };
                            if (!custom) {
                                state.customBrushes.push(target);
                                state.brushId = target.id;
                                state.paintPreset = target.id;
                            }
                            state.brushConfig = cfgNow;
                            val.textContent = Number(range.value).toFixed(2);
                            renderAll();
                            if (save) save();
                        });
                        row.append(span, range, val);
                        return row;
                    };
                    sliderWrap.append(
                        make('硬さ', 'hardness', 0, 1, 0.01),
                        make('間隔', 'spacing', 0.04, 1, 0.01),
                        make('揺らぎ', 'jitter', 0, 1, 0.01),
                        make('散布', 'scatter', 0, 1, 0.01),
                        make('流量', 'flow', 0.05, 1, 0.01)
                    );
                    mount.appendChild(sliderWrap);
                }
            });
            refreshActive();
        }

        function refreshActive() {
            document.querySelectorAll('.brush-lib-item').forEach(el => {
                const label = el.querySelector('span')?.textContent || '';
                const brush = all().find(b => b.name === label);
                el.classList.toggle('active', !!brush && brush.id === state.brushId);
            });
        }

        function sanitizeVPB(data) {
            if (!data || typeof data !== 'object') return null;
            const cfgSource = data.config || data.settings || data;
            const cfg = { ...DEFAULT_CONFIG };
            Object.keys(DEFAULT_CONFIG).forEach(k => {
                if (cfgSource && cfgSource[k] != null && !Number.isNaN(Number(cfgSource[k]))) cfg[k] = Number(cfgSource[k]);
            });
            if (cfgSource && cfgSource.blend) cfg.blend = String(cfgSource.blend);
            return {
                id: 'imported-' + Date.now(),
                name: String(data.name || data.brushName || '読み込みブラシ').slice(0, 40),
                author: data.author ? String(data.author).slice(0, 60) : '',
                config: cfg
            };
        }

        function importVPB(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result));
                    const brush = sanitizeVPB(parsed);
                    if (!brush) throw new Error('invalid');
                    state.customBrushes.push(brush);
                    applyToState(brush.id);
                    alert(`ブラシ「${brush.name}」を読み込みました`);
                } catch (error) {
                    alert('VPBの読み込みに失敗しました。VersePaint VPB(JSON)形式を選択してください。');
                }
            };
            reader.readAsText(file);
        }

        function exportVPB() {
            const brush = find(state.brushId);
            const payload = {
                format: 'vpb',
                version: 1,
                engine: 'raster',
                name: brush.name,
                author: 'VersePaint',
                config: configOf(state.brushId)
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (brush.name || 'brush').replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, '_') + '.vpb';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        state.brushConfig = configOf(state.brushId);
        renderAll();
        return { renderAll, applyToState, configOf, exportVPB, refreshPreview: () => renderAll(), BUILTINS };
    }

    global.VersePaintBrushStore = { initialize, BUILTINS, DEFAULT_CONFIG };
})(window);
