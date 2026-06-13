# 推薦API 続き作業メモ（ハンドオフ）

> このファイルは worktree `58hack2026-6_TeamKouka-recommendation`（ブランチ `feat/recommendation-api`）専用。
> 新しい Claude セッションで作業を再開する場合は、まず本ファイルと [`recommendation-api.md`](./recommendation-api.md) を読むこと。
> 設計の根拠・RPC仕様・特徴量・距離の起点などの詳細は `recommendation-api.md` が正。

## 現状（コミット 06728b6 までに完了）

| レイヤ | 物 | 状態 |
|---|---|---|
| DB | `supabase/migrations/20260613140000_recommendation.sql` | ✅ 作成・中核RPCは実DBで動作確認済み（**未適用**） |
| バックエンド | `recommendation-service/`（FastAPI + scikit-learn） | ✅ 生成・契約レビュー済み（**未デプロイ**） |
| デモデータ | `ShareKeep/scripts/{seed,unseed}-agents.ts` | ✅ 生成・契約レビュー済み（**未実行**） |
| 設計 | `maki-docs/recommendation-api.md` | ✅ 実スキーマ基準で更新済み |
| クライアント連携 | `ShareKeep/features/recommend.ts` ＋ 選択UI | ✅ **実装済み**（型チェックは `npm install` 後に各自で） |

DB契約は検証済み：`recommendation-service` の RPC 呼び出し・`recommendation_logs` 挿入列は migration と一致。
`get_recipient_coordinates` RPC は後から migration に追加して整合済み。

## ✅ 実装済み（このセッションで完了 ＝ worktree 内で完結）

1. **`ShareKeep/features/recommend.ts`** 新規作成
   - `recommendAgents({ parcelId?, recipientId?, latitude?, longitude?, radiusMeters?, topK?, targetAt? })`
     → `fetch(${EXPO_PUBLIC_RECOMMENDATION_URL}/recommend)`。型は recommendation-service の `RecommendResponse`/`RecommendationItem` に一致
   - `markRecommendationChosen(parcelId, agentId)` → `supabase.rpc('mark_recommendation_chosen', ...)`
   - `isRecommendationEnabled()`（URL 未設定判定。UI のフォールバック分岐に使用）
2. **受取人の中間者選択UI**（`app/(app)/recipient/matching.tsx` を改修）
   - GPS取得 → `recommendAgents` 呼び出し → スコア降順カードリスト（**内訳バー** `breakdown` ＋ `reasons` タグ）
   - 確定で `assignAgentToParcel`（`distance_meters` 付き）＋ `markRecommendationChosen`（best-effort）→ 保管状態を購読し pickup-ready へ
   - **フォールバック**：URL未設定／取得失敗／候補ゼロ時は従来の自動マッチ `matchNearbyAgent` ＋待機演出に自動で切替（＝サービス未デプロイでもデモが止まらない）
3. **`ShareKeep/lib/database.types.ts`** に `RecipientProfile` / `RecommendationLog` 型を追記
4. `EXPO_PUBLIC_RECOMMENDATION_URL` を `ShareKeep/.env.example` に追加（`EXPO_PUBLIC_` プレフィックスのため型は expo が自動付与）

## 🤖 残実装（任意・優先度低）

- **受取人住所の登録導線**（距離の起点 `recipient_profiles` を埋める。recommendation-api.md §1.5）
  - 現状は **端末GPS（`expo-location`）で `latitude/longitude` を直接 `/recommend` に渡す簡易版**を採用（doc記載の代替案）。
  - より正確にするなら geocode Edge Function の受取人版（`geocode-agent-address` 流用/汎用化）＋ サインアップ/設定で住所入力 → `upsert_recipient_profile` RPC。
- **型チェック/テスト**：worktree に `node_modules` 未導入のため未実行。`cd ShareKeep && npm install && npm test` で各自確認。

## 👤 あなた（権限・キー・インフラ）

1. **Supabase PAT を revoke→再発行**（過去の会話に `sbp_2671…` が露出したため）
2. **migration適用**：`supabase db push`（DB書き込み権限）
3. **service_role キー**を 2か所の `.env` に設定：
   - `ShareKeep/.env`（seed用）/ `recommendation-service/.env`（サービス用）
4. **シード実行**：`cd ShareKeep && npm install && npm run seed:agents`（本番DBに代理人8人）
5. **Pythonサービス**：`pip install -r recommendation-service/requirements.txt` →（任意）`python -m training.generate_synthetic && python -m training.train` → `uvicorn app.main:app --reload` → どこかにデプロイ（Railway/Render/Cloud Run等）
6. デプロイURLを `EXPO_PUBLIC_RECOMMENDATION_URL` に設定

## 契約の要点（実装時の参照用）

- 候補RPC：`get_recommendation_candidates(p_lat, p_lng, p_radius_m default 2000, p_active_statuses default array['agent_assigned','delivered_to_agent'])`
- 起点解決：`/recommend` は lat/lng を優先、無ければ recipient_id → `get_recipient_coordinates(p_recipient_id)`
- ログ：`recommendation_logs`（parcel_id/recipient_id/candidate_agent_id/features/score/rank/model_version、選択は `chosen`、成否は `outcome`）
- 学習は当面**合成データ**（`recommendation_logs` が溜まったら `--from-logs` で再学習）。`time_score`/`day_match` は自己申告で在宅"予測"ではない。

## 注意

- このブランチはローカルコミットのみ（未push）。push/PRは要相談。
- seed/Pythonサービスは **本番DBに書き込む**（プロジェクトは1つ）。デモ後は `npm run unseed:agents` で片付け可。
- 距離の起点は「登録した受取人の自宅座標」を既定、GPSは任意上書き（recommendation-api.md §1.5）。
