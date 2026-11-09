(function (global) {
    'use strict';

    // カラーパレット定義
    const PALETTE_PRESETS = {
        // プリセットパターン
        mono: ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4', '#ffffff'],
        vercel: ['#171717', '#0070f3', '#7928ca', '#ff0080', '#f5a623', '#50e3c2'],
        pastel: ['#2b2d42', '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f8edeb'],
        earth: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#d8f3dc'],
        neon: ['#0a0a0a', '#00f0ff', '#ff00aa', '#aaff00', '#ff5500', '#ffffff'],
        
        // 平面系カラーパレット
        flat1: ['#e8eaed', '#7f8fa6', '#52697b', '#394d5d', '#2c3e50', '#1a252f'],
        flat2: ['#fefae0', '#ffdc8f', '#f7c59f', '#ca9e79', '#8a7355', '#3e3b36'],
        
        // 円形グラデーション用
        circular1: [
            '#ffffff', '#f4f4f4', '#e6e6e6', '#d0d0d0', 
            '#b8b8b8', '#9e9e9e', '#7c7c7c', '#5a5a5a'
        ],
        
        // ライティング・明度変化対応（プロ絵師向け）
        lighting1: [
            '#f8d6c2', '#f0b99d', '#df966e', '#cf7241', 
            '#bf5013', '#af2e0f', '#5a1b0b'
        ],
        
        // リアル系ライティング
        realistic: [
            '#ffffff', '#e8e8e8', '#cccccc', '#999999', 
            '#666666', '#333333', '#1a1a1a'
        ],

    };

    // 最近使用履歴管理
    class PaletteHistory {
        constructor() {
            this.maxSize = 20;
            this.history = [];
        }

        add(palette) {
            const key = JSON.stringify(palette);
            if (!this.history.find(h => JSON.stringify(h.palette) === key)) {
                this.history.unshift({ palette, timestamp: Date.now() });
                if (this.history.length > this.maxSize) {
                    this.history.pop();
                }
                this.save();
            }
        }

        getRecent(count = 6) {
            return this.history.slice(0, count).map(h => ({
                ...h,
                name: JSON.stringify(h.palette).slice(0, 12) + '...'
            }));
        }

        save() {
            try {
                const storage = localStorage.getItem('paletteHistory') || [];
                this.history = [...storage, ...this.history].slice(0, this.maxSize);
                localStorage.setItem('paletteHistory', JSON.stringify(this.history));
            } catch(e) {
                console.warn('LocalStorage not available:', e);
            }
        }

        clear() {
            this.history = [];
            this.save();
        }
    }

    // お気に入り管理
    class FavoritePalettes {
        constructor() {
            this.storageKey = 'favoritePalettes';
        }

        add(palette, name) {
            const favorites = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            if (!favorites.find(f => JSON.stringify(f.palette) === JSON.stringify(palette))) {
                favorites.push({ palette, name });
                this.save();
                return true;
            }
            return false;
        }

        remove(index) {
            const favorites = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            if (favorites.length > index) {
                favorites.splice(index, 1);
                this.save();
                return true;
            }
            return false;
        }

        save() {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.get()));
            } catch(e) {
                console.warn('LocalStorage not available:', e);
            }
        }

        get() {
            return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        }
    }

    // パレットストア（統合クラス）
    class EnhancedPaletteStore {
        constructor() {
            this.presets = PALETTE_PRESETS;
            this.history = new PaletteHistory();
            this.favorites = new FavoritePalettes();
            
            // 初期化
            try {
                if (!localStorage.getItem('paletteVersion') || localStorage.getItem('paletteVersion') !== '2.0') {
                    localStorage.setItem('paletteVersion', '2.0');
                    this.refreshPresetHistory();
                }
            } catch(e) {}
        }

        // 全パレット取得（プリセット + ヒストリー）
        getAll() {
            return [
                ...Object.entries(this.presets).map(([name, colors]) => ({
                    name,
                    type: 'preset',
                    colors,
                    id: `preset_${name}`,
                    createdAt: Date.now() - Math.random() * 1000000
                })),
                ...this.history.getRecent()
            ].sort((a, b) => {
                // お気に入りを優先、次に最近使用済み
                if (a.type === 'favourite' && b.type !== 'favourite') return -1;
                if (b.type === 'favourite' && a.type !== 'favourite') return 1;
                if (a.createdAt > b.createdAt) return -1;
                return 1;
            });
        }

        get(nameOrId) {
            const all = this.getAll();
            return all.find(p => p.name === nameOrId || p.id === nameOrId);
        }

        addCustom(palette, name, type = 'custom') {
            const id = `custom_${Date.now()}`;
            const paletteObj = {
                name: name || 'カスタムパレット',
                colors: palette,
                id,
                createdAt: Date.now(),
                description: 'ユーザー作成カスタムカラー'
            };
            
            this.history.add(paletteObj);
            this.favorites.add(paletteObj, name);
            return paletteObj;
        }

        refreshPresetHistory() {
            // 使用頻度計算
            const presetCounts = {};
            for (const [name, colors] of Object.entries(this.presets)) {
                presetCounts[name] = 1;
            }
            
            this.history.refresh();
        }

        remove(id) {
            let removed = false;
            const all = this.getAll();
            all.forEach(p => {
                if (p.id === id) {
                    // お気に入りも削除
                    const favs = JSON.parse(localStorage.getItem('favoritePalettes') || '[]');
                    const newFavs = favs.filter(f => f.id !== id);
                    localStorage.setItem('favoritePalettes', JSON.stringify(newFavs));
                    removed = true;
                }
            });
            
            if (removed) {
                this.refreshPresetHistory();
            }
        }

        getGrouped() {
            return [
                {
                    name: 'プリセット',
                    palettes: Object.entries(this.presets).map(([name, colors]) => ({
                        id: `preset_${name}`,
                        name,
                        colors,
                        type: 'preset'
                    }))
                },
                {
                    name: '最近使用済み',
                    palettes: this.history.getRecent()
                },
                {
                    name: 'お気に入り',
                    palettes: JSON.parse(localStorage.getItem('favoritePalettes') || '[]').map(f => ({
                        ...f,
                        type: 'favorite'
                    }))
                }
            ];
        }
    }

    // グローバルエクスポート
    global.PaletteStore = new EnhancedPaletteStore();
    
})(window);
