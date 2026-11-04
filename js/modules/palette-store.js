(function (global) {
    'use strict';

    const LIGHT_RAMPS = [
        { name: '肌', colors: ['#3b2118', '#6b3a2a', '#a85f45', '#d9946c', '#f2c6a0', '#ffe3c9'] },
        { name: '髪', colors: ['#1a1410', '#3d2b1f', '#6b4a33', '#9c7250', '#c9a477', '#eed9b5'] },
        { name: '赤', colors: ['#3f0d12', '#7f1d1d', '#c2262b', '#ef4444', '#fb8a8a', '#ffd1d1'] },
        { name: '青', colors: ['#0b1e3a', '#123c69', '#1d5fa8', '#3b82f6', '#7db4fb', '#d3e4ff'] },
        { name: '緑', colors: ['#0d2b1d', '#14532d', '#15803d', '#22c55e', '#7ee2a0', '#d4f9df'] },
        { name: '紫', colors: ['#241035', '#431d63', '#6d28a8', '#a855f7', '#d0a6fb', '#f0ddff'] }
    ];

    function huePalette() {
        const colors = ['#111111', '#ffffff'];
        for (let h = 0; h < 360; h += 30) {
            colors.push(hslHex(h, 72, 52));
            colors.push(hslHex(h, 55, 34));
        }
        return colors;
    }

    function hslHex(h, s, l) {
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return '#' + to(r) + to(g) + to(b);
    }

    const BUILTIN = {
        flat: {
            name: '平面',
            colors: [
                '#111827', '#374151', '#6b7280', '#d1d5db', '#f9fafb',
                '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
                '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
                '#d946ef', '#ec4899', '#f43f5e', '#a16207', '#78350f'
            ]
        },
        wheel: { name: '円形', colors: huePalette() },
        lighting: { name: 'ライティング', colors: [], groups: LIGHT_RAMPS },
        mono: { name: 'モノクロ', colors: ['#0a0a0a', '#171717', '#262626', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5', '#fafafa', '#ffffff'] },
        pastel: { name: 'パステル', colors: ['#2b2d42', '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f8edeb', '#f7b2bd', '#b8e0d2', '#d6c3f5', '#fde2a7'] },
        earth: { name: 'アース', colors: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#d8f3dc', '#7f5539', '#a68a64', '#c2a27f', '#e6ccb2'] },
        neon: { name: 'ネオン', colors: ['#0a0a0a', '#00f0ff', '#ff00aa', '#aaff00', '#ff5500', '#ffffff', '#7c3aed', '#22d3ee', '#f43f5e'] },
        basic: { name: 'ベーシック', colors: ['#000000', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#78350f', '#e5e7eb'] }
    };

    function initialize({ state, setColor, save }) {
        const mounts = [
            document.getElementById('color-system'),
            document.getElementById('color-system-left')
        ].filter(Boolean);
        if (!mounts.length) return null;

        if (!Array.isArray(state.recentColors)) state.recentColors = [];
        if (!Array.isArray(state.favoriteColors)) state.favoriteColors = [];
        if (!Array.isArray(state.customPalettes)) state.customPalettes = [];
        if (!state.paletteId) state.paletteId = 'flat';

        function allPalettes() {
            const map = { ...BUILTIN };
            state.customPalettes.forEach(p => {
                if (p && p.id && Array.isArray(p.colors)) {
                    map[p.id] = { name: p.name || 'カスタム', colors: p.colors, custom: true };
                }
            });
            return map;
        }

        function normalize(hex) {
            if (!hex) return '';
            let v = String(hex).toLowerCase();
            if (v[0] !== '#') v = '#' + v;
            if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
            return /^#[0-9a-f]{6}$/.test(v) ? v : '';
        }

        function noteColor(hex) {
            const v = normalize(hex);
            if (!v) return;
            state.recentColors = [v, ...state.recentColors.filter(c => c !== v)].slice(0, 18);
            refreshActive();
        }

        function refreshActive() {
            const current = normalize(state.color);
            document.querySelectorAll('.palette-swatch').forEach(el => {
                el.classList.toggle('active', el.dataset.hex === current);
            });
        }

        function makeSwatch(hex, extraClass) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'swatch palette-swatch' + (extraClass ? ' ' + extraClass : '');
            b.style.background = hex;
            b.dataset.hex = hex;
            b.title = hex;
            b.setAttribute('aria-label', hex);
            b.addEventListener('click', () => {
                setColor(hex);
                noteColor(hex);
                if (save) save();
            });
            b.addEventListener('contextmenu', ev => {
                ev.preventDefault();
                if (extraClass === 'fav-swatch') {
                    state.favoriteColors = state.favoriteColors.filter(c => c !== hex);
                    renderAll();
                    if (save) save();
                }
            });
            return b;
        }

        function swatchGrid(colors, groups) {
            const box = document.createElement('div');
            box.className = 'palette-grid';
            if (groups && groups.length) {
                groups.forEach(group => {
                    const label = document.createElement('div');
                    label.className = 'palette-group-label';
                    label.textContent = group.name;
                    box.appendChild(label);
                    const row = document.createElement('div');
                    row.className = 'palette-grid-row';
                    group.colors.forEach(hex => row.appendChild(makeSwatch(hex)));
                    box.appendChild(row);
                });
            } else {
                colors.forEach(hex => box.appendChild(makeSwatch(hex)));
            }
            return box;
        }

        function build(mount, suffix) {
            mount.replaceChildren();
            const palettes = allPalettes();

            const head = document.createElement('div');
            head.className = 'palette-head';
            const select = document.createElement('select');
            select.className = 'palette-select prop-input';
            select.id = 'palette-select-' + suffix;
            Object.keys(palettes).forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = palettes[id].name;
                select.appendChild(opt);
            });
            select.value = palettes[state.paletteId] ? state.paletteId : 'flat';
            select.addEventListener('change', () => {
                state.paletteId = select.value;
                renderAll();
                if (save) save();
            });
            const favBtn = document.createElement('button');
            favBtn.type = 'button';
            favBtn.className = 'geist-btn palette-icon-btn';
            favBtn.title = '現在の色をお気に入りに追加';
            favBtn.innerHTML = '<i class="fa-solid fa-star" aria-hidden="true"></i>';
            favBtn.addEventListener('click', () => {
                const c = normalize(state.color);
                if (!c) return;
                if (!state.favoriteColors.includes(c)) state.favoriteColors.push(c);
                renderAll();
                if (save) save();
            });
            head.append(select, favBtn);
            mount.appendChild(head);

            const current = palettes[state.paletteId] || palettes.flat;
            mount.appendChild(swatchGrid(current.colors || [], current.groups));

            const recentLabel = document.createElement('div');
            recentLabel.className = 'palette-group-label';
            recentLabel.textContent = '最近使った色';
            mount.appendChild(recentLabel);
            const recentRow = document.createElement('div');
            recentRow.className = 'palette-grid-row';
            if (state.recentColors.length) {
                state.recentColors.forEach(hex => recentRow.appendChild(makeSwatch(hex, 'recent-swatch')));
            } else {
                recentRow.innerHTML = '<span class="palette-empty">まだありません</span>';
            }
            mount.appendChild(recentRow);

            const favLabel = document.createElement('div');
            favLabel.className = 'palette-group-label';
            favLabel.textContent = 'お気に入り';
            mount.appendChild(favLabel);
            const favRow = document.createElement('div');
            favRow.className = 'palette-grid-row';
            if (state.favoriteColors.length) {
                state.favoriteColors.forEach(hex => favRow.appendChild(makeSwatch(hex, 'fav-swatch')));
            } else {
                favRow.innerHTML = '<span class="palette-empty">★で追加</span>';
            }
            mount.appendChild(favRow);

            const actions = document.createElement('div');
            actions.className = 'palette-actions';
            const savePalette = document.createElement('button');
            savePalette.type = 'button';
            savePalette.className = 'geist-btn palette-action-btn';
            savePalette.textContent = 'お気に入りを保存';
            savePalette.addEventListener('click', () => {
                const name = prompt('パレット名', 'マイパレット');
                if (!name) return;
                const colors = (state.favoriteColors.length ? state.favoriteColors : state.recentColors).slice(0, 32);
                if (!colors.length) return;
                state.customPalettes.push({ id: 'custom-' + Date.now(), name, colors });
                state.paletteId = state.customPalettes[state.customPalettes.length - 1].id;
                renderAll();
                if (save) save();
            });
            const clearRecent = document.createElement('button');
            clearRecent.type = 'button';
            clearRecent.className = 'geist-btn palette-action-btn';
            clearRecent.textContent = '最近をクリア';
            clearRecent.addEventListener('click', () => {
                state.recentColors = [];
                renderAll();
                if (save) save();
            });
            actions.append(savePalette, clearRecent);
            mount.appendChild(actions);
        }

        function renderAll() {
            mounts.forEach((mount, i) => build(mount, i === 0 ? 'props' : 'left' + i));
            refreshActive();
        }

        renderAll();
        return { renderAll, noteColor, refreshActive, palettes: BUILTIN };
    }

    global.VersePaintColorSystem = { initialize, BUILTIN, LIGHT_RAMPS };
})(window);
