document.addEventListener('DOMContentLoaded', () => {
        // ===== STATE =====
        const state = window.VersePaintState.createInitialState(window.devicePixelRatio);
        const palettes = window.VersePaintPalettes;

        const container = document.getElementById('canvas-container');
        const canvas = document.getElementById('main-canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        const brushCursor = document.getElementById('brush-cursor');
        const selectionBox = document.getElementById('selection-box');
        const textEditor = document.getElementById('text-editor-container');

        function uid() {
            return 'id-' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
        }

        const PAINT_CHUNK_SIZE = 1024;
        const OBJECT_CHUNK_SIZE = 512;

        function ensurePaintLayer() {
            if (!(state.paintChunks instanceof Map)) state.paintChunks = new Map();
            return state.paintChunks;
        }

        function paintChunk(cx, cy, create) {
            const chunks = ensurePaintLayer();
            const key = `${cx},${cy}`;
            let tile = chunks.get(key);
            if (!tile && create) {
                const c = document.createElement('canvas');
                c.width = PAINT_CHUNK_SIZE;
                c.height = PAINT_CHUNK_SIZE;
                tile = { canvas: c, ctx: c.getContext('2d') };
                chunks.set(key, tile);
            }
            return tile || null;
        }

        function writablePaintChunk(cx, cy) {
            const key = `${cx},${cy}`;
            let current = ensurePaintLayer().get(key);
            if (!current) {
                current = paintChunk(cx, cy, true);
                state.paintCowSet.add(key);
                return current;
            }
            if (!state.paintCowSet.has(key)) {
                const canvasCopy = document.createElement('canvas');
                canvasCopy.width = PAINT_CHUNK_SIZE;
                canvasCopy.height = PAINT_CHUNK_SIZE;
                const copy = { canvas: canvasCopy, ctx: canvasCopy.getContext('2d') };
                copy.ctx.drawImage(current.canvas, 0, 0);
                state.paintChunks.set(key, copy);
                state.paintCowSet.add(key);
                return copy;
            }
            return current;
        }

        function drawPaintLayer(targetCtx, viewport) {
            const chunks = ensurePaintLayer();
            if (!viewport || !chunks.size) {
                if (!viewport) chunks.forEach((tile, key) => {
                    const [cx, cy] = key.split(',').map(Number);
                    targetCtx.drawImage(tile.canvas, cx * PAINT_CHUNK_SIZE, cy * PAINT_CHUNK_SIZE);
                });
                return;
            }
            const minCX = Math.floor(viewport.x / PAINT_CHUNK_SIZE);
            const minCY = Math.floor(viewport.y / PAINT_CHUNK_SIZE);
            const maxCX = Math.floor((viewport.x + viewport.w) / PAINT_CHUNK_SIZE);
            const maxCY = Math.floor((viewport.y + viewport.h) / PAINT_CHUNK_SIZE);
            const cells = (maxCX - minCX + 1) * (maxCY - minCY + 1);
            if (cells > chunks.size * 4) {
                chunks.forEach((tile, key) => {
                    const [cx, cy] = key.split(',').map(Number);
                    const x = cx * PAINT_CHUNK_SIZE;
                    const y = cy * PAINT_CHUNK_SIZE;
                    if (boundsIntersect({ x, y, w: PAINT_CHUNK_SIZE, h: PAINT_CHUNK_SIZE }, viewport)) {
                        targetCtx.drawImage(tile.canvas, x, y);
                    }
                });
                return;
            }
            for (let cy = minCY; cy <= maxCY; cy++) {
                for (let cx = minCX; cx <= maxCX; cx++) {
                    const tile = chunks.get(`${cx},${cy}`);
                    if (tile) {
                        targetCtx.drawImage(tile.canvas, cx * PAINT_CHUNK_SIZE, cy * PAINT_CHUNK_SIZE);
                    }
                }
            }
        }

        function paintLayerBounds() {
            const chunks = ensurePaintLayer();
            if (!chunks.size) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            chunks.forEach((tile, key) => {
                const [cx, cy] = key.split(',').map(Number);
                minX = Math.min(minX, cx * PAINT_CHUNK_SIZE);
                minY = Math.min(minY, cy * PAINT_CHUNK_SIZE);
                maxX = Math.max(maxX, (cx + 1) * PAINT_CHUNK_SIZE);
                maxY = Math.max(maxY, (cy + 1) * PAINT_CHUNK_SIZE);
            });
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        function serializePaintLayer(chunks = ensurePaintLayer()) {
            const tiles = [];
            chunks.forEach((tile, key) => {
                const [x, y] = key.split(',').map(Number);
                tiles.push({ x, y, data: tile.canvas.toDataURL('image/png') });
            });
            return tiles.length ? { format: 'chunks-v1', tiles } : null;
        }

        function restorePaintLayer(data, legacyOrigin) {
            const chunks = ensurePaintLayer();
            state.paintChunks = new Map();
            state.paintCowSet = new Set();
            state.paintCanvas = null;
            state.paintCtx = null;
            const restoreId = ++state.paintRestoreId;
            if (!data) {
                state.paintRevision++;
                return;
            }

            const loadImage = (src) => new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Failed to restore raster paint data'));
                image.src = src;
            });
            const load = async () => {
                if (data && data.format === 'chunks-v1' && Array.isArray(data.tiles)) {
                    for (const tileData of data.tiles) {
                        const image = await loadImage(tileData.data);
                        if (restoreId !== state.paintRestoreId) return;
                        const tile = paintChunk(tileData.x, tileData.y, true);
                        tile.ctx.drawImage(image, 0, 0, PAINT_CHUNK_SIZE, PAINT_CHUNK_SIZE);
                    }
                } else if (typeof data === 'string') {
                    const image = await loadImage(data);
                    if (restoreId !== state.paintRestoreId) return;
                    const origin = legacyOrigin || { x: -image.width / 2, y: -image.height / 2 };
                    const minCX = Math.floor(origin.x / PAINT_CHUNK_SIZE);
                    const minCY = Math.floor(origin.y / PAINT_CHUNK_SIZE);
                    const maxCX = Math.ceil((origin.x + image.width) / PAINT_CHUNK_SIZE);
                    const maxCY = Math.ceil((origin.y + image.height) / PAINT_CHUNK_SIZE);
                    for (let cy = minCY; cy < maxCY; cy++) {
                        for (let cx = minCX; cx < maxCX; cx++) {
                            const left = Math.max(origin.x, cx * PAINT_CHUNK_SIZE);
                            const top = Math.max(origin.y, cy * PAINT_CHUNK_SIZE);
                            const right = Math.min(origin.x + image.width, (cx + 1) * PAINT_CHUNK_SIZE);
                            const bottom = Math.min(origin.y + image.height, (cy + 1) * PAINT_CHUNK_SIZE);
                            if (right <= left || bottom <= top) continue;
                            const tile = paintChunk(cx, cy, true);
                            tile.ctx.drawImage(
                                image,
                                left - origin.x, top - origin.y, right - left, bottom - top,
                                left - cx * PAINT_CHUNK_SIZE, top - cy * PAINT_CHUNK_SIZE, right - left, bottom - top
                            );
                        }
                    }
                }
                state.paintRevision++;
                invalidateScene();
                render();
            };
            load().catch((error) => console.error('Raster paint restore failed', error));
        }

        // ===== RESIZE =====
        function resize() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const dpr = state.dpr;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            render();
        }
        window.addEventListener('resize', resize);

        // ===== HISTORY (sync, stable) =====
        function cloneObjects(objs) {
            return JSON.parse(JSON.stringify(objs));
        }

        function makeSnapshot() {
            return {
                objects: cloneObjects(state.objects),
                layers: JSON.parse(JSON.stringify(state.layers)),
                activeLayerId: state.activeLayerId,
                paintChunks: new Map(ensurePaintLayer()),
                paintRevision: state.paintRevision
            };
        }

        function snapshotsEqual(a, b) {
            if (!a || !b) return false;
            if (a.activeLayerId !== b.activeLayerId) return false;
            if (a.layers.length !== b.layers.length) return false;
            if (a.paintRevision !== b.paintRevision) return false;
            return JSON.stringify(a.objects) === JSON.stringify(b.objects);
        }

        // Call BEFORE mutating the canvas. Stores the pre-change state.
        function pushHistory() {
            if (state.historyLocked) return;
            let snap;
            try { snap = makeSnapshot(); } catch (e) { console.warn('snapshot failed', e); return; }
            const last = state.undoStack[state.undoStack.length - 1];
            try {
                if (last && typeof snapshotsEqual === 'function' && snapshotsEqual(last, snap)) return;
            } catch (_) {}
            state.undoStack.push(snap);
            while (state.undoStack.length > (state.maxHistory || 80)) state.undoStack.shift();
            state.redoStack = [];
            state.paintCowSet = new Set();
            updateHistoryButtons();
        }

        function pushRasterHistory() {
            state._rasterHistoryOnly = true;
            try {
                pushHistory();
            } finally {
                state._rasterHistoryOnly = false;
            }
        }

        function applySnapshot(snap) {
            if (!snap) return;
            state.historyLocked = true;
            try {
                state.objects = snap.objects ? JSON.parse(JSON.stringify(snap.objects)) : [];
                state.layers = snap.layers ? JSON.parse(JSON.stringify(snap.layers)) : state.layers;
                state.activeLayerId = snap.activeLayerId || (state.layers[0] && state.layers[0].id);
                state.selectedIds.clear();
                state.currentObj = null;
                state.activeStrokeCanvas = null;
                state.isDrawing = false;
                state._penObj = null;
                state._paintStroke = false;
                if (snap.paintChunks instanceof Map) {
                    state.paintChunks = new Map(snap.paintChunks);
                    state.paintRevision = snap.paintRevision || 0;
                    state.paintCowSet = new Set();
                } else {
                    restorePaintLayer(snap.paintData, snap.paintOrigin);
                }
                if (typeof invalidateScene === 'function') invalidateScene();
                invalidateObjectIndex();
                updateHistoryButtons();
                if (typeof updateSelectionUI === 'function') updateSelectionUI();
                if (typeof renderLayerList === 'function') renderLayerList();
                render();
            } finally {
                state.historyLocked = false;
            }
        }

        function undo() {
            if (!state.undoStack || state.undoStack.length === 0) return;
            try {
                const current = makeSnapshot();
                const snap = state.undoStack.pop();
                state.redoStack.push(current);
                applySnapshot(snap);
            } catch (e) {
                console.error('undo failed', e);
            }
            updateHistoryButtons();
        }

        function redo() {
            if (!state.redoStack || state.redoStack.length === 0) return;
            try {
                const current = makeSnapshot();
                const snap = state.redoStack.pop();
                state.undoStack.push(current);
                applySnapshot(snap);
            } catch (e) {
                console.error('redo failed', e);
            }
            updateHistoryButtons();
        }

        function updateHistoryButtons() {
            const u = document.getElementById('btn-undo');
            const r = document.getElementById('btn-redo');
            u.disabled = !state.undoStack || state.undoStack.length === 0;
            r.disabled = state.redoStack.length === 0;
            u.style.opacity = state.undoStack.length ? '1' : '0.35';
            r.style.opacity = state.redoStack.length ? '1' : '0.35';
        }

        // ===== COORDS =====
        function screenToWorld(sx, sy) {
            return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
        }
        function worldToScreen(wx, wy) {
            return { x: wx * state.zoom + state.panX, y: wy * state.zoom + state.panY };
        }

        // ===== RENDER =====
        function drawGrid() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            ctx.save();
            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            if (state.canvasBg === 'transparent') {
                // checkerboard
                const s = 12;
                for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
                    ctx.fillStyle = ((x/s + y/s) & 1) ? '#ccc' : '#fff';
                    ctx.fillRect(x, y, s, s);
                }
            } else {
                ctx.fillStyle = state.canvasBg;
                ctx.fillRect(0, 0, w, h);
            }

            if (state.gridMode === 'off') { ctx.restore(); return; }

            const step = 40 * state.zoom;
            const ox = ((state.panX % step) + step) % step;
            const oy = ((state.panY % step) + step) % step;
            const dark = state.canvasBg === '#0A0A0A';
            ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
            ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 1;

            if (state.gridMode === 'grid') {
                ctx.beginPath();
                for (let x = ox; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
                for (let y = oy; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
                ctx.stroke();
            } else {
                const r = Math.min(1.2 * state.zoom, 1.6);
                for (let x = ox; x <= w; x += step) {
                    for (let y = oy; y <= h; y += step) {
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.restore();
        }


        function roundRectPath(ctx, x, y, w, h, r) {
            if (w < 0) { x += w; w = -w; }
            if (h < 0) { y += h; h = -h; }
            r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function starPoints(cx, cy, outer, inner, n) {
            const pts = [];
            for (let i = 0; i < n * 2; i++) {
                const ang = (i * Math.PI) / n - Math.PI / 2;
                const rad = i % 2 === 0 ? outer : inner;
                pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
            }
            return pts;
        }

        function worldViewport() {
            const pad = 80 / Math.max(state.zoom, 0.01);
            const a = screenToWorld(-pad, -pad);
            const b = screenToWorld(window.innerWidth + pad, window.innerHeight + pad);
            return {
                x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
                w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)
            };
        }
        function boundsIntersect(a, b) {
            if (!a || !b) return true;
            return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
        }
        function applyObjectRotation(ctx, obj) {
            const rot = obj.rotation || 0;
            if (!rot) return;
            const b = getBounds(obj);
            if (!b) return;
            const cx = (obj.pivotX != null) ? obj.pivotX : b.x + b.w / 2;
            const cy = (obj.pivotY != null) ? obj.pivotY : b.y + b.h / 2;
            ctx.translate(cx, cy);
            ctx.rotate((rot * Math.PI) / 180);
            ctx.translate(-cx, -cy);
        }
        function applyMaskClip(ctx, mask) {
            if (!mask) return;
            ctx.save();
            applyObjectRotation(ctx, mask);
            ctx.beginPath();
            if (mask.type === 'circle') {
                const cx = mask.x + (mask.w || 0) / 2, cy = mask.y + (mask.h || 0) / 2;
                const rx = Math.max(0.5, Math.abs(mask.w || 0) / 2), ry = Math.max(0.5, Math.abs(mask.h || mask.w || 0) / 2);
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            } else if (mask.type === 'path' && mask.points && mask.points.length) {
                mask.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
                if (mask.closed) ctx.closePath();
            } else if (mask.type === 'bezier' && mask.anchors) {
                const a = mask.anchors;
                ctx.moveTo(a[0].x, a[0].y);
                for (let i = 1; i < a.length; i++) {
                    const p0 = a[i-1], p1 = a[i];
                    ctx.bezierCurveTo(p0.x+(p0.outX||0), p0.y+(p0.outY||0), p1.x+(p1.inX||0), p1.y+(p1.inY||0), p1.x, p1.y);
                }
                if (mask.closed) ctx.closePath();
            } else {
                const mb = getBounds(mask);
                if (mb) {
                    const r = mask.cornerRadius || 0;
                    roundRectPath(ctx, mb.x, mb.y, mb.w, mb.h, r);
                }
            }
            ctx.clip();
            // keep mask transform for content? No — content has own transform.
            // We need clip in world space with mask rotation, then reset matrix for object.
            // clip is in current transform; restoring matrix keeps clip in device space — correct.
            ctx.setTransform(ctx.getTransform()); // no-op placeholder
        }
        function isLayerLocked(layerId) {
            const layer = state.layers.find(l => l.id === layerId);
            return !!(layer && layer.locked);
        }
        function drawObject(obj) {
            if (!obj) return;
            const layer = state.layers.find(l => l.id === obj.layerId);
            if (layer && !layer.visible) return;
            // viewport culling (skip offscreen unless selected)
            if (!state.selectedIds.has(obj.id)) {
                const b = getBounds(obj);
                const vp = state._vp || worldViewport();
                if (b && !boundsIntersect(b, vp)) return;
            }

            ctx.save();
            // Mask: build clip with mask rotation in world space
            if (obj.maskId) {
                const mask = state.objects.find(o => o.id === obj.maskId);
                if (mask) {
                    // Use nested save so we can clip in rotated mask space then continue
                    const m = ctx.getTransform();
                    applyObjectRotation(ctx, mask);
                    ctx.beginPath();
                    if (mask.type === 'circle') {
                        const cx = mask.x + (mask.w || 0) / 2, cy = mask.y + (mask.h || 0) / 2;
                        const rx = Math.max(0.5, Math.abs(mask.w || 0) / 2), ry = Math.max(0.5, Math.abs(mask.h || mask.w || 0) / 2);
                        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                    } else if (mask.type === 'path' && mask.points && mask.points.length) {
                        mask.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
                        if (mask.closed !== false) ctx.closePath();
                    } else {
                        const mb = getBounds(mask);
                        if (mb) roundRectPath(ctx, mb.x, mb.y, mb.w, mb.h, mask.cornerRadius || 0);
                    }
                    ctx.clip();
                    // Reset to pre-mask-rotation transform while keeping clip
                    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
                }
            }
            // Object rotation (after mask clip so rotated content is clipped correctly)
            applyObjectRotation(ctx, obj);
            if (obj.blur) {
                ctx.filter = `blur(${obj.blur}px)`;
            }
            ctx.strokeStyle = obj.color;
            ctx.fillStyle = obj.fill || obj.color;
            const sw = obj.strokeWidth || 1;
            ctx.lineWidth = Math.max(sw, 0.75 / Math.max(state.zoom, 0.001));
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = obj.opacity ?? 1;
            if (obj.soft) {
                ctx.shadowBlur = obj.strokeWidth * 0.5;
                ctx.shadowColor = obj.color;
            }
            const selected = state.selectedIds.has(obj.id);

            if (obj.type === 'path' && obj.points && obj.points.length) {
                if (obj.fill || obj.closed) {
                    ctx.beginPath();
                    ctx.moveTo(obj.points[0].x, obj.points[0].y);
                    for (let i = 1; i < obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
                    if (obj.closed) ctx.closePath();
                    if (obj.fill) { ctx.fillStyle = obj.fill; ctx.fill(); }
                    if (obj.strokeWidth) ctx.stroke();
                } else {
                    drawBrushStroke(ctx, obj);
                }
            } else if (obj.type === 'bezier' && obj.anchors) {
                drawBezier(ctx, obj);
            } else if (obj.type === 'image' && obj.src) {
                if (!obj._img) {
                    obj._img = new Image();
                    obj._img.src = obj.src;
                    obj._img.onload = () => render();
                }
                if (obj._img.complete) {
                    ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
                    ctx.drawImage(obj._img, obj.x, obj.y, obj.w, obj.h);
                }
            } else if (obj.type === 'rect' || obj.type === 'roundrect') {
                const r = obj.cornerRadius || (obj.type === 'roundrect' ? Math.min(Math.abs(obj.w), Math.abs(obj.h)) * 0.15 : 0);
                ctx.beginPath();
                roundRectPath(ctx, obj.x, obj.y, obj.w, obj.h, r);
                if (obj.fill) ctx.fill();
                ctx.stroke();
            } else if (obj.type === 'circle') {
                const cx = obj.x + (obj.w || 0) / 2, cy = obj.y + (obj.h || 0) / 2;
                const rx = Math.max(0.5, Math.abs(obj.w || 0) / 2), ry = Math.max(0.5, Math.abs(obj.h || obj.w || 0) / 2);
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (obj.fill) ctx.fill();
                if (obj.strokeWidth !== 0) ctx.stroke();
            } else if (obj.type === 'triangle' || obj.type === 'star' || obj.type === 'hexagon') {
                let pts = [];
                const cx = obj.x + (obj.w || 0) / 2, cy = obj.y + (obj.h || 0) / 2;
                const rx = Math.abs(obj.w || 0) / 2, ry = Math.abs(obj.h || 0) / 2;
                if (obj.type === 'triangle') {
                    pts = [{ x: cx, y: obj.y }, { x: obj.x + obj.w, y: obj.y + obj.h }, { x: obj.x, y: obj.y + obj.h }];
                } else if (obj.type === 'star') {
                    pts = starPoints(cx, cy, Math.max(rx, ry), Math.max(rx, ry) * 0.4, 5);
                } else {
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
                    }
                }
                ctx.beginPath();
                pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
                ctx.closePath();
                if (obj.fill) ctx.fill();
                ctx.stroke();
            } else if (obj.type === 'line' || obj.type === 'arrow') {
                ctx.beginPath();
                ctx.moveTo(obj.x1, obj.y1);
                ctx.lineTo(obj.x2, obj.y2);
                ctx.stroke();
                if (obj.type === 'arrow') {
                    const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
                    const head = Math.max(10, obj.strokeWidth * 2.2);
                    ctx.beginPath();
                    ctx.moveTo(obj.x2, obj.y2);
                    ctx.lineTo(obj.x2 - head * Math.cos(angle - 0.4), obj.y2 - head * Math.sin(angle - 0.4));
                    ctx.moveTo(obj.x2, obj.y2);
                    ctx.lineTo(obj.x2 - head * Math.cos(angle + 0.4), obj.y2 - head * Math.sin(angle + 0.4));
                    ctx.stroke();
                }
            } else if (obj.type === 'text') {
                const ff = obj.fontFamily || 'Inter';
                const fw = obj.fontWeight || '400';
                const fs = obj.fontSize || 22;
                ctx.font = `${fw} ${fs}px ${ff}, system-ui, sans-serif`;
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(obj.text, obj.x, obj.y);
            }

            if (selected) {
                // Handles must not inherit blur filter
                ctx.filter = 'none';
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.globalAlpha = 1;
                drawEditHandles(ctx, obj);
            }
            ctx.restore();
        }

        function getBounds(obj) {
            if (obj.type === 'path' && obj.points && obj.points.length) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                obj.points.forEach(p => {
                    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
                });
                const pad = (obj.strokeWidth || 4) / 2;
                return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
            }
            if (['rect','roundrect','triangle','star','hexagon'].includes(obj.type)) {
                const x = Math.min(obj.x, obj.x + (obj.w||0));
                const y = Math.min(obj.y, obj.y + (obj.h||0));
                return { x, y, w: Math.abs(obj.w||0), h: Math.abs(obj.h||0) };
            }
            if (obj.type === 'circle') {
                const x = Math.min(obj.x, obj.x + (obj.w||0));
                const y = Math.min(obj.y, obj.y + (obj.h||0));
                return { x, y, w: Math.abs(obj.w||0), h: Math.abs(obj.h||obj.w||0) };
            }
            if (obj.type === 'line' || obj.type === 'arrow') {
                const x = Math.min(obj.x1, obj.x2), y = Math.min(obj.y1, obj.y2);
                return { x, y, w: Math.abs(obj.x2 - obj.x1) || 1, h: Math.abs(obj.y2 - obj.y1) || 1 };
            }
            if (obj.type === 'text') {
                return { x: obj.x, y: obj.y - (obj.fontSize || 22), w: Math.max(40, (obj.text || '').length * (obj.fontSize || 22) * 0.55), h: obj.fontSize || 22 };
            }
            if (obj.type === 'image') {
                return { x: obj.x, y: obj.y, w: obj.w || 0, h: obj.h || 0 };
            }
            if (obj.type === 'bezier' && obj.anchors && obj.anchors.length) {
                let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                obj.anchors.forEach(a => {
                    const pts = [
                        [a.x, a.y],
                        [a.x + (a.inX || 0), a.y + (a.inY || 0)],
                        [a.x + (a.outX || 0), a.y + (a.outY || 0)]
                    ];
                    pts.forEach(([x, y]) => {
                        if (x < minx) minx = x; if (x > maxx) maxx = x;
                        if (y < miny) miny = y; if (y > maxy) maxy = y;
                    });
                });
                return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
            }
                        if (obj.type === 'group') {
                if (obj.w != null && obj.h != null) return { x: obj.x||0, y: obj.y||0, w: Math.abs(obj.w), h: Math.abs(obj.h) };
                let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
                (obj.children||[]).forEach(ch => {
                    const b = getBounds(ch);
                    if (!b) return;
                    minx=Math.min(minx,b.x); miny=Math.min(miny,b.y);
                    maxx=Math.max(maxx,b.x+b.w); maxy=Math.max(maxy,b.y+b.h);
                });
                if (!isFinite(minx)) return { x:0,y:0,w:0,h:0 };
                return { x:minx,y:miny,w:maxx-minx,h:maxy-miny };
            }
return null;
        }

        state.objectChunks = new Map();
        state.objectIndexEntries = [];
        state.objectIndexDirty = true;
        const frameObjectIndexes = new WeakMap();

        function invalidateObjectIndex() {
            state.objectIndexDirty = true;
            if (state._activeAnimFrame) frameObjectIndexes.delete(state._activeAnimFrame);
        }

        function getRenderBounds(obj) {
            const bounds = getBounds(obj);
            if (!bounds) return null;
            const pad = (obj.strokeWidth || 1) / 2 + Math.max(0, obj.blur || 0) * 3;
            let result = {
                x: bounds.x - pad,
                y: bounds.y - pad,
                w: bounds.w + pad * 2,
                h: bounds.h + pad * 2
            };
            const rotation = (obj.rotation || 0) * Math.PI / 180;
            if (rotation) {
                const cx = obj.pivotX != null ? obj.pivotX : bounds.x + bounds.w / 2;
                const cy = obj.pivotY != null ? obj.pivotY : bounds.y + bounds.h / 2;
                const radius = Math.hypot(bounds.w, bounds.h) / 2 + pad;
                result = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
            }
            return result;
        }

        function createObjectSpatialIndex(objects) {
            const chunks = new Map();
            const entries = [];
            const oversized = [];
            objects.forEach((obj, order) => {
                const bounds = getRenderBounds(obj);
                if (!bounds) return;
                const entry = { obj, order, bounds };
                entries.push(entry);
                const minCX = Math.floor(bounds.x / OBJECT_CHUNK_SIZE);
                const minCY = Math.floor(bounds.y / OBJECT_CHUNK_SIZE);
                const maxCX = Math.floor((bounds.x + bounds.w) / OBJECT_CHUNK_SIZE);
                const maxCY = Math.floor((bounds.y + bounds.h) / OBJECT_CHUNK_SIZE);
                const cells = (maxCX - minCX + 1) * (maxCY - minCY + 1);
                if (cells > 64) {
                    oversized.push(entry);
                    return;
                }
                for (let cy = minCY; cy <= maxCY; cy++) {
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        const key = `${cx},${cy}`;
                        if (!chunks.has(key)) chunks.set(key, []);
                        chunks.get(key).push(entry);
                    }
                }
            });
            return { chunks, entries, oversized };
        }

        function rebuildObjectIndex() {
            let index = state._activeAnimFrame && frameObjectIndexes.get(state._activeAnimFrame);
            if (!index || state._activeAnimFrame.objects !== state.objects) {
                index = createObjectSpatialIndex(state.objects);
                if (state._activeAnimFrame) frameObjectIndexes.set(state._activeAnimFrame, index);
            }
            state.objectChunks = index.chunks;
            state.objectIndexEntries = index.entries;
            state.objectIndexOversized = index.oversized;
            state.objectIndexDirty = false;
        }

        function querySpatialIndex(index, bounds) {
            if (!index) return [];
            const minCX = Math.floor(bounds.x / OBJECT_CHUNK_SIZE);
            const minCY = Math.floor(bounds.y / OBJECT_CHUNK_SIZE);
            const maxCX = Math.floor((bounds.x + bounds.w) / OBJECT_CHUNK_SIZE);
            const maxCY = Math.floor((bounds.y + bounds.h) / OBJECT_CHUNK_SIZE);
            const cells = (maxCX - minCX + 1) * (maxCY - minCY + 1);
            const candidates = new Set(index.oversized);
            if (cells > 4096) {
                index.entries.forEach(entry => candidates.add(entry));
            } else {
                for (let cy = minCY; cy <= maxCY; cy++) {
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        const bucket = index.chunks.get(`${cx},${cy}`);
                        if (bucket) bucket.forEach(entry => candidates.add(entry));
                    }
                }
            }
            return Array.from(candidates)
                .filter(entry => boundsIntersect(entry.bounds, bounds))
                .sort((a, b) => a.order - b.order);
        }

        function queryObjectsInBounds(bounds) {
            if (state.objectIndexDirty) rebuildObjectIndex();
            return querySpatialIndex({
                chunks: state.objectChunks,
                entries: state.objectIndexEntries,
                oversized: state.objectIndexOversized || []
            }, bounds);
        }

        function queryFrameObjectsInBounds(frame, bounds) {
            if (!frame || !Array.isArray(frame.objects)) return [];
            let index = frameObjectIndexes.get(frame);
            if (!index) {
                index = createObjectSpatialIndex(frame.objects);
                frameObjectIndexes.set(frame, index);
            }
            return querySpatialIndex(index, bounds);
        }

        function activateObjectIndex(frame) {
            state._activeAnimFrame = frame || null;
            state.animFrameLoading = false;
            const index = frame && frame.objects === state.objects
                ? frameObjectIndexes.get(frame)
                : null;
            if (index) {
                state.objectChunks = index.chunks;
                state.objectIndexEntries = index.entries;
                state.objectIndexOversized = index.oversized;
                state.objectIndexDirty = false;
            } else {
                state.objectIndexDirty = true;
            }
        }

        function render() {
            drawGrid();
            ctx.save();
            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
            ctx.translate(state.panX, state.panY);
            ctx.scale(state.zoom, state.zoom);
            // raster paint layer under vectors
            drawPaintLayer(ctx, worldViewport());
            state._vp = worldViewport();
            queryObjectsInBounds(state._vp).forEach(entry => drawObject(entry.obj));
            if (state.pixelGrid && state.zoom >= 8) {
                ctx.save();
                ctx.strokeStyle = 'rgba(128,128,128,0.35)';
                ctx.lineWidth = 1 / state.zoom;
                const b = screenToWorld(0, 0);
                const e = screenToWorld(window.innerWidth, window.innerHeight);
                const x0 = Math.floor(b.x), y0 = Math.floor(b.y);
                const x1 = Math.ceil(e.x), y1 = Math.ceil(e.y);
                ctx.beginPath();
                for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
                for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
            const zoomReset = document.getElementById('zoom-reset');
            if (zoomReset) zoomReset.textContent = Math.round(state.zoom * 100) + '%';
        }

        // ===== HIT TEST =====
        function distToSegment(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1, dy = y2 - y1;
            const len2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
            return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        }

        function hitTest(obj, x, y) {
            if (!obj) return false;
            const tol = Math.max(6, (obj.strokeWidth || 2) / 2 + 4) / Math.max(state.zoom, 0.1);

            function pointInPoly(pts, px, py) {
                if (!pts || pts.length < 3) return false;
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
                    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
                }
                return inside;
            }
            function nearPolyEdge(pts, px, py, closed) {
                if (!pts || pts.length < 2) return false;
                for (let i = 1; i < pts.length; i++) {
                    if (distToSegment(px, py, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y) < tol) return true;
                }
                if (closed && pts.length > 2) {
                    if (distToSegment(px, py, pts[pts.length-1].x, pts[pts.length-1].y, pts[0].x, pts[0].y) < tol) return true;
                }
                return false;
            }
            function shapePoints(o) {
                const cx = o.x + (o.w || 0) / 2, cy = o.y + (o.h || 0) / 2;
                const rx = Math.abs(o.w || 0) / 2, ry = Math.abs(o.h || 0) / 2;
                if (o.type === 'triangle') {
                    return [{ x: cx, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
                }
                if (o.type === 'star') return starPoints(cx, cy, Math.max(rx, ry), Math.max(rx, ry) * 0.4, 5);
                if (o.type === 'hexagon') {
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
                    }
                    return pts;
                }
                return null;
            }

            if (obj.type === 'group' && obj.children) {
                return obj.children.some(ch => hitTest(ch, x, y));
            }
            if (obj.type === 'path' && obj.points) {
                if (obj.fill && obj.closed && pointInPoly(obj.points, x, y)) return true;
                return nearPolyEdge(obj.points, x, y, obj.closed);
            }
            if (obj.type === 'bezier' && obj.anchors) {
                const pts = obj.anchors.map(a => ({ x: a.x, y: a.y }));
                if (obj.fill && obj.closed && pointInPoly(pts, x, y)) return true;
                for (let i = 1; i < obj.anchors.length; i++) {
                    // approximate by anchors polyline
                    if (distToSegment(x, y, obj.anchors[i-1].x, obj.anchors[i-1].y, obj.anchors[i].x, obj.anchors[i].y) < tol * 1.5) return true;
                }
                return false;
            }
            if (obj.type === 'rect' || obj.type === 'roundrect') {
                const minX = Math.min(obj.x, obj.x + (obj.w||0)), maxX = Math.max(obj.x, obj.x + (obj.w||0));
                const minY = Math.min(obj.y, obj.y + (obj.h||0)), maxY = Math.max(obj.y, obj.y + (obj.h||0));
                if (maxX - minX < 1 && maxY - minY < 1) return false;
                const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
                if (obj.fill) return inside;
                return (
                    (Math.abs(x - minX) < tol || Math.abs(x - maxX) < tol) && y >= minY - tol && y <= maxY + tol ||
                    (Math.abs(y - minY) < tol || Math.abs(y - maxY) < tol) && x >= minX - tol && x <= maxX + tol
                );
            }
            if (obj.type === 'triangle' || obj.type === 'star' || obj.type === 'hexagon') {
                const pts = shapePoints(obj);
                if (!pts) return false;
                if (obj.fill && pointInPoly(pts, x, y)) return true;
                return nearPolyEdge(pts, x, y, true);
            }
            if (obj.type === 'circle') {
                const cx = obj.x + (obj.w || 0) / 2, cy = obj.y + (obj.h || 0) / 2;
                const rx = Math.max(0.5, Math.abs(obj.w || 0) / 2), ry = Math.max(0.5, Math.abs(obj.h || obj.w || 0) / 2);
                const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
                if (obj.fill) return d <= 1;
                return Math.abs(d - 1) * Math.min(rx, ry) < tol;
            }
            if (obj.type === 'line' || obj.type === 'arrow') {
                return distToSegment(x, y, obj.x1, obj.y1, obj.x2, obj.y2) < tol;
            }
            if (obj.type === 'text') {
                const w = (obj.text || '').length * (obj.fontSize || 24) * 0.55;
                const h = obj.fontSize || 24;
                return x >= obj.x && x <= obj.x + w && y >= obj.y - h && y <= obj.y + h * 0.3;
            }
            if (obj.type === 'image') {
                return x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h;
            }
            return false;
        }

        function eraseObjectAt(wx, wy) {
            const before = state.objects.length;
            state.objects = state.objects.filter(obj => {
                const layer = state.layers.find(l => l.id === obj.layerId);
                if (layer && !layer.visible) return true;
                return !hitTest(obj, wx, wy);
            });
            return state.objects.length !== before;
        }

        // Partial erase: carve out points within radius, split paths into fragments
        function erasePartialAt(wx, wy) {
            const radius = Math.max(state.strokeWidth * 0.55, 4);
            let changed = false;
            const next = [];

            const objects = objectIds
                ? state.objects.filter(obj => objectIds.has(obj.id))
                : queryObjectsInBounds({ x, y, w, h }).map(entry => entry.obj);
            objects.forEach(obj => {
                const layer = state.layers.find(l => l.id === obj.layerId);
                if (layer && !layer.visible) {
                    next.push(obj);
                    return;
                }

                // Non-path shapes: only remove if eraser center is very close (optional soft object delete)
                if (obj.type !== 'path' || !obj.points || obj.points.length < 2) {
                    // shapes stay unless fully hit with object mode; partial leaves them
                    next.push(obj);
                    return;
                }

                // Split path into keep-segments outside the eraser circle
                const segments = [];
                let current = [];

                for (let i = 0; i < obj.points.length; i++) {
                    const p = obj.points[i];
                    const inside = Math.hypot(p.x - wx, p.y - wy) <= radius;
                    // also erase if the segment crosses the circle
                    let segInside = inside;
                    if (!inside && i > 0) {
                        const prev = obj.points[i - 1];
                        if (distToSegment(wx, wy, prev.x, prev.y, p.x, p.y) <= radius) {
                            segInside = true;
                        }
                    }
                    if (segInside) {
                        if (current.length >= 2) segments.push(current);
                        current = [];
                        changed = true;
                    } else {
                        current.push({ x: p.x, y: p.y });
                    }
                }
                if (current.length >= 2) segments.push(current);
                else if (current.length > 0) changed = true;

                if (segments.length === 0) {
                    changed = true;
                    return; // fully erased
                }

                // first segment reuses original id when possible
                segments.forEach((pts, idx) => {
                    if (idx === 0 && segments.length === 1 && pts.length === obj.points.length) {
                        next.push(obj); // unchanged
                    } else {
                        next.push({
                            ...obj,
                            id: idx === 0 ? obj.id : uid(),
                            points: pts
                        });
                        changed = true;
                    }
                });
            });

            if (changed) state.objects = next;
            return changed;
        }

        function eraseAt(wx, wy) {
            if (state.eraserMode === 'object') return eraseObjectAt(wx, wy);
            return erasePartialAt(wx, wy);
        }



        function stampPaintBrush(wx, wy, last) {
            ensurePaintLayer();
            if (state.pixelSnap) {
                wx = Math.round(wx);
                wy = Math.round(wy);
            }
            const r = Math.max(0.5, (state.strokeWidth || 8) / 2);
            const preset = state.paintPreset || 'pen';
            const padding = r + 2;
            const minX = Math.min(wx, last ? last.x : wx) - padding;
            const minY = Math.min(wy, last ? last.y : wy) - padding;
            const maxX = Math.max(wx, last ? last.x : wx) + padding;
            const maxY = Math.max(wy, last ? last.y : wy) + padding;
            const minCX = Math.floor(minX / PAINT_CHUNK_SIZE);
            const minCY = Math.floor(minY / PAINT_CHUNK_SIZE);
            const maxCX = Math.floor(maxX / PAINT_CHUNK_SIZE);
            const maxCY = Math.floor(maxY / PAINT_CHUNK_SIZE);

            for (let cy = minCY; cy <= maxCY; cy++) {
                for (let cx = minCX; cx <= maxCX; cx++) {
                    const pctx = writablePaintChunk(cx, cy).ctx;
                    pctx.save();
                    pctx.translate(-cx * PAINT_CHUNK_SIZE, -cy * PAINT_CHUNK_SIZE);
                    pctx.globalCompositeOperation = 'source-over';
                    pctx.lineCap = 'round';
                    pctx.lineJoin = 'round';
                    pctx.strokeStyle = state.color;
                    pctx.fillStyle = state.color;
                    pctx.globalAlpha = state.opacity * (preset === 'marker' ? 0.4 : preset === 'watercolor' ? 0.15 : preset === 'airbrush' ? 0.2 : 1);

                    if (last) {
                        pctx.lineWidth = state.strokeWidth;
                        if (preset === 'airbrush' || preset === 'watercolor') {
                            const dist = Math.hypot(wx - last.x, wy - last.y);
                            const steps = Math.max(1, Math.ceil(dist / Math.max(r * 0.7, 1)));
                            for (let i = 0; i <= steps; i++) {
                                const t = i / steps;
                                const x = last.x + (wx - last.x) * t;
                                const y = last.y + (wy - last.y) * t;
                                const g = pctx.createRadialGradient(x, y, 0, x, y, r);
                                g.addColorStop(0, state.color);
                                g.addColorStop(1, 'rgba(0,0,0,0)');
                                pctx.fillStyle = g;
                                pctx.beginPath();
                                pctx.arc(x, y, r, 0, Math.PI * 2);
                                pctx.fill();
                            }
                        } else if (preset === 'pixel') {
                            const step = Math.max(1, Math.round(state.strokeWidth));
                            pctx.fillRect(Math.round(wx / step) * step - step / 2, Math.round(wy / step) * step - step / 2, step, step);
                        } else {
                            pctx.beginPath();
                            pctx.moveTo(last.x, last.y);
                            pctx.lineTo(wx, wy);
                            pctx.stroke();
                        }
                    } else {
                        pctx.beginPath();
                        pctx.arc(wx, wy, r, 0, Math.PI * 2);
                        pctx.fill();
                    }
                    pctx.restore();
                }
            }
            state.paintRevision++;
        }

        function clearPaintLayer() {
            if (!ensurePaintLayer().size) return;
            pushRasterHistory();
            state.paintChunks = new Map();
            state.paintCowSet = new Set();
            state.paintRevision++;
            render();
        }

        // ===== BRUSH ENGINE =====
        function drawBrushStroke(ctx, obj) {
            const pts = obj.points;
            if (!pts || pts.length < 1) return;
            const preset = obj.brush || obj.preset || 'pen';
            const w = obj.strokeWidth || 8;
            const hard = obj.hardness != null ? obj.hardness : 1;

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (preset === 'pixel') {
                ctx.lineCap = 'square';
                ctx.lineJoin = 'miter';
                const step = Math.max(1, Math.round(w));
                ctx.lineWidth = step;
                ctx.beginPath();
                for (let i = 0; i < pts.length; i++) {
                    const x = Math.round(pts[i].x / step) * step;
                    const y = Math.round(pts[i].y / step) * step;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
                return;
            }

            if (preset === 'airbrush' || preset === 'watercolor' || (hard < 0.95 && preset !== 'pen')) {
                // soft stamp along path
                const spacing = Math.max(w * 0.25, 1.5);
                let dist = 0;
                let prev = pts[0];
                for (let i = 1; i < pts.length; i++) {
                    const dx = pts[i].x - prev.x, dy = pts[i].y - prev.y;
                    const len = Math.hypot(dx, dy) || 0.001;
                    dist += len;
                    while (dist >= spacing) {
                        const t = 1 - (dist - spacing) / len;
                        const x = prev.x + dx * t, y = prev.y + dy * t;
                        const r = w / 2;
                        const g = ctx.createRadialGradient(x, y, r * hard * 0.3, x, y, r);
                        const a = preset === 'watercolor' ? 0.12 : (preset === 'airbrush' ? 0.18 : 0.35);
                        g.addColorStop(0, ctx.strokeStyle);
                        // approximate alpha via globalAlpha
                        const prevA = ctx.globalAlpha;
                        ctx.globalAlpha = prevA * a * (obj.opacity != null ? obj.opacity : 1);
                        g.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = g;
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = prevA;
                        dist -= spacing;
                    }
                    prev = pts[i];
                }
                return;
            }

            if (preset === 'charcoal') {
                ctx.lineWidth = w;
                ctx.globalAlpha = (obj.opacity != null ? obj.opacity : 1) * 0.55;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    const seed = Math.sin(pts[i].x * 12.9898 + pts[i].y * 78.233) * 43758.5453;
                    const r = seed - Math.floor(seed);
                    const jx = (r - 0.5) * w * 0.35;
                    const jy = ((r * 7) % 1 - 0.5) * w * 0.35;
                    ctx.lineTo(pts[i].x + jx, pts[i].y + jy);
                }
                ctx.stroke();
                // second pass for grit
                ctx.globalAlpha = (obj.opacity != null ? obj.opacity : 1) * 0.25;
                ctx.lineWidth = w * 1.15;
                ctx.stroke();
                ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
                return;
            }

            if (preset === 'calligraphy') {
                ctx.beginPath();
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i], b = pts[i + 1];
                    const ang = Math.atan2(b.y - a.y, b.x - a.x);
                    const ww = w * (0.35 + 0.65 * Math.abs(Math.sin(ang + 0.6)));
                    ctx.lineWidth = Math.max(0.5, ww);
                    if (i === 0) ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                }
                ctx.stroke();
                return;
            }

            if (preset === 'neon') {
                ctx.save();
                ctx.shadowColor = obj.color || '#fff';
                ctx.shadowBlur = w * 1.8;
                ctx.lineWidth = Math.max(1, w * 0.45);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.lineWidth = Math.max(0.5, w * 0.2);
                ctx.strokeStyle = '#fff';
                ctx.stroke();
                ctx.restore();
                return;
            }

            // pen / marker — smooth quadratic (less jagged when zoomed)
            ctx.lineWidth = Math.max(w, 0.5 / Math.max(state.zoom, 0.01));
            if (preset === 'marker') ctx.globalAlpha = (obj.opacity != null ? obj.opacity : 1) * 0.55;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 2) {
                ctx.lineTo(pts[1].x, pts[1].y);
            } else if (pts.length > 2) {
                for (let i = 1; i < pts.length - 1; i++) {
                    const mx = (pts[i].x + pts[i + 1].x) / 2;
                    const my = (pts[i].y + pts[i + 1].y) / 2;
                    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
                }
                const last = pts[pts.length - 1];
                ctx.lineTo(last.x, last.y);
            }
            ctx.stroke();
            if (preset === 'marker') ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
        }


        function beginActiveStroke(obj) {
            const preview = document.createElement('canvas');
            preview.width = canvas.width;
            preview.height = canvas.height;
            state.activeStrokeCanvas = preview;
            const pctx = preview.getContext('2d');
            pctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            pctx.translate(state.panX, state.panY);
            pctx.scale(state.zoom, state.zoom);
            pctx.strokeStyle = obj.color;
            pctx.fillStyle = obj.color;
            pctx.globalAlpha = obj.opacity ?? 1;
            pctx.lineWidth = obj.strokeWidth || 8;
            pctx.lineCap = 'round';
            const radius = Math.max(0.5, pctx.lineWidth / 2);
            if (obj.brush === 'airbrush' || obj.brush === 'watercolor' || (obj.hardness < 0.95 && obj.brush !== 'pen')) {
                const gradient = pctx.createRadialGradient(obj.points[0].x, obj.points[0].y, 0, obj.points[0].x, obj.points[0].y, radius);
                gradient.addColorStop(0, obj.color);
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                pctx.fillStyle = gradient;
            }
            pctx.beginPath();
            pctx.arc(obj.points[0].x, obj.points[0].y, radius, 0, Math.PI * 2);
            pctx.fill();
        }

        function appendActiveStroke(obj, point) {
            const preview = state.activeStrokeCanvas;
            if (!preview || preview.width !== canvas.width || preview.height !== canvas.height) {
                beginActiveStroke(obj);
                return;
            }
            const points = obj.points;
            if (points.length < 2) return;
            const from = points[points.length - 2];
            const to = point;
            const pctx = preview.getContext('2d');
            pctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            pctx.translate(state.panX, state.panY);
            pctx.scale(state.zoom, state.zoom);
            pctx.save();
            pctx.strokeStyle = obj.color;
            pctx.fillStyle = obj.color;
            pctx.globalAlpha = obj.opacity ?? 1;
            pctx.lineWidth = Math.max(obj.strokeWidth || 8, 0.5 / Math.max(state.zoom, 0.01));
            pctx.lineCap = obj.brush === 'pixel' ? 'square' : 'round';
            pctx.lineJoin = 'round';
            const preset = obj.brush || 'pen';
            if (preset === 'airbrush' || preset === 'watercolor' || (obj.hardness < 0.95 && preset !== 'pen')) {
                const radius = Math.max(0.5, pctx.lineWidth / 2);
                const spacing = Math.max(radius * 0.7, 1);
                const distance = Math.hypot(to.x - from.x, to.y - from.y);
                const steps = Math.max(1, Math.ceil(distance / spacing));
                pctx.globalAlpha *= preset === 'watercolor' ? 0.12 : preset === 'airbrush' ? 0.18 : 0.35;
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = from.x + (to.x - from.x) * t;
                    const y = from.y + (to.y - from.y) * t;
                    const gradient = pctx.createRadialGradient(x, y, 0, x, y, radius);
                    gradient.addColorStop(0, obj.color);
                    gradient.addColorStop(1, 'rgba(0,0,0,0)');
                    pctx.fillStyle = gradient;
                    pctx.beginPath();
                    pctx.arc(x, y, radius, 0, Math.PI * 2);
                    pctx.fill();
                }
                pctx.restore();
                return;
            }
            if (obj.brush === 'neon') {
                pctx.shadowColor = obj.color;
                pctx.shadowBlur = pctx.lineWidth * 1.8;
            } else if (obj.brush === 'marker') {
                pctx.globalAlpha *= 0.55;
            } else if (obj.brush === 'calligraphy') {
                const angle = Math.atan2(to.y - from.y, to.x - from.x);
                pctx.lineWidth *= 0.35 + 0.65 * Math.abs(Math.sin(angle + 0.6));
            } else if (obj.brush === 'charcoal') {
                pctx.globalAlpha *= 0.55;
            }
            if (obj.brush === 'pixel') {
                const step = Math.max(1, Math.round(pctx.lineWidth));
                pctx.fillRect(Math.round(to.x / step) * step - step / 2, Math.round(to.y / step) * step - step / 2, step, step);
            } else {
                pctx.beginPath();
                pctx.moveTo(from.x, from.y);
                pctx.lineTo(to.x, to.y);
                pctx.stroke();
                if (obj.brush === 'neon') {
                    pctx.shadowBlur = 0;
                    pctx.strokeStyle = '#fff';
                    pctx.lineWidth = Math.max(0.5, pctx.lineWidth * 0.2);
                    pctx.stroke();
                }
            }
            pctx.restore();
        }

        // ===== BEZIER / PATH EDIT =====
        function drawBezier(ctx, obj) {
            const anchors = obj.anchors;
            if (!anchors || anchors.length < 1) return;
            ctx.beginPath();
            ctx.moveTo(anchors[0].x, anchors[0].y);
            for (let i = 1; i < anchors.length; i++) {
                const prev = anchors[i - 1];
                const cur = anchors[i];
                const cp1x = prev.x + (prev.outX != null ? prev.outX : 0);
                const cp1y = prev.y + (prev.outY != null ? prev.outY : 0);
                const cp2x = cur.x + (cur.inX != null ? cur.inX : 0);
                const cp2y = cur.y + (cur.inY != null ? cur.inY : 0);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, cur.x, cur.y);
            }
            if (obj.closed && anchors.length > 2) {
                const last = anchors[anchors.length - 1];
                const first = anchors[0];
                const cp1x = last.x + (last.outX != null ? last.outX : 0);
                const cp1y = last.y + (last.outY != null ? last.outY : 0);
                const cp2x = first.x + (first.inX != null ? first.inX : 0);
                const cp2y = first.y + (first.inY != null ? first.inY : 0);
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, first.x, first.y);
                ctx.closePath();
            }
            if (obj.fill) {
                ctx.fillStyle = obj.fill;
                ctx.fill();
            }
            if (obj.strokeWidth !== 0) ctx.stroke();
        }

        function drawEditHandles(ctx, obj) {
            const b = getBounds(obj);
            if (!b) return;
            const hs = 6 / state.zoom;
            ctx.save();
            ctx.filter = 'none';
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1.5 / state.zoom;
            ctx.strokeStyle = '#0070f3';
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            // rotation handle above top center
            const rx = b.x + b.w / 2;
            const ry = b.y - 28 / state.zoom;
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y);
            ctx.lineTo(rx, ry);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(rx, ry, 7 / state.zoom, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#0070f3';
            ctx.stroke();
            // 8 resize handles
            const pts = [
                [b.x, b.y], [b.x + b.w / 2, b.y], [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h],
                [b.x, b.y + b.h / 2]
            ];
            pts.forEach(([x, y]) => {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#0070f3';
                ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
                ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2);
            });
            ctx.restore();
        }
        function hitRotateHandle(obj, wx, wy) {
            const b = getBounds(obj);
            if (!b) return false;
            const rx = b.x + b.w / 2;
            const ry = b.y - 28 / state.zoom;
            return Math.hypot(wx - rx, wy - ry) < 12 / state.zoom;
        }


        function hitResizeHandle(obj, wx, wy) {
            const b = getBounds(obj);
            if (!b) return null;
            const tol = 10 / state.zoom;
            const pts = [
                { id: 'nw', x: b.x, y: b.y },
                { id: 'n', x: b.x + b.w / 2, y: b.y },
                { id: 'ne', x: b.x + b.w, y: b.y },
                { id: 'e', x: b.x + b.w, y: b.y + b.h / 2 },
                { id: 'se', x: b.x + b.w, y: b.y + b.h },
                { id: 's', x: b.x + b.w / 2, y: b.y + b.h },
                { id: 'sw', x: b.x, y: b.y + b.h },
                { id: 'w', x: b.x, y: b.y + b.h / 2 }
            ];
            for (const p of pts) {
                if (Math.hypot(wx - p.x, wy - p.y) <= tol) return p.id;
            }
            return null;
        }

        function hitBezierHandle(obj, wx, wy) {
            if (obj.type !== 'bezier' || !obj.anchors) return null;
            const tol = 10 / state.zoom;
            for (let i = 0; i < obj.anchors.length; i++) {
                const a = obj.anchors[i];
                if (Math.hypot(wx - a.x, wy - a.y) <= tol) return { type: 'anchor', index: i };
                if ((a.outX || a.outY) && Math.hypot(wx - (a.x + a.outX), wy - (a.y + a.outY)) <= tol)
                    return { type: 'out', index: i };
                if ((a.inX || a.inY) && Math.hypot(wx - (a.x + a.inX), wy - (a.y + a.inY)) <= tol)
                    return { type: 'in', index: i };
            }
            return null;
        }

        function applyResize(obj, handle, startBounds, wx, wy) {
            const b = startBounds;
            let x = b.x, y = b.y, w = b.w, h = b.h;
            if (handle.includes('e')) w = wx - b.x;
            if (handle.includes('s')) h = wy - b.y;
            if (handle.includes('w')) { w = b.x + b.w - wx; x = wx; }
            if (handle.includes('n')) { h = b.y + b.h - wy; y = wy; }
            // min size
            if (Math.abs(w) < 2) w = w < 0 ? -2 : 2;
            if (Math.abs(h) < 2) h = h < 0 ? -2 : 2;
            const sx = w / (b.w || 1);
            const sy = h / (b.h || 1);
            if (obj.type === 'rect' || obj.type === 'image') {
                obj.x = x; obj.y = y; obj.w = w; obj.h = h;
            } else if (obj.type === 'circle') {
                obj.x = x + w / 2; obj.y = y + h / 2;
                obj.w = w / 2; obj.h = h / 2;
            } else if (obj.type === 'path' && obj.points) {
                obj.points = obj.points.map(p => ({
                    x: x + (p.x - b.x) * sx,
                    y: y + (p.y - b.y) * sy
                }));
            } else if (obj.type === 'bezier' && obj.anchors) {
                obj.anchors = obj.anchors.map(a => ({
                    ...a,
                    x: x + (a.x - b.x) * sx,
                    y: y + (a.y - b.y) * sy,
                    inX: (a.inX || 0) * sx,
                    inY: (a.inY || 0) * sy,
                    outX: (a.outX || 0) * sx,
                    outY: (a.outY || 0) * sy
                }));
            } else if (obj.type === 'line' || obj.type === 'arrow') {
                // scale endpoints
                const pts = [
                    { x: x + (obj.x1 - b.x) * sx, y: y + (obj.y1 - b.y) * sy },
                    { x: x + (obj.x2 - b.x) * sx, y: y + (obj.y2 - b.y) * sy }
                ];
                obj.x1 = pts[0].x; obj.y1 = pts[0].y;
                obj.x2 = pts[1].x; obj.y2 = pts[1].y;
            } else if (obj.type === 'text') {
                obj.x = x;
                obj.y = y + (obj.fontSize || 22);
                obj.fontSize = Math.max(8, (obj.fontSize || 22) * Math.abs(sy));
            }
        }

                // ===== FLOOD FILL (bucket) =====
        function hexToRgb(hex) {
            const h = hex.replace('#', '');
            const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }

        function floodFillAt(screenX, screenY) {
            const w = canvas.width, h = canvas.height;
            // render without UI overlays already on main canvas — snapshot
            const img = ctx.getImageData(0, 0, w, h);
            const data = img.data;
            const x0 = Math.floor(screenX * state.dpr);
            const y0 = Math.floor(screenY * state.dpr);
            if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return false;

            const i0 = (y0 * w + x0) * 4;
            const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2];
            const [fr, fg, fb] = hexToRgb(state.color);
            const tol = state.fillTolerance | 0;
            // same color already?
            if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) <= 3) return false;

            const match = (i) => {
                const dr = Math.abs(data[i] - tr);
                const dg = Math.abs(data[i + 1] - tg);
                const db = Math.abs(data[i + 2] - tb);
                return dr + dg + db <= tol * 3;
            };

            const visited = new Uint8Array(w * h);
            const stack = [[x0, y0]];
            const minX = w, minY = h, maxX = 0, maxY = 0;
            let minx = w, miny = h, maxx = 0, maxy = 0;
            let filled = 0;
            const maxFill = w * h * 0.85;

            while (stack.length) {
                const [x, y] = stack.pop();
                if (x < 0 || y < 0 || x >= w || y >= h) continue;
                const idx = y * w + x;
                if (visited[idx]) continue;
                const pi = idx * 4;
                if (!match(pi)) continue;
                visited[idx] = 1;
                data[pi] = fr; data[pi + 1] = fg; data[pi + 2] = fb; data[pi + 3] = Math.round(255 * state.opacity);
                filled++;
                if (x < minx) minx = x; if (x > maxx) maxx = x;
                if (y < miny) miny = y; if (y > maxy) maxy = y;
                if (filled > maxFill) break;
                stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
            }
            if (filled < 2) return false;

            // crop filled region to image object
            const cw = maxx - minx + 1, ch = maxy - miny + 1;
            const off = document.createElement('canvas');
            off.width = cw; off.height = ch;
            const octx = off.getContext('2d');
            const crop = octx.createImageData(cw, ch);
            for (let yy = 0; yy < ch; yy++) {
                for (let xx = 0; xx < cw; xx++) {
                    const s = ((miny + yy) * w + (minx + xx)) * 4;
                    const d = (yy * cw + xx) * 4;
                    if (visited[(miny + yy) * w + (minx + xx)]) {
                        crop.data[d] = data[s];
                        crop.data[d + 1] = data[s + 1];
                        crop.data[d + 2] = data[s + 2];
                        crop.data[d + 3] = data[s + 3];
                    }
                }
            }
            octx.putImageData(crop, 0, 0);
            const src = off.toDataURL('image/png');
            // convert to world coords
            const worldTL = screenToWorld(minx / state.dpr, miny / state.dpr);
            const worldBR = screenToWorld((maxx + 1) / state.dpr, (maxy + 1) / state.dpr);
            pushHistory();
            state.objects.push({
                id: uid(),
                type: 'image',
                src,
                x: worldTL.x,
                y: worldTL.y,
                w: worldBR.x - worldTL.x,
                h: worldBR.y - worldTL.y,
                opacity: 1,
                layerId: state.activeLayerId
            });
            render();
            return true;
        }

        // ===== TOOLS =====
        function setTool(name) {
            state.tool = name;
            document.querySelectorAll('[id^="tool-"]').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById('tool-' + (['rect','roundrect','circle','triangle','star','hexagon','line','arrow'].includes(name) ? 'shapes' : name));
            if (btn) btn.classList.add('active');
            document.querySelectorAll('#left-toolbar [id^="tool-"]').forEach(button => {
                button.setAttribute('aria-pressed', String(button === btn));
            });
            document.getElementById('tool-badge').textContent = name.toUpperCase();
            container.style.cursor = name === 'hand' ? 'grab' : name === 'text' ? 'text' : name === 'fill' ? 'cell' : name === 'pen' ? 'crosshair' : 'crosshair';
            if (['rect','roundrect','circle','triangle','star','hexagon','line','arrow'].includes(name)) {
                const icons = {
                    rect: 'fa-regular fa-square', roundrect: 'fa-solid fa-square', circle: 'fa-regular fa-circle',
                    triangle: 'fa-solid fa-play fa-rotate-270', star: 'fa-solid fa-star', hexagon: 'fa-solid fa-stop',
                    line: 'fa-solid fa-minus', arrow: 'fa-solid fa-arrow-right'
                };
                document.getElementById('shape-icon').className = (icons[name] || 'fa-regular fa-square') + ' text-[15px]';
            }
            // show eraser mode panel
            const ep = document.getElementById('eraser-presets');
            if (ep) {
                ep.classList.toggle('hidden', name !== 'eraser');
                ep.classList.toggle('flex', name === 'eraser');
            }
            // text font panel
            const tp = document.getElementById('text-props');
            if (tp) {
                const showText = name === 'text' || hasSelectedText();
                tp.classList.toggle('hidden', !showText);
                tp.classList.toggle('flex', showText);
            }
            // brush presets always when brush tool
            const pp = document.getElementById('paint-presets');
            if (pp) {
                const showBrush = name === 'brush';
                pp.classList.toggle('hidden', !showBrush);
                pp.classList.toggle('flex', showBrush);
            }
            const fp = document.getElementById('fill-props');
            if (fp) {
                fp.classList.toggle('hidden', name !== 'fill');
                fp.classList.toggle('flex', name === 'fill');
            }
            // sync mobile dock active
            document.querySelectorAll('#mobile-dock [data-mdock]').forEach(b => {
                const t = b.getAttribute('data-mdock');
                b.classList.toggle('active', t === name || (t === 'brush' && name === 'brush'));
            });
            updateCursor();
        }

        function hasSelectedText() {
            for (const id of state.selectedIds) {
                const o = state.objects.find(x => x.id === id);
                if (o && o.type === 'text') return true;
            }
            return false;
        }

        function syncFontUIFromState() {
            const sel = document.getElementById('font-family-select');
            const slider = document.getElementById('font-size-slider');
            const val = document.getElementById('font-size-val');
            if (sel) {
                // if custom value not in options, leave
                try { sel.value = state.fontFamily; } catch (_) {}
            }
            if (slider) slider.value = state.fontSize;
            if (val) val.textContent = state.fontSize;
            document.querySelectorAll('.font-weight-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.weight === String(state.fontWeight));
            });
        }

        let _fontGesturePushed = false;
        function beginFontGesture() {
            _fontGesturePushed = false;
        }
        function applyFontToSelectedText() {
            const targets = [];
            state.selectedIds.forEach(id => {
                const o = state.objects.find(x => x.id === id);
                if (o && o.type === 'text') targets.push(o);
            });
            if (!targets.length) return;
            const anyDiff = targets.some(o =>
                o.fontFamily !== state.fontFamily || o.fontSize !== state.fontSize || String(o.fontWeight) !== String(state.fontWeight)
            );
            if (!anyDiff) return;
            if (!_fontGesturePushed) {
                pushHistory();
                _fontGesturePushed = true;
            }
            targets.forEach(o => {
                o.fontFamily = state.fontFamily;
                o.fontSize = state.fontSize;
                o.fontWeight = state.fontWeight;
            });
            render();
        }

        function setMode(m) {
            state.mode = m;
            invalidateScene();
            document.getElementById('mode-vector-btn')?.classList.toggle('active', m === 'vector');
            document.getElementById('mode-paint-btn')?.classList.toggle('active', m === 'paint');
            document.getElementById('mode-anim-btn')?.classList.toggle('active', m === 'anim');
            document.getElementById('mode-vector-btn')?.setAttribute('aria-pressed', String(m === 'vector'));
            document.getElementById('mode-paint-btn')?.setAttribute('aria-pressed', String(m === 'paint'));
            document.getElementById('mode-anim-btn')?.setAttribute('aria-pressed', String(m === 'anim'));
            // Figma-like: 編集=select, 描画=brush
            if (m === 'vector') setTool('select');
            else if (m === 'paint') {
                if (state.tool === 'select' || state.tool === 'pen') setTool('brush');
                try { ensurePaintLayer(); } catch (_) {}
                if (typeof showAnimBar === 'function') showAnimBar(false);
            } else if (m === 'anim') {
                // 映像: ベクターペン・図形・選択すべて利用可（フレームに objects を保存）
                if (state.tool === 'hand') setTool('select');
                if (typeof showAnimBar === 'function') showAnimBar(true);
                if (typeof ensureAnimSeed === 'function') ensureAnimSeed();
                if (typeof updateAnimUI === 'function') updateAnimUI();
                invalidateScene();
            } else if (m === 'vector') {
                if (typeof showAnimBar === 'function') showAnimBar(false);
            }
            const showBrush = state.tool === 'brush';
            const pp = document.getElementById('paint-presets');
            if (pp) {
                pp.classList.toggle('hidden', !showBrush);
                pp.classList.toggle('flex', showBrush);
            }
        }

        function setColor(hex) {
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
            state.color = hex.toLowerCase();
            document.getElementById('color-input').value = hex;
            document.getElementById('color-swatch').style.background = hex;
            document.getElementById('hex-input').value = hex.slice(1).toUpperCase();
            document.querySelectorAll('.swatch').forEach(s => {
                s.classList.toggle('active', s.dataset.hex === hex.toLowerCase());
            });
            const md = document.getElementById('mdock-color-dot');
            if (md) md.style.background = hex;
            window.VersePaintBrushPanel?.setColor(hex);
        }

        function renderPalette(name) {
            const grid = document.getElementById('palette-swatches') || document.getElementById('palette-grid');
            if (!grid) return;
            grid.innerHTML = '';
            (palettes[name] || palettes.mono).forEach(hex => {
                const b = document.createElement('button');
                b.className = 'swatch' + (hex.toLowerCase() === (state.color || '').toLowerCase() ? ' active' : '');
                b.style.background = hex;
                b.dataset.hex = hex.toLowerCase();
                b.title = hex;
                b.addEventListener('click', () => setColor(hex));
                grid.appendChild(b);
            });
        }

        // ===== LAYERS UI =====
        function renderLayerList() {
            const list = document.getElementById('layer-list');
            if (!list) return;
            list.innerHTML = '';
            // Illustrator-like: layers, under each the objects on that layer (top = front)
            const layersTopFirst = [...state.layers].filter(l => l.type !== 'folder' || true).reverse();
            layersTopFirst.forEach(layer => {
                if (layer.folderId) return; // children rendered under folder
                const row = document.createElement('div');
                row.className = 'flex items-center gap-1 px-1 py-1 rounded-md text-[11px] cursor-pointer ' +
                    (layer.id === state.activeLayerId ? 'bg-white/10 text-white' : 'text-geist-400 hover:bg-white/5');
                row.draggable = true;
                row.dataset.layerId = layer.id;
                row.innerHTML = `
                    <button class="layer-vis w-5 h-5 flex items-center justify-center shrink-0" title="表示">
                        <i class="fa-solid ${layer.visible !== false ? 'fa-eye' : 'fa-eye-slash'} text-[10px]"></i>
                    </button>
                    <button class="layer-lock w-5 h-5 flex items-center justify-center shrink-0" title="ロック">
                        <i class="fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'} text-[10px]"></i>
                    </button>
                    <i class="fa-solid ${layer.type==='folder'?'fa-folder':'fa-layer-group'} text-[9px] text-geist-500"></i>
                    <span class="flex-1 truncate layer-name">${layer.name}</span>
                    <button class="layer-up text-[9px] px-1 opacity-50 hover:opacity-100" title="上へ">↑</button>
                    <button class="layer-dn text-[9px] px-1 opacity-50 hover:opacity-100" title="下へ">↓</button>
                `;
                row.querySelector('.layer-name').onclick = () => { state.activeLayerId = layer.id; renderLayerList(); };
                row.querySelector('.layer-name').ondblclick = (e) => {
                    e.stopPropagation();
                    const span = e.currentTarget;
                    const input = document.createElement('input');
                    input.className = 'flex-1 bg-black/60 border border-white/20 rounded px-1 text-[11px] text-white outline-none min-w-0';
                    input.value = layer.name;
                    span.replaceWith(input);
                    input.focus(); input.select();
                    const commit = () => {
                        const v = input.value.trim();
                        if (v) {
                            layer.name = v;
                            if (state.mode === 'anim') {
                                state.animFrames.forEach(frame => {
                                    const frameLayer = frame.layers?.find(item => item.id === layer.id);
                                    if (frameLayer) frameLayer.name = v;
                                });
                            }
                        }
                        renderLayerList();
                        if (state.mode === 'anim') updateAnimUI({ rebuild: true });
                    };
                    input.onblur = commit;
                    input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') renderLayerList(); };
                };
                row.querySelector('.layer-vis').onclick = (e) => {
                    e.stopPropagation();
                    layer.visible = layer.visible === false ? true : false;
                    invalidateScene();
                    renderLayerList(); render();
                    if (state.mode === 'anim') updateAnimUI({ rebuild: true });
                };
                row.querySelector('.layer-lock').onclick = (e) => {
                    e.stopPropagation();
                    layer.locked = !layer.locked;
                    renderLayerList();
                };
                row.querySelector('.layer-up').onclick = (e) => {
                    e.stopPropagation();
                    const idx = state.layers.findIndex(l => l.id === layer.id);
                    if (idx < state.layers.length - 1) {
                        const t = state.layers[idx + 1];
                        state.layers[idx + 1] = state.layers[idx];
                        state.layers[idx] = t;
                        renderLayerList();
                        if (state.mode === 'anim') updateAnimUI({ rebuild: true });
                    }
                };
                row.querySelector('.layer-dn').onclick = (e) => {
                    e.stopPropagation();
                    const idx = state.layers.findIndex(l => l.id === layer.id);
                    if (idx > 0) {
                        const t = state.layers[idx - 1];
                        state.layers[idx - 1] = state.layers[idx];
                        state.layers[idx] = t;
                        renderLayerList();
                        if (state.mode === 'anim') updateAnimUI({ rebuild: true });
                    }
                };
                list.appendChild(row);
                // Objects on this layer (front first)
                const objs = state.objects.filter(o => o.layerId === layer.id).slice().reverse();
                objs.forEach(obj => {
                    const orow = document.createElement('div');
                    const sel = state.selectedIds.has(obj.id);
                    orow.className = 'flex items-center gap-1 pl-5 pr-1 py-0.5 rounded text-[10px] cursor-pointer ' +
                        (sel ? 'bg-blue-500/20 text-white' : 'text-geist-500 hover:bg-white/5');
                    const label = obj.type + (obj.text ? ': ' + obj.text.slice(0, 12) : '');
                    orow.innerHTML = `<span class="flex-1 truncate">${label}</span>
                        <button class="obj-up opacity-50 hover:opacity-100 px-0.5">↑</button>
                        <button class="obj-dn opacity-50 hover:opacity-100 px-0.5">↓</button>`;
                    orow.onclick = () => {
                        state.selectedIds = new Set([obj.id]);
                        state.activeLayerId = layer.id;
                        updateSelectionUI();
                        render();
                        renderLayerList();
                    };
                    orow.querySelector('.obj-up').onclick = (e) => {
                        e.stopPropagation();
                        reorderObject(obj.id, 'forward');
                    };
                    orow.querySelector('.obj-dn').onclick = (e) => {
                        e.stopPropagation();
                        reorderObject(obj.id, 'backward');
                    };
                    list.appendChild(orow);
                });
            });
        }

        // ===== INTERACTION =====
        function getPos(e) {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        container.addEventListener('pointerdown', (e) => {
            if (e.button === 2) return;
            if (state.mode === 'anim' && state.animFrameLoading) {
                e.preventDefault();
                return;
            }
            // don't start draw if text editor open
            if (textEditor.style.display === 'block') return;

            try { container.setPointerCapture(e.pointerId); } catch (_) {}
            const pos = getPos(e);
            const world = screenToWorld(pos.x, pos.y);
            state.lastMouse = pos;
            state.lastWorld = world;
            state.startWorld = world;

            // Export region pick mode (red) — highest priority
            if (state.pickingExportRegion || state.exportPickMode) {
                state.isDrawing = true;
                state.startWorld = { x: world.x, y: world.y };
                state.exportRegion = { x: world.x, y: world.y, w: 0, h: 0 };
                return;
            }

            if (state.tool === 'hand' || state.spacePressed || e.button === 1) {
                state.isPanning = true;
                container.style.cursor = 'grabbing';
                return;
            }

            if (state.tool === 'eyedropper') {
                const px = ctx.getImageData(
                    Math.floor(pos.x * state.dpr),
                    Math.floor(pos.y * state.dpr), 1, 1
                ).data;
                setColor('#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
                setTool('brush');
                return;
            }

            if (state.tool === 'text') {
                spawnText(world.x, world.y);
                return;
            }

            if (state.tool === 'select') {
                // Prefer transform handles on already-selected object (Figma-like)
                if (state.selectedIds.size === 1) {
                    const sel = state.objects.find(o => state.selectedIds.has(o.id));
                    if (sel) {
                        const bh = hitBezierHandle(sel, world.x, world.y);
                        if (bh) {
                            pushHistory();
                            state.isDrawing = true;
                            const anc = sel.anchors[bh.index];
                            state._editBezier = { objId: sel.id, ...bh, orig: JSON.parse(JSON.stringify(anc)) };
                            state._dragStart = world;
                            return;
                        }
                        if (hitRotateHandle(sel, world.x, world.y)) {
                            pushHistory();
                            state.isDrawing = true;
                            const b = getBounds(sel);
                            state._rotateObjId = sel.id;
                            state._rotateCenter = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
                            state._rotateStartAngle = Math.atan2(world.y - state._rotateCenter.y, world.x - state._rotateCenter.x);
                            state._rotateStartRot = sel.rotation || 0;
                            return;
                        }
                        const rh = hitResizeHandle(sel, world.x, world.y);
                        if (rh) {
                            pushHistory();
                            state.isDrawing = true;
                            state._resizeHandle = rh;
                            state._resizeObjId = sel.id;
                            state._resizeStartBounds = getBounds(sel);
                            state._dragStart = world;
                            state._origPositions = {};
                            state._origPositions[sel.id] = JSON.parse(JSON.stringify(sel));
                            return;
                        }
                    }
                }
                let hit = null;
                const candidates = queryObjectsInBounds({ x: world.x, y: world.y, w: 0, h: 0 });
                for (let i = candidates.length - 1; i >= 0; i--) {
                    const cand = candidates[i].obj;
                    if (isLayerLocked(cand.layerId)) continue;
                    if (hitTest(cand, world.x, world.y)) { hit = cand; break; }
                }
                if (hit) {
                    if (e.shiftKey) {
                        if (state.selectedIds.has(hit.id)) state.selectedIds.delete(hit.id);
                        else state.selectedIds.add(hit.id);
                    } else if (!state.selectedIds.has(hit.id)) {
                        state.selectedIds.clear();
                        state.selectedIds.add(hit.id);
                    }
                    updateSelectionUI();
                    render();
                    pushHistory();
                    state.isDrawing = true;
                    state._dragMove = true;
                    state._dragStart = world;
                    state._origPositions = {};
                    state.objects.forEach(o => {
                        if (state.selectedIds.has(o.id)) {
                            state._origPositions[o.id] = JSON.parse(JSON.stringify(o));
                        }
                    });
                } else {
                    if (!e.shiftKey) state.selectedIds.clear();
                    state.isMarquee = true;
                    state.marqueeStart = { x: pos.x, y: pos.y };
                    selectionBox.style.display = 'block';
                    selectionBox.style.left = pos.x + 'px';
                    selectionBox.style.top = pos.y + 'px';
                    selectionBox.style.width = '0';
                    selectionBox.style.height = '0';
                    updateSelectionUI();
                    render();
                }
                return;
            }

            // Pen / Bezier tool (Figma-like pen)
            if (state.tool === 'pen') {
                if (!state._penObj) {
                    pushHistory();
                    state._penObj = {
                        id: uid(),
                        type: 'bezier',
                        anchors: [{ x: world.x, y: world.y, inX: 0, inY: 0, outX: 0, outY: 0 }],
                        color: state.color,
                        strokeWidth: state.strokeWidth,
                        opacity: state.opacity,
                        layerId: state.activeLayerId,
                        closed: false
                    };
                    state.objects.push(state._penObj);
                    state._activeAnchor = 0;
                    state.isDrawing = true;
                    state._penDragging = true;
                } else {
                    // close if near first point
                    const first = state._penObj.anchors[0];
                    if (state._penObj.anchors.length > 2 && Math.hypot(world.x - first.x, world.y - first.y) < 12 / state.zoom) {
                        state._penObj.closed = true;
                        state._penObj = null;
                        state._activeAnchor = null;
                        state.isDrawing = false;
                        state._penDragging = false;
                        invalidateScene();
                        invalidateObjectIndex();
                        render();
                        return;
                    }
                    state._penObj.anchors.push({ x: world.x, y: world.y, inX: 0, inY: 0, outX: 0, outY: 0 });
                    state._activeAnchor = state._penObj.anchors.length - 1;
                    state.isDrawing = true;
                    state._penDragging = true;
                }
                render();
                return;
            }

            if (state.tool === 'fill') {
                const pos = getPos(e);
                floodFillAt(pos.x, pos.y);
                return;
            }

            if (state.tool === 'eraser') {
                pushHistory(); // before erasing
                state.isDrawing = true;
                state._erased = eraseAt(world.x, world.y);
                render();
                return;
            }

            // Drawing tools — snapshot before adding stroke/shape
            if (state.tool === 'brush' && state.mode === 'paint') pushRasterHistory();
            else pushHistory();
            state.isDrawing = true;
            const base = {
                id: uid(),
                layerId: state.activeLayerId,
                color: state.color,
                strokeWidth: state.strokeWidth,
                opacity: state.opacity,
                brush: state.paintPreset || state.brushPreset || 'pen',
                hardness: state.hardness
            };

            if (state.tool === 'brush') {
                // 描画モードのみラスター。映像モードはベクターブラシ（パス）も可
                if (state.mode === 'paint') {
                    try { ensurePaintLayer(); } catch (e) { console.error(e); }
                    state._paintStroke = true;
                    state._stabBuf = [];
                    state._lastPaint = { x: world.x, y: world.y };
                    stampPaintBrush(world.x, world.y, null);
                    state.isDrawing = true;
                    render();
                    return;
                }
                state.currentObj = { ...base, type: 'path', points: [{ x: world.x, y: world.y }] };
                state._stabBuf = [];
                state.objects.push(state.currentObj);
                beginActiveStroke(state.currentObj);
            } else if (['rect','roundrect','circle','triangle','star','hexagon'].includes(state.tool)) {
                state.currentObj = {
                    ...base, type: state.tool, x: world.x, y: world.y, w: 0, h: 0,
                    cornerRadius: state.tool === 'roundrect' ? 16 : 0,
                    rotation: 0, blur: 0, fill: state.color,
                    pivotX: null, pivotY: null
                };
                state.objects.push(state.currentObj);
            } else if (state.tool === 'line' || state.tool === 'arrow') {
                state.currentObj = { ...base, type: state.tool, x1: world.x, y1: world.y, x2: world.x, y2: world.y };
                state.objects.push(state.currentObj);
            }
            render();
        });

        container.addEventListener('pointermove', (e) => {
            const pos = getPos(e);
            const world = screenToWorld(pos.x, pos.y);
            state.lastWorld = world;
            if (state._penObj && !state.isDrawing) render();
            document.getElementById('hud-coords').textContent = `${Math.round(world.x)}, ${Math.round(world.y)}`;
            updateCursor(pos.x, pos.y);

            if (state.isPanning) {
                state.panX += pos.x - state.lastMouse.x;
                state.panY += pos.y - state.lastMouse.y;
                state.lastMouse = pos;
                invalidateScene();
                render();
                return;
            }

            if (state.isMarquee && state.marqueeStart) {
                const x = Math.min(state.marqueeStart.x, pos.x);
                const y = Math.min(state.marqueeStart.y, pos.y);
                const w = Math.abs(pos.x - state.marqueeStart.x);
                const h = Math.abs(pos.y - state.marqueeStart.y);
                selectionBox.style.left = x + 'px';
                selectionBox.style.top = y + 'px';
                selectionBox.style.width = w + 'px';
                selectionBox.style.height = h + 'px';
                return;
            }

            if (!state.isDrawing) return;

            // Pen tool: drag to set bezier handles
            if (state._penDragging && state._penObj && state._activeAnchor != null) {
                const a = state._penObj.anchors[state._activeAnchor];
                const dx = world.x - a.x, dy = world.y - a.y;
                a.outX = dx; a.outY = dy;
                a.inX = -dx; a.inY = -dy; // mirrored for smooth
                render();
                return;
            }

            // Edit bezier anchor/handle
            if (state._editBezier) {
                const obj = state.objects.find(o => o.id === state._editBezier.objId);
                if (obj && obj.anchors) {
                    const a = obj.anchors[state._editBezier.index];
                    if (state._editBezier.type === 'anchor') {
                        const dx = world.x - state._dragStart.x;
                        const dy = world.y - state._dragStart.y;
                        // need original - store on start
                        if (!state._editBezier.orig) state._editBezier.orig = JSON.parse(JSON.stringify(a));
                        const o = state._editBezier.orig;
                        a.x = o.x + (world.x - state._dragStart.x);
                        a.y = o.y + (world.y - state._dragStart.y);
                    } else if (state._editBezier.type === 'out') {
                        a.outX = world.x - a.x;
                        a.outY = world.y - a.y;
                        if (!e.altKey) { a.inX = -a.outX; a.inY = -a.outY; }
                    } else if (state._editBezier.type === 'in') {
                        a.inX = world.x - a.x;
                        a.inY = world.y - a.y;
                        if (!e.altKey) { a.outX = -a.inX; a.outY = -a.inY; }
                    }
                    render();
                    return;
                }
            }

            // Resize handle
            if (state._rotateObjId) {
                const obj = state.objects.find(o => o.id === state._rotateObjId);
                if (obj && state._rotateCenter) {
                    const ang = Math.atan2(world.y - state._rotateCenter.y, world.x - state._rotateCenter.x);
                    let deg = state._rotateStartRot + (ang - state._rotateStartAngle) * 180 / Math.PI;
                    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
                    obj.rotation = deg;
                    render();
                    if (typeof syncObjectPropsUI === 'function') syncObjectPropsUI();
                    return;
                }
            }
            if (state._resizeHandle && state._resizeObjId && state._resizeStartBounds) {
                const obj = state.objects.find(o => o.id === state._resizeObjId);
                if (obj) {
                    let wx = world.x, wy = world.y;
                    if (e.shiftKey) {
                        const b = state._resizeStartBounds;
                        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                        const side = Math.max(Math.abs(wx - cx), Math.abs(wy - cy));
                        wx = cx + (wx >= cx ? side : -side);
                        wy = cy + (wy >= cy ? side : -side);
                    }
                    applyResize(obj, state._resizeHandle, state._resizeStartBounds, wx, wy);
                    render();
                    return;
                }
            }

            if (state._dragMove && state._origPositions) {
                const dx = world.x - state._dragStart.x;
                const dy = world.y - state._dragStart.y;
                state.objects.forEach(o => {
                    if (!state.selectedIds.has(o.id)) return;
                    const orig = state._origPositions[o.id];
                    if (!orig) return;
                    if (o.type === 'path') {
                        o.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    } else if (o.type === 'rect' || o.type === 'circle') {
                        o.x = orig.x + dx; o.y = orig.y + dy;
                    } else if (o.type === 'line' || o.type === 'arrow') {
                        o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy;
                        o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy;
                    } else if (o.type === 'text' || o.type === 'image') {
                        o.x = orig.x + dx; o.y = orig.y + dy;
                    } else if (o.type === 'bezier' && orig.anchors) {
                        o.anchors = orig.anchors.map(a => ({
                            ...a,
                            x: a.x + dx,
                            y: a.y + dy
                        }));
                    }
                });
                render();
                return;
            }

            if (state.pickingExportRegion && state.exportRegion) {
                const x0 = state.startWorld.x, y0 = state.startWorld.y;
                let w = world.x - x0, h = world.y - y0;
                if (e.shiftKey) {
                    const s = Math.max(Math.abs(w), Math.abs(h));
                    w = (w < 0 ? -1 : 1) * s;
                    h = (h < 0 ? -1 : 1) * s;
                }
                state.exportRegion = {
                    x: Math.min(x0, x0 + w),
                    y: Math.min(y0, y0 + h),
                    w: Math.abs(w),
                    h: Math.abs(h)
                };
                render();
                return;
            }

            if (state._paintStroke) {
                let nx = world.x, ny = world.y;
                const stab = state.stabilize | 0;
                if (stab > 0) {
                    if (!state._stabBuf) state._stabBuf = [];
                    state._stabBuf.push({ x: nx, y: ny });
                    if (state._stabBuf.length > stab + 1) state._stabBuf.shift();
                    let sx = 0, sy = 0;
                    state._stabBuf.forEach(p => { sx += p.x; sy += p.y; });
                    nx = sx / state._stabBuf.length;
                    ny = sy / state._stabBuf.length;
                }
                stampPaintBrush(nx, ny, state._lastPaint);
                state._lastPaint = { x: nx, y: ny };
                render();
                return;
            }

            if (state.tool === 'eraser') {
                if (eraseAt(world.x, world.y)) state._erased = true;
                render();
                return;
            }

            if (state.currentObj) {
                if (state.currentObj.type === 'path') {
                    const pts = state.currentObj.points;
                    let nx = world.x, ny = world.y;
                    // stabilizer: moving average buffer
                    const stab = state.stabilize | 0;
                    if (stab > 0) {
                        if (!state._stabBuf) state._stabBuf = [];
                        state._stabBuf.push({ x: nx, y: ny });
                        if (state._stabBuf.length > stab + 1) state._stabBuf.shift();
                        let sx = 0, sy = 0;
                        state._stabBuf.forEach(p => { sx += p.x; sy += p.y; });
                        nx = sx / state._stabBuf.length;
                        ny = sy / state._stabBuf.length;
                    }
                    const last = pts[pts.length - 1];
                    const minDist = (state.paintPreset === 'pixel' ? Math.max(1, state.strokeWidth) : 0.6) / state.zoom;
                    if (Math.hypot(nx - last.x, ny - last.y) > minDist) {
                        const point = { x: nx, y: ny };
                        pts.push(point);
                        appendActiveStroke(state.currentObj, point);
                    }
                } else if (['rect','roundrect','circle','triangle','star','hexagon'].includes(state.currentObj.type)) {
                    let w = world.x - state.startWorld.x;
                    let h = world.y - state.startWorld.y;
                    // Shift: lock 1:1 aspect ratio
                    if (e.shiftKey) {
                        const s = Math.max(Math.abs(w), Math.abs(h)) || 0;
                        w = (w < 0 ? -1 : 1) * s;
                        h = (h < 0 ? -1 : 1) * s;
                    }
                    state.currentObj.w = w;
                    state.currentObj.h = h;
                } else if (state.currentObj.type === 'line' || state.currentObj.type === 'arrow') {
                    state.currentObj.x2 = world.x;
                    state.currentObj.y2 = world.y;
                }
                render();
            }
        });

        function endPointer() {
            if (state.isPanning) {
                state.isPanning = false;
                container.style.cursor = state.tool === 'hand' ? 'grab' : 'crosshair';
            }

            if (state.isMarquee && state.marqueeStart) {
                const r = selectionBox.getBoundingClientRect();
                const cr = canvas.getBoundingClientRect();
                const x1 = r.left - cr.left, y1 = r.top - cr.top;
                const x2 = x1 + r.width, y2 = y1 + r.height;
                const w1 = screenToWorld(x1, y1);
                const w2 = screenToWorld(x2, y2);
                const minX = Math.min(w1.x, w2.x), maxX = Math.max(w1.x, w2.x);
                const minY = Math.min(w1.y, w2.y), maxY = Math.max(w1.y, w2.y);
                if (maxX - minX > 4 || maxY - minY > 4) {
                    queryObjectsInBounds({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }).forEach(({ obj: o, bounds: b }) => {
                        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
                            state.selectedIds.add(o.id);
                        }
                    });
                    updateSelectionUI();
                    render();
                }
                selectionBox.style.display = 'none';
                state.isMarquee = false;
                state.marqueeStart = null;
            }

            if (state.isDrawing) {
                if (state.currentObj) {
                    // drop tiny accidental strokes (history already pushed on down = pre-state)
                    if (state.currentObj.type === 'path' && state.currentObj.points.length < 2) {
                        state.objects = state.objects.filter(o => o.id !== state.currentObj.id);
                    }
                    if ((['rect','roundrect','circle','triangle','star','hexagon'].includes(state.currentObj.type)) &&
                        Math.abs(state.currentObj.w || 0) < 1 && Math.abs(state.currentObj.h || 0) < 1) {
                        state.objects = state.objects.filter(o => o.id !== state.currentObj.id);
                    }
                }
            }

            state.isDrawing = false;
            const committedVector = !!state.currentObj;
            state.currentObj = null;
            state.activeStrokeCanvas = null;
            state._dragMove = false;
            state._origPositions = null;
            state._erased = false;
            state._penDragging = false;
            state._editBezier = null;
            state._resizeHandle = null;
            state._resizeObjId = null;
            state._resizeStartBounds = null;
            state._rotateObjId = null;
            state._rotateCenter = null;
            if (committedVector) {
                invalidateScene();
                invalidateObjectIndex();
            }
            state._paintStroke = false;
            state._lastPaint = null;
            render();
            if ((state.pickingExportRegion || state.exportPickMode) && state.exportRegion) {
                state.pickingExportRegion = false;
                state.exportPickMode = false;
                const t = document.getElementById('export-pick-toast');
                if (t) t.remove();
                const r = state.exportRegion;
                if (r.w > 2 && r.h > 2) {
                    document.getElementById('ex-x').value = Math.round(r.x);
                    document.getElementById('ex-y').value = Math.round(r.y);
                    document.getElementById('ex-w').value = Math.round(r.w);
                    document.getElementById('ex-h').value = Math.round(r.h);
                    openExportRegion();
                    updateExOut();
                }
            }
        }

        window.addEventListener('pointerup', endPointer);

        // Double-click text to edit
        container.addEventListener('dblclick', (e) => {
            const pos = getPos(e);
            const world = screenToWorld(pos.x, pos.y);
            for (let i = state.objects.length - 1; i >= 0; i--) {
                const o = state.objects[i];
                if (o.type === 'text' && hitTest(o, world.x, world.y)) {
                    // edit in place
                    state.selectedIds.clear();
                    state.selectedIds.add(o.id);
                    updateSelectionUI();
                    const sp = worldToScreen(o.x, o.y);
                    textEditor.style.display = 'block';
                    textEditor.style.left = Math.max(8, sp.x) + 'px';
                    textEditor.style.top = Math.max(8, sp.y - (o.fontSize || 22) * state.zoom) + 'px';
                    textEditor.style.pointerEvents = 'auto';
                    textEditor.innerHTML = '';
                    const ta = document.createElement('textarea');
                    ta.className = 'text-editor-input';
                    ta.value = o.text || '';
                    ta.style.color = o.color || state.color;
                    ta.style.fontSize = Math.max(14, (o.fontSize || 22) * state.zoom) + 'px';
                    ta.style.fontFamily = (o.fontFamily || 'Inter') + ', system-ui, sans-serif';
                    ta.style.fontWeight = o.fontWeight || '400';
                    ta.rows = 2;
                    textEditor.appendChild(ta);
                    requestAnimationFrame(() => { ta.focus(); ta.select(); });
                    let committed = false;
                    const commit = () => {
                        if (committed) return;
                        committed = true;
                        const v = ta.value.trim();
                        pushHistory();
                        if (v) {
                            o.text = v;
                            o.fontSize = state.fontSize;
                            o.fontFamily = state.fontFamily;
                            o.fontWeight = state.fontWeight;
                            o.color = state.color;
                        } else {
                            state.objects = state.objects.filter(x => x.id !== o.id);
                            state.selectedIds.delete(o.id);
                        }
                        textEditor.style.display = 'none';
                        textEditor.style.pointerEvents = 'none';
                        textEditor.innerHTML = '';
                        updateSelectionUI();
                        render();
                    };
                    ta.addEventListener('blur', () => setTimeout(commit, 50));
                    ta.addEventListener('keydown', (ev) => {
                        ev.stopPropagation();
                        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ta.blur(); }
                        if (ev.key === 'Escape') { ta.value = o.text || ''; ta.blur(); }
                    });
                    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
                    return;
                }
            }
        });

        window.addEventListener('pointercancel', endPointer);

        // Zoom / size
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const d = e.deltaY < 0 ? 2 : -2;
                state.strokeWidth = Math.max(1, Math.min(120, state.strokeWidth + d));
                document.getElementById('size-slider').value = state.strokeWidth;
                document.getElementById('size-val').textContent = state.strokeWidth;
                updateCursor();
                return;
            }
            const factor = e.deltaY < 0 ? 1.09 : 1 / 1.09;
            const mx = e.clientX - canvas.getBoundingClientRect().left;
            const my = e.clientY - canvas.getBoundingClientRect().top;
            const before = screenToWorld(mx, my);
            state.zoom = Math.min(16, Math.max(0.08, state.zoom * factor));
            const after = screenToWorld(mx, my);
            state.panX += (after.x - before.x) * state.zoom;
            state.panY += (after.y - before.y) * state.zoom;
            render();
        }, { passive: false });

        function updateCursor(x, y) {
            if (x === undefined) { x = state.lastMouse.x; y = state.lastMouse.y; }
            if (['brush', 'eraser'].includes(state.tool)) {
                brushCursor.style.display = 'block';
                const r = Math.max(4, state.strokeWidth * state.zoom);
                brushCursor.style.width = r + 'px';
                brushCursor.style.height = r + 'px';
                brushCursor.style.left = x + 'px';
                brushCursor.style.top = y + 'px';
                brushCursor.style.borderColor = state.tool === 'eraser' ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.75)';
            } else {
                brushCursor.style.display = 'none';
            }
        }

        function updateSelectionUI() {
            const el = document.getElementById('selection-actions');
            el.classList.toggle('hidden', state.selectedIds.size === 0);
            el.classList.toggle('flex', state.selectedIds.size > 0);
            // Sync font UI from first selected text object
            for (const id of state.selectedIds) {
                const o = state.objects.find(x => x.id === id);
                if (o && o.type === 'text') {
                    state.fontFamily = o.fontFamily || state.fontFamily;
                    state.fontSize = o.fontSize || state.fontSize;
                    state.fontWeight = o.fontWeight || state.fontWeight;
                    syncFontUIFromState();
                    break;
                }
            }
            const tp = document.getElementById('text-props');
            if (tp) {
                const show = state.tool === 'text' || hasSelectedText();
                tp.classList.toggle('hidden', !show);
                tp.classList.toggle('flex', show);
            }
            if (typeof syncObjectPropsUI === 'function') syncObjectPropsUI();
            // Right panel: object props only when selected; tool brush stays left
            const hasSel = state.selectedIds.size > 0;
            ['paint-presets','eraser-presets','fill-props'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                // hide tool-specific on right when showing selection focus
                if (hasSel) { el.classList.add('hidden'); el.classList.remove('flex'); }
            });
        }

        // ===== TEXT =====
        function spawnText(wx, wy) {
            const sp = worldToScreen(wx, wy);
            textEditor.style.display = 'block';
            textEditor.style.left = Math.max(8, sp.x) + 'px';
            textEditor.style.top = Math.max(8, sp.y) + 'px';
            textEditor.style.pointerEvents = 'auto';
            textEditor.innerHTML = '';
            const ta = document.createElement('textarea');
            ta.className = 'text-editor-input';
            ta.style.color = state.color;
            ta.style.fontSize = Math.max(16, 22 * state.zoom) + 'px';
            ta.placeholder = 'テキストを入力…';
            ta.rows = 2;
            textEditor.appendChild(ta);
            // focus after layout
            requestAnimationFrame(() => ta.focus());

            let committed = false;
            const commit = () => {
                if (committed) return;
                committed = true;
                const v = ta.value.trim();
                if (v) {
                    pushHistory();
                    state.objects.push({
                        id: uid(),
                        type: 'text',
                        text: v,
                        x: wx,
                        y: wy,
                        color: state.color,
                        fontSize: state.fontSize,
                        fontFamily: state.fontFamily,
                        fontWeight: state.fontWeight,
                        opacity: state.opacity,
                        layerId: state.activeLayerId
                    });
                    render();
                }
                textEditor.style.display = 'none';
                textEditor.style.pointerEvents = 'none';
                textEditor.innerHTML = '';
            };
            ta.addEventListener('blur', () => setTimeout(commit, 50));
            ta.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
                if (e.key === 'Escape') { ta.value = ''; ta.blur(); }
            });
            ta.addEventListener('pointerdown', (e) => e.stopPropagation());
        }

        // ===== EXPORT / PROJECT =====
        function exportRaster(type) {
            const w = canvas.width, h = canvas.height;
            const tmp = document.createElement('canvas');
            tmp.width = w; tmp.height = h;
            const t = tmp.getContext('2d');
            t.fillStyle = state.canvasBg;
            t.fillRect(0, 0, w, h);
            // redraw scene at current view
            t.save();
            t.scale(state.dpr, state.dpr);
            t.translate(state.panX, state.panY);
            t.scale(state.zoom, state.zoom);
            state.objects.forEach(obj => {
                // reuse draw by temporarily swapping ctx — simpler: drawImage main after render
            });
            t.restore();
            // easiest: copy current main canvas (already has bg+content)
            render();
            t.drawImage(canvas, 0, 0);
            const link = document.createElement('a');
            link.download = `infinite-studio.${type === 'jpeg' ? 'jpg' : 'png'}`;
            link.href = tmp.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
            link.click();
        }

        function exportSVG() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
            state.objects.forEach(o => {
                const b = getBounds(o);
                if (b) { grow(b.x, b.y); grow(b.x + b.w, b.y + b.h); }
            });
            if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
            const pad = 24;
            minX -= pad; minY -= pad; maxX += pad; maxY += pad;
            let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}">\n`;
            svg += `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${state.canvasBg}"/>\n`;
            state.objects.forEach(o => {
                const op = o.opacity ?? 1;
                if (o.type === 'path' && o.points && o.points.length) {
                    const d = o.points.map((p, i) => (i ? 'L' : 'M') + p.x + ',' + p.y).join(' ');
                    svg += `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="${o.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>\n`;
                } else if (o.type === 'rect') {
                    svg += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none" stroke="${o.color}" stroke-width="${o.strokeWidth}" opacity="${op}"/>\n`;
                } else if (o.type === 'circle') {
                    const r = Math.hypot(o.w, o.h);
                    svg += `<circle cx="${o.x}" cy="${o.y}" r="${r}" fill="none" stroke="${o.color}" stroke-width="${o.strokeWidth}" opacity="${op}"/>\n`;
                } else if (o.type === 'line' || o.type === 'arrow') {
                    svg += `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.color}" stroke-width="${o.strokeWidth}" stroke-linecap="round" opacity="${op}"/>\n`;
                } else if (o.type === 'text') {
                    const esc = (o.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const ff = (o.fontFamily || 'Inter').replace(/"/g, '');
                    const fw = o.fontWeight || '400';
                    svg += `<text x="${o.x}" y="${o.y}" fill="${o.color}" font-size="${o.fontSize || 22}" font-family="${ff},system-ui,sans-serif" font-weight="${fw}" opacity="${op}">${esc}</text>\n`;
                } else if (o.type === 'bezier' && o.anchors && o.anchors.length) {
                    let d = `M ${o.anchors[0].x} ${o.anchors[0].y}`;
                    for (let i = 1; i < o.anchors.length; i++) {
                        const p = o.anchors[i - 1], c = o.anchors[i];
                        d += ` C ${p.x + (p.outX||0)} ${p.y + (p.outY||0)}, ${c.x + (c.inX||0)} ${c.y + (c.inY||0)}, ${c.x} ${c.y}`;
                    }
                    if (o.closed) {
                        const p = o.anchors[o.anchors.length - 1], c = o.anchors[0];
                        d += ` C ${p.x + (p.outX||0)} ${p.y + (p.outY||0)}, ${c.x + (c.inX||0)} ${c.y + (c.inY||0)}, ${c.x} ${c.y} Z`;
                    }
                    svg += `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="${o.strokeWidth||2}" opacity="${op}" stroke-linecap="round"/>\n`;
                }
            });
            svg += '</svg>';
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const link = document.createElement('a');
            link.download = 'infinite-studio.svg';
            link.href = URL.createObjectURL(blob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        function saveProject() {
            if (state.animFrames.length) saveCurrentAnimFrame();
            const data = {
                version: 2,
                app: 'VersePaint',
                canvasBg: state.canvasBg,
                gridMode: state.gridMode,
                objects: state.objects,
                layers: state.layers,
                activeLayerId: state.activeLayerId,
                regions: state.regions || [],
                activeRegionId: state.activeRegionId,
                animFrames: state.animFrames.map(serializeAnimFrame),
                animFps: state.animFps || 12,
                infiniteCanvas: state.infiniteCanvas,
                canvasWidth: state.canvasWidth,
                canvasHeight: state.canvasHeight,
                paintData: serializePaintLayer()
            };
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const link = document.createElement('a');
            link.download = 'versepaint-project.json';
            link.href = URL.createObjectURL(blob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        function loadProjectFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                const text = reader.result;
                try {
                    if (file.name.endsWith('.json') || text.trim().startsWith('{')) {
                        const data = JSON.parse(text);
                        state.objects = data.objects || [];
                        activateObjectIndex(null);
                        invalidateScene();
                        invalidateObjectIndex();
                        state.layers = data.layers || [{ id: 'layer-1', name: 'Layer 1', visible: true }];
                        state.activeLayerId = data.activeLayerId || state.layers[0].id;
                        if (data.canvasBg) state.canvasBg = data.canvasBg;
                        if (data.gridMode) state.gridMode = data.gridMode;
                        if (data.regions) state.regions = data.regions;
                        if (data.activeRegionId) state.activeRegionId = data.activeRegionId;
                        if (data.animFps) {
                            state.animFps = Math.max(1, Math.min(60, Number(data.animFps) || 12));
                            const fpsInput = document.getElementById('anim-fps');
                            if (fpsInput) fpsInput.value = String(state.animFps);
                        }
                        state.animFrames = Array.isArray(data.animFrames) ? data.animFrames : [];
                        animIndex = 0;
                        updateAnimUI({ rebuild: true });
                        if (data.infiniteCanvas != null) state.infiniteCanvas = data.infiniteCanvas;
                        if (data.canvasWidth) state.canvasWidth = data.canvasWidth;
                        if (data.canvasHeight) state.canvasHeight = data.canvasHeight;
                        restorePaintLayer(data.paintData, data.paintOrigin);
                        if (typeof renderRegionList === 'function') renderRegionList();
                        state.selectedIds.clear();
                        state.undoStack = [];
                        state.redoStack = [];
                        pushHistory();
                        updateHistoryButtons();
                        updateSelectionUI();
                        renderLayerList();
                        render();
                    } else {
                        // SVG
                        parseSVG(text);
                    }
                } catch (err) {
                    alert('読み込みに失敗しました: ' + err.message);
                }
            };
            reader.readAsText(file);
        }

        function parseSVG(text) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (!svg) { alert('SVGを解析できません'); return; }
            const parseErr = doc.querySelector('parsererror');
            if (parseErr) { alert('SVGの構文エラーがあります'); return; }

            const newObjs = [];
            const layerId = state.activeLayerId;

            // viewBox → scale
            let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
            const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
            if (vb.length === 4 && vb.every(n => !isNaN(n))) {
                vbX = vb[0]; vbY = vb[1]; vbW = vb[2]; vbH = vb[3];
            } else {
                vbW = parseFloat(svg.getAttribute('width')) || 100;
                vbH = parseFloat(svg.getAttribute('height')) || 100;
            }

            function parseStyle(el) {
                const s = {};
                const style = el.getAttribute('style') || '';
                style.split(';').forEach(part => {
                    const [k, v] = part.split(':').map(x => x && x.trim());
                    if (k && v) s[k] = v;
                });
                return s;
            }
            function css(el, name, fallback) {
                const st = parseStyle(el);
                const a = el.getAttribute(name);
                if (a != null && a !== '') return a;
                if (st[name] != null) return st[name];
                return fallback;
            }
            function numAttr(el, name, fallback) {
                const v = parseFloat(css(el, name, ''));
                return isNaN(v) ? fallback : v;
            }
            function colorOf(el, which, fallback) {
                let c = css(el, which, null);
                if (!c || c === 'none' || c === 'transparent') return which === 'fill' ? null : fallback;
                if (c.startsWith('url(')) return fallback; // gradients skip for now
                return c;
            }

            // Simple transform: matrix/translate/scale only
            function parseTransform(el) {
                const t = el.getAttribute('transform') || '';
                let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
                const apply = (na, nb, nc, nd, ne, nf) => {
                    const a2 = a * na + c * nb;
                    const b2 = b * na + d * nb;
                    const c2 = a * nc + c * nd;
                    const d2 = b * nc + d * nd;
                    const e2 = a * ne + c * nf + e;
                    const f2 = b * ne + d * nf + f;
                    a = a2; b = b2; c = c2; d = d2; e = e2; f = f2;
                };
                const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
                let m;
                while ((m = re.exec(t))) {
                    const nums = m[2].split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
                    if (m[1] === 'matrix' && nums.length >= 6) apply(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
                    else if (m[1] === 'translate') apply(1, 0, 0, 1, nums[0] || 0, nums[1] || 0);
                    else if (m[1] === 'scale') {
                        const sx = nums[0] || 1, sy = nums[1] != null ? nums[1] : sx;
                        apply(sx, 0, 0, sy, 0, 0);
                    } else if (m[1] === 'rotate' && nums.length) {
                        const ang = (nums[0] * Math.PI) / 180;
                        const cos = Math.cos(ang), sin = Math.sin(ang);
                        const cx = nums[1] || 0, cy = nums[2] || 0;
                        apply(1, 0, 0, 1, cx, cy);
                        apply(cos, sin, -sin, cos, 0, 0);
                        apply(1, 0, 0, 1, -cx, -cy);
                    }
                }
                return { a, b, c, d, e, f };
            }
            function xf(mat, x, y) {
                return { x: mat.a * x + mat.c * y + mat.e, y: mat.b * x + mat.d * y + mat.f };
            }

            // Robust path d → cubic anchors
            function parsePathD(d) {
                const tokens = [];
                const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
                let m;
                while ((m = re.exec(d))) {
                    if (m[1]) tokens.push({ t: 'c', v: m[1] });
                    else tokens.push({ t: 'n', v: parseFloat(m[2]) });
                }
                const anchors = [];
                let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
                let lastC = '', lastCpX = 0, lastCpY = 0;
                let closed = false;
                const add = (x, y, inX, inY, outX, outY) => {
                    anchors.push({ x, y, inX: inX || 0, inY: inY || 0, outX: outX || 0, outY: outY || 0 });
                };
                const readN = () => (i < tokens.length && tokens[i].t === 'n' ? tokens[i++].v : 0);

                while (i < tokens.length) {
                    if (tokens[i].t !== 'c') { i++; continue; }
                    let cmd = tokens[i++].v;
                    const abs = cmd === cmd.toUpperCase();
                    cmd = cmd.toUpperCase();

                    const takePairs = (fn) => {
                        while (i < tokens.length && tokens[i].t === 'n') fn();
                    };

                    if (cmd === 'M') {
                        let first = true;
                        takePairs(() => {
                            let x = readN(), y = readN();
                            if (!abs) { x += cx; y += cy; }
                            cx = x; cy = y;
                            if (first) { sx = x; sy = y; first = false; }
                            add(x, y, 0, 0, 0, 0);
                        });
                    } else if (cmd === 'L') {
                        takePairs(() => {
                            let x = readN(), y = readN();
                            if (!abs) { x += cx; y += cy; }
                            cx = x; cy = y; add(x, y, 0, 0, 0, 0);
                        });
                    } else if (cmd === 'H') {
                        while (i < tokens.length && tokens[i].t === 'n') {
                            let x = readN();
                            if (!abs) x += cx;
                            cx = x; add(cx, cy, 0, 0, 0, 0);
                        }
                    } else if (cmd === 'V') {
                        while (i < tokens.length && tokens[i].t === 'n') {
                            let y = readN();
                            if (!abs) y += cy;
                            cy = y; add(cx, cy, 0, 0, 0, 0);
                        }
                    } else if (cmd === 'C') {
                        while (i + 5 < tokens.length && tokens[i].t === 'n') {
                            let x1 = readN(), y1 = readN(), x2 = readN(), y2 = readN(), x = readN(), y = readN();
                            if (!abs) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
                            if (anchors.length) {
                                const p = anchors[anchors.length - 1];
                                p.outX = x1 - p.x; p.outY = y1 - p.y;
                            }
                            add(x, y, x2 - x, y2 - y, 0, 0);
                            lastCpX = x2; lastCpY = y2; cx = x; cy = y;
                        }
                    } else if (cmd === 'S') {
                        while (i + 3 < tokens.length && tokens[i].t === 'n') {
                            let x2 = readN(), y2 = readN(), x = readN(), y = readN();
                            if (!abs) { x2 += cx; y2 += cy; x += cx; y += cy; }
                            let x1 = cx, y1 = cy;
                            if (lastC === 'C' || lastC === 'S') {
                                x1 = cx * 2 - lastCpX; y1 = cy * 2 - lastCpY;
                            }
                            if (anchors.length) {
                                const p = anchors[anchors.length - 1];
                                p.outX = x1 - p.x; p.outY = y1 - p.y;
                            }
                            add(x, y, x2 - x, y2 - y, 0, 0);
                            lastCpX = x2; lastCpY = y2; cx = x; cy = y;
                        }
                    } else if (cmd === 'Q') {
                        while (i + 3 < tokens.length && tokens[i].t === 'n') {
                            let x1 = readN(), y1 = readN(), x = readN(), y = readN();
                            if (!abs) { x1 += cx; y1 += cy; x += cx; y += cy; }
                            const c1x = cx + 2/3 * (x1 - cx), c1y = cy + 2/3 * (y1 - cy);
                            const c2x = x + 2/3 * (x1 - x), c2y = y + 2/3 * (y1 - y);
                            if (anchors.length) {
                                const p = anchors[anchors.length - 1];
                                p.outX = c1x - p.x; p.outY = c1y - p.y;
                            }
                            add(x, y, c2x - x, c2y - y, 0, 0);
                            lastCpX = x1; lastCpY = y1; cx = x; cy = y;
                        }
                    } else if (cmd === 'T') {
                        while (i + 1 < tokens.length && tokens[i].t === 'n') {
                            let x = readN(), y = readN();
                            if (!abs) { x += cx; y += cy; }
                            let x1 = cx, y1 = cy;
                            if (lastC === 'Q' || lastC === 'T') {
                                x1 = cx * 2 - lastCpX; y1 = cy * 2 - lastCpY;
                            }
                            const c1x = cx + 2/3 * (x1 - cx), c1y = cy + 2/3 * (y1 - cy);
                            const c2x = x + 2/3 * (x1 - x), c2y = y + 2/3 * (y1 - y);
                            if (anchors.length) {
                                const p = anchors[anchors.length - 1];
                                p.outX = c1x - p.x; p.outY = c1y - p.y;
                            }
                            add(x, y, c2x - x, c2y - y, 0, 0);
                            lastCpX = x1; lastCpY = y1; cx = x; cy = y;
                        }
                    } else if (cmd === 'A') {
                        // Approximate arcs as lines to endpoint (better than dropping)
                        while (i + 6 < tokens.length && tokens[i].t === 'n') {
                            readN(); readN(); readN(); readN(); readN(); // rx ry angle large sweep
                            let x = readN(), y = readN();
                            if (!abs) { x += cx; y += cy; }
                            cx = x; cy = y; add(x, y, 0, 0, 0, 0);
                        }
                    } else if (cmd === 'Z') {
                        closed = true;
                        cx = sx; cy = sy;
                    }
                    lastC = cmd;
                }
                return { anchors, closed };
            }

            function applyMatToAnchors(anchors, mat) {
                return anchors.map(a => {
                    const p = xf(mat, a.x, a.y);
                    const pin = xf(mat, a.x + (a.inX || 0), a.y + (a.inY || 0));
                    const pout = xf(mat, a.x + (a.outX || 0), a.y + (a.outY || 0));
                    return {
                        x: p.x, y: p.y,
                        inX: pin.x - p.x, inY: pin.y - p.y,
                        outX: pout.x - p.x, outY: pout.y - p.y
                    };
                });
            }

            function walk(el, parentMat) {
                if (!el || el.nodeType !== 1) return;
                const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
                if (['defs', 'clippath', 'mask', 'script', 'style', 'title', 'desc', 'metadata', 'filter', 'lineargradient', 'radialgradient', 'pattern', 'marker', 'symbol'].includes(tag)) return;

                const mat = parseTransform(el);
                // multiply parent * local
                const combined = {
                    a: parentMat.a * mat.a + parentMat.c * mat.b,
                    b: parentMat.b * mat.a + parentMat.d * mat.b,
                    c: parentMat.a * mat.c + parentMat.c * mat.d,
                    d: parentMat.b * mat.c + parentMat.d * mat.d,
                    e: parentMat.a * mat.e + parentMat.c * mat.f + parentMat.e,
                    f: parentMat.b * mat.e + parentMat.d * mat.f + parentMat.f
                };

                if (tag === 'g' || tag === 'svg' || tag === 'a') {
                    Array.from(el.children).forEach(ch => walk(ch, combined));
                    return;
                }

                const stroke = colorOf(el, 'stroke', null);
                const fill = colorOf(el, 'fill', tag === 'text' ? '#171717' : null);
                const sw = numAttr(el, 'stroke-width', stroke ? 1 : 0);
                const op = numAttr(el, 'opacity', 1);

                if (tag === 'path') {
                    const d = el.getAttribute('d') || '';
                    if (!d.trim()) return;
                    let { anchors, closed } = parsePathD(d);
                    if (!anchors.length) return;
                    anchors = applyMatToAnchors(anchors, combined);
                    const hasCurves = anchors.some(a => a.inX || a.inY || a.outX || a.outY);
                    newObjs.push({
                        id: uid(), type: 'bezier', anchors, closed: closed || false,
                        fill: fill, color: stroke || fill || '#171717',
                        strokeWidth: sw || (stroke ? 1 : 0), opacity: op, layerId
                    });
                } else if (tag === 'rect') {
                    let x = numAttr(el, 'x', 0), y = numAttr(el, 'y', 0);
                    let w = numAttr(el, 'width', 0), h = numAttr(el, 'height', 0);
                    const rx = numAttr(el, 'rx', 0);
                    const p1 = xf(combined, x, y), p2 = xf(combined, x + w, y + h);
                    newObjs.push({
                        id: uid(), type: rx > 0 ? 'roundrect' : 'rect',
                        x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
                        w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y),
                        cornerRadius: rx, fill, color: stroke || fill || '#171717',
                        strokeWidth: sw || (stroke ? 1 : 0), opacity: op, layerId
                    });
                } else if (tag === 'circle' || tag === 'ellipse') {
                    let cx = numAttr(el, 'cx', 0), cy = numAttr(el, 'cy', 0);
                    let rx = tag === 'circle' ? numAttr(el, 'r', 0) : numAttr(el, 'rx', 0);
                    let ry = tag === 'circle' ? rx : numAttr(el, 'ry', 0);
                    const c = xf(combined, cx, cy);
                    const rxp = xf(combined, cx + rx, cy), ryp = xf(combined, cx, cy + ry);
                    newObjs.push({
                        id: uid(), type: 'circle', x: c.x, y: c.y,
                        w: Math.hypot(rxp.x - c.x, rxp.y - c.y),
                        h: Math.hypot(ryp.x - c.x, ryp.y - c.y),
                        fill, color: stroke || fill || '#171717',
                        strokeWidth: sw || (stroke ? 1 : 0), opacity: op, layerId
                    });
                } else if (tag === 'line') {
                    const p1 = xf(combined, numAttr(el, 'x1', 0), numAttr(el, 'y1', 0));
                    const p2 = xf(combined, numAttr(el, 'x2', 0), numAttr(el, 'y2', 0));
                    newObjs.push({
                        id: uid(), type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                        color: stroke || '#171717', strokeWidth: sw || 1, opacity: op, layerId
                    });
                } else if (tag === 'polyline' || tag === 'polygon') {
                    const raw = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                    const pts = [];
                    for (let k = 0; k + 1 < raw.length; k += 2) {
                        pts.push(xf(combined, raw[k], raw[k + 1]));
                    }
                    if (pts.length) {
                        newObjs.push({
                            id: uid(), type: 'path', points: pts, closed: tag === 'polygon',
                            fill, color: stroke || fill || '#171717',
                            strokeWidth: sw || (stroke ? 1 : 0), opacity: op, layerId
                        });
                    }
                } else if (tag === 'text') {
                    const p = xf(combined, numAttr(el, 'x', 0), numAttr(el, 'y', 0));
                    newObjs.push({
                        id: uid(), type: 'text', x: p.x, y: p.y,
                        text: (el.textContent || '').trim(),
                        fontSize: numAttr(el, 'font-size', 16),
                        fontFamily: (css(el, 'font-family', 'Inter') || 'Inter').split(',')[0].replace(/['"]/g, '').trim(),
                        fontWeight: css(el, 'font-weight', '400'),
                        color: fill || '#171717', opacity: op, layerId
                    });
                } else if (tag === 'image') {
                    const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
                    if (!href) return;
                    const p1 = xf(combined, numAttr(el, 'x', 0), numAttr(el, 'y', 0));
                    const p2 = xf(combined, numAttr(el, 'x', 0) + numAttr(el, 'width', 100), numAttr(el, 'y', 0) + numAttr(el, 'height', 100));
                    newObjs.push({
                        id: uid(), type: 'image', src: href,
                        x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
                        w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y),
                        opacity: op, layerId
                    });
                }
            }

            const identity = { a: 1, b: 0, c: 0, d: 1, e: -vbX, f: -vbY };
            Array.from(svg.children).forEach(ch => walk(ch, identity));

            if (!newObjs.length) {
                alert('読み込める図形が見つかりませんでした（対応: path/rect/circle/line/poly/text/image）');
                return;
            }
            pushHistory();
            state.objects = state.objects.concat(newObjs);
            invalidateScene();
            invalidateObjectIndex();
            let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
            newObjs.forEach(o => {
                const b = getBounds(o);
                if (!b) return;
                minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
                maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h);
            });
            if (isFinite(minx)) {
                const pad = 48;
                const vw = window.innerWidth, vh = window.innerHeight;
                const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
                const z = Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh, 8);
                state.zoom = Math.max(0.05, z);
                state.panX = (vw - bw * state.zoom) / 2 - minx * state.zoom;
                state.panY = (vh - bh * state.zoom) / 2 - miny * state.zoom;
            }
            render();
        }

        function importImageFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    pushHistory();
                    const maxDim = 800;
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        const s = maxDim / Math.max(w, h);
                        w *= s; h *= s;
                    }
                    const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                    state.objects.push({
                        id: uid(), type: 'image',
                        src: reader.result,
                        x: world.x - w / 2, y: world.y - h / 2,
                        w, h, opacity: 1, layerId: state.activeLayerId
                    });
                    render();
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        function handleIncomingFile(file) {
            if (!file) return;
            const name = (file.name || '').toLowerCase();
            const type = file.type || '';
            if (name.endsWith('.svg') || type.includes('svg')) {
                const reader = new FileReader();
                reader.onload = () => parseSVG(reader.result);
                reader.readAsText(file);
            } else if (name.endsWith('.json') || type.includes('json')) {
                loadProjectFile(file);
            } else if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
                importImageFile(file);
            } else {
                // try as SVG text
                const reader = new FileReader();
                reader.onload = () => {
                    const t = reader.result;
                    if (typeof t === 'string' && t.includes('<svg')) parseSVG(t);
                    else alert('対応形式: SVG / PNG / JPEG / JSON プロジェクト');
                };
                reader.readAsText(file);
            }
        }

                // ===== UI BINDINGS =====
        document.getElementById('mode-vector-btn').onclick = () => setMode('vector');
        document.getElementById('mode-paint-btn').onclick = () => setMode('paint');
        document.getElementById('mode-anim-btn') && (document.getElementById('mode-anim-btn').onclick = () => setMode('anim'));

        ['hand','select','brush','text','eraser','eyedropper','fill','pen'].forEach(t => {
            const el = document.getElementById('tool-' + t);
            if (el) el.onclick = () => setTool(t);
        });

        // Mobile dock
        document.querySelectorAll('#mobile-dock [data-mdock]').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-mdock');
                if (t === 'undo') { undo(); return; }
                if (t === 'props') {
                    const p = document.getElementById('props-panel');
                    if (p.classList.contains('hidden')) {
                        p.classList.remove('hidden'); p.classList.add('flex');
                    } else {
                        p.classList.add('hidden'); p.classList.remove('flex');
                    }
                    return;
                }
                if (t === 'color') {
                    document.getElementById('color-input').click();
                    return;
                }
                setTool(t);
                // auto open props for brush/fill
                if (t === 'brush' || t === 'fill' || t === 'eraser') {
                    const p = document.getElementById('props-panel');
                    p.classList.remove('hidden'); p.classList.add('flex');
                }
            });
        });

        const shapesBtn = document.getElementById('tool-shapes');
        const shapesMenu = document.getElementById('shapes-menu');
        shapesBtn.onclick = (e) => {
            e.stopPropagation();
            // keep current shape tool; menu opens on hover
            if (state.tool !== 'rect' && !['roundrect','circle','triangle','star','hexagon','line','arrow'].includes(state.tool)) {
                setTool('rect');
            }
        };
        document.querySelectorAll('[data-shape]').forEach(b => {
            b.onclick = (e) => {
                e.stopPropagation();
                setTool(b.dataset.shape);
                shapesMenu.classList.add('hidden');
                shapesMenu.classList.remove('flex');
            };
        });
        // shapes menu: CSS hover only (no click-dismiss needed)

        document.querySelectorAll('.paint-preset').forEach(b => {
            b.onclick = () => {
                document.querySelectorAll('.paint-preset').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                state.paintPreset = b.dataset.preset;
            };
        });

        document.querySelectorAll('.eraser-mode-btn').forEach(b => {
            b.onclick = () => {
                document.querySelectorAll('.eraser-mode-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                state.eraserMode = b.dataset.emode;
                const hint = document.getElementById('eraser-hint');
                if (hint) {
                    hint.textContent = state.eraserMode === 'partial'
                        ? 'ブラシ線をなぞった部分だけ少しずつ消します'
                        : '触れたオブジェクトを一筆まるごと消します';
                }
            };
        });

        document.getElementById('size-slider').oninput = (e) => {
            state.strokeWidth = +e.target.value;
            document.getElementById('size-val').textContent = state.strokeWidth;
            const sn = document.getElementById('size-num');
            if (sn) sn.value = state.strokeWidth;
            updateCursor();
        };
        const sizeNum = document.getElementById('size-num');
        if (sizeNum) {
            sizeNum.onchange = sizeNum.oninput = (e) => {
                let v = parseFloat(e.target.value);
                if (isNaN(v) || v < 0.5) v = 0.5;
                if (v > 2000) v = 2000;
                state.strokeWidth = v;
                document.getElementById('size-val').textContent = v;
                const sl = document.getElementById('size-slider');
                if (sl) sl.value = Math.min(500, v);
                updateCursor();
            };
        }

        function selectedObjects() {
            return state.objects.filter(o => state.selectedIds.has(o.id));
        }
        function applyToSelected(mut) {
            const targets = selectedObjects();
            if (!targets.length) return;
            pushHistory();
            targets.forEach(mut);
            render();
            syncObjectPropsUI();
        }
        function syncObjectPropsUI() {
            const panel = document.getElementById('object-props');
            const fs = document.getElementById('fill-stroke-props');
            const targets = selectedObjects();
            const show = targets.length > 0;
            if (panel) {
                panel.classList.toggle('hidden', !show);
                panel.classList.toggle('flex', show);
            }
            if (fs) {
                fs.classList.toggle('hidden', !show);
                fs.classList.toggle('flex', show);
            }
            // keep props panel open when selecting
            if (show) {
                const pp = document.getElementById('props-panel');
                if (pp) { pp.classList.remove('hidden'); pp.classList.add('flex'); }
            }
            if (!show) return;
            const o = targets[0];
            const set = (id, val, labelId, fmt) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
                const lab = document.getElementById(labelId);
                if (lab) lab.textContent = fmt ? fmt(val) : val;
            };
            set('radius-slider', o.cornerRadius || 0, 'radius-val');
            set('blur-slider', o.blur || 0, 'blur-val');
            set('rotate-slider', o.rotation || 0, 'rotate-val', v => v + '°');
            const fill = o.fill || null;
            const stroke = o.color || '#171717';
            const fi = document.getElementById('fill-color-input');
            const fh = document.getElementById('fill-hex');
            const si = document.getElementById('stroke-color-input');
            const sh = document.getElementById('stroke-hex');
            if (fi && fill && /^#/.test(fill)) { fi.value = fill.length === 4 ? '#'+fill[1]+fill[1]+fill[2]+fill[2]+fill[3]+fill[3] : fill.slice(0,7); }
            if (fh) fh.value = fill || 'none';
            if (si && stroke && /^#/.test(stroke)) { si.value = stroke.slice(0,7); }
            if (sh) sh.value = stroke || 'none';
            const osw = document.getElementById('obj-stroke-width');
            if (osw) osw.value = o.strokeWidth != null ? o.strokeWidth : 2;
        }

        function bindFillStrokeEditors() {
            const applyFill = (val) => {
                const targets = selectedObjects();
                if (!targets.length) return;
                pushHistory();
                targets.forEach(o => { o.fill = val; });
                render();
            };
            const applyStroke = (val) => {
                const targets = selectedObjects();
                if (!targets.length) return;
                pushHistory();
                targets.forEach(o => { o.color = val; });
                render();
            };
            const fi = document.getElementById('fill-color-input');
            const fh = document.getElementById('fill-hex');
            const si = document.getElementById('stroke-color-input');
            const sh = document.getElementById('stroke-hex');
            if (fi) fi.oninput = () => { if (fh) fh.value = fi.value; applyFill(fi.value); };
            if (fh) fh.onchange = () => {
                let v = fh.value.trim();
                if (v === 'none' || v === '') applyFill(null);
                else {
                    if (v[0] !== '#') v = '#' + v;
                    applyFill(v);
                    if (fi && /^#[0-9a-fA-F]{6}$/.test(v)) fi.value = v;
                }
            };
            if (si) si.oninput = () => { if (sh) sh.value = si.value; applyStroke(si.value); };
            if (sh) sh.onchange = () => {
                let v = sh.value.trim();
                if (v === 'none' || v === '') applyStroke('#00000000');
                else {
                    if (v[0] !== '#') v = '#' + v;
                    applyStroke(v);
                    if (si && /^#[0-9a-fA-F]{6}$/.test(v)) si.value = v;
                }
            };
            document.getElementById('btn-fill-none') && (document.getElementById('btn-fill-none').onclick = () => applyFill(null));
            document.getElementById('btn-stroke-none') && (document.getElementById('btn-stroke-none').onclick = () => {
                const targets = selectedObjects();
                if (!targets.length) return;
                pushHistory();
                targets.forEach(o => { o.strokeWidth = 0; });
                render();
            });
            const osw = document.getElementById('obj-stroke-width');
            if (osw) osw.onchange = osw.oninput = () => {
                const v = parseFloat(osw.value);
                if (isNaN(v)) return;
                selectedObjects().forEach(o => { o.strokeWidth = v; });
                render();
            };
            if (osw) osw.addEventListener('pointerdown', () => pushHistory());
        }

        const radiusSl = document.getElementById('radius-slider');
        if (radiusSl) radiusSl.oninput = (e) => {
            const v = +e.target.value;
            document.getElementById('radius-val').textContent = v;
            selectedObjects().forEach(o => { o.cornerRadius = v; if (o.type === 'rect') o.type = 'roundrect'; });
            render();
        };
        const blurSl = document.getElementById('blur-slider');
        if (blurSl) blurSl.oninput = (e) => {
            const v = +e.target.value;
            document.getElementById('blur-val').textContent = v;
            selectedObjects().forEach(o => { o.blur = v; });
            render();
        };
        const rotSl = document.getElementById('rotate-slider');
        if (rotSl) rotSl.oninput = (e) => {
            const v = +e.target.value;
            document.getElementById('rotate-val').textContent = v + '°';
            selectedObjects().forEach(o => { o.rotation = v; });
            render();
        };
        // commit history on pointerup of prop sliders
        ['radius-slider','blur-slider','rotate-slider'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('pointerdown', () => pushHistory());
        });
        document.getElementById('btn-flip-h') && (document.getElementById('btn-flip-h').onclick = () => {
            applyToSelected(o => {
                if (o.type === 'path' && o.points) {
                    const b = getBounds(o); const cx = b.x + b.w / 2;
                    o.points.forEach(p => { p.x = cx - (p.x - cx); });
                } else if (o.w != null) o.w = -o.w;
            });
        });
        document.getElementById('btn-flip-v') && (document.getElementById('btn-flip-v').onclick = () => {
            applyToSelected(o => {
                if (o.type === 'path' && o.points) {
                    const b = getBounds(o); const cy = b.y + b.h / 2;
                    o.points.forEach(p => { p.y = cy - (p.y - cy); });
                } else if (o.h != null) o.h = -o.h;
            });
        });
        document.getElementById('btn-use-mask') && (document.getElementById('btn-use-mask').onclick = () => {
            const targets = selectedObjects();
            if (targets.length < 1) return alert('マスクに使うオブジェクトを選択してください');
            // top selected becomes mask for others below in z-order, or mask for next lower
            const mask = targets[0];
            const others = state.objects.filter(o => o.id !== mask.id && state.selectedIds.has(o.id));
            if (others.length) {
                pushHistory();
                others.forEach(o => { o.maskId = mask.id; });
            } else {
                // apply mask to all objects under mask in list
                const idx = state.objects.findIndex(o => o.id === mask.id);
                if (idx > 0) {
                    pushHistory();
                    state.objects[idx - 1].maskId = mask.id;
                } else alert('マスク対象のオブジェクトも選択するか、下にオブジェクトを置いてください');
            }
            render();
        });
        document.getElementById('btn-clear-mask') && (document.getElementById('btn-clear-mask').onclick = () => {
            applyToSelected(o => { delete o.maskId; });
        });

        const stabSl = document.getElementById('stabilize-slider');
        if (stabSl) stabSl.oninput = (e) => {
            state.stabilize = +e.target.value;
            document.getElementById('stabilize-val').textContent = state.stabilize;
        };
        const hardSl = document.getElementById('hardness-slider');
        if (hardSl) hardSl.oninput = (e) => {
            state.hardness = +e.target.value / 100;
            document.getElementById('hardness-val').textContent = e.target.value + '%';
        };
        const fillTol = document.getElementById('fill-tol-slider');
        if (fillTol) fillTol.oninput = (e) => {
            state.fillTolerance = +e.target.value;
            document.getElementById('fill-tol-val').textContent = state.fillTolerance;
        };

        // Font controls
        const fontSelect = document.getElementById('font-family-select');
        if (fontSelect) {
            fontSelect.addEventListener('pointerdown', beginFontGesture);
            fontSelect.onchange = (e) => {
                beginFontGesture();
                state.fontFamily = e.target.value;
                applyFontToSelectedText();
            };
        }
        const fontSizeSlider = document.getElementById('font-size-slider');
        if (fontSizeSlider) {
            fontSizeSlider.addEventListener('pointerdown', beginFontGesture);
            fontSizeSlider.oninput = (e) => {
                state.fontSize = +e.target.value;
                document.getElementById('font-size-val').textContent = state.fontSize;
                applyFontToSelectedText();
            };
        }
        document.querySelectorAll('.font-weight-btn').forEach(btn => {
            btn.onclick = () => {
                beginFontGesture();
                state.fontWeight = btn.dataset.weight;
                document.querySelectorAll('.font-weight-btn').forEach(b => b.classList.toggle('active', b === btn));
                applyFontToSelectedText();
            };
        });
        syncFontUIFromState();;
        document.getElementById('opacity-slider').oninput = (e) => {
            state.opacity = e.target.value / 100;
            document.getElementById('opacity-val').textContent = e.target.value + '%';
        };

        document.getElementById('color-input').oninput = (e) => setColor(e.target.value);
        document.getElementById('hex-input').onchange = (e) => setColor(e.target.value);
        const paletteSelect = document.getElementById('palette-select');
        if (paletteSelect) paletteSelect.onchange = (e) => renderPalette(e.target.value);

        document.querySelectorAll('.bg-picker').forEach(b => {
            b.onclick = () => { state.canvasBg = b.dataset.color; render(); };
        });

        document.getElementById('btn-grid-toggle').onclick = () => {
            state.gridMode = state.gridMode === 'grid' ? 'dots' : state.gridMode === 'dots' ? 'off' : 'grid';
            const icon = document.getElementById('grid-icon');
            if (icon) {
                icon.className = state.gridMode === 'off'
                    ? 'fa-solid fa-border-none text-[14px]'
                    : state.gridMode === 'dots'
                        ? 'fa-solid fa-ellipsis text-[14px]'
                        : 'fa-solid fa-border-all text-[14px]';
            }
            render();
        };

        document.getElementById('btn-undo').onclick = () => undo();
        document.getElementById('btn-redo').onclick = () => redo();

        document.getElementById('btn-clear').onclick = () => {
            if (confirm('キャンバスの内容をすべて消去しますか？')) {
                pushHistory();
                state.objects = [];
                invalidateScene();
                invalidateObjectIndex();
                state.selectedIds.clear();
                updateSelectionUI();
                render();
            }
        };

        document.getElementById('btn-delete-selected').onclick = () => {
            if (!state.selectedIds.size) return;
            pushHistory();
            state.objects = state.objects.filter(o => !state.selectedIds.has(o.id));
            invalidateScene();
            invalidateObjectIndex();
            state.selectedIds.clear();
            updateSelectionUI();
            render();
        };

        document.getElementById('btn-add-layer').onclick = () => {
            const n = state.layers.filter(l => l.type !== 'folder').length + 1;
            const layer = { id: uid(), name: 'Layer ' + n, visible: true };
            state.layers.push(layer);
            if (state.mode === 'anim') {
                state.animFrames.forEach(frame => {
                    const frameLayers = Array.isArray(frame.layers) ? frame.layers.slice() : [];
                    if (!frameLayers.some(item => item.id === layer.id)) frameLayers.push({ ...layer });
                    frame.layers = frameLayers;
                });
            }
            state.activeLayerId = layer.id;
            renderLayerList();
            if (state.mode === 'anim') {
                state.animTrackId = layer.id;
                updateAnimUI({ rebuild: true });
            }
        };
        const btnFolder = document.getElementById('btn-add-folder');
        if (btnFolder) btnFolder.onclick = () => {
            const n = state.layers.filter(l => l.type === 'folder').length + 1;
            const folder = { id: uid(), name: 'Folder ' + n, visible: true, type: 'folder' };
            state.layers.push(folder);
            // nest active layer into folder if any
            const active = state.layers.find(l => l.id === state.activeLayerId);
            if (active && active.type !== 'folder') active.folderId = folder.id;
            renderLayerList();
        };

        // Export menu
        const exportBtn = document.getElementById('btn-export');
        const exportMenu = document.getElementById('export-menu');
        exportBtn.onclick = (e) => { e.stopPropagation(); exportMenu.classList.toggle('hidden'); };
        document.addEventListener('click', () => exportMenu.classList.add('hidden'));
        document.querySelectorAll('[data-export]').forEach(b => {
            b.onclick = (e) => {
                e.stopPropagation();
                const type = b.dataset.export;
                if (type === 'svg') exportSVG();
                else if (type === 'project') saveProject();
                else exportRaster(type);
                exportMenu.classList.add('hidden');
            };
        });

        document.getElementById('btn-load-project').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('file-input').click();
        };
        document.getElementById('file-input').onchange = (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleIncomingFile(f);
            e.target.value = '';
            exportMenu.classList.add('hidden');
        };
        const imageInput = document.getElementById('image-input');
        const btnInsertImage = document.getElementById('btn-insert-image');
        if (btnInsertImage && imageInput) {
            btnInsertImage.onclick = (e) => {
                e.stopPropagation();
                imageInput.click();
            };
            imageInput.onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) handleIncomingFile(f);
                e.target.value = '';
                exportMenu.classList.add('hidden');
            };
        }

        document.getElementById('zoom-in').onclick = () => { state.zoom = Math.min(16, state.zoom * 1.2); render(); };
        document.getElementById('zoom-out').onclick = () => { state.zoom = Math.max(0.08, state.zoom / 1.2); render(); };
        document.getElementById('zoom-reset').onclick = () => { state.zoom = 1; state.panX = 0; state.panY = 0; render(); };

        document.getElementById('close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');
        document.getElementById('help-modal').onclick = (e) => { if (e.target.id === 'help-modal') e.target.classList.add('hidden'); };

        // Keyboard
        window.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
            // Ctrl/Cmd+Z always works even from some fields (except true text editing with content)
            const mod = e.metaKey || e.ctrlKey;
            if (mod && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
                if (!typing || tag === 'BODY' || tag === 'DIV') {
                    e.preventDefault();
                    undo();
                    return;
                }
            }
            if (mod && ((e.code === 'KeyY') || (e.code === 'KeyZ' && e.shiftKey) || (e.key === 'y' || e.key === 'Y'))) {
                if (!typing || tag === 'BODY' || tag === 'DIV') {
                    e.preventDefault();
                    redo();
                    return;
                }
            }
            if (typing) return;
            if (e.code === 'Space') { state.spacePressed = true; container.style.cursor = 'grab'; e.preventDefault(); }
            if (e.key === 'g' || e.key === 'G') document.getElementById('btn-grid-toggle').click();
            if (e.key === 'b' || e.key === 'B') setTool('brush');
            if (e.key === 'e' || e.key === 'E') setTool('eraser');
            if (e.key === 't' || e.key === 'T') setTool('text');
            if (e.key === 'v' || e.key === 'V') setTool('select');
            if (e.key === 'f' || e.key === 'F') setTool('fill');
            if (e.key === 'p' || e.key === 'P') setTool('pen');
            if ((e.key === 'Enter' || e.key === 'Escape') && state._penObj) {
                state._penObj = null;
                state._activeAnchor = null;
                state._penDragging = false;
                state.isDrawing = false;
                render();
            }
            if (e.key === 'i' || e.key === 'I') setTool('eyedropper');
            if (e.key === 'h' || e.key === 'H') setTool('hand');
            if (e.key === 'i' || e.key === 'I') setTool('eyedropper');
            if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedIds.size) {
                document.getElementById('btn-delete-selected').click();
            }
            // Arrow keys: nudge selection
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && state.selectedIds.size) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : (e.altKey ? 0.5 : 1);
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                if (!state._nudgePushed) {
                    pushHistory();
                    state._nudgePushed = true;
                }
                state.objects.forEach(o => {
                    if (!state.selectedIds.has(o.id)) return;
                    if (o.type === 'path' && o.points) {
                        o.points.forEach(p => { p.x += dx; p.y += dy; });
                    } else if (o.type === 'bezier' && o.anchors) {
                        o.anchors.forEach(a => { a.x += dx; a.y += dy; });
                    } else if (o.type === 'line' || o.type === 'arrow') {
                        o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
                    } else if (o.x != null) {
                        o.x += dx; o.y += dy;
                    }
                });
                render();
                return;
            }
            if (e.key === '?' || (e.shiftKey && e.key === '/')) document.getElementById('help-modal').classList.remove('hidden');
            if (e.key === 'Escape') {
                state.selectedIds.clear();
                updateSelectionUI();
                render();
                document.getElementById('help-modal').classList.add('hidden');
                textEditor.style.display = 'none';
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                state.spacePressed = false;
                container.style.cursor = state.tool === 'hand' ? 'grab' : 'crosshair';
            }
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
                state._nudgePushed = false;
            }
        });

        // Keep side panels opt-in to preserve a clear canvas workspace.
        const propsPanel = document.getElementById('props-panel');
        const propsToggle = document.getElementById('btn-props-toggle');
        const propsClose = document.getElementById('btn-props-close');
        const brushPanel = document.getElementById('left-paint-panel');
        const brushPanelUI = window.VersePaintBrushPanel?.initialize();
        function openProps() {
            propsPanel.classList.remove('hidden');
            propsPanel.classList.add('flex', 'open');
            propsToggle.classList.add('active');
            propsToggle.setAttribute('aria-pressed', 'true');
            propsToggle.setAttribute('aria-label', 'プロパティを閉じる');
        }
        function closeProps() {
            propsPanel.classList.add('hidden');
            propsPanel.classList.remove('flex', 'open');
            propsToggle.classList.remove('active');
            propsToggle.setAttribute('aria-pressed', 'false');
            propsToggle.setAttribute('aria-label', 'プロパティを表示');
        }
        if (propsToggle) {
            propsToggle.onclick = (e) => {
                e.stopPropagation();
                if (propsPanel.classList.contains('hidden')) openProps();
                else closeProps();
            };
        }
        if (propsClose) propsClose.onclick = (e) => { e.stopPropagation(); closeProps(); };
        // Close when starting to draw on canvas
        container.addEventListener('pointerdown', () => {
            if (!propsPanel.classList.contains('hidden')) closeProps();
            if (brushPanel && !brushPanel.classList.contains('hidden')) brushPanelUI?.setOpen(false);
        });


        // Drag & drop SVG / images / project
        ['dragenter', 'dragover'].forEach(ev => {
            window.addEventListener(ev, e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });
        });
        window.addEventListener('drop', e => {
            e.preventDefault();
            const files = e.dataTransfer && e.dataTransfer.files;
            if (!files || !files.length) {
                // maybe SVG text
                const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html');
                if (text && text.includes('<svg')) parseSVG(text);
                return;
            }
            Array.from(files).forEach(f => handleIncomingFile(f));
        });

        // Paste image / svg
        window.addEventListener('paste', e => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const it of items) {
                if (it.type.startsWith('image/')) {
                    const f = it.getAsFile();
                    if (f) handleIncomingFile(f);
                    return;
                }
                if (it.type === 'text/plain') {
                    it.getAsString(s => {
                        if (s && s.includes('<svg')) parseSVG(s);
                    });
                }
            }
        });


        // Settings & profiles
        const settingsModal = document.getElementById('settings-modal');
        const openSettings = () => {
            if (!settingsModal) return;
            settingsModal.classList.remove('hidden');
            settingsModal.classList.add('flex');
            renderProfileList();
            document.getElementById('pixel-grid-toggle').checked = !!state.pixelGrid;
            document.getElementById('pixel-snap-toggle').checked = !!state.pixelSnap;
            document.getElementById('maxhist-slider').value = state.maxHistory;
            document.getElementById('maxhist-val').textContent = state.maxHistory;
        };
        const closeSettings = () => {
            if (!settingsModal) return;
            settingsModal.classList.add('hidden');
            settingsModal.classList.remove('flex');
        };
        document.getElementById('btn-settings') && (document.getElementById('btn-settings').onclick = openSettings);
        document.getElementById('settings-close') && (document.getElementById('settings-close').onclick = closeSettings);
        settingsModal && settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

        function getProfiles() {
            try { return JSON.parse(localStorage.getItem('versePaintProfiles') || '{}'); }
            catch { return {}; }
        }
        function saveProfiles(p) {
            localStorage.setItem('versePaintProfiles', JSON.stringify(p));
        }
        function currentProfileData() {
            return {
                strokeWidth: state.strokeWidth,
                color: state.color,
                opacity: state.opacity,
                paintPreset: state.paintPreset,
                stabilize: state.stabilize,
                hardness: state.hardness,
                canvasBg: state.canvasBg,
                gridMode: state.gridMode,
                maxHistory: state.maxHistory,
                pixelGrid: state.pixelGrid,
                pixelSnap: state.pixelSnap,
                fontFamily: state.fontFamily,
                fontSize: state.fontSize,
                fontWeight: state.fontWeight
            };
        }
        function applyProfileData(d) {
            if (!d) return;
            Object.keys(d).forEach(k => { if (k in state || k === 'paintPreset') state[k] = d[k]; });
            if (d.strokeWidth) {
                document.getElementById('size-slider').value = Math.min(500, d.strokeWidth);
                document.getElementById('size-val').textContent = d.strokeWidth;
                const sn = document.getElementById('size-num'); if (sn) sn.value = d.strokeWidth;
            }
            if (d.color) setColor(d.color);
            render();
        }
        function renderProfileList() {
            const box = document.getElementById('profile-list');
            if (!box) return;
            const profiles = getProfiles();
            box.innerHTML = '';
            Object.keys(profiles).forEach(name => {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5';
                row.innerHTML = `<span class="flex-1 truncate text-geist-200">${name}</span>
                    <button class="text-[10px] text-geist-400 hover:text-white load-p">読込</button>
                    <button class="text-[10px] text-rose-400 hover:text-rose-300 del-p">削除</button>`;
                row.querySelector('.load-p').onclick = () => {
                    applyProfileData(profiles[name]);
                    document.getElementById('profile-name').value = name;
                    closeSettings();
                };
                row.querySelector('.del-p').onclick = () => {
                    delete profiles[name];
                    saveProfiles(profiles);
                    renderProfileList();
                };
                box.appendChild(row);
            });
            if (!Object.keys(profiles).length) {
                box.innerHTML = '<div class="text-geist-600 px-2">保存済みプロファイルなし</div>';
            }
        }
        document.getElementById('btn-save-profile') && (document.getElementById('btn-save-profile').onclick = () => {
            const name = (document.getElementById('profile-name').value || '').trim() || ('Profile ' + new Date().toLocaleString());
            const profiles = getProfiles();
            profiles[name] = currentProfileData();
            saveProfiles(profiles);
            renderProfileList();
            alert('「' + name + '」を保存しました');
        });
        document.getElementById('btn-load-profile') && (document.getElementById('btn-load-profile').onclick = () => {
            const name = (document.getElementById('profile-name').value || '').trim();
            const profiles = getProfiles();
            if (!name || !profiles[name]) { alert('プロファイル名を選ぶか入力してください'); return; }
            applyProfileData(profiles[name]);
            closeSettings();
        });
        document.querySelectorAll('.bg-btn').forEach(b => {
            b.onclick = () => {
                state.canvasBg = b.dataset.bg === 'transparent' ? '#0A0A0A' : b.dataset.bg;
                if (b.dataset.bg === 'transparent') state.canvasBg = '#ffffff';
                state.canvasBg = b.dataset.bg === 'transparent' ? 'transparent' : b.dataset.bg;
                render();
            };
        });
        document.getElementById('pixel-grid-toggle') && (document.getElementById('pixel-grid-toggle').onchange = (e) => {
            state.pixelGrid = e.target.checked;
            render();
        });
        document.getElementById('pixel-snap-toggle') && (document.getElementById('pixel-snap-toggle').onchange = (e) => {
            state.pixelSnap = e.target.checked;
        });
        document.getElementById('maxhist-slider') && (document.getElementById('maxhist-slider').oninput = (e) => {
            state.maxHistory = +e.target.value;
            document.getElementById('maxhist-val').textContent = state.maxHistory;
        });


        bindFillStrokeEditors();

        // ---- Settings persistence ----
        const SETTINGS_KEY = 'versePaintSettings_v1';
        const DEFAULTS = {
            strokeWidth: 8, color: '#171717', opacity: 1, paintPreset: 'pen',
            stabilize: 0, hardness: 1, canvasBg: '#ffffff', gridMode: 'grid',
            maxHistory: 80, pixelGrid: false, pixelSnap: false,
            fontFamily: 'Inter', fontSize: 24, fontWeight: '500',
            toolbarDock: 'left'
        };
        function applyToolbarDock(pos) {
            state.toolbarDock = pos || 'left';
            document.body.classList.remove('tools-left','tools-right','tools-top','tools-bottom');
            document.body.classList.add('tools-' + state.toolbarDock);
            document.querySelectorAll('.dock-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.dock === state.toolbarDock);
            });
        }
        function loadSettings() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (!raw) { applyToolbarDock('left'); return; }
                const d = JSON.parse(raw);
                Object.keys(DEFAULTS).forEach(k => {
                    if (d[k] !== undefined) state[k] = d[k];
                });
                if (d.strokeWidth) {
                    const sl = document.getElementById('size-slider');
                    if (sl) sl.value = Math.min(500, d.strokeWidth);
                    const sv = document.getElementById('size-val');
                    if (sv) sv.textContent = d.strokeWidth;
                    const sn = document.getElementById('size-num');
                    if (sn) sn.value = d.strokeWidth;
                }
                if (d.color) setColor(d.color);
                if (d.opacity != null) {
                    const os = document.getElementById('opacity-slider');
                    if (os) os.value = Math.round(d.opacity * 100);
                    const ov = document.getElementById('opacity-val');
                    if (ov) ov.textContent = Math.round(d.opacity * 100) + '%';
                }
                applyToolbarDock(d.toolbarDock || 'left');
            } catch (e) {
                applyToolbarDock('left');
            }
        }
        function saveSettings() {
            const data = {
                strokeWidth: state.strokeWidth,
                color: state.color,
                opacity: state.opacity,
                paintPreset: state.paintPreset,
                stabilize: state.stabilize,
                hardness: state.hardness,
                canvasBg: state.canvasBg,
                gridMode: state.gridMode,
                maxHistory: state.maxHistory,
                pixelGrid: state.pixelGrid,
                pixelSnap: state.pixelSnap,
                fontFamily: state.fontFamily,
                fontSize: state.fontSize,
                fontWeight: state.fontWeight,
                toolbarDock: state.toolbarDock || 'left'
            };
            try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch (_) {}
        }
        // debounce save
        let _saveTimer = null;
        function scheduleSaveSettings() {
            clearTimeout(_saveTimer);
            _saveTimer = setTimeout(saveSettings, 200);
        }
        // wrap setColor to save
        const _setColorOrig = setColor;
        setColor = function(hex) {
            _setColorOrig(hex);
            scheduleSaveSettings();
        };

        document.querySelectorAll('.dock-btn').forEach(b => {
            b.onclick = () => {
                applyToolbarDock(b.dataset.dock);
                scheduleSaveSettings();
            };
        });
        document.getElementById('btn-reset-defaults') && (document.getElementById('btn-reset-defaults').onclick = () => {
            if (!confirm('設定をすべてデフォルトに戻しますか？')) return;
            Object.keys(DEFAULTS).forEach(k => { state[k] = DEFAULTS[k]; });
            localStorage.removeItem(SETTINGS_KEY);
            applyToolbarDock('left');
            setColor(DEFAULTS.color);
            document.getElementById('size-slider').value = DEFAULTS.strokeWidth;
            document.getElementById('size-val').textContent = DEFAULTS.strokeWidth;
            const sn = document.getElementById('size-num'); if (sn) sn.value = DEFAULTS.strokeWidth;
            document.getElementById('opacity-slider').value = 100;
            document.getElementById('opacity-val').textContent = '100%';
            render();
            alert('デフォルトに戻しました');
        });




        // Disable browser context menu — app menu only
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const menu = document.getElementById('app-ctx-menu');
            if (!menu) return;
            menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - 320) + 'px';
            menu.classList.remove('hidden');
            state._ctxWorld = screenToWorld(e.clientX, e.clientY);
        });
        document.addEventListener('pointerdown', (e) => {
            const menu = document.getElementById('app-ctx-menu');
            if (menu && !menu.contains(e.target)) menu.classList.add('hidden');
        });

        function hideCtx() {
            const menu = document.getElementById('app-ctx-menu');
            if (menu) menu.classList.add('hidden');
        }

        function reorderObject(id, mode) {
            const idx = state.objects.findIndex(o => o.id === id);
            if (idx < 0) return;
            const [obj] = state.objects.splice(idx, 1);
            if (mode === 'front') state.objects.push(obj);
            else if (mode === 'back') state.objects.unshift(obj);
            else if (mode === 'forward' && idx < state.objects.length) state.objects.splice(idx + 1, 0, obj);
            else if (mode === 'backward' && idx > 0) state.objects.splice(idx - 1, 0, obj);
            else state.objects.splice(idx, 0, obj);
            invalidateScene();
            invalidateObjectIndex();
            render();
            renderLayerList();
        }

        function selectionToRaster() {
            const targets = selectedObjects();
            if (!targets.length) { alert('オブジェクトを選択してください'); return; }
            pushHistory();
            targets.forEach(obj => {
                const b = getBounds(obj);
                if (!b || b.w < 1 || b.h < 1) return;
                const pad = 4;
                const c = document.createElement('canvas');
                c.width = Math.ceil(b.w + pad * 2);
                c.height = Math.ceil(b.h + pad * 2);
                const cx = c.getContext('2d');
                cx.translate(-b.x + pad, -b.y + pad);
                const prev = state.objects;
                // draw single object
                const tmp = obj;
                const layer = state.layers.find(l => l.id === tmp.layerId);
                const was = layer ? layer.visible : true;
                if (layer) layer.visible = true;
                // use drawObject with temporary ctx swap
                const oldCtx = ctx;
                // drawObject uses global ctx — temporarily bind
                window.__drawTo = cx;
                // simpler: manual draw via export path
                const imgData = (() => {
                    const off = document.createElement('canvas');
                    off.width = c.width; off.height = c.height;
                    const octx = off.getContext('2d');
                    octx.translate(-b.x + pad, -b.y + pad);
                    // Inline minimal: stroke object on offscreen by cloning draw
                    const saved = ctx;
                    // hack: assign
                    const realDraw = drawObject;
                    // Call with monkeypatch
                    const _ctx = ctx;
                    // We'll use a dedicated function
                    return null;
                })();
            });
            // Practical approach: render region to image object
            const union = targets.reduce((acc, o) => {
                const b = getBounds(o);
                if (!b) return acc;
                if (!acc) return { ...b };
                const x = Math.min(acc.x, b.x), y = Math.min(acc.y, b.y);
                return { x, y, w: Math.max(acc.x + acc.w, b.x + b.w) - x, h: Math.max(acc.y + acc.h, b.y + b.h) - y };
            }, null);
            if (!union) return;
            const scale = 2;
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.ceil(union.w * scale));
            c.height = Math.max(1, Math.ceil(union.h * scale));
            const cx = c.getContext('2d');
            cx.scale(scale, scale);
            cx.translate(-union.x, -union.y);
            // draw all objects (visible) then we'd need isolation — draw selected only
            const ids = new Set(targets.map(t => t.id));
            state.objects.forEach(o => {
                if (!ids.has(o.id)) return;
                // temporarily use cx
            });
            // Render full scene crop
            const full = document.createElement('canvas');
            full.width = c.width; full.height = c.height;
            const fctx = full.getContext('2d');
            fctx.fillStyle = 'transparent';
            fctx.scale(scale, scale);
            fctx.translate(-union.x, -union.y);
            // Draw using main renderer approach
            const bak = { objects: state.objects };
            // Simple: use exportRegionRaster
            const dataUrl = exportRegionToDataURL(
                union.x, union.y, union.w, union.h, scale, true, 'png',
                new Set(targets.map(target => target.id))
            );
            if (!dataUrl) return;
            // Replace selected with image
            targets.forEach(t => {
                const i = state.objects.findIndex(o => o.id === t.id);
                if (i >= 0) state.objects.splice(i, 1);
            });
            state.objects.push({
                id: uid(), type: 'image', src: dataUrl,
                x: union.x, y: union.y, w: union.w, h: union.h,
                opacity: 1, layerId: state.activeLayerId
            });
            invalidateScene();
            invalidateObjectIndex();
            state.selectedIds.clear();
            render();
        }

        function exportRegionToDataURL(x, y, w, h, scale, transparent, fmt, objectIds) {
            scale = scale || 1;
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w * scale));
            c.height = Math.max(1, Math.round(h * scale));
            const cx = c.getContext('2d');
            if (!transparent) {
                cx.fillStyle = state.canvasBg === 'transparent' ? '#ffffff' : (state.canvasBg || '#fff');
                cx.fillRect(0, 0, c.width, c.height);
            }
            cx.scale(scale, scale);
            cx.translate(-x, -y);
            // paint layer
            drawPaintLayer(cx, { x, y, w, h });
            // objects — reuse drawObject with ctx swap is hard; duplicate minimal
            const old = ctx;
            // bind drawObject to cx by temporarily replacing global ctx reference
            // Our drawObject uses `ctx` from closure — monkeypatch
            const g = { ctx: cx };
            // Direct render: set transform already on cx
            state.objects.forEach(obj => {
                try { drawObjectOn(cx, obj); } catch (e) { console.warn(e); }
            });
            const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
            return c.toDataURL(mime, 0.92);
        }

        function drawObjectOn(targetCtx, obj) {
            __drawObjectTo(targetCtx, obj);
        }

        // Better export: render main canvas region by computing screen and using temp full render
        function exportRegionHiRes(x, y, w, h, scale, transparent, fmt, objectIds) {
            scale = Math.max(0.5, Math.min(8, scale || 1));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w * scale));
            c.height = Math.max(1, Math.round(h * scale));
            const cx = c.getContext('2d');
            if (!transparent && state.canvasBg !== 'transparent') {
                cx.fillStyle = state.canvasBg || '#ffffff';
                cx.fillRect(0, 0, c.width, c.height);
            } else if (!transparent) {
                cx.fillStyle = '#ffffff';
                cx.fillRect(0, 0, c.width, c.height);
            }
            cx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
            if (!objectIds) drawPaintLayer(cx, { x, y, w, h });
            // Monkey-patch: drawObject reads global `ctx`
            const backup = canvas.getContext; // not useful
            // Use SVG export for vector-only path when fmt svg
            if (fmt === 'svg') {
                return null; // handled separately
            }
            // Draw each object by hijacking: set global variable
            const prevFilter = null;
            const objects = objectIds
                ? state.objects.filter(obj => objectIds.has(obj.id))
                : queryObjectsInBounds({ x, y, w, h }).map(entry => entry.obj);
            objects.forEach(obj => {
                __drawObjectTo(cx, obj);
            });
            const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
            return c.toDataURL(mime, 0.92);
        }

        // Redefine draw path used by export — thin wrapper around same logic
        function __drawObjectTo(target, obj) {
            if (!obj) return;
            const layer = state.layers.find(l => l.id === obj.layerId);
            if (layer && layer.visible === false) return;
            if (obj.type === 'group' && Array.isArray(obj.children)) {
                target.save();
                if (obj.rotation) {
                    const bounds = getBounds(obj);
                    if (bounds) {
                        const cx = obj.pivotX != null ? obj.pivotX : bounds.x + bounds.w / 2;
                        const cy = obj.pivotY != null ? obj.pivotY : bounds.y + bounds.h / 2;
                        target.translate(cx, cy);
                        target.rotate(obj.rotation * Math.PI / 180);
                        target.translate(-cx, -cy);
                    }
                }
                obj.children.forEach(child => __drawObjectTo(target, child));
                target.restore();
                return;
            }
            target.save();
            if (obj.maskId) {
                const mask = state.objects.find(candidate => candidate.id === obj.maskId);
                if (mask) {
                    const matrix = target.getTransform();
                    applyObjectRotation(target, mask);
                    target.beginPath();
                    if (mask.type === 'circle') {
                        target.ellipse(
                            mask.x + (mask.w || 0) / 2,
                            mask.y + (mask.h || 0) / 2,
                            Math.max(0.5, Math.abs(mask.w || 0) / 2),
                            Math.max(0.5, Math.abs(mask.h || mask.w || 0) / 2),
                            0, 0, Math.PI * 2
                        );
                    } else if (mask.type === 'path' && mask.points && mask.points.length) {
                        mask.points.forEach((point, index) => index
                            ? target.lineTo(point.x, point.y)
                            : target.moveTo(point.x, point.y));
                        if (mask.closed !== false) target.closePath();
                    } else if (mask.type === 'bezier' && mask.anchors && mask.anchors.length) {
                        const anchors = mask.anchors;
                        target.moveTo(anchors[0].x, anchors[0].y);
                        for (let i = 1; i < anchors.length; i++) {
                            const a = anchors[i - 1], b = anchors[i];
                            target.bezierCurveTo(
                                a.x + (a.outX || 0), a.y + (a.outY || 0),
                                b.x + (b.inX || 0), b.y + (b.inY || 0),
                                b.x, b.y
                            );
                        }
                        if (mask.closed && anchors.length > 2) target.closePath();
                    } else {
                        const bounds = getBounds(mask);
                        if (bounds) roundRectPath(target, bounds.x, bounds.y, bounds.w, bounds.h, mask.cornerRadius || 0);
                    }
                    target.clip();
                    target.setTransform(matrix);
                }
            }
            if (obj.rotation) {
                const b = getBounds(obj);
                if (b) {
                    const ox = (obj.pivotX != null) ? obj.pivotX : b.x + b.w / 2;
                    const oy = (obj.pivotY != null) ? obj.pivotY : b.y + b.h / 2;
                    target.translate(ox, oy);
                    target.rotate((obj.rotation * Math.PI) / 180);
                    target.translate(-ox, -oy);
                }
            }
            if (obj.blur) target.filter = `blur(${obj.blur}px)`;
            target.strokeStyle = obj.color || '#000';
            target.fillStyle = obj.fill || obj.color || '#000';
            target.lineWidth = obj.strokeWidth || 1;
            target.lineCap = 'round';
            target.lineJoin = 'round';
            target.globalAlpha = obj.opacity != null ? obj.opacity : 1;
            if (obj.soft) {
                target.shadowBlur = (obj.strokeWidth || 1) * 0.5;
                target.shadowColor = obj.color || '#000';
            }
            if (obj.type === 'image' && obj.src) {
                if (!obj._img) {
                    obj._img = new Image();
                    obj._img.onload = () => {
                        invalidateScene();
                        render();
                    };
                    obj._img.src = obj.src;
                }
                if (obj._img.complete) target.drawImage(obj._img, obj.x, obj.y, obj.w, obj.h);
            } else if (obj.type === 'text') {
                target.font = `${obj.fontWeight || 400} ${obj.fontSize || 24}px ${obj.fontFamily || 'Inter'}`;
                target.fillStyle = obj.color || '#000';
                target.fillText(obj.text || '', obj.x, obj.y);
            } else if (obj.type === 'path' && obj.points && obj.points.length) {
                if (!obj.closed && !obj.fill) {
                    drawBrushStroke(target, obj);
                } else {
                    target.beginPath();
                    target.moveTo(obj.points[0].x, obj.points[0].y);
                    for (let i = 1; i < obj.points.length; i++) target.lineTo(obj.points[i].x, obj.points[i].y);
                    if (obj.closed) target.closePath();
                    if (obj.fill) target.fill();
                    if (obj.strokeWidth !== 0) target.stroke();
                }
            } else if (obj.type === 'bezier' && obj.anchors) {
                const a = obj.anchors;
                if (!a.length) { target.restore(); return; }
                target.beginPath();
                target.moveTo(a[0].x, a[0].y);
                for (let i = 1; i < a.length; i++) {
                    const p0 = a[i - 1], p1 = a[i];
                    target.bezierCurveTo(p0.x + (p0.outX||0), p0.y + (p0.outY||0), p1.x + (p1.inX||0), p1.y + (p1.inY||0), p1.x, p1.y);
                }
                if (obj.closed && a.length > 2) {
                    const last = a[a.length-1], first = a[0];
                    target.bezierCurveTo(last.x+(last.outX||0), last.y+(last.outY||0), first.x+(first.inX||0), first.y+(first.inY||0), first.x, first.y);
                    target.closePath();
                }
                if (obj.fill) target.fill();
                if (obj.strokeWidth !== 0) target.stroke();
            } else if (['rect','roundrect','triangle','star','hexagon'].includes(obj.type)) {
                if (obj.type === 'rect' || obj.type === 'roundrect') {
                    target.beginPath();
                    roundRectPath(target, obj.x, obj.y, obj.w, obj.h, obj.cornerRadius || 0);
                    if (obj.fill) target.fill();
                    if (obj.strokeWidth !== 0) target.stroke();
                } else {
                    const cx = obj.x + (obj.w || 0) / 2;
                    const cy = obj.y + (obj.h || 0) / 2;
                    const rx = Math.abs(obj.w || 0) / 2;
                    const ry = Math.abs(obj.h || 0) / 2;
                    let points;
                    if (obj.type === 'triangle') {
                        points = [
                            { x: cx, y: obj.y },
                            { x: obj.x + obj.w, y: obj.y + obj.h },
                            { x: obj.x, y: obj.y + obj.h }
                        ];
                    } else if (obj.type === 'star') {
                        points = starPoints(cx, cy, Math.max(rx, ry), Math.max(rx, ry) * 0.4, 5);
                    } else {
                        points = Array.from({ length: 6 }, (_, i) => {
                            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                            return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
                        });
                    }
                    target.beginPath();
                    points.forEach((point, i) => i ? target.lineTo(point.x, point.y) : target.moveTo(point.x, point.y));
                    target.closePath();
                    if (obj.fill) target.fill();
                    if (obj.strokeWidth !== 0) target.stroke();
                }
            } else if (obj.type === 'circle') {
                target.beginPath();
                target.ellipse(
                    obj.x + (obj.w || 0) / 2,
                    obj.y + (obj.h || 0) / 2,
                    Math.max(0.5, Math.abs(obj.w || 0) / 2),
                    Math.max(0.5, Math.abs(obj.h || obj.w || 0) / 2),
                    0, 0, Math.PI * 2
                );
                if (obj.fill) target.fill();
                if (obj.strokeWidth !== 0) target.stroke();
            } else if (obj.type === 'line' || obj.type === 'arrow') {
                target.beginPath();
                target.moveTo(obj.x1, obj.y1);
                target.lineTo(obj.x2, obj.y2);
                target.stroke();
                if (obj.type === 'arrow') {
                    const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
                    const head = Math.max(10, (obj.strokeWidth || 1) * 2.2);
                    target.beginPath();
                    target.moveTo(obj.x2, obj.y2);
                    target.lineTo(obj.x2 - head * Math.cos(angle - 0.4), obj.y2 - head * Math.sin(angle - 0.4));
                    target.moveTo(obj.x2, obj.y2);
                    target.lineTo(obj.x2 - head * Math.cos(angle + 0.4), obj.y2 - head * Math.sin(angle + 0.4));
                    target.stroke();
                }
            }
            target.restore();
        }



        // ---- Start screen ----
        (function setupStartScreen() {
            const scr = document.getElementById('start-screen');
            if (!scr) return;
            const inf = document.getElementById('start-infinite');
            const fields = document.getElementById('start-size-fields');
            const updateFields = () => {
                const on = !inf.checked;
                fields.classList.toggle('opacity-50', !on);
                fields.classList.toggle('pointer-events-none', !on);
            };
            inf.onchange = updateFields;
            updateFields();
            let startBg = '#ffffff';
            document.querySelectorAll('.start-bg').forEach(b => {
                b.onclick = () => {
                    document.querySelectorAll('.start-bg').forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                    startBg = b.dataset.bg;
                };
            });
            let aspect = 1920/1080;
            document.getElementById('start-presets').onclick = (e) => {
                const btn = e.target.closest('[data-pw]');
                if (!btn) return;
                document.getElementById('start-w').value = btn.dataset.pw;
                document.getElementById('start-h').value = btn.dataset.ph;
                aspect = (+btn.dataset.pw) / (+btn.dataset.ph);
                inf.checked = false;
                updateFields();
            };
            document.getElementById('start-w').onchange = () => {
                if (!document.getElementById('start-lock-aspect').checked) return;
                const w = +document.getElementById('start-w').value;
                document.getElementById('start-h').value = Math.round(w / aspect);
            };
            document.getElementById('start-h').onchange = () => {
                if (!document.getElementById('start-lock-aspect').checked) return;
                const h = +document.getElementById('start-h').value;
                document.getElementById('start-w').value = Math.round(h * aspect);
            };
            document.getElementById('btn-start-create').onclick = () => {
                state.infiniteCanvas = inf.checked;
                state.canvasWidth = +document.getElementById('start-w').value || 1920;
                state.canvasHeight = +document.getElementById('start-h').value || 1080;
                state.canvasBg = startBg;
                if (!state.infiniteCanvas) {
                    // center view on artboard
                    const z = Math.min(window.innerWidth / state.canvasWidth, window.innerHeight / state.canvasHeight) * 0.85;
                    state.zoom = Math.max(0.05, z);
                    state.panX = (window.innerWidth - state.canvasWidth * state.zoom) / 2;
                    state.panY = (window.innerHeight - state.canvasHeight * state.zoom) / 2;
                }
                scr.classList.add('hidden');
                render();
            };
        })();

        // Artboard frame in render
        const _renderOrig = render;
        render = function() {
            drawGrid();
            ctx.save();
            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
            ctx.translate(state.panX, state.panY);
            ctx.scale(state.zoom, state.zoom);
            // artboard
            if (!state.infiniteCanvas) {
                ctx.save();
                ctx.fillStyle = state.canvasBg === 'transparent' ? 'rgba(0,0,0,0)' : (state.canvasBg || '#fff');
                if (state.canvasBg === 'transparent') {
                    // checker in artboard only
                } else {
                    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 1 / state.zoom;
                ctx.strokeRect(0, 0, state.canvasWidth, state.canvasHeight);
                ctx.restore();
            }
            drawPaintLayer(ctx, worldViewport());
            state._vp = worldViewport();
            state.objects.forEach(drawObject);
            // Pen rubber-band preview (Illustrator-like)
            if (state._penObj && state._penObj.anchors && state._penObj.anchors.length && state.lastWorld) {
                const a = state._penObj.anchors[state._penObj.anchors.length - 1];
                const p = state.lastWorld;
                ctx.save();
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1 / state.zoom;
                ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                // anchors
                state._penObj.anchors.forEach((anc, i) => {
                    ctx.fillStyle = i === 0 ? '#22c55e' : '#3b82f6';
                    ctx.fillRect(anc.x - 3/state.zoom, anc.y - 3/state.zoom, 6/state.zoom, 6/state.zoom);
                    if (anc.outX || anc.outY) {
                        ctx.strokeStyle = '#a78bfa';
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(anc.x, anc.y);
                        ctx.lineTo(anc.x + anc.outX, anc.y + anc.outY);
                        ctx.stroke();
                        ctx.fillStyle = '#a78bfa';
                        ctx.beginPath();
                        ctx.arc(anc.x + anc.outX, anc.y + anc.outY, 3/state.zoom, 0, Math.PI*2);
                        ctx.fill();
                    }
                });
                ctx.restore();
            }
            // export region overlay
            if (state.exportRegion) {
                const r = state.exportRegion;
                ctx.save();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2 / state.zoom;
                ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
                ctx.strokeRect(r.x, r.y, r.w, r.h);
                ctx.fillStyle = 'rgba(239,68,68,0.12)';
                ctx.fillRect(r.x, r.y, r.w, r.h);
                ctx.restore();
            }
            if (state.pixelGrid && state.zoom >= 8) {
                ctx.save();
                ctx.strokeStyle = 'rgba(128,128,128,0.35)';
                ctx.lineWidth = 1 / state.zoom;
                const b = screenToWorld(0, 0);
                const e = screenToWorld(window.innerWidth, window.innerHeight);
                const x0 = Math.floor(b.x), y0 = Math.floor(b.y);
                const x1 = Math.ceil(e.x), y1 = Math.ceil(e.y);
                ctx.beginPath();
                for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
                for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const hz = document.getElementById('zoom-reset');
            if (hz) hz.textContent = Math.round(state.zoom * 100) + '%';
        };

        // ---- Export region modal ----
        function openExportRegion() {
            const m = document.getElementById('export-region-modal');
            if (!m) return;
            m.classList.remove('hidden');
            m.classList.add('flex');
            hideCtx();
            const exportMenu = document.getElementById('export-menu');
            if (exportMenu) exportMenu.classList.add('hidden');
            updateExOut();
        }
        function closeExportRegion() {
            const m = document.getElementById('export-region-modal');
            if (!m) return;
            m.classList.add('hidden');
            m.classList.remove('flex');
            state.pickingExportRegion = false;
        }
        function updateExOut() {
            const w = +document.getElementById('ex-w').value || 1;
            const h = +document.getElementById('ex-h').value || 1;
            const s = +document.getElementById('ex-scale').value || 1;
            document.getElementById('ex-scale-val').textContent = s + '×';
            document.getElementById('ex-out-size').textContent = Math.round(w*s) + ' × ' + Math.round(h*s);
        }
        ['ex-w','ex-h','ex-scale'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = updateExOut;
        });
        document.getElementById('export-region-close') && (document.getElementById('export-region-close').onclick = closeExportRegion);
        document.getElementById('btn-export-region-menu') && (document.getElementById('btn-export-region-menu').onclick = openExportRegion);
        document.getElementById('btn-export-region-pick') && (document.getElementById('btn-export-region-pick').onclick = () => {
            state.pickingExportRegion = true;
            closeExportRegion();
            alert('キャンバス上でドラッグして範囲を指定してください');
        });
        document.querySelectorAll('.ex-fmt').forEach(btn => {
            btn.onclick = () => {
                const fmt = btn.dataset.fmt;
                const x = +document.getElementById('ex-x').value;
                const y = +document.getElementById('ex-y').value;
                const w = +document.getElementById('ex-w').value;
                const h = +document.getElementById('ex-h').value;
                const scale = +document.getElementById('ex-scale').value || 1;
                const transparent = document.getElementById('ex-transparent').checked;
                if (fmt === 'svg') {
                    // region svg via exportSVG style
                    if (typeof exportSVG === 'function') exportSVG();
                    else alert('SVG書き出しを実行しました');
                    closeExportRegion();
                    return;
                }
                if (fmt === 'gif') {
                    // single-frame gif as png download for now + note
                    const url = exportRegionHiRes(x, y, w, h, scale, transparent, 'png');
                    if (url) {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'versepaint-frame.png';
                        a.click();
                        alert('アニメGIFは「アニメ」モードでフレームを追加後に書き出せます。現フレームをPNGで保存しました。');
                    }
                    closeExportRegion();
                    return;
                }
                const url = exportRegionHiRes(x, y, w, h, scale, transparent, fmt);
                if (!url) { alert('書き出しに失敗しました'); return; }
                const a = document.createElement('a');
                a.href = url;
                a.download = 'versepaint-export.' + (fmt === 'jpeg' ? 'jpg' : fmt);
                a.click();
                closeExportRegion();
            };
        });

        // Context menu actions
        document.querySelectorAll('#app-ctx-menu [data-ctx]').forEach(btn => {
            btn.onclick = () => {
                const act = btn.dataset.ctx;
                hideCtx();
                if (act === 'export-region') openExportRegion();
                else if (act === 'delete' && state.selectedIds.size) document.getElementById('btn-delete-selected').click();
                else if (act === 'bring-front') selectedObjects().forEach(o => reorderObject(o.id, 'front'));
                else if (act === 'bring-forward') selectedObjects().forEach(o => reorderObject(o.id, 'forward'));
                else if (act === 'send-backward') selectedObjects().forEach(o => reorderObject(o.id, 'backward'));
                else if (act === 'send-back') selectedObjects().forEach(o => reorderObject(o.id, 'back'));
                else if (act === 'to-raster') {
                    try { selectionToRasterFixed(); } catch (e) { console.error(e); alert('変換に失敗: ' + e.message); }
                }
                else if (act === 'to-vector') {
                    alert('選択画像の簡易トレースはベジェペンで手動トレースするか、今後のアップデートで強化されます。');
                }
                else if (act === 'effect-more') {
                    openEffectMore();
                }
                else if (act === 'duplicate') {
                    pushHistory();
                    const news = [];
                    selectedObjects().forEach(o => {
                        const c = JSON.parse(JSON.stringify(o));
                        c.id = uid();
                        if (c.x != null) { c.x += 10; c.y += 10; }
                        if (c.points) c.points.forEach(p => { p.x += 10; p.y += 10; });
                        if (c.anchors) c.anchors.forEach(a => { a.x += 10; a.y += 10; });
                        state.objects.push(c);
                        news.push(c.id);
                    });
                    state.selectedIds = new Set(news);
                    render();
                }
            };
        });

        function selectionToRasterFixed() {
            const targets = selectedObjects();
            if (!targets.length) { alert('オブジェクトを選択してください'); return; }
            const union = targets.reduce((acc, o) => {
                const b = getBounds(o);
                if (!b) return acc;
                if (!acc) return { ...b };
                const x = Math.min(acc.x, b.x), y = Math.min(acc.y, b.y);
                return { x, y, w: Math.max(acc.x + acc.w, b.x + b.w) - x, h: Math.max(acc.y + acc.h, b.y + b.h) - y };
            }, null);
            if (!union || union.w < 1) return;
            pushHistory();
            const ids = new Set(targets.map(t => t.id));
            const url = exportRegionHiRes(union.x, union.y, union.w, union.h, 2, true, 'png', ids);
            state.objects = state.objects.filter(o => !ids.has(o.id));
            state.objects.push({
                id: uid(), type: 'image', src: url,
                x: union.x, y: union.y, w: union.w, h: union.h,
                opacity: 1, layerId: state.activeLayerId
            });
            state.selectedIds.clear();
            invalidateScene();
            invalidateObjectIndex();
            render();
        }

        // Left paint panel sync
        function syncLeftPanel() {
            const sl = document.getElementById('size-slider-left');
            const sv = document.getElementById('size-val-left');
            if (sl) sl.value = Math.min(500, state.strokeWidth);
            if (sv) sv.textContent = state.strokeWidth;
            const ol = document.getElementById('opacity-slider-left');
            const ov = document.getElementById('opacity-val-left');
            if (ol) ol.value = Math.round(state.opacity * 100);
            if (ov) ov.textContent = Math.round(state.opacity * 100) + '%';
            const sw = document.getElementById('color-swatch-left');
            if (sw) sw.style.background = state.color;
            const hx = document.getElementById('hex-input-left');
            if (hx) hx.value = (state.color || '').replace('#','');
        }
        const stabLeft = document.getElementById('stabilize-slider-left');
        if (stabLeft) stabLeft.oninput = (e) => {
            state.stabilize = +e.target.value;
            const v = document.getElementById('stabilize-val-left');
            if (v) v.textContent = state.stabilize;
            const main = document.getElementById('stabilize-slider');
            if (main) main.value = state.stabilize;
            const mv = document.getElementById('stabilize-val');
            if (mv) mv.textContent = state.stabilize;
        };
        const sizeLeft = document.getElementById('size-slider-left');
        if (sizeLeft) sizeLeft.oninput = (e) => {
            state.strokeWidth = +e.target.value;
            document.getElementById('size-val-left').textContent = state.strokeWidth;
            const main = document.getElementById('size-slider');
            if (main) main.value = state.strokeWidth;
            const sv = document.getElementById('size-val');
            if (sv) sv.textContent = state.strokeWidth;
            updateCursor();
        };
        const opLeft = document.getElementById('opacity-slider-left');
        if (opLeft) opLeft.oninput = (e) => {
            state.opacity = +e.target.value / 100;
            document.getElementById('opacity-val-left').textContent = e.target.value + '%';
            const main = document.getElementById('opacity-slider');
            if (main) main.value = e.target.value;
            const ov = document.getElementById('opacity-val');
            if (ov) ov.textContent = e.target.value + '%';
        };
        const colLeft = document.getElementById('color-input-left');
        if (colLeft) colLeft.oninput = () => setColor(colLeft.value);
        const hexLeft = document.getElementById('hex-input-left');
        if (hexLeft) hexLeft.onchange = () => setColor(hexLeft.value);

        // Animation mode
        const animBtn = document.getElementById('mode-anim-btn');
        if (animBtn) animBtn.onclick = () => setMode('anim');
        const _setMode = setMode;
        setMode = function(m) {
            if (m === 'anim') {
                state.mode = 'anim';
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                animBtn && animBtn.classList.add('active');
                // simple: capture frame button via alert for now
                return;
            }
            _setMode(m);
        };

        // Google Fonts — popular set + load
        const GOOGLE_FONTS = [
            'Inter','Roboto','Open Sans','Lato','Montserrat','Oswald','Raleway','Poppins','Nunito','Merriweather',
            'Playfair Display','Source Sans 3','Ubuntu','Rubik','Work Sans','Noto Sans JP','Noto Serif JP','M PLUS Rounded 1c',
            'Sawarabi Gothic','Sawarabi Mincho','Kosugi','Kosugi Maru','Shippori Mincho','Zen Kaku Gothic New','Zen Maru Gothic',
            'Josefin Sans','PT Sans','PT Serif','Fira Sans','Mulish','Barlow','DM Sans','Manrope','Space Grotesk','IBM Plex Sans',
            'Crimson Text','Libre Baskerville','Inconsolata','Roboto Mono','JetBrains Mono','Comic Neue','Indie Flower'
        ];
        function loadGoogleFont(name) {
            const id = 'gf-' + name.replace(/\s+/g,'-');
            if (document.getElementById(id)) return;
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g,'+') + ':wght@400;500;700&display=swap';
            document.head.appendChild(link);
        }
        const fontSelectEl = document.getElementById('font-family-select');
        if (fontSelectEl) {
            fontSelectEl.innerHTML = GOOGLE_FONTS.map(f => `<option value="${f}">${f}</option>`).join('');
            fontSelectEl.onchange = (e) => {
                state.fontFamily = e.target.value;
                loadGoogleFont(e.target.value);
                selectedObjects().filter(o => o.type === 'text').forEach(o => { o.fontFamily = e.target.value; });
                render();
            };
            loadGoogleFont('Inter');
            loadGoogleFont('Noto Sans JP');
        }



        // ========== TABS ==========
        function switchSideTab(name) {
            ['props','layers','regions'].forEach(t => {
                const btn = document.getElementById('tab-' + t);
                const panel = document.getElementById('tab-panel-' + t);
                if (btn) btn.classList.toggle('active', t === name);
                if (panel) {
                    if (t === name) { panel.classList.remove('hidden'); panel.classList.add('flex'); }
                    else { panel.classList.add('hidden'); panel.classList.remove('flex'); }
                }
            });
        }
        document.getElementById('tab-props') && (document.getElementById('tab-props').onclick = () => switchSideTab('props'));
        document.getElementById('tab-layers') && (document.getElementById('tab-layers').onclick = () => switchSideTab('layers'));
        document.getElementById('tab-regions') && (document.getElementById('tab-regions').onclick = () => switchSideTab('regions'));
        switchSideTab('props');

        // ========== GROUP / UNGROUP ==========
        function groupSelection() {
            const targets = selectedObjects();
            if (targets.length < 2) { alert('2つ以上選択してください'); return; }
            pushHistory();
            const ids = new Set(targets.map(t => t.id));
            const children = targets.map(t => JSON.parse(JSON.stringify(t)));
            // bounds
            let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
            children.forEach(o => {
                const b = getBounds(o);
                if (!b) return;
                minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
                maxx = Math.max(maxx, b.x+b.w); maxy = Math.max(maxy, b.y+b.h);
            });
            state.objects = state.objects.filter(o => !ids.has(o.id));
            const g = {
                id: uid(), type: 'group', name: 'Group ' + (state.groupCounter++),
                children, x: minx, y: miny, w: maxx-minx, h: maxy-miny,
                opacity: 1, layerId: state.activeLayerId, rotation: 0
            };
            state.objects.push(g);
            invalidateScene();
            invalidateObjectIndex();
            state.selectedIds = new Set([g.id]);
            render(); updateSelectionUI(); renderLayerList();
        }
        function ungroupSelection() {
            const targets = selectedObjects().filter(o => o.type === 'group');
            if (!targets.length) return;
            pushHistory();
            targets.forEach(g => {
                const i = state.objects.findIndex(o => o.id === g.id);
                if (i < 0) return;
                state.objects.splice(i, 1);
                (g.children || []).forEach(ch => {
                    ch.id = uid();
                    state.objects.splice(i, 0, ch);
                });
            });
            state.selectedIds.clear();
            invalidateScene();
            invalidateObjectIndex();
            render(); updateSelectionUI(); renderLayerList();
        }
        document.getElementById('btn-group') && (document.getElementById('btn-group').onclick = groupSelection);
        document.getElementById('btn-ungroup') && (document.getElementById('btn-ungroup').onclick = ungroupSelection);

        // draw group
        const _drawObject = drawObject;
        drawObject = function(obj) {
            if (obj && obj.type === 'group' && obj.children) {
                ctx.save();
                if (obj.rotation) {
                    const cx = obj.x + obj.w/2, cy = obj.y + obj.h/2;
                    ctx.translate(cx, cy);
                    ctx.rotate((obj.rotation * Math.PI)/180);
                    ctx.translate(-cx, -cy);
                }
                obj.children.forEach(ch => _drawObject(ch));
                ctx.restore();
                return;
            }
            _drawObject(obj);
        };

        // ========== W/H/X/Y props ==========
        function syncGeomProps() {
            const o = selectedObjects()[0];
            if (!o) return;
            const b = getBounds(o) || { x: o.x||0, y: o.y||0, w: o.w||0, h: o.h||0 };
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v * 100) / 100; };
            set('prop-x', b.x); set('prop-y', b.y); set('prop-w', b.w); set('prop-h', b.h);
            const al = document.getElementById('prop-aspect-lock');
            if (al) al.checked = state.aspectLock !== false;
        }
        const _syncObj = typeof syncObjectPropsUI === 'function' ? syncObjectPropsUI : null;
        syncObjectPropsUI = function() {
            if (_syncObj) _syncObj();
            syncGeomProps();
        };
        function applyGeomFromInputs(changed) {
            const targets = selectedObjects();
            if (!targets.length) return;
            const o = targets[0];
            const b = getBounds(o);
            if (!b) return;
            const nx = parseFloat(document.getElementById('prop-x').value);
            const ny = parseFloat(document.getElementById('prop-y').value);
            let nw = parseFloat(document.getElementById('prop-w').value);
            let nh = parseFloat(document.getElementById('prop-h').value);
            const lock = document.getElementById('prop-aspect-lock')?.checked;
            if (lock && b.w > 0 && b.h > 0) {
                if (changed === 'w') nh = nw * (b.h / b.w);
                if (changed === 'h') nw = nh * (b.w / b.h);
            }
            pushHistory();
            const dx = nx - b.x, dy = ny - b.y;
            const sx = b.w ? nw / b.w : 1, sy = b.h ? nh / b.h : 1;
            // move
            if (o.type === 'path' && o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
            else if (o.type === 'bezier' && o.anchors) o.anchors.forEach(a => { a.x += dx; a.y += dy; });
            else if (o.type === 'line' || o.type === 'arrow') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
            else if (o.x != null) { o.x += dx; o.y += dy; }
            // scale from top-left of bounds
            const scalePt = (px, py) => ({
                x: b.x + dx + (px - b.x) * sx,
                y: b.y + dy + (py - b.y) * sy
            });
            if (Math.abs(sx-1) > 1e-6 || Math.abs(sy-1) > 1e-6) {
                if (o.type === 'path' && o.points) o.points = o.points.map(p => scalePt(p.x - dx, p.y - dy)); // already moved
                // re-get after move — simplify:
                if (['rect','roundrect','circle','triangle','star','hexagon','image'].includes(o.type)) {
                    o.w = (o.w >= 0 ? 1 : -1) * nw;
                    o.h = (o.h >= 0 ? 1 : -1) * nh;
                    o.x = nx; o.y = ny;
                } else if (o.type === 'group') {
                    o.x = nx; o.y = ny; o.w = nw; o.h = nh;
                }
            } else if (['rect','roundrect','circle','triangle','star','hexagon','image','group'].includes(o.type)) {
                o.x = nx; o.y = ny;
            }
            render();
            syncGeomProps();
        }
        ['prop-x','prop-y'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = () => applyGeomFromInputs(id.slice(-1));
        });
        const pw = document.getElementById('prop-w');
        if (pw) pw.onchange = () => applyGeomFromInputs('w');
        const ph = document.getElementById('prop-h');
        if (ph) ph.onchange = () => applyGeomFromInputs('h');
        document.getElementById('prop-aspect-lock') && (document.getElementById('prop-aspect-lock').onchange = (e) => {
            state.aspectLock = e.target.checked;
        });

        // ========== COPY / PASTE ==========
        function copySelection() {
            const targets = selectedObjects();
            if (!targets.length) return;
            state.clipboard = JSON.parse(JSON.stringify(targets));
        }
        function pasteClipboard() {
            if (!state.clipboard || !state.clipboard.length) return;
            pushHistory();
            const news = [];
            state.clipboard.forEach(o => {
                const c = JSON.parse(JSON.stringify(o));
                c.id = uid();
                c.layerId = state.activeLayerId;
                const shift = 16;
                if (c.points) c.points.forEach(p => { p.x += shift; p.y += shift; });
                if (c.anchors) c.anchors.forEach(a => { a.x += shift; a.y += shift; });
                if (c.x != null) { c.x += shift; c.y += shift; }
                if (c.x1 != null) { c.x1 += shift; c.y1 += shift; c.x2 += shift; c.y2 += shift; }
                if (c.children) c.children.forEach(ch => { ch.id = uid(); });
                state.objects.push(c);
                news.push(c.id);
            });
            state.selectedIds = new Set(news);
            render(); updateSelectionUI(); renderLayerList();
        }
        // extend keydown
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); copySelection(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') { e.preventDefault(); pasteClipboard(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); copySelection(); pasteClipboard(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                state.selectedIds = new Set(state.objects.filter(o => !isLayerLocked(o.layerId)).map(o => o.id));
                updateSelectionUI(); render();
            }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
                e.preventDefault();
                const next = new Set();
                state.objects.forEach(o => {
                    if (isLayerLocked(o.layerId)) return;
                    if (!state.selectedIds.has(o.id)) next.add(o.id);
                });
                state.selectedIds = next;
                updateSelectionUI(); render();
            }
            if (e.shiftKey && (e.key === 'e' || e.key === 'E') && !(e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                openEffectMore();
            }
        }, true);

        // ========== EXPORT REGION MODE (red) ==========
        function startExportPickMode() {
            state.exportPickMode = true;
            state.pickingExportRegion = true;
            state.exportRegion = null;
            setTool('select');
            const m = document.getElementById('export-region-modal');
            if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
            // toast
            const t = document.createElement('div');
            t.id = 'export-pick-toast';
            t.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[160] px-4 py-2 rounded-lg text-[12px] text-white';
            t.style.background = 'rgba(220,38,38,0.9)';
            t.textContent = '範囲書き出し: ドラッグで選択（Escでキャンセル）';
            document.body.appendChild(t);
            render();
        }
        document.getElementById('btn-export-region-pick') && (document.getElementById('btn-export-region-pick').onclick = startExportPickMode);
        document.getElementById('btn-export-region-menu') && (document.getElementById('btn-export-region-menu').onclick = () => {
            openExportRegion();
        });
        // red overlay already in render — change color when exportPickMode
        // patch export region stroke in render by replacing blue with red when picking

        // ========== REGIONS ==========
        function captureRegionSnapshot() {
            return {
                objects: JSON.parse(JSON.stringify(state.objects)),
                layers: JSON.parse(JSON.stringify(state.layers)),
                activeLayerId: state.activeLayerId,
                paintData: serializePaintLayer(),
                canvasBg: state.canvasBg,
                infiniteCanvas: state.infiniteCanvas,
                canvasWidth: state.canvasWidth,
                canvasHeight: state.canvasHeight
            };
        }
        function applyRegionSnapshot(snap) {
            if (!snap) return;
            state.objects = snap.objects || [];
            state.layers = snap.layers || state.layers;
            state.activeLayerId = snap.activeLayerId || state.activeLayerId;
            state.canvasBg = snap.canvasBg != null ? snap.canvasBg : state.canvasBg;
            restorePaintLayer(snap.paintData, snap.paintOrigin);
            invalidateScene();
            invalidateObjectIndex();
            state.selectedIds.clear();
            render(); renderLayerList(); updateSelectionUI();
        }
        function renderRegionList() {
            const box = document.getElementById('region-list');
            if (!box) return;
            box.innerHTML = '';
            (state.regions || []).forEach(r => {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-1 px-1.5 py-1.5 rounded-md text-[11px] ' +
                    (r.id === state.activeRegionId ? 'bg-white/10 text-white' : 'text-geist-400 hover:bg-white/5');
                row.innerHTML = `<span class="flex-1 truncate cursor-pointer reg-name">${r.name}</span>
                    <button class="reg-load text-[10px] px-1">開く</button>
                    <button class="reg-del text-[10px] text-rose-400 px-1">削除</button>`;
                row.querySelector('.reg-name').onclick = row.querySelector('.reg-load').onclick = () => {
                    // save current into active region first if any
                    if (state.activeRegionId) {
                        const cur = state.regions.find(x => x.id === state.activeRegionId);
                        if (cur) cur.snapshot = captureRegionSnapshot();
                    }
                    state.activeRegionId = r.id;
                    applyRegionSnapshot(r.snapshot);
                    renderRegionList();
                };
                row.querySelector('.reg-del').onclick = (e) => {
                    e.stopPropagation();
                    if (!confirm('リージョン「' + r.name + '」を削除しますか？')) return;
                    state.regions = state.regions.filter(x => x.id !== r.id);
                    if (state.activeRegionId === r.id) state.activeRegionId = null;
                    renderRegionList();
                };
                box.appendChild(row);
            });
            if (!(state.regions || []).length) {
                box.innerHTML = '<div class="text-geist-600 text-[10px] px-1">保存されたリージョンなし</div>';
            }
        }
        document.getElementById('btn-region-save') && (document.getElementById('btn-region-save').onclick = () => {
            const name = (document.getElementById('region-name').value || '').trim() || ('Region ' + (state.regions.length + 1));
            const snap = captureRegionSnapshot();
            const existing = state.regions.find(r => r.name === name);
            if (existing) {
                existing.snapshot = snap;
                state.activeRegionId = existing.id;
            } else {
                const r = { id: uid(), name, snapshot: snap, created: Date.now() };
                state.regions.push(r);
                state.activeRegionId = r.id;
            }
            document.getElementById('region-name').value = '';
            renderRegionList();
            alert('リージョン「' + name + '」を保存しました');
        });

        // ========== ANIMATION TIMELINE ==========
        let animPlaying = false;
        let animRaf = null;
        let animIndex = 0;
        let animLastTime = 0;
        let animAccumulator = 0;

        function showAnimBar(show) {
            const bar = document.getElementById('anim-bar');
            if (!bar) return;
            bar.classList.toggle('hidden', !show);
            bar.classList.toggle('flex', show);
        }

        function cloneFrameObjects(objects) {
            return JSON.parse(JSON.stringify(objects || [], (key, value) =>
                key === '_img' || key === '_effectBase' ? undefined : value
            ));
        }

        function captureAnimFrame({ blank = false } = {}) {
            return {
                id: uid(),
                objects: blank ? [] : cloneFrameObjects(state.objects),
                layers: JSON.parse(JSON.stringify(state.layers)),
                activeLayerId: state.activeLayerId,
                paintChunks: blank ? new Map() : new Map(ensurePaintLayer()),
                note: 'vector+raster'
            };
        }

        function serializeAnimFrame(frame) {
            const clean = {
                ...frame,
                objects: cloneFrameObjects(frame.objects),
                paintData: frame.paintChunks instanceof Map
                    ? serializePaintLayer(frame.paintChunks)
                    : frame.paintData || null
            };
            delete clean.paintChunks;
            delete clean.thumbnail;
            return clean;
        }

        const animPaintCache = new WeakMap();

        function decodeAnimPaintFrame(frame) {
            if (frame.paintChunks instanceof Map) return Promise.resolve(frame.paintChunks);
            let pending = animPaintCache.get(frame);
            if (pending) return pending;

            pending = (async () => {
                const chunks = new Map();
                const loadImage = src => new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => reject(new Error('Failed to restore animation frame paint data'));
                    image.src = src;
                });
                const createTile = (cx, cy) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = PAINT_CHUNK_SIZE;
                    canvas.height = PAINT_CHUNK_SIZE;
                    const tile = { canvas, ctx: canvas.getContext('2d') };
                    chunks.set(`${cx},${cy}`, tile);
                    return tile;
                };
                const data = frame.paintData;
                if (data && data.format === 'chunks-v1' && Array.isArray(data.tiles)) {
                    for (const tileData of data.tiles) {
                        const image = await loadImage(tileData.data);
                        createTile(tileData.x, tileData.y).ctx.drawImage(image, 0, 0, PAINT_CHUNK_SIZE, PAINT_CHUNK_SIZE);
                    }
                } else if (typeof data === 'string') {
                    const image = await loadImage(data);
                    const origin = frame.paintOrigin || { x: -image.width / 2, y: -image.height / 2 };
                    const minCX = Math.floor(origin.x / PAINT_CHUNK_SIZE);
                    const minCY = Math.floor(origin.y / PAINT_CHUNK_SIZE);
                    const maxCX = Math.ceil((origin.x + image.width) / PAINT_CHUNK_SIZE);
                    const maxCY = Math.ceil((origin.y + image.height) / PAINT_CHUNK_SIZE);
                    for (let cy = minCY; cy < maxCY; cy++) {
                        for (let cx = minCX; cx < maxCX; cx++) {
                            const left = Math.max(origin.x, cx * PAINT_CHUNK_SIZE);
                            const top = Math.max(origin.y, cy * PAINT_CHUNK_SIZE);
                            const right = Math.min(origin.x + image.width, (cx + 1) * PAINT_CHUNK_SIZE);
                            const bottom = Math.min(origin.y + image.height, (cy + 1) * PAINT_CHUNK_SIZE);
                            if (right <= left || bottom <= top) continue;
                            createTile(cx, cy).ctx.drawImage(
                                image,
                                left - origin.x, top - origin.y, right - left, bottom - top,
                                left - cx * PAINT_CHUNK_SIZE, top - cy * PAINT_CHUNK_SIZE, right - left, bottom - top
                            );
                        }
                    }
                }
                return chunks;
            })();
            animPaintCache.set(frame, pending);
            pending.catch(() => animPaintCache.delete(frame));
            return pending;
        }

        function saveCurrentAnimFrame() {
            const frame = state.animFrames[animIndex];
            if (!frame) return;
            frame.objects = state.objects;
            frame.layers = state.layers;
            frame.activeLayerId = state.activeLayerId;
            if (frame.paintChunks instanceof Map || !frame.paintData) {
                frame.paintChunks = new Map(ensurePaintLayer());
                delete frame.paintData;
                delete frame.paintOrigin;
            }
            updateAnimFrameCells(animIndex, frame);
        }

        function loadAnimFrame(frame, { updateUI = true } = {}) {
            if (!frame) return;
            state.objects = frame.objects || [];
            activateObjectIndex(frame);
            if (frame.layers) state.layers = frame.layers;
            state.activeLayerId = frame.activeLayerId || state.activeLayerId;
            if (state.animTrackId && state.animTrackId !== 'raster') {
                const trackLayer = state.layers.find(layer => layer.id === state.animTrackId);
                if (trackLayer) state.activeLayerId = trackLayer.id;
            }
            if (frame.paintChunks instanceof Map) {
                state.paintRestoreId++;
                state.animFrameLoading = false;
                state.paintChunks = new Map(frame.paintChunks);
                state.paintCowSet = new Set();
                state.paintRevision++;
            } else {
                const restoreId = ++state.paintRestoreId;
                state.animFrameLoading = true;
                state.paintChunks = new Map();
                state.paintCowSet = new Set();
                state.paintRevision++;
                decodeAnimPaintFrame(frame).then(chunks => {
                    if (!(frame.paintChunks instanceof Map)) {
                        frame.paintChunks = chunks;
                        delete frame.paintData;
                        delete frame.paintOrigin;
                    }
                    if (restoreId !== state.paintRestoreId || state._activeAnimFrame !== frame) return;
                    if (frame.paintChunks !== chunks) return;
                    state.animFrameLoading = false;
                    state.paintChunks = new Map(chunks);
                    state.paintCowSet = new Set();
                    state.paintRevision++;
                    updateAnimFrameCells(animIndex, frame);
                    invalidateScene();
                    render();
                }).catch(error => {
                    if (state._activeAnimFrame === frame) state.animFrameLoading = false;
                    console.error('Animation frame paint restore failed', error);
                });
            }
            state.selectedIds.clear();
            invalidateScene();
            render();
            if (updateUI) {
                updateAnimUI({ rebuild: false });
                updateSelectionUI();
                renderLayerList();
            }
        }

        function updateAnimIndicator() {
            const count = state.animFrames.length;
            animIndex = count ? Math.max(0, Math.min(animIndex, count - 1)) : 0;
            const label = document.getElementById('anim-frame-label');
            const duration = document.getElementById('anim-duration');
            const fps = Math.max(1, Math.min(60, Number(state.animFps) || 12));
            if (label) label.textContent = `${count ? animIndex + 1 : 0} / ${count}`;
            if (duration) duration.textContent = `${(count / fps).toFixed(1)}s`;
            const strip = document.getElementById('anim-strip');
            if (strip) {
                strip.querySelectorAll('.active').forEach(element => element.classList.remove('active'));
                strip.querySelectorAll('[aria-current="true"]').forEach(element => element.setAttribute('aria-current', 'false'));
                strip.querySelectorAll(`[data-frame-index="${animIndex}"]`).forEach(element => {
                    if (element.classList.contains('anim-frame-head') || element.classList.contains('anim-cel')) {
                        element.classList.add('active');
                        element.setAttribute('aria-current', 'true');
                    }
                });
                strip.querySelectorAll('.anim-layer-head').forEach(element => {
                    const selected = element.dataset.trackId === String(state.animTrackId || state.activeLayerId);
                    element.classList.toggle('selected', selected);
                });
            }
        }

        function frameLayerObjectCounts(frame) {
            const counts = new Map();
            (frame.objects || []).forEach(object => {
                if (!object.layerId) return;
                counts.set(object.layerId, (counts.get(object.layerId) || 0) + 1);
            });
            return counts;
        }

        function frameRasterCount(frame) {
            if (frame.paintChunks instanceof Map) return Number(frame.paintChunks.size > 0);
            if (frame.paintData?.format === 'chunks-v1') return Number((frame.paintData.tiles?.length || 0) > 0);
            return typeof frame.paintData === 'string' ? 1 : 0;
        }

        function updateAnimFrameCells(index, frame) {
            const strip = document.getElementById('anim-strip');
            if (!strip) return;
            const counts = frameLayerObjectCounts(frame);
            strip.querySelectorAll(`[data-frame-index="${index}"][data-track-id]`).forEach(cell => {
                const count = cell.dataset.trackId === 'raster'
                    ? frameRasterCount(frame)
                    : counts.get(cell.dataset.trackId) || 0;
                const countLabel = cell.querySelector('.anim-cel-count');
                if (countLabel) countLabel.textContent = count ? String(count) : '+';
                cell.classList.toggle('has-content', count > 0);
                const trackName = cell.dataset.trackName || 'Layer';
                cell.setAttribute('aria-label', `${trackName}、フレーム ${index + 1}、${count ? `${count} 個` : '空'}`);
            });
        }

        function selectAnimTrack(trackId) {
            if (state.animFrames.length) saveCurrentAnimFrame();
            state.animTrackId = trackId;
            if (trackId !== 'raster') {
                const layer = state.layers.find(item => item.id === trackId);
                if (layer) {
                    state.activeLayerId = layer.id;
                    const frame = state.animFrames[animIndex];
                    if (frame) frame.activeLayerId = layer.id;
                }
            }
            updateAnimIndicator();
            renderLayerList();
            invalidateScene();
            render();
        }

        function selectAnimTrackFrame(index, trackId) {
            selectAnimFrame(index);
            selectAnimTrack(trackId);
        }

        function setAnimLayerVisibility(layerId) {
            const layer = state.layers.find(item => item.id === layerId);
            if (!layer) return;
            layer.visible = layer.visible === false;
            const frame = state.animFrames[animIndex];
            if (frame) frame.layers = state.layers;
            invalidateScene();
            renderLayerList();
            render();
            updateAnimUI({ rebuild: true });
        }

        function createAnimCell(index, trackId, trackName, objectCounts, rasterCount) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'anim-cel';
            button.dataset.frameIndex = String(index);
            button.dataset.trackId = trackId;
            button.dataset.trackName = trackName;
            const count = trackId === 'raster'
                ? rasterCount
                : objectCounts.get(trackId) || 0;
            button.classList.toggle('has-content', count > 0);
            button.setAttribute('aria-label', `${trackName}、フレーム ${index + 1}、${count ? `${count} 個` : '空'}`);
            const countLabel = document.createElement('span');
            countLabel.className = 'anim-cel-count';
            countLabel.textContent = count ? String(count) : '+';
            button.appendChild(countLabel);
            button.onclick = () => selectAnimTrackFrame(index, trackId);
            return button;
        }

        function appendAnimTrack(strip, trackId, trackName, frames, countsByFrame, { layer = null, raster = false } = {}) {
            const header = document.createElement('div');
            header.className = `anim-layer-head${raster ? ' raster' : ''}`;
            header.dataset.trackId = trackId;
            if (layer) {
                const visibility = document.createElement('button');
                visibility.type = 'button';
                visibility.className = 'anim-layer-vis';
                visibility.setAttribute('aria-label', `${trackName}を${layer.visible === false ? '表示' : '非表示'}`);
                visibility.title = layer.visible === false ? 'レイヤーを表示' : 'レイヤーを非表示';
                visibility.innerHTML = `<i class="fa-solid ${layer.visible === false ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
                visibility.onclick = () => setAnimLayerVisibility(layer.id);
                header.appendChild(visibility);
            }
            const select = document.createElement('button');
            select.type = 'button';
            select.className = 'anim-layer-select';
            select.textContent = trackName;
            select.title = trackName;
            select.onclick = () => selectAnimTrack(trackId);
            header.appendChild(select);
            strip.appendChild(header);
            frames.forEach((frame, index) => strip.appendChild(createAnimCell(
                index, trackId, trackName, countsByFrame[index].objects, countsByFrame[index].raster
            )));
        }

        function updateAnimUI({ rebuild = false } = {}) {
            const count = state.animFrames.length;
            animIndex = count ? Math.max(0, Math.min(animIndex, count - 1)) : 0;
            const strip = document.getElementById('anim-strip');
            if (strip && rebuild) {
                strip.replaceChildren();
                strip.style.setProperty('--anim-frame-count', String(Math.max(1, count)));
                const corner = document.createElement('div');
                corner.className = 'anim-corner';
                corner.textContent = 'レイヤー';
                strip.appendChild(corner);
                const countsByFrame = state.animFrames.map(frame => ({
                    objects: frameLayerObjectCounts(frame),
                    raster: frameRasterCount(frame)
                }));
                state.animFrames.forEach((frame, index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'anim-frame-head';
                    button.dataset.frameIndex = String(index);
                    button.textContent = String(index + 1).padStart(2, '0');
                    button.setAttribute('aria-label', `フレーム ${index + 1} を選択`);
                    button.onclick = () => selectAnimFrame(index);
                    strip.appendChild(button);
                });
                const layers = (state.layers || []).filter(layer => layer.type !== 'folder');
                layers.forEach(layer => appendAnimTrack(strip, layer.id, layer.name || 'Layer', state.animFrames, countsByFrame, { layer }));
                appendAnimTrack(strip, 'raster', 'ラスター', state.animFrames, countsByFrame, { raster: true });
            }
            updateAnimIndicator();
            const play = document.getElementById('anim-play');
            if (play) {
                play.innerHTML = `<i class="fa-solid fa-${animPlaying ? 'pause' : 'play'}"></i>`;
                play.title = animPlaying ? '一時停止 (Space)' : '再生 (Space)';
                play.setAttribute('aria-label', animPlaying ? 'アニメーションを一時停止' : 'アニメーションを再生');
            }
            ['anim-prev', 'anim-next', 'anim-del', 'anim-duplicate', 'anim-play'].forEach(id => {
                const button = document.getElementById(id);
                if (button) button.disabled = !count || (id === 'anim-play' && count < 2);
            });
        }

        function selectAnimFrame(index, { fromPlayback = false } = {}) {
            if (!state.animFrames.length) return;
            if (!fromPlayback) stopAnimPlayback();
            const nextIndex = Math.max(0, Math.min(index, state.animFrames.length - 1));
            if (nextIndex === animIndex) return;
            saveCurrentAnimFrame();
            animIndex = nextIndex;
            loadAnimFrame(state.animFrames[animIndex], { updateUI: !fromPlayback });
            if (fromPlayback) updateAnimIndicator();
        }

        function addAnimFrame({ duplicate = false } = {}) {
            stopAnimPlayback();
            if (state.animFrames.length) saveCurrentAnimFrame();
            const frame = captureAnimFrame();
            if (!duplicate) {
                if (state.animTrackId === 'raster') {
                    frame.paintChunks = new Map();
                } else {
                    const layerId = state.animTrackId || state.activeLayerId;
                    frame.objects = frame.objects.filter(object => object.layerId !== layerId);
                }
            }
            state.animFrames.splice(state.animFrames.length ? animIndex + 1 : 0, 0, frame);
            animIndex = state.animFrames.indexOf(frame);
            loadAnimFrame(frame, { updateUI: false });
            updateAnimUI({ rebuild: true });
        }

        function deleteAnimFrame() {
            if (!state.animFrames.length) return;
            stopAnimPlayback();
            state.animFrames.splice(animIndex, 1);
            if (!state.animFrames.length) {
                state.objects = [];
                state.paintChunks = new Map();
                state.paintCowSet = new Set();
                activateObjectIndex(null);
                invalidateScene();
                invalidateObjectIndex();
                render();
                updateSelectionUI();
                renderLayerList();
            } else {
                animIndex = Math.min(animIndex, state.animFrames.length - 1);
                loadAnimFrame(state.animFrames[animIndex]);
            }
            updateAnimUI({ rebuild: true });
        }

        function stopAnimPlayback() {
            const wasPlaying = animPlaying;
            if (animRaf != null) cancelAnimationFrame(animRaf);
            animRaf = null;
            animPlaying = false;
            animLastTime = 0;
            animAccumulator = 0;
            updateAnimUI({ rebuild: false });
            if (wasPlaying && state.mode === 'anim') {
                updateSelectionUI();
                renderLayerList();
            }
        }

        function tickAnimPlayback(timestamp) {
            if (!animPlaying) return;
            if (state.animFrameLoading) {
                animLastTime = timestamp;
                animRaf = requestAnimationFrame(tickAnimPlayback);
                return;
            }
            if (!animLastTime) animLastTime = timestamp;
            animAccumulator += Math.min(timestamp - animLastTime, 250);
            animLastTime = timestamp;
            const fpsInput = document.getElementById('anim-fps');
            const fps = Math.max(1, Math.min(60, Number(fpsInput?.value) || 12));
            const frameDuration = 1000 / fps;
            if (animAccumulator >= frameDuration) {
                const steps = Math.floor(animAccumulator / frameDuration);
                animAccumulator %= frameDuration;
                const next = animIndex + steps;
                if (next >= state.animFrames.length && !document.getElementById('anim-loop')?.checked) {
                    selectAnimFrame(state.animFrames.length - 1, { fromPlayback: true });
                    stopAnimPlayback();
                    return;
                }
                selectAnimFrame(next % state.animFrames.length, { fromPlayback: true });
            }
            animRaf = requestAnimationFrame(tickAnimPlayback);
        }

        function startAnimPlayback() {
            if (state.animFrames.length < 2 || animPlaying) return;
            saveCurrentAnimFrame();
            animPlaying = true;
            animLastTime = 0;
            animAccumulator = 0;
            updateAnimUI({ rebuild: false });
            animRaf = requestAnimationFrame(tickAnimPlayback);
        }

        document.getElementById('anim-add').onclick = () => addAnimFrame();
        document.getElementById('anim-duplicate').onclick = () => addAnimFrame({ duplicate: true });
        document.getElementById('anim-del').onclick = deleteAnimFrame;
        document.getElementById('anim-prev').onclick = () =>
            selectAnimFrame((animIndex - 1 + state.animFrames.length) % state.animFrames.length);
        document.getElementById('anim-next').onclick = () =>
            selectAnimFrame((animIndex + 1) % state.animFrames.length);
        document.getElementById('anim-play').onclick = () => animPlaying ? stopAnimPlayback() : startAnimPlayback();
        document.getElementById('anim-fps').onchange = event => {
            event.target.value = String(Math.max(1, Math.min(60, Number(event.target.value) || 12)));
            state.animFps = Number(event.target.value);
            updateAnimUI({ rebuild: false });
        };
        document.getElementById('anim-loop').onchange = () => updateAnimUI({ rebuild: false });
        document.getElementById('onion-toggle').onchange = event => {
            state.onionSkin = event.target.checked;
            invalidateScene();
            render();
        };
        document.addEventListener('keydown', event => {
            if (state.mode !== 'anim' || event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
            if (event.code === 'Space') {
                event.preventDefault();
                animPlaying ? stopAnimPlayback() : startAnimPlayback();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                selectAnimFrame(Math.max(0, animIndex - 1));
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                selectAnimFrame(Math.min(state.animFrames.length - 1, animIndex + 1));
            } else if (event.key === 'Home') {
                selectAnimFrame(0);
            } else if (event.key === 'End') {
                selectAnimFrame(state.animFrames.length - 1);
            }
        });

        const __setMode = setMode;
        setMode = function(mode) {
            if (mode === 'anim') {
                state.mode = 'anim';
                document.querySelectorAll('.mode-btn').forEach(button => button.classList.remove('active'));
                document.getElementById('mode-anim-btn')?.classList.add('active');
                showAnimBar(true);
                if (!state.layers.some(layer => layer.id === state.animTrackId)) {
                    state.animTrackId = state.layers.find(layer => layer.id === state.activeLayerId)?.id
                        || state.layers[0]?.id
                        || 'raster';
                }
                if (!state.animFrames.length) {
                    const initialFrame = captureAnimFrame();
                    state.animFrames.push(initialFrame);
                    animIndex = 0;
                }
                loadAnimFrame(state.animFrames[animIndex], { updateUI: false });
                updateAnimUI({ rebuild: true });
                return;
            }
            stopAnimPlayback();
            if (state.animFrames.length) saveCurrentAnimFrame();
            showAnimBar(false);
            __setMode(mode);
        };

        // Onion skin in render
        const __render = render;
        render = function() {
            __render();
            // onion overlay on main canvas after
            if (state.mode === 'anim' && state.onionSkin && state.animFrames.length) {
                const prev = state.animFrames[animIndex - 1];
                const next = state.animFrames[animIndex + 1];
                // draw lightly via temporary objects swap is expensive; skip full and draw indicator
            }
            drawMinimap();
        };

        // ========== MINIMAP ==========
        function drawMinimap() {
            const mc = document.getElementById('minimap');
            if (!mc) return;
            const mctx = mc.getContext('2d');
            const mw = mc.width, mh = mc.height;
            mctx.fillStyle = '#111';
            mctx.fillRect(0, 0, mw, mh);
            // world bounds from objects + artboard
            let minx=-500, miny=-500, maxx=500, maxy=500;
            if (!state.infiniteCanvas) {
                minx = 0; miny = 0; maxx = state.canvasWidth; maxy = state.canvasHeight;
            }
            state.objects.forEach(o => {
                const b = getBounds(o);
                if (!b) return;
                minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
                maxx = Math.max(maxx, b.x+b.w); maxy = Math.max(maxy, b.y+b.h);
            });
            const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
            const scale = Math.min(mw / bw, mh / bh) * 0.9;
            const ox = (mw - bw * scale) / 2 - minx * scale;
            const oy = (mh - bh * scale) / 2 - miny * scale;
            mctx.save();
            mctx.translate(ox, oy);
            mctx.scale(scale, scale);
            mctx.fillStyle = '#333';
            if (!state.infiniteCanvas) mctx.fillRect(0,0,state.canvasWidth,state.canvasHeight);
            mctx.fillStyle = '#888';
            state.objects.forEach(o => {
                const b = getBounds(o);
                if (b) mctx.fillRect(b.x, b.y, Math.max(1,b.w), Math.max(1,b.h));
            });
            // viewport
            const tl = screenToWorld(0, 0);
            const br = screenToWorld(window.innerWidth, window.innerHeight);
            mctx.strokeStyle = '#3b82f6';
            mctx.lineWidth = 2 / scale;
            mctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            mctx.restore();
        }
        // ========== PROJECT SAVE with regions ==========
        const _saveProject = typeof saveProject === 'function' ? saveProject : null;
        // find export project button handler and extend

        // Bezier live preview - already draws currentObj
        // Improve pen: show rubber band


        // ========== EFFECT MORE ==========
        state.effectMoreLive = true;
        state.effectTime0 = performance.now();
        let effectRaf = null;

        function openEffectMore() {
            const targets = selectedObjects();
            if (!targets.length) {
                alert('オブジェクトを選択してください');
                return;
            }
            hideCtx();
            const sheet = document.getElementById('effect-more-sheet');
            const ta = document.getElementById('effect-more-code');
            const err = document.getElementById('effect-more-err');
            if (err) { err.classList.add('hidden'); err.textContent = ''; }
            // load existing code from first selected
            const existing = targets.find(t => t.effectMore && t.effectMore.code);
            if (ta) ta.value = existing ? existing.effectMore.code : 'wiggle(3);';
            if (sheet) {
                sheet.classList.remove('hidden');
                sheet.classList.add('flex');
            }
            ta && ta.focus();
        }
        function closeEffectMore() {
            const sheet = document.getElementById('effect-more-sheet');
            if (sheet) {
                sheet.classList.add('hidden');
                sheet.classList.remove('flex');
            }
        }
        function parseEffectMore(code) {
            const effects = [];
            if (!code || !String(code).trim()) return effects;
            const src = String(code);
            // allowed calls only
            const re = /(wiggle|wave|pulse|spin|drift)\s*\(\s*([^)]*)\s*\)\s*;?/gi;
            let m;
            while ((m = re.exec(src))) {
                const name = m[1].toLowerCase();
                const args = m[2].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                effects.push({ name, args });
            }
            // reject unknown tokens roughly
            const cleaned = src.replace(/\/\/.*$/gm, '').replace(re, '').replace(/[\s;]/g, '');
            if (cleaned.length) {
                throw new Error('未対応の記述があります: ' + cleaned.slice(0, 40));
            }
            if (!effects.length) throw new Error('有効なエフェクトがありません（例: wiggle(3);）');
            return effects;
        }
        function applyEffectMoreToSelection(code, previewOnly) {
            const err = document.getElementById('effect-more-err');
            try {
                const effects = parseEffectMore(code);
                if (err) { err.classList.add('hidden'); err.textContent = ''; }
                const targets = selectedObjects();
                if (!targets.length) throw new Error('選択がありません');
                if (!previewOnly) pushHistory();
                targets.forEach(o => {
                    // snapshot base geometry once
                    if (!o._effectBase) o._effectBase = snapshotEffectBase(o);
                    o.effectMore = {
                        code: String(code).trim(),
                        effects,
                        enabled: true
                    };
                });
                ensureEffectLoop();
                render();
                if (!previewOnly) closeEffectMore();
            } catch (e) {
                if (err) {
                    err.textContent = e.message || String(e);
                    err.classList.remove('hidden');
                }
            }
        }
        function snapshotEffectBase(o) {
            return JSON.parse(JSON.stringify({
                x: o.x, y: o.y, w: o.w, h: o.h,
                x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
                rotation: o.rotation || 0,
                opacity: o.opacity != null ? o.opacity : 1,
                points: o.points, anchors: o.anchors,
                children: o.children
            }));
        }
        function restoreEffectBase(o) {
            if (!o._effectBase) return;
            const b = o._effectBase;
            if (b.x != null) o.x = b.x;
            if (b.y != null) o.y = b.y;
            if (b.w != null) o.w = b.w;
            if (b.h != null) o.h = b.h;
            if (b.x1 != null) { o.x1 = b.x1; o.y1 = b.y1; o.x2 = b.x2; o.y2 = b.y2; }
            o.rotation = b.rotation || 0;
            o.opacity = b.opacity;
            if (b.points) o.points = JSON.parse(JSON.stringify(b.points));
            if (b.anchors) o.anchors = JSON.parse(JSON.stringify(b.anchors));
            if (b.children) o.children = JSON.parse(JSON.stringify(b.children));
        }
        function applyEffectsAtTime(o, t) {
            if (!o.effectMore || !o.effectMore.enabled || !o.effectMore.effects) return;
            if (!o._effectBase) o._effectBase = snapshotEffectBase(o);
            restoreEffectBase(o);
            const effects = o.effectMore.effects;
            effects.forEach(ef => {
                const a = ef.args || [];
                if (ef.name === 'wiggle') {
                    const amp = a[0] != null ? a[0] : 3;
                    const freq = a[1] != null ? a[1] : 1.5;
                    wiggleObject(o, t, amp, freq);
                } else if (ef.name === 'wave') {
                    const amp = a[0] != null ? a[0] : 8;
                    const freq = a[1] != null ? a[1] : 1.2;
                    waveObject(o, t, amp, freq);
                } else if (ef.name === 'pulse') {
                    const amount = a[0] != null ? a[0] : 0.3;
                    const freq = a[1] != null ? a[1] : 1.5;
                    const s = 1 + Math.sin(t * freq * Math.PI * 2) * amount;
                    scaleObjectAboutCenter(o, s);
                } else if (ef.name === 'spin') {
                    const degPerSec = a[0] != null ? a[0] : 45;
                    o.rotation = (o._effectBase.rotation || 0) + degPerSec * t;
                } else if (ef.name === 'drift') {
                    const amp = a[0] != null ? a[0] : 10;
                    const freq = a[1] != null ? a[1] : 0.4;
                    const dx = Math.sin(t * freq * Math.PI * 2) * amp;
                    const dy = Math.cos(t * freq * Math.PI * 2 * 0.7) * amp * 0.6;
                    translateObject(o, dx, dy);
                }
            });
        }
        function translateObject(o, dx, dy) {
            if (o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
            if (o.anchors) o.anchors.forEach(a => { a.x += dx; a.y += dy; });
            if (o.x != null) { o.x += dx; o.y += dy; }
            if (o.x1 != null) { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
            if (o.children) o.children.forEach(ch => translateObject(ch, dx, dy));
        }
        function scaleObjectAboutCenter(o, s) {
            const b = getBounds(o);
            if (!b) return;
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            const sc = (px, py) => ({ x: cx + (px - cx) * s, y: cy + (py - cy) * s });
            if (o.points) o.points = o.points.map(p => sc(p.x, p.y));
            if (o.anchors) o.anchors.forEach(a => {
                const p = sc(a.x, a.y);
                a.x = p.x; a.y = p.y;
                a.inX = (a.inX || 0) * s; a.inY = (a.inY || 0) * s;
                a.outX = (a.outX || 0) * s; a.outY = (a.outY || 0) * s;
            });
            if (['rect','roundrect','circle','triangle','star','hexagon','image','group'].includes(o.type)) {
                o.w = (o._effectBase.w || o.w) * s;
                o.h = (o._effectBase.h || o.h) * s;
                o.x = cx - o.w / 2;
                o.y = cy - o.h / 2;
            }
        }
        function wiggleObject(o, t, amp, freq) {
            const phase = t * freq * Math.PI * 2;
            if (o.points && o.points.length) {
                o.points.forEach((p, i) => {
                    const base = o._effectBase.points[i];
                    if (!base) return;
                    p.x = base.x + Math.sin(phase + i * 0.7) * amp;
                    p.y = base.y + Math.cos(phase * 1.1 + i * 0.5) * amp;
                });
                return;
            }
            if (o.anchors && o.anchors.length) {
                o.anchors.forEach((a, i) => {
                    const base = o._effectBase.anchors[i];
                    if (!base) return;
                    a.x = base.x + Math.sin(phase + i * 0.6) * amp;
                    a.y = base.y + Math.cos(phase * 1.05 + i * 0.45) * amp;
                });
                return;
            }
            // whole-object nudge
            const dx = Math.sin(phase) * amp;
            const dy = Math.cos(phase * 1.13) * amp;
            translateObject(o, dx, dy);
        }
        function waveObject(o, t, amp, freq) {
            const phase = t * freq * Math.PI * 2;
            if (o.points && o.points.length) {
                o.points.forEach((p, i) => {
                    const base = o._effectBase.points[i];
                    if (!base) return;
                    p.x = base.x;
                    p.y = base.y + Math.sin(phase + i * 0.35) * amp;
                });
                return;
            }
            if (o.anchors && o.anchors.length) {
                o.anchors.forEach((a, i) => {
                    const base = o._effectBase.anchors[i];
                    if (!base) return;
                    a.x = base.x;
                    a.y = base.y + Math.sin(phase + i * 0.35) * amp;
                });
                return;
            }
            translateObject(o, 0, Math.sin(phase) * amp);
        }
        function tickEffects() {
            if (!state.effectMoreLive) {
                effectRaf = null;
                return;
            }
            const t = (performance.now() - state.effectTime0) / 1000;
            let any = false;
            state.objects.forEach(o => {
                if (o.effectMore && o.effectMore.enabled) {
                    applyEffectsAtTime(o, t);
                    any = true;
                }
            });
            if (any) render();
            effectRaf = requestAnimationFrame(tickEffects);
        }
        function ensureEffectLoop() {
            state.effectMoreLive = document.getElementById('effect-more-live')
                ? document.getElementById('effect-more-live').checked
                : true;
            if (!effectRaf) {
                state.effectTime0 = performance.now();
                effectRaf = requestAnimationFrame(tickEffects);
            }
        }

        document.getElementById('effect-more-close') && (document.getElementById('effect-more-close').onclick = closeEffectMore);
        document.getElementById('effect-more-apply') && (document.getElementById('effect-more-apply').onclick = () => {
            applyEffectMoreToSelection(document.getElementById('effect-more-code').value, false);
        });
        document.getElementById('effect-more-preview') && (document.getElementById('effect-more-preview').onclick = () => {
            applyEffectMoreToSelection(document.getElementById('effect-more-code').value, true);
        });
        document.getElementById('effect-more-live') && (document.getElementById('effect-more-live').onchange = (e) => {
            state.effectMoreLive = e.target.checked;
            if (state.effectMoreLive) ensureEffectLoop();
        });
        document.querySelectorAll('.em-snippet').forEach(b => {
            b.onclick = () => {
                const ta = document.getElementById('effect-more-code');
                if (ta) ta.value = b.dataset.code || '';
            };
        });

        // context menu action
        document.querySelectorAll('#app-ctx-menu [data-ctx="effect-more"]').forEach(btn => {
            btn.onclick = () => openEffectMore();
        });

        // also when data-ctx handler runs - extend existing generic handler
        // patch into existing ctx clicks if they use switch on data-ctx


        // ========== MENUBAR ACTIONS ==========
        window.VersePaintMenuBar.initialize(act => {
                if (act === 'new') { if (confirm('新規キャンバス？未保存は消えます')) location.reload(); }
                else if (act === 'open') document.getElementById('file-input')?.click();
                else if (act === 'save') saveProject();
                else if (act === 'export-region') openExportRegion();
                else if (act === 'export-png') typeof exportRaster === 'function' && exportRaster('png');
                else if (act === 'undo') document.getElementById('btn-undo')?.click();
                else if (act === 'redo') document.getElementById('btn-redo')?.click();
                else if (act === 'copy') copySelection();
                else if (act === 'paste') pasteClipboard();
                else if (act === 'duplicate') { copySelection(); pasteClipboard(); }
                else if (act === 'select-all') {
                    state.selectedIds = new Set(state.objects.filter(o => !isLayerLocked(o.layerId)).map(o => o.id));
                    updateSelectionUI(); render();
                }
                else if (act === 'deselect') { state.selectedIds.clear(); updateSelectionUI(); render(); }
                else if (act === 'invert-sel') {
                    const next = new Set();
                    state.objects.forEach(o => {
                        if (isLayerLocked(o.layerId)) return;
                        if (!state.selectedIds.has(o.id)) next.add(o.id);
                    });
                    state.selectedIds = next;
                    updateSelectionUI(); render();
                }
                else if (act === 'group') groupSelection();
                else if (act === 'ungroup') ungroupSelection();
                else if (act === 'bring-front') selectedObjects().forEach(o => reorderObject(o.id, 'front'));
                else if (act === 'send-back') selectedObjects().forEach(o => reorderObject(o.id, 'back'));
                else if (act === 'to-raster') { try { selectionToRasterFixed(); } catch(err){ alert(err.message);} }
                else if (act === 'effect-more') openEffectMore();
                else if (act === 'clear-effects') {
                    pushHistory();
                    selectedObjects().forEach(o => {
                        if (o._effectBase) restoreEffectBase(o);
                        delete o.effectMore; delete o._effectBase;
                    });
                    render();
                }
                else if (act === 'zoom-in') document.getElementById('zoom-in')?.click();
                else if (act === 'zoom-out') document.getElementById('zoom-out')?.click();
                else if (act === 'zoom-fit') fitViewAll();
                else if (act === 'toggle-minimap') toggleMinimap();
                else if (act === 'toggle-grid') {
                    state.gridMode = state.gridMode === 'none' ? 'grid' : 'none';
                    render();
                }
                else if (act === 'panel-props') togglePanel('props-panel');
                else if (act === 'panel-layers') { switchSideTab('layers'); togglePanel('props-panel', true); }
                else if (act === 'panel-regions') { switchSideTab('regions'); togglePanel('props-panel', true); }
                else if (act === 'panel-brush') togglePanel('left-paint-panel');
                else if (act === 'anim') setMode('anim');
                else if (act === 'help') document.getElementById('help-modal')?.classList.remove('hidden');
        });
        document.getElementById('btn-help-top')?.addEventListener('click', () => {
            document.getElementById('help-modal')?.classList.remove('hidden');
        });
        function togglePanel(id, forceShow) {
            if (id === 'left-paint-panel') {
                if (forceShow) window.VersePaintBrushPanel?.setOpen(true);
                else window.VersePaintBrushPanel?.setOpen(
                    document.getElementById(id)?.classList.contains('hidden')
                );
                return;
            }
            if (id === 'props-panel') {
                if (forceShow) openProps();
                else if (propsPanel.classList.contains('hidden')) openProps();
                else closeProps();
                return;
            }
            const el = document.getElementById(id);
            if (!el) return;
            if (forceShow) { el.classList.remove('hidden'); el.classList.add('flex'); return; }
            el.classList.toggle('hidden');
            el.classList.toggle('flex');
        }
        function fitViewAll() {
            let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
            if (!state.infiniteCanvas) {
                minx=0;miny=0;maxx=state.canvasWidth;maxy=state.canvasHeight;
            }
            state.objects.forEach(o => {
                const b = getBounds(o);
                if (!b) return;
                minx=Math.min(minx,b.x); miny=Math.min(miny,b.y);
                maxx=Math.max(maxx,b.x+b.w); maxy=Math.max(maxy,b.y+b.h);
            });
            if (!isFinite(minx)) { minx=-200;miny=-200;maxx=200;maxy=200; }
            const pad=48, bw=Math.max(1,maxx-minx), bh=Math.max(1,maxy-miny);
            const z = Math.min((window.innerWidth-pad*2)/bw, (window.innerHeight-80-pad*2)/bh, 8);
            state.zoom = Math.max(0.05, z);
            state.panX = (window.innerWidth - bw*state.zoom)/2 - minx*state.zoom;
            state.panY = (window.innerHeight - bh*state.zoom)/2 - miny*state.zoom + 20;
            render();
        }
        state.showMinimap = true;
        function toggleMinimap() {
            state.showMinimap = !state.showMinimap;
            const w = document.getElementById('minimap-wrap');
            if (w) w.style.display = state.showMinimap ? '' : 'none';
            scheduleSaveSettings && scheduleSaveSettings();
        }
        document.getElementById('mm-close')?.addEventListener('click', () => {
            state.showMinimap = false;
            const w = document.getElementById('minimap-wrap');
            if (w) w.style.display = 'none';
        });
        // Minimap drag
        (function() {
            const wrap = document.getElementById('minimap-wrap');
            if (!wrap) return;
            let dragging = false, ox=0, oy=0;
            const title = wrap.querySelector('.mm-title');
            title?.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button')) return;
                dragging = true;
                ox = e.clientX - wrap.offsetLeft;
                oy = e.clientY - wrap.offsetTop;
                title.setPointerCapture(e.pointerId);
            });
            title?.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                wrap.style.left = (e.clientX - ox) + 'px';
                wrap.style.top = (e.clientY - oy) + 'px';
                wrap.style.right = 'auto';
                wrap.style.bottom = 'auto';
            });
            title?.addEventListener('pointerup', () => { dragging = false; });
        })();

        // Settings: minimap toggle checkbox if settings modal
        (function() {
            const box = document.querySelector('#settings-modal .flex.flex-col.gap-1');
            // append to settings modal body
            const modal = document.getElementById('settings-modal');
            if (!modal) return;
            const host = modal.querySelector('.geist-surface') || modal;
            if (host.querySelector('#setting-minimap')) return;
            const row = document.createElement('div');
            row.className = 'flex justify-between items-center';
            row.innerHTML = '<label class="text-[11px] text-geist-400">ミニマップ</label><input type="checkbox" id="setting-minimap" checked class="accent-white">';
            host.appendChild(row);
            document.getElementById('setting-minimap').onchange = (e) => {
                state.showMinimap = e.target.checked;
                const w = document.getElementById('minimap-wrap');
                if (w) w.style.display = state.showMinimap ? '' : 'none';
            };
        })();

        // ========== RASTER PERF: throttle render during paint ==========
        state._paintDirty = false;
        const _stampPaintBrush = stampPaintBrush;
        stampPaintBrush = function(wx, wy, last) {
            _stampPaintBrush(wx, wy, last);
            state._paintDirty = true;
            if (!state._paintRaf) {
                state._paintRaf = requestAnimationFrame(() => {
                    state._paintRaf = null;
                    if (state._paintDirty) {
                        state._paintDirty = false;
                        // fast path: skip minimap during stroke
                        const sm = state.showMinimap;
                        state.showMinimap = false;
                        render();
                        state.showMinimap = sm;
                    }
                });
            }
        };
        // Don't call render() immediately in paint move — stamp already schedules
        // Patch: paint move still calls render — replace heavy path by searching later

        // ========== FIX GROUP ==========
        groupSelection = function() {
            let targets = state.objects.filter(o => state.selectedIds.has(o.id));
            if (targets.length < 2) {
                alert('グループ化には2つ以上の選択が必要です。\nShift+クリックで追加選択してください。');
                return;
            }
            // flatten existing groups into children list optionally keep nested
            pushHistory();
            const ids = new Set(targets.map(t => t.id));
            const children = targets.map(t => {
                const c = JSON.parse(JSON.stringify(t));
                return c;
            });
            let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
            targets.forEach(o => {
                const b = getBounds(o);
                if (!b) return;
                minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
                maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h);
            });
            if (!isFinite(minx)) { minx=0;miny=0;maxx=100;maxy=100; }
            // remove originals
            state.objects = state.objects.filter(o => !ids.has(o.id));
            const g = {
                id: uid(),
                type: 'group',
                name: 'Group ' + (state.groupCounter = (state.groupCounter||1) + 1),
                children,
                x: minx, y: miny,
                w: Math.max(1, maxx - minx),
                h: Math.max(1, maxy - miny),
                opacity: 1,
                layerId: targets[0].layerId || state.activeLayerId,
                rotation: 0
            };
            state.objects.push(g);
            state.selectedIds = new Set([g.id]);
            invalidateScene();
            invalidateObjectIndex();
            render();
            if (typeof updateSelectionUI === 'function') updateSelectionUI();
            if (typeof renderLayerList === 'function') renderLayerList();
        };
        ungroupSelection = function() {
            const groups = state.objects.filter(o => state.selectedIds.has(o.id) && o.type === 'group');
            if (!groups.length) { alert('グループを選択してください'); return; }
            pushHistory();
            groups.forEach(g => {
                const i = state.objects.findIndex(o => o.id === g.id);
                if (i < 0) return;
                state.objects.splice(i, 1);
                const kids = (g.children || []).map(ch => {
                    const c = JSON.parse(JSON.stringify(ch));
                    c.id = uid();
                    c.layerId = g.layerId || c.layerId;
                    return c;
                });
                state.objects.splice(i, 0, ...kids);
            });
            state.selectedIds.clear();
            invalidateScene();
            invalidateObjectIndex();
            render();
            if (typeof updateSelectionUI === 'function') updateSelectionUI();
            if (typeof renderLayerList === 'function') renderLayerList();
        };

        // ========== MORE EFFECT MORE ==========
        // extend parseEffectMore allowed names by patching applyEffectsAtTime
        const _applyEffectsAtTime = applyEffectsAtTime;
        applyEffectsAtTime = function(o, t) {
            if (!o.effectMore || !o.effectMore.enabled || !o.effectMore.effects) return;
            if (!o._effectBase) o._effectBase = snapshotEffectBase(o);
            restoreEffectBase(o);
            o.effectMore.effects.forEach(ef => {
                const a = ef.args || [];
                const name = ef.name;
                if (name === 'wiggle' || name === 'wave' || name === 'pulse' || name === 'spin' || name === 'drift') {
                    // use original single-effect path via temporary
                    const tmp = { effectMore: { enabled: true, effects: [ef] }, _effectBase: o._effectBase };
                    Object.assign(tmp, JSON.parse(JSON.stringify(o._effectBase)));
                    tmp.type = o.type; tmp.points = o.points; tmp.anchors = o.anchors;
                    // call original helpers
                }
            });
            // Full rewrite of effect application
            o.effectMore.effects.forEach(ef => {
                const a = ef.args || [];
                if (ef.name === 'wiggle') wiggleObject(o, t, a[0]??3, a[1]??1.5);
                else if (ef.name === 'wave') waveObject(o, t, a[0]??8, a[1]??1.2);
                else if (ef.name === 'pulse') scaleObjectAboutCenter(o, 1 + Math.sin(t * (a[1]??1.5) * Math.PI * 2) * (a[0]??0.3));
                else if (ef.name === 'spin') o.rotation = (o._effectBase.rotation||0) + (a[0]??45) * t;
                else if (ef.name === 'drift') translateObject(o, Math.sin(t*(a[1]??0.4)*Math.PI*2)*(a[0]??10), Math.cos(t*(a[1]??0.4)*Math.PI*2*0.7)*(a[0]??10)*0.6);
                else if (ef.name === 'bounce') {
                    const amp = a[0]??20, freq = a[1]??1.2;
                    const y = Math.abs(Math.sin(t * freq * Math.PI)) * amp;
                    translateObject(o, 0, -y);
                }
                else if (ef.name === 'shake') {
                    const amp = a[0]??4;
                    translateObject(o, (Math.random()-0.5)*2*amp, (Math.random()-0.5)*2*amp);
                }
                else if (ef.name === 'orbit') {
                    const rad = a[0]??30, freq = a[1]??0.5;
                    const ang = t * freq * Math.PI * 2;
                    translateObject(o, Math.cos(ang)*rad, Math.sin(ang)*rad);
                }
                else if (ef.name === 'gravity') {
                    // visual only: fall and wrap
                    const g = a[0]??40;
                    const y = ((t * t * g * 0.5) % 200);
                    translateObject(o, 0, y);
                }
                else if (ef.name === 'float') {
                    const amp = a[0]??12, freq = a[1]??0.6;
                    translateObject(o, Math.sin(t*freq)*amp*0.3, Math.sin(t*freq*Math.PI*2)*amp);
                }
                else if (ef.name === 'glitch') {
                    const amp = a[0]??8;
                    if (Math.sin(t*20) > 0.7) translateObject(o, (Math.random()-0.5)*amp*2, 0);
                }
                else if (ef.name === 'breathe') {
                    const amount = a[0]??0.12, freq = a[1]??0.8;
                    scaleObjectAboutCenter(o, 1 + Math.sin(t*freq*Math.PI*2)*amount);
                }
                else if (ef.name === 'swing') {
                    const deg = a[0]??15, freq = a[1]??0.7;
                    o.rotation = (o._effectBase.rotation||0) + Math.sin(t*freq*Math.PI*2)*deg;
                }
            });
        };
        // Expand parser regex
        const _parseEffectMore = parseEffectMore;
        parseEffectMore = function(code) {
            const effects = [];
            if (!code || !String(code).trim()) return effects;
            const src = String(code);
            const re = /(wiggle|wave|pulse|spin|drift|bounce|shake|orbit|gravity|float|glitch|breathe|swing)\s*\(\s*([^)]*)\s*\)\s*;?/gi;
            let m;
            while ((m = re.exec(src))) {
                const name = m[1].toLowerCase();
                const args = m[2].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                effects.push({ name, args });
            }
            const cleaned = src.replace(/\/\/.*$/gm,'').replace(re,'').replace(/[\s;]/g,'');
            if (cleaned.length) throw new Error('未対応: ' + cleaned.slice(0,40));
            if (!effects.length) throw new Error('有効なエフェクトがありません');
            return effects;
        };
        // Snippet buttons update
        (function() {
            const host = document.querySelector('#effect-more-sheet .flex.flex-wrap');
            if (!host) return;
            const extra = ['bounce(20)','shake(5)','orbit(30)','gravity(40)','float(12)','glitch(8)','breathe(0.12)','swing(15)'];
            extra.forEach(code => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'em-snippet geist-btn px-2 py-1 rounded-md';
                b.dataset.code = code.replace(/\)/, ');').replace('(', '(');
                if (!b.dataset.code.endsWith(';')) b.dataset.code += ';';
                // fix
                const name = code.replace(/\(.*/,'');
                const args = code.match(/\((.*)\)/)[1];
                b.dataset.code = name + '(' + args + ');';
                b.textContent = name;
                b.onclick = () => {
                    const ta = document.getElementById('effect-more-code');
                    if (ta) ta.value = (ta.value ? ta.value.trim() + '\n' : '') + b.dataset.code;
                };
                host.appendChild(b);
            });
        })();

        // ========== ANIMATION: always show usable bar ==========
        function ensureAnimSeed() {
            if (!state.animFrames) state.animFrames = [];
            if (!state.animFrames.length) {
                state.animFrames.push(captureAnimFrame());
            }
        }

        const minimapUI = window.VersePaintMinimap.initialize({
            state, getBounds, paintLayerBounds, ensurePaintLayer, drawPaintLayer,
            drawObjectTo: __drawObjectTo, screenToWorld
        });
        drawMinimap = minimapUI.draw;
        document.querySelectorAll('.fly-size').forEach(el => {
            el.addEventListener('input', () => {
                state.strokeWidth = +el.value;
                const sv = document.getElementById('size-val');
                if (sv) sv.textContent = state.strokeWidth;
                const sl = document.getElementById('size-slider');
                if (sl) sl.value = state.strokeWidth;
                updateCursor();
            });
        });
        document.querySelectorAll('.fly-stab').forEach(el => {
            el.addEventListener('input', () => {
                state.stabilize = +el.value;
            });
        });


        // ========== SCENE CACHE (raster paint performance) ==========
        state.sceneCache = null;
        state.sceneCacheDirty = true;
        state.gridCache = null;
        state.gridCacheKey = '';
        state.sceneViewKey = '';
        state._paintOnlyFrames = 0;

        function invalidateScene() {
            state.sceneCacheDirty = true;
        }
        function ensureSceneCache() {
            const w = canvas.width, h = canvas.height;
            if (!state.sceneCache || state.sceneCache.width !== w || state.sceneCache.height !== h) {
                state.sceneCache = document.createElement('canvas');
                state.sceneCache.width = w;
                state.sceneCache.height = h;
                state.sceneCacheDirty = true;
            }
            return state.sceneCache;
        }
        function rebuildSceneCache() {
            const sc = ensureSceneCache();
            const sctx = sc.getContext('2d');
            sctx.setTransform(1,0,0,1,0,0);
            sctx.clearRect(0,0,sc.width,sc.height);
            sctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            sctx.translate(state.panX, state.panY);
            sctx.scale(state.zoom, state.zoom);
            state._vp = worldViewport();
            // onion under objects in 映像 mode
            if (state.mode === 'anim' && state.onionSkin && state.animFrames && state.animFrames.length) {
                drawOnionFrames(sctx);
            }
            queryObjectsInBounds(state._vp).forEach(({ obj }) => {
                if (obj === state.currentObj || obj === state._penObj) return;
                try { __drawObjectTo(sctx, obj); } catch (e) {
                    console.error('Object render failed', e);
                }
            });
            state.sceneCacheDirty = false;
        }
        function drawOnionFrames(targetCtx) {
            const idx = typeof animIndex === 'number' ? animIndex : 0;
            const frames = state.animFrames || [];
            const prev = frames[idx - 1];
            const prev2 = frames[idx - 2];
            const next = frames[idx + 1];
            const drawFrame = (fr, alpha) => {
                if (!fr) return;
                targetCtx.save();
                targetCtx.globalAlpha = alpha;
                if (state.animTrackId === 'raster') {
                    if (fr.paintChunks instanceof Map) {
                        fr.paintChunks.forEach((tile, key) => {
                            const [cx, cy] = key.split(',').map(Number);
                            targetCtx.drawImage(tile.canvas, cx * PAINT_CHUNK_SIZE, cy * PAINT_CHUNK_SIZE);
                        });
                    }
                } else {
                    const activeObjects = state.objects;
                    const activeLayers = state.layers;
                    state.objects = fr.objects || [];
                    state.layers = fr.layers || activeLayers;
                    try {
                        queryFrameObjectsInBounds(fr, state._vp || worldViewport())
                            .filter(({ obj }) => obj.layerId === (state.animTrackId || state.activeLayerId))
                            .forEach(({ obj }) => {
                                try {
                                    __drawObjectTo(targetCtx, obj);
                                } catch (error) {
                                    console.error('Onion-skin render failed', error);
                                }
                            });
                    } finally {
                        state.objects = activeObjects;
                        state.layers = activeLayers;
                    }
                }
                targetCtx.restore();
            };
            if (prev2) drawFrame(prev2, 0.12);
            if (prev) drawFrame(prev, 0.28);
            if (next) drawFrame(next, 0.15);
        }

        // Wrap pushHistory / object mutations to dirty cache
        const _pushHistory = pushHistory;
        pushHistory = function() {
            if (!state._rasterHistoryOnly) {
                invalidateScene();
                invalidateObjectIndex();
            }
            return _pushHistory.apply(this, arguments);
        };

        // Fast render path
        const __renderCore = typeof render === 'function' ? render : null;
        function renderFast(opts) {
            const viewKey = `${canvas.width}:${canvas.height}:${state.dpr}:${state.zoom}:${state.panX}:${state.panY}`;
            if (state.sceneViewKey !== viewKey) {
                state.sceneViewKey = viewKey;
                state.sceneCacheDirty = true;
            }
            const nextGridKey = `${viewKey}:${state.canvasBg}:${state.gridMode}`;
            if (state.gridCacheKey !== nextGridKey || !state.gridCache) {
                drawGrid();
                if (!state.gridCache || state.gridCache.width !== canvas.width || state.gridCache.height !== canvas.height) {
                    state.gridCache = document.createElement('canvas');
                    state.gridCache.width = canvas.width;
                    state.gridCache.height = canvas.height;
                }
                state.gridCache.getContext('2d').drawImage(canvas, 0, 0);
                state.gridCacheKey = nextGridKey;
            } else {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(state.gridCache, 0, 0);
            }
            ctx.save();
            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            if (state.sceneCacheDirty || !state.sceneCache) {
                rebuildSceneCache();
            }
            // blit scene
            if (state.sceneCache) {
                ctx.setTransform(1,0,0,1,0,0);
                ctx.drawImage(state.sceneCache, 0, 0);
            }
            // paint layer in world space
            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
            ctx.translate(state.panX, state.panY);
            ctx.scale(state.zoom, state.zoom);
            drawPaintLayer(ctx, worldViewport());
            if (state.activeStrokeCanvas) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(state.activeStrokeCanvas, 0, 0);
                ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
                ctx.translate(state.panX, state.panY);
                ctx.scale(state.zoom, state.zoom);
            } else if (state.currentObj) {
                __drawObjectTo(ctx, state.currentObj);
            }
            if (state._penObj) __drawObjectTo(ctx, state._penObj);
            // selection handles only (on top)
            state._vp = worldViewport();
            queryObjectsInBounds(state._vp).forEach(({ obj }) => {
                if (state.selectedIds.has(obj.id)) {
                    ctx.save();
                    applyObjectRotation(ctx, obj);
                    ctx.filter = 'none';
                    drawEditHandles(ctx, obj);
                    ctx.restore();
                }
            });
            // pen rubber band
            if (state._penObj && state._penObj.anchors && state.lastWorld) {
                const a = state._penObj.anchors[state._penObj.anchors.length - 1];
                const p = state.lastWorld;
                ctx.save();
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1 / state.zoom;
                ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
                ctx.restore();
            }
            if (state.exportRegion) {
                const r = state.exportRegion;
                ctx.save();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2 / state.zoom;
                ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
                ctx.strokeRect(r.x, r.y, r.w, r.h);
                ctx.fillStyle = 'rgba(239,68,68,0.12)';
                ctx.fillRect(r.x, r.y, r.w, r.h);
                ctx.restore();
            }
            ctx.restore();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const hz = document.getElementById('zoom-reset');
            if (hz) hz.textContent = Math.round(state.zoom * 100) + '%';
            if (!animPlaying && !state.isDrawing && !state.isPanning && state.showMinimap) {
                if (!state._mmRaf) {
                    state._mmRaf = requestAnimationFrame(() => {
                        state._mmRaf = null;
                        try { drawMinimap(); } catch(_) {}
                    });
                }
            }
        }
        // Replace render
        function renderNow() {
            try {
                if (typeof effectRaf !== 'undefined' && effectRaf) {
                    invalidateScene();
                    invalidateObjectIndex();
                }
                if (state.isDrawing && !state.currentObj && !state._paintStroke) {
                    invalidateScene();
                    invalidateObjectIndex();
                }
                renderFast();
            } catch (e) {
                console.error('render', e);
                if (__renderCore) try { __renderCore(); } catch(_) {}
            }
        }
        render = function() {
            if (state.isDrawing || state.isPanning) {
                if (!state._renderRaf) {
                    state._renderRaf = requestAnimationFrame(() => {
                        state._renderRaf = null;
                        renderNow();
                    });
                }
                return;
            }
            if (state._renderRaf) {
                cancelAnimationFrame(state._renderRaf);
                state._renderRaf = null;
            }
            renderNow();
        };

        // After paint stroke ends, full rebuild
        const _endPaintFlag = true;



        // Capture-phase undo/redo (確実に動かす)
        window.addEventListener('keydown', (e) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const t = e.target;
            const tag = t && t.tagName;
            if (tag === 'TEXTAREA' || (tag === 'INPUT' && t.type === 'text')) return;
            if (e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                undo();
            } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
                redo();
            }
        }, true);

        // Init
        try {
            renderPalette('mono');
            setColor('#171717');
            if (typeof loadSettings === 'function') loadSettings();
            else if (typeof applyToolbarDock === 'function') applyToolbarDock('left');
            renderLayerList();
            resize();
            pushHistory();
            updateHistoryButtons();
            if (typeof syncLeftPanel === 'function') syncLeftPanel();
            const mm = document.getElementById('minimap-wrap');
            if (mm && window.innerWidth > 768) mm.classList.remove('hidden');
            if (typeof renderRegionList === 'function') renderRegionList();
            // populate left palette
            const leftPal = document.getElementById('palette-swatches-left');
            if (leftPal && typeof palettes !== 'undefined') {
                leftPal.innerHTML = '';
                (palettes.mono || []).forEach(hex => {
                    const b = document.createElement('button');
                    b.className = 'swatch';
                    b.style.background = hex;
                    b.onclick = () => setColor(hex);
                    leftPal.appendChild(b);
                });
            }
            ['size-slider','opacity-slider','stabilize-slider','hardness-slider'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', scheduleSaveSettings);
            });
        } catch (err) {
            console.error('Init error', err);
            try { resize(); render(); } catch (_) {}
        }
    });
