(function (global) {
    'use strict';

    const LAYOUTS = {
        compact: { label: 'コンパクト', desc: '描画スペース最大化・ツール一覧ポップアップ' },
        styler: { label: 'スタイラー', desc: '現在のバランス型レイアウト' },
        pro: { label: 'プロ', desc: '常時パネル表示・高密度ワークスペース' }
    };

    const TOOLS = [
        { id: 'hand', icon: 'fa-hand', label: '移動' },
        { id: 'select', icon: 'fa-arrow-pointer', label: '選択' },
        { id: 'brush', icon: 'fa-pen-nib', label: 'ブラシ' },
        { id: 'pen', icon: 'fa-bezier-curve', label: 'ベジェペン' },
        { id: 'eraser', icon: 'fa-eraser', label: '消しゴム' },
        { id: 'fill', icon: 'fa-fill-drip', label: 'バケツ' },
        { id: 'text', icon: 'fa-font', label: 'テキスト' },
        { id: 'shapes', icon: 'fa-square', label: '図形' },
        { id: 'eyedropper', icon: 'fa-eye-dropper', label: 'スポイト' }
    ];

    function initialize({ state, setTool, save, setMode }) {
        const compact = document.getElementById('compact-tools');
        const compactBtn = document.getElementById('compact-tools-btn');
        const compactMenu = document.getElementById('compact-tools-menu');

        function apply(layout) {
            const name = LAYOUTS[layout] ? layout : 'styler';
            state.uiLayout = name;
            document.body.classList.remove('layout-compact', 'layout-styler', 'layout-pro');
            document.body.classList.add('layout-' + name);
            document.querySelectorAll('[data-layout]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.layout === name);
            });
            if (compact) compact.classList.toggle('hidden', name !== 'compact');
            const menubar = document.getElementById('app-menubar');
            if (menubar) menubar.classList.toggle('compact-menubar', name === 'compact');
            if (save) save();
        }

        document.querySelectorAll('[data-layout]').forEach(btn => {
            btn.addEventListener('click', () => apply(btn.dataset.layout));
        });

        if (compactMenu) {
            compactMenu.replaceChildren();
            TOOLS.forEach(tool => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'geist-btn compact-tool-item';
                btn.title = tool.label;
                btn.innerHTML = `<i class="fa-solid ${tool.icon}" aria-hidden="true"></i><span>${tool.label}</span>`;
                btn.addEventListener('click', () => {
                    setTool(tool.id);
                    if (compactMenu) compactMenu.classList.add('hidden');
                    if (compactBtn) compactBtn.setAttribute('aria-expanded', 'false');
                });
                compactMenu.appendChild(btn);
            });
            const row = document.createElement('div');
            row.className = 'compact-tool-row';
            const modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'geist-btn compact-tool-item';
            modeBtn.innerHTML = '<i class="fa-solid fa-paintbrush" aria-hidden="true"></i><span>描画モード</span>';
            modeBtn.addEventListener('click', () => {
                setMode('paint');
                compactMenu.classList.add('hidden');
            });
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'geist-btn compact-tool-item';
            editBtn.innerHTML = '<i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i><span>編集モード</span>';
            editBtn.addEventListener('click', () => {
                setMode('vector');
                compactMenu.classList.add('hidden');
            });
            row.append(modeBtn, editBtn);
            compactMenu.appendChild(row);
        }
        if (compactBtn && compactMenu) {
            compactBtn.addEventListener('click', event => {
                event.stopPropagation();
                const open = compactMenu.classList.contains('hidden');
                compactMenu.classList.toggle('hidden', !open);
                compactBtn.setAttribute('aria-expanded', String(open));
            });
            document.addEventListener('pointerdown', event => {
                if (compactMenu.classList.contains('hidden')) return;
                if (compactMenu.contains(event.target) || compactBtn.contains(event.target)) return;
                compactMenu.classList.add('hidden');
                compactBtn.setAttribute('aria-expanded', 'false');
            });
        }

        function applyStored() {
            apply(state.uiLayout || 'styler');
        }
        applyStored();
        return { apply, layouts: LAYOUTS };
    }

    global.VersePaintUILayout = { initialize, LAYOUTS };
})(window);
