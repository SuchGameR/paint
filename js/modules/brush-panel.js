(function (global) {
    'use strict';

    function setOpen(open) {
        const panel = document.getElementById('left-paint-panel');
        const toggle = document.getElementById('btn-brush-panel-toggle');
        if (!panel || !toggle) return;

        panel.classList.toggle('hidden', !open);
        panel.classList.toggle('flex', open);
        panel.setAttribute('aria-hidden', String(!open));
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'ブラシと色の設定を閉じる' : 'ブラシと色の設定を表示');
    }

    function initialize() {
        const panel = document.getElementById('left-paint-panel');
        const toggle = document.getElementById('btn-brush-panel-toggle');
        const close = document.getElementById('btn-brush-panel-close');
        if (!panel || !toggle || !close) return;

        toggle.addEventListener('click', () => setOpen(panel.classList.contains('hidden')));
        close.addEventListener('click', () => {
            setOpen(false);
            toggle.focus();
        });
        setOpen(false);
        return { setOpen, toggle: () => setOpen(panel.classList.contains('hidden')) };
    }

    function setColor(color) {
        const indicator = document.getElementById('brush-panel-color');
        if (indicator) indicator.style.background = color;
    }

    global.VersePaintBrushPanel = { initialize, setColor, setOpen };
})(window);
