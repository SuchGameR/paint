(function (global) {
    'use strict';

    function initialize({ state, render, invalidate }) {
        const xInput = document.getElementById('status-x');
        const yInput = document.getElementById('status-y');
        const zoomInput = document.getElementById('status-zoom');
        const xWrap = xInput?.closest('.status-field');
        const yWrap = yInput?.closest('.status-field');
        let active = null;

        function centerWorld() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            return {
                x: (w / 2 - state.panX) / state.zoom,
                y: (h / 2 - state.panY) / state.zoom
            };
        }

        function displayX() {
            if (document.activeElement === xInput) return;
            const p = state.lastWorld || centerWorld();
            xInput.value = Math.round(p.x);
        }

        function displayY() {
            if (document.activeElement === yInput) return;
            const p = state.lastWorld || centerWorld();
            yInput.value = Math.round(p.y);
        }

        function displayZoom() {
            if (document.activeElement === zoomInput) return;
            zoomInput.value = Math.round(state.zoom * 100);
        }

        function commitPosition() {
            if (!xInput || !yInput) return;
            const x = Number(xInput.value);
            const y = Number(yInput.value);
            if (Number.isNaN(x) || Number.isNaN(y)) return;
            state.panX = window.innerWidth / 2 - x * state.zoom;
            state.panY = window.innerHeight / 2 - y * state.zoom;
            state.lastWorld = { x, y };
            if (invalidate) invalidate();
            if (render) render();
        }

        function commitZoom() {
            if (!zoomInput) return;
            const percent = Number(zoomInput.value);
            if (Number.isNaN(percent)) return;
            const next = Math.max(0.02, Math.min(32, percent / 100));
            const c = centerWorld();
            state.zoom = next;
            state.panX = window.innerWidth / 2 - c.x * next;
            state.panY = window.innerHeight / 2 - c.y * next;
            if (invalidate) invalidate();
            if (render) render();
            displayZoom();
        }

        function bind(input, commit) {
            if (!input) return;
            input.addEventListener('focus', () => {
                active = input;
                input.select();
            });
            input.addEventListener('blur', () => {
                active = null;
                commit();
                displayX();
                displayY();
                displayZoom();
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                    input.blur();
                } else if (event.key === 'Escape') {
                    input.blur();
                }
                event.stopPropagation();
            });
        }

        bind(xInput, commitPosition);
        bind(yInput, commitPosition);
        bind(zoomInput, commitZoom);

        [xWrap, yWrap].forEach(wrap => {
            if (!wrap) return;
            wrap.addEventListener('pointerdown', event => {
                if (event.target === wrap) {
                    xInput?.focus();
                    xInput?.select();
                }
            });
        });

        function update(world) {
            if (world) state.lastWorld = world;
            displayX();
            displayY();
            displayZoom();
        }

        displayX();
        displayY();
        displayZoom();
        return { update, syncZoom: displayZoom };
    }

    global.VersePaintStatusBar = { initialize };
})(window);
