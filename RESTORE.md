# VersePaint 修正・構成メモ

## 重要: main.js の復旧

リモートの `js/main.js` が破損している場合:

```bash
git checkout b75c9d3f0edba50ede086bf80eb23ef35a83199e -- js/main.js
git apply effect-more-fix.patch
git add js/main.js index.html js/modules/app-state.js
git commit -m "fix: Effect More を編集と分離、プロジェクト種類を追加"
git push
```

## 設計方針（編集と再生の分離）

| 系統 | 役割 | いつ動くか |
|------|------|------------|
| **描画・編集** (vector / paint) | オブジェクトの作成・変形 | 常時。エフェクトは静止表示 |
| **Effect More** | 手続き的エフェクト (wiggle 等) | 「プレビュー再生」ON のときだけ RAF |
| **アニメ タイムライン** | コマ送り / FPS / オニオンスキン | アニメモード専用 |

- エフェクト適用後は **静止**（base ジオメトリ表示）→ 位置・形を編集しやすい
- 確認したいときだけ「プレビュー」または「プレビュー再生」をオン
- ベクター／ペイントモードに戻すと自動でエフェクト再生オフ
- スタート画面で **イラスト / アニメーション** を選択（後者はタイムラインを開いて開始）

## パフォーマンス

- エフェクト用 `requestAnimationFrame` はライブ対象があるときだけ回す
- オフ時は全オブジェクトを base に戻してループ停止
