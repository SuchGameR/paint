# Effect More 編集可能化パッチ

## 問題
エフェクトモア（常時再生）適用中、オブジェクトの移動・リサイズ・回転・矢印キー移動がすぐ上書きされて編集できない。

## 原因
毎フレーム `restoreEffectBase` → エフェクト適用しており、ユーザー操作が打ち消される。

## 修正内容
1. ドラッグ/リサイズ/回転中は当該オブジェクトのエフェクト適用をスキップ
2. 操作終了時に `_effectBase` を再スナップショット
3. 矢印キー移動は base を直接更新
4. roundrect / triangle / star / hexagon のドラッグ・リサイズ対応

## 適用方法（ローカル）
```bash
git clone https://github.com/SuchGameR/paint.git
cd paint
# まず壊れた main.js を直前のコミットから戻す
git checkout b75c9d3f0edba50ede086bf80eb23ef35a83199e -- js/main.js
# パッチ適用
git apply effect-more-fix.patch
git add js/main.js
git commit -m "fix: allow edit while Effect More is live"
git push
```
