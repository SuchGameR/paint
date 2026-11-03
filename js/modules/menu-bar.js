(function (global) {
    'use strict';

    function initialize(onAction) {
        const roots = Array.from(document.querySelectorAll('#app-menubar .menu-root'));

        function closeAll() {
            roots.forEach(root => {
                root.querySelector('.menu-dd')?.classList.add('hidden');
                root.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false');
            });
        }

        function open(root, focusFirst = false) {
            closeAll();
            const menu = root.querySelector('.menu-dd');
            const trigger = root.querySelector('.menu-btn');
            if (!menu || !trigger) return;
            menu.classList.remove('hidden');
            trigger.setAttribute('aria-expanded', 'true');
            if (focusFirst) menu.querySelector('button')?.focus();
        }

        roots.forEach(root => {
            const trigger = root.querySelector('.menu-btn');
            const menu = root.querySelector('.menu-dd');
            if (!trigger || !menu) return;

            trigger.setAttribute('aria-haspopup', 'true');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                if (menu.classList.contains('hidden')) open(root);
                else closeAll();
            });
            trigger.addEventListener('keydown', event => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                open(root, true);
            });
            root.addEventListener('focusout', event => {
                if (root.contains(event.relatedTarget)) return;
                menu.classList.add('hidden');
                trigger.setAttribute('aria-expanded', 'false');
            });
            menu.addEventListener('keydown', event => {
                const items = Array.from(menu.querySelectorAll('button:not(:disabled)'));
                const currentIndex = items.indexOf(document.activeElement);
                let nextIndex = null;
                if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
                else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = items.length - 1;
                if (nextIndex !== null && items.length) {
                    event.preventDefault();
                    items[nextIndex].focus();
                }
            });
            menu.querySelectorAll('button[data-menu-act]').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    const action = button.dataset.menuAct;
                    closeAll();
                    onAction(action);
                });
            });
        });

        document.addEventListener('pointerdown', event => {
            if (!event.target.closest('#app-menubar')) closeAll();
        });
        document.getElementById('app-menubar')?.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const openRoot = roots.find(root => !root.querySelector('.menu-dd')?.classList.contains('hidden'));
            if (!openRoot) return;
            event.preventDefault();
            closeAll();
            openRoot.querySelector('.menu-btn')?.focus();
        });

        return { close: closeAll };
    }

    global.VersePaintMenuBar = { initialize };
})(window);
