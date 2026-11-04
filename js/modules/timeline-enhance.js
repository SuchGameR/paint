(function (global) {
    'use strict';

    function initialize({ state, onMoveFrame, invalidate, render, updateAnimUI, save }) {
        const strip = document.getElementById('anim-strip');
        const modal = document.getElementById('timeline-settings-modal');
        const gear = document.getElementById('anim-settings');
        const close = document.getElementById('timeline-settings-close');
        let dragFrame = null;

        function decorate() {
            if (!strip) return;
            strip.querySelectorAll('.anim-frame-head, .anim-cel').forEach(el => {
                el.draggable = true;
                el.classList.add('anim-draggable');
            });
        }

        if (strip) {
            new MutationObserver(decorate).observe(strip, { childList: true, subtree: true });
            decorate();
            strip.addEventListener('dragstart', event => {
                const cell = event.target.closest('.anim-frame-head, .anim-cel');
                if (!cell) return;
                dragFrame = Number(cell.dataset.frameIndex);
                if (!Number.isFinite(dragFrame)) {
                    dragFrame = null;
                    return;
                }
                event.dataTransfer.effectAllowed = 'move';
                try { event.dataTransfer.setData('text/plain', String(dragFrame)); } catch (_) {}
                cell.classList.add('anim-dragging');
            });
            strip.addEventListener('dragend', event => {
                dragFrame = null;
                strip.querySelectorAll('.anim-dragging, .anim-drop-target').forEach(el => {
                    el.classList.remove('anim-dragging', 'anim-drop-target');
                });
            });
            strip.addEventListener('dragover', event => {
                const cell = event.target.closest('.anim-frame-head, .anim-cel');
                if (!cell || dragFrame == null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                strip.querySelectorAll('.anim-drop-target').forEach(el => el.classList.remove('anim-drop-target'));
                cell.classList.add('anim-drop-target');
            });
            strip.addEventListener('drop', event => {
                const cell = event.target.closest('.anim-frame-head, .anim-cel');
                if (!cell || dragFrame == null) return;
                event.preventDefault();
                const target = Number(cell.dataset.frameIndex);
                if (Number.isFinite(target) && target !== dragFrame && onMoveFrame) {
                    onMoveFrame(dragFrame, target);
                }
                dragFrame = null;
            });
        }

        function syncModal() {
            const before = document.getElementById('onion-before');
            const after = document.getElementById('onion-after');
            const fps = document.getElementById('timeline-fps');
            const loop = document.getElementById('timeline-loop');
            if (before) before.value = state.onionBefore != null ? state.onionBefore : 2;
            if (after) after.value = state.onionAfter != null ? state.onionAfter : 1;
            if (fps) fps.value = state.animFps || 12;
            if (loop) loop.checked = document.getElementById('anim-loop')?.checked !== false;
        }

        if (gear && modal) {
            gear.addEventListener('click', () => {
                syncModal();
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            });
        }
        const closeModal = () => {
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };
        if (close) close.addEventListener('click', closeModal);
        if (modal) modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

        const apply = document.getElementById('timeline-settings-apply');
        if (apply) {
            apply.addEventListener('click', () => {
                const before = Math.max(0, Math.min(6, Number(document.getElementById('onion-before')?.value) || 0));
                const after = Math.max(0, Math.min(6, Number(document.getElementById('onion-after')?.value) || 0));
                const fps = Math.max(1, Math.min(60, Number(document.getElementById('timeline-fps')?.value) || 12));
                state.onionBefore = before;
                state.onionAfter = after;
                state.animFps = fps;
                const fpsInput = document.getElementById('anim-fps');
                if (fpsInput) fpsInput.value = String(fps);
                const loop = document.getElementById('timeline-loop');
                const animLoop = document.getElementById('anim-loop');
                if (animLoop && loop) animLoop.checked = loop.checked;
                invalidate?.();
                render?.();
                updateAnimUI?.({ rebuild: false });
                save?.();
                closeModal();
            });
        }

        return { decorate, open: () => gear?.click() };
    }

    global.VersePaintTimelineEnhance = { initialize };
})(window);
