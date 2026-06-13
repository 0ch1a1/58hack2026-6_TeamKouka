# アーカイブ: 旧 database/sharekeep-app（仮フロント）

統合計画（`maki-docs/integration-plan.md` / `integration-tasks.md`）に基づき、
本物のバックエンド連携層（`features/`）は `ShareKeep/` 側へ移植済み。

このフォルダは原則 **不要** だが、計画 §4 のとおり
**QR 周り（`QrTokenView` / `QrScanScreen` のロジック）を移植時の参照元として残す**ため退避した。

- 元パス: `database/sharekeep-app`
- 退避日: 2026-06-13（STAGE C）
- `database/.env`（旧アプリの Supabase キー）は退避せず削除。秘密情報の履歴整理は
  `chore/security-env-hygiene` ブランチ側で扱う。

ShareKeep 本体が安定し QR 実装の参照が不要になったら、このフォルダごと削除してよい。
