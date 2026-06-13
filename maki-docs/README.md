# maki-docs

ShareKeep の設計・統合メモ置き場。

## 現役ドキュメント（ここを見る）

| ファイル | 役割 | 状態 |
| --- | --- | --- |
| [`integration-tasks.md`](./integration-tasks.md) | バックエンド統合の現状ボード。実装済み/残作業/検証をここに集約 | 最新・正 |
| [`feature-ideas.md`](./feature-ideas.md) | ハッカソン向け機能案（推薦＝案2 / CO2・XP＝案5 / QR＝案1 の設計元）。古い status enum 記述を含むため注意 | 参照用 |

> 要件・仕様の正本はリポジトリ直下の [`58th_development_requirements.md`](../58th_development_requirements.md)。

## 過去記録（archive へ移動済み）

完了したため `archive/maki-docs/` に退避。履歴として参照可。

| ファイル | 役割 |
| --- | --- |
| `archive/maki-docs/integration-plan.md` | 統合方針の元メモ。統合は完了し `integration-tasks.md` に置き換え |
| `archive/maki-docs/driver-screens-plan.md` | 配達業者画面の実装計画（Wave 0〜2）。実装完了・要件定義書に集約 |

## 推薦システム（AI推薦API）

- 設計メモ `recommendation-api.md` と実装基盤（`recommendation-service/` の Python ML サービス + Supabase migration）は **`feat/recommendation-api` ブランチ**にある。
- 現アプリ本体には未接続。**AI推薦APIが完成したらデモに統合する方針**（要件定義書の F-MATCH-03）。
- それまで配達員のマッチングは `find_nearby_agents` ＋手動選択で動作する。

## 注意

- バックエンド統合の進捗は `integration-tasks.md` と実コードを正とする。
- `feature-ideas.md` は作業前提の元メモで、実装後の状態を逐次反映していない箇所がある。
