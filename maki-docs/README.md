# maki-docs

ShareKeep の設計・統合メモ置き場。

最初に見るもの:

| ファイル | 役割 | 状態 |
| --- | --- | --- |
| [`integration-tasks.md`](./integration-tasks.md) | バックエンド統合の現状ボード。実装済み/残作業/検証をここに集約 | 最新 |
| [`integration-plan.md`](./integration-plan.md) | 統合方針の元メモ。なぜ ShareKeep 側へ寄せるかの背景 | 参照用 |
| [`feature-ideas.md`](./feature-ideas.md) | ハッカソン向け機能案。古い status enum 記述を含むため注意 | 参照用 |
| [`recommendation-api.md`](./recommendation-api.md) | 推薦スコアリング API の将来案 | 未実装 |

## 現在の実装メモ

- バックエンド統合の進捗は `integration-tasks.md` を正とする。
- `ShareKeep/features/` への RPC/Edge Function 連携層移植は実装済み。
- 受取人フローは `createParcel` / `matchNearbyAgent` / `generateQrToken` / `verifyRecipientQr` / realtime 購読へ概ね載せ替え済み。
- 代理人フローは QR 生成・受取人 QR 検証・暫定の「配達員から受領」導線まで実装済み。一方、請負一覧など一部は `delivery_matches` 直叩きを意図的に残している。
- 推薦スコアリング API は設計のみ。現アプリには未接続。

## 注意

`feature-ideas.md` と `integration-plan.md` は作業前提を整理するための元メモで、実装後の状態を逐次反映していない箇所がある。作業判断は必ず `integration-tasks.md` と実コードを確認する。
