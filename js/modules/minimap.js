(function (global) {
    'use strict';

    function initialize({ state, getBounds, paintLayerBounds, ensurePaintLayer, drawPaintLayer, drawObjectTo, screenToWorld }) {
        let drawMinimap;
        // ========== MINIMAP DRAW FIX ==========
        let minimapCamera = null;
        function minimapWorldBounds() {
            let minX = state.infiniteCanvas ? Infinity : 0;
            let minY = state.infiniteCanvas ? Infinity : 0;
            let maxX = state.infiniteCanvas ? -Infinity : state.canvasWidth || 1920;
            let maxY = state.infiniteCanvas ? -Infinity : state.canvasHeight || 1080;
            state.objects.forEach(object => {
                const bounds = getBounds(object);
                if (!bounds) return;
                minX = Math.min(minX, bounds.x);
                minY = Math.min(minY, bounds.y);
                maxX = Math.max(maxX, bounds.x + bounds.w);
                maxY = Math.max(maxY, bounds.y + bounds.h);
            });
            const paintBounds = paintLayerBounds();
            if (paintBounds) {
                minX = Math.min(minX, paintBounds.x);
                minY = Math.min(minY, paintBounds.y);
                maxX = Math.max(maxX, paintBounds.x + paintBounds.w);
                maxY = Math.max(maxY, paintBounds.y + paintBounds.h);
            }
            if (!Number.isFinite(minX)) {
                minX = -600; minY = -400; maxX = 600; maxY = 400;
            }
            const padding = Math.max(40, Math.max(maxX - minX, maxY - minY) * 0.08);
            return {
                minX: minX - padding,
                minY: minY - padding,
                maxX: maxX + padding,
                maxY: maxY + padding
            };
        }

        function fitMinimapToContent() {
            const wrap = document.getElementById('minimap-wrap');
            if (!wrap) return;
            const bounds = minimapWorldBounds();
            const width = Math.max(1, wrap.clientWidth);
            const height = Math.max(1, wrap.clientHeight - 22);
            minimapCamera = {
                centerX: (bounds.minX + bounds.maxX) / 2,
                centerY: (bounds.minY + bounds.maxY) / 2,
                scale: Math.max(Number.MIN_VALUE, Math.min(
                    width / (bounds.maxX - bounds.minX),
                    height / (bounds.maxY - bounds.minY)
                ) * 0.9)
            };
            drawMinimap();
        }

        drawMinimap = function() {
            if (state.showMinimap === false) return;
            const mc = document.getElementById('minimap');
            const wrap = document.getElementById('minimap-wrap');
            if (!mc || !wrap || wrap.style.display === 'none') return;
            const cssW = Math.max(80, wrap.clientWidth || 180);
            const cssH = Math.max(60, (wrap.clientHeight || 130) - 22);
            const scaleRes = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
            const mw = Math.max(1, Math.round(cssW * scaleRes));
            const mh = Math.max(1, Math.round(cssH * scaleRes));
            if (mc.width !== mw || mc.height !== mh) {
                mc.width = mw;
                mc.height = mh;
            }
            mc.style.width = '100%';
            mc.style.height = 'calc(100% - 22px)';
            const mctx = mc.getContext('2d');
            mctx.setTransform(1, 0, 0, 1, 0, 0);
            mctx.imageSmoothingEnabled = true;
            mctx.imageSmoothingQuality = 'high';
            mctx.fillStyle = '#111';
            mctx.fillRect(0, 0, mw, mh);

            if (!minimapCamera) {
                const bounds = minimapWorldBounds();
                minimapCamera = {
                    centerX: (bounds.minX + bounds.maxX) / 2,
                    centerY: (bounds.minY + bounds.maxY) / 2,
                    scale: Math.max(Number.MIN_VALUE, Math.min(
                        cssW / (bounds.maxX - bounds.minX),
                        cssH / (bounds.maxY - bounds.minY)
                    ) * 0.9)
                };
            }
            const scale = minimapCamera.scale * scaleRes;
            mctx.save();
            mctx.translate(mw / 2, mh / 2);
            mctx.scale(scale, scale);
            mctx.translate(-minimapCamera.centerX, -minimapCamera.centerY);
            if (!state.infiniteCanvas) {
                mctx.fillStyle = '#1c1c1c';
                mctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
            }
            if (ensurePaintLayer().size) {
                mctx.globalAlpha = 0.9;
                drawPaintLayer(mctx);
                mctx.globalAlpha = 1;
            }
            state.objects.forEach(object => {
                try {
                    __drawObjectTo(mctx, object);
                } catch (error) {
                    console.error('Minimap object render failed', error);
                    const bounds = getBounds(object);
                    if (bounds) {
                        mctx.fillStyle = object.color || '#888';
                        mctx.globalAlpha = 0.7;
                        mctx.fillRect(bounds.x, bounds.y, Math.max(1, bounds.w), Math.max(1, bounds.h));
                        mctx.globalAlpha = 1;
                    }
                }
            });
            const topLeft = screenToWorld(0, 40);
            const bottomRight = screenToWorld(window.innerWidth, window.innerHeight);
            mctx.strokeStyle = '#3b82f6';
            mctx.lineWidth = 2 / scale;
            mctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
            mctx.restore();
            state._mm = { ...minimapCamera, scale: minimapCamera.scale, mw, mh };
        };

        (function() {
            const mc = document.getElementById('minimap');
            const wrap = document.getElementById('minimap-wrap');
            if (!mc || !wrap) return;
            let drag = null;
            let drawRaf = null;
            const scheduleMinimapDraw = () => {
                if (drawRaf) return;
                drawRaf = requestAnimationFrame(() => {
                    drawRaf = null;
                    drawMinimap();
                });
            };
            const fitButton = document.getElementById('mm-fit');
            if (fitButton) fitButton.addEventListener('click', fitMinimapToContent);
            mc.style.cursor = 'grab';
            mc.addEventListener('pointerdown', event => {
                if (event.button !== 0 || !minimapCamera) return;
                event.preventDefault();
                mc.setPointerCapture(event.pointerId);
                drag = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    centerX: minimapCamera.centerX,
                    centerY: minimapCamera.centerY
                };
                mc.style.cursor = 'grabbing';
            });
            mc.addEventListener('pointermove', event => {
                if (!drag || drag.pointerId !== event.pointerId) return;
                minimapCamera.centerX = drag.centerX - (event.clientX - drag.x) / minimapCamera.scale;
                minimapCamera.centerY = drag.centerY - (event.clientY - drag.y) / minimapCamera.scale;
                scheduleMinimapDraw();
            });
            const endDrag = event => {
                if (!drag || drag.pointerId !== event.pointerId) return;
                drag = null;
                mc.style.cursor = 'grab';
            };
            mc.addEventListener('pointerup', endDrag);
            mc.addEventListener('pointercancel', endDrag);
            mc.addEventListener('wheel', event => {
                event.preventDefault();
                if (!minimapCamera) return;
                const rect = mc.getBoundingClientRect();
                const x = event.clientX - rect.left - rect.width / 2;
                const y = event.clientY - rect.top - rect.height / 2;
                const worldX = minimapCamera.centerX + x / minimapCamera.scale;
                const worldY = minimapCamera.centerY + y / minimapCamera.scale;
                const nextLogScale = Math.log(minimapCamera.scale) - event.deltaY * 0.001;
                const nextScale = Math.exp(Math.max(
                    Math.log(Number.MIN_VALUE),
                    Math.min(Math.log(Number.MAX_VALUE), nextLogScale)
                ));
                minimapCamera.centerX = worldX - x / nextScale;
                minimapCamera.centerY = worldY - y / nextScale;
                minimapCamera.scale = nextScale;
                scheduleMinimapDraw();
            }, { passive: false });
            mc.addEventListener('dblclick', event => {
                event.preventDefault();
                fitMinimapToContent();
            });
            mc.addEventListener('keydown', event => {
                if (!minimapCamera) return;
                const panStep = 40 / minimapCamera.scale;
                if (event.key === 'Home') {
                    event.preventDefault();
                    fitMinimapToContent();
                    return;
                }
                const pan = {
                    ArrowLeft: [-panStep, 0],
                    ArrowRight: [panStep, 0],
                    ArrowUp: [0, -panStep],
                    ArrowDown: [0, panStep]
                }[event.key];
                if (pan) {
                    event.preventDefault();
                    minimapCamera.centerX += pan[0];
                    minimapCamera.centerY += pan[1];
                    drawMinimap();
                    return;
                }
                if (event.key === '+' || event.key === '=') {
                    event.preventDefault();
                    minimapCamera.scale = Math.exp(Math.min(
                        Math.log(Number.MAX_VALUE),
                        Math.log(minimapCamera.scale) + Math.log(1.25)
                    ));
                    drawMinimap();
                } else if (event.key === '-' || event.key === '_') {
                    event.preventDefault();
                    minimapCamera.scale = Math.exp(Math.max(
                        Math.log(Number.MIN_VALUE),
                        Math.log(minimapCamera.scale) - Math.log(1.25)
                    ));
                    drawMinimap();
                }
            });
            new ResizeObserver(() => drawMinimap()).observe(wrap);
        })();



        return { draw: drawMinimap, fit: fitMinimapToContent };
    }

    global.VersePaintMinimap = { initialize };
})(window);
