(function() {
    "use strict";

    // ベクターパスクラス
    class VectorPath {
        constructor(type, points = [], closed = false) {
            this.type = type; // 'line', 'curve', 'polygon', 'freehand'
            this.points = points || [];
            this.closed = closed;
            this.selected = false;
        }

        addPoint(x, y) {
            this.points.push({x, y});
            if (this.type === 'line' && !this.closed) {
                this.type = 'freehand';
            }
        }

        removeLastPoint() {
            if (this.points.length > 0) {
                this.points.pop();
            }
        }

        getBezierPoints(tolerance = 8) {
            // ベジェ曲線のポイント計算
            const points = [];
            
            if (this.type === 'freehand') {
                for (let i = 0; i < this.points.length - 1; i++) {
                    const p1 = this.points[i];
                    const p2 = this.points[i + 1];
                    
                    // カブリエル＝ラトクシス公式で接点を計算
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    
                    points.push({
                        x: p1.x,
                        y: p1.y,
                        type: 'start'
                    });
                    
                    // 接点を補間
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    
                    points.push({
                        x: midX,
                        y: midY,
                        type: 'control'
                    });
                }
            }
            
            return points;
        }

        editStart(index) {
            // ベジェ曲線の編集開始
            if (this.points[index]) {
                this.selectedPoint = index;
                return true;
            }
            return false;
        }

        editEnd() {
            // 編集解除
            this.selectedPoint = null;
            return true;
        }
    }

    // ベジェ曲線描画用クラス
    class BezierCurveEditor {
        constructor(path, container) {
            this.path = path;
            this.container = container;
            this.handlePoints = [];
            
            this.init();
        }

        init() {
            const points = this.path.getBezierPoints();
            
            points.forEach((p, i) => {
                const el = document.createElement('div');
                el.className = 'vector-point';
                el.dataset.index = i;
                
                if (p.type === 'control') {
                    // 制御ポイント
                    el.classList.add('control-point');
                    
                    const handleEl = document.createElement('div');
                    handleEl.className = 'handle';
                    handleEl.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        this.moveHandle(i, e);
                    });
                    
                    el.appendChild(handleEl);
                } else {
                    // アンカーポイント
                    el.classList.add('anchor-point');
                    el.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        this.moveToPoint(i, e);
                    });
                }
                
                this.container.appendChild(el);
            });
        }

        moveToPoint(index, e) {
            // アンカーポイントへの移動
            const container = this.container.getBoundingClientRect();
            const x = (e.clientX - container.left) / this.container.offsetWidth * 100;
            const y = (e.clientY - container.top) / this.container.offsetHeight * 100;
            
            const point = this.path.points[index];
            point.x = x * 100; // ノーマライズ済み値を保持
            point.y = y * 100;
        }

        moveHandle(index, e) {
            // ハンドル移動処理
            const container = this.container.getBoundingClientRect();
            const handle = document.querySelector(`.vector-point[data-index="${index}"] .handle`);
            if (handle) {
                handle.style.transform = `translate(${e.clientX - handle.offsetLeft}px, ${e.clientY - handle.offsetTop}px)`;
            }
        }

        getPoints() {
            return this.path.points.map(p => ({
                x: p.x,
                y: p.y
            }));
        }
    }

    // グリッドクラス
    class GridManager {
        constructor(options = {}) {
            this.gridSize = options.gridSize || 20;
            this.enabled = options.enabled || false;
            this.snapToGrid = options.snapToGrid || false;
            
            this.init();
        }

        init() {
            // グリッド描画
            this.gridLayer = document.createElement('div');
            this.gridLayer.className = 'grid-layer';
            this.render();
        }

        render() {
            // グリッド再描画ロジック
            this.gridLayer.innerHTML = '';
            
            // D&D スナップ処理の準備
            if (this.snapToGrid) {
                document.addEventListener('mousemove', (e) => {
                    const rect = e.target.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    e.target.dataset.gridX = Math.round(x / this.gridSize) * this.gridSize;
                    e.target.dataset.gridY = Math.round(y / this.gridSize) * this.gridSize;
                });
            }
        }

        toggleSnap() {
            this.snapToGrid = !this.snapToGrid;
            return this.snapToGrid;
        }

        isSnapEnabled() {
            return this.snapToGrid;
        }
    }

    // グローバルにエクスポート
    window.VectorPath = VectorPath;
    window.BezierCurveEditor = BezierCurveEditor;
    window.GridManager = GridManager;

})();
