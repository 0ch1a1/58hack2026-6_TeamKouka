# 次期機能 実装計画（メッセージ / 評価 / 通知強化 / AI推薦統合）

作成: 2026-06-13 / 対象: 部下向け T1〜T5（小タスク）とは別の本格機能4件
要件定義書: [`../58th_development_requirements.md`](../58th_development_requirements.md)

## 前提（実DB確認済み・2026-06-13）

Supabase `project_id=zbmrmblakoszzecdnptn` の public スキーマを確認:
- **存在する**: `profiles` / `delivery_companies` / `parcels` / `parcel_status_histories` / `qr_tokens` / `agent_profiles` / `delivery_matches` / `point_transactions`(0行) / `achievements`(0行) / `co2_reduction_logs` / `notifications`(22行) / `system_settings`
- **存在しない（新規作成が必要）**: `handover_messages` / `agent_reviews` / `agent_whitelists`

> バックエンド変更は Supabase migration + RLS ポリシーが必須。RPC/Edge Function のソースは `feat/recommendation-api` 等の `supabase/` 配下にあり、本体（main）には未取り込み。

---

## 1. メッセージ機能（F-MSG-01）

### 目的
受取人⇆代理人が荷物ごとに連絡（「今向かっています」「玄関前に置きます」等）。デモで会話が見えると体験が伝わる。

### データ（新規テーブル）
`handover_messages`
| 列 | 型 | 備考 |
| --- | --- | --- |
| id | uuid PK | default `gen_random_uuid()` |
| parcel_id | uuid NOT NULL FK→parcels(id) | `on delete cascade` |
| sender_id | uuid NOT NULL FK→profiles(id) | |
| body | text NOT NULL | `CHECK (length(btrim(body)) > 0)`（空本文禁止） |
| created_at | timestamptz NOT NULL default now() | |
- **RLS（両レビュー指摘で厳格化）**:
  - read: 対象 parcel の `recipient_id` または `assigned_agent_id` 本人のみ。
  - insert: `with check (sender_id = auth.uid() AND auth.uid() IN (parcels.recipient_id, parcels.assigned_agent_id))`。**送信者偽装・無関係荷物への投稿を防ぐ**。
- **Realtime**: migration に `alter publication supabase_realtime add table public.handover_messages;` を含める（既存 publication は `parcels` / `delivery_matches` のみ。追加しないと購読が発火しない）。
- 注: `parcels` は実DBでFK制約0件だが、新テーブル側からは `parcels.id`(PK)/`profiles.id`(PK) へFKを張る（既存に倣ってFK省略しないこと）。

### API層（`ShareKeep/features/messages.ts` 新規）
- `sendMessage(parcelId, body)` … insert
- `fetchMessages(parcelId)` … select order by created_at
- `subscribeMessages(parcelId, onChange)` … Realtime（`subscribeParcel` を踏襲）。**`subscribeParcel` 同様 parcelId は呼び出し側で UUID 形式を保証**（filter に文字列補間するため）。

### 画面
- 専用 `app/(app)/messages/[parcelId].tsx`（チャットUI）。受取人 `pickup-ready.tsx`・代理人 `parcels.tsx`（キープ中）から「メッセージ」ボタンで遷移。

### 実装ステップ
1. migration（テーブル＋RLS）→ 2. `features/messages.ts` → 3. チャット画面 → 4. 各画面に導線 → 5. Realtime購読

### 受け入れ条件
受取人/代理人が同一荷物のメッセージを送受信でき、相手側にリアルタイム反映。第三者は読めない（RLS）。

### 規模・分割
中。**BE担当**（migration+RLS）／**FE担当**（features+画面）の2人で並列可。依存: parcels/profiles（既存）。

---

## 2. 評価機能（F-REVIEW-01）

### 目的
引き渡し完了後に受取人が代理人を評価。平均評価をマッチングの「おすすめ」表示に活用（推薦とも連動）。

### データ（新規テーブル）
`agent_reviews`
| 列 | 型 | 備考 |
| --- | --- | --- |
| id | uuid PK | default `gen_random_uuid()` |
| parcel_id | uuid NOT NULL FK→parcels(id) | **UNIQUE（1荷物1評価）** |
| agent_id | uuid NOT NULL FK→profiles(id) | 被評価者。`parcels.assigned_agent_id` から導出（受取人が任意指定不可） |
| reviewer_id | uuid NOT NULL FK→profiles(id) | 受取人 |
| rating | int NOT NULL | `CHECK (rating BETWEEN 1 AND 5)` |
| comment | text null | |
| created_at | timestamptz NOT NULL default now() | |
- **RLS（両レビュー指摘で厳格化）** insert の `with check`:
  - `reviewer_id = auth.uid()`
  - `reviewer_id = parcels.recipient_id`（自分が受取人の荷物のみ）
  - `agent_id = parcels.assigned_agent_id`（割り当て済み代理人のみ＝別人を評価できない）
  - `parcels.status IN ('completed','handed_to_recipient')`（`lib/status.ts` の `isHandedOff` と揃える。`completed` 限定だと `handed_to_recipient` 止まりが評価不可）
  - `UNIQUE(parcel_id)` で二重評価をDB側でも防止
  - read: 集計のため広め（agent本人＋当該受取人）。

### API層（`ShareKeep/features/reviews.ts` 新規）
- `createReview({parcelId, rating, comment})` … `agent_id` はクライアント指定せず RPC 側で `parcels.assigned_agent_id` から導出
- `fetchReviewForParcel(parcelId)` … 投稿済みか確認（UNIQUE で2回目はエラーになるため、フォームの出し分けに必須）
- **`get_agent_locations` / `getAgentLocations()` の戻りに `avg_rating` / `review_count` を追加（必須）**。カードごとに `getAgentRating` を呼ぶと N+1 になるため、一覧取得に集約する。

### 画面
- `recipient/delivery-complete.tsx` に評価フォーム（星＋コメント）を追加。※同画面は現状 `assigned_agent_id` を保持しないため、評価対象の取得が必要（RPC側導出なら parcelId だけでよい）。投稿済みなら `fetchReviewForParcel` の結果で「評価済み」表示。
- 平均評価の表示先は **受取人側（推薦カード＝後述 `recipient/matching.tsx`）が第一義**。配達員 `driver/agents.tsx` に出す場合は「配達員が割り当てる画面」という別ロール文脈として明示する。

### 実装ステップ
1. migration（テーブル＋RLS＋`get_agent_locations` への avg_rating/review_count 追加）→ 2. `features/reviews.ts` → 3. 完了画面に評価フォーム（投稿済み出し分け）→ 4. 代理人カードに平均表示

### 受け入れ条件
完了荷物に対し受取人が1回だけ評価でき、代理人の平均評価・件数が表示される。

### 規模・分割
中。**BE担当**（table+RPC）／**FE担当**（完了画面＋表示）。

---

## 3. 通知強化（F-NOTIF-01）

### 目的
ステータス変化を見落とさない。未読バッジ・一覧・リアルタイム表示でアプリらしさを上げる。

### データ
`notifications` は**既存（22行）→ テーブル追加不要**。

### API層（`ShareKeep/features/parcels.ts` に追加 or `features/notifications.ts`）
- 既存: `fetchMyNotifications` / `markNotificationRead`（実在・`mark_notification_read` RPC 経由）
- 追加: `getUnreadNotificationCount()` / `markAllNotificationsRead()`（RPC `get_unread_notification_count` / `mark_all_notifications_read`）。
  - **RPC は `userId` をクライアントから受けず内部で `auth.uid()` を使う**（または `p_user_id = auth.uid()` を検証）。クライアント渡しの userId を信用しない。
  - 種別フィルタは select の `.eq('notification_type', ...)`
- **Realtime**: migration に `alter publication supabase_realtime add table public.notifications;` を含める（既存 publication 未追加のため）。

### 画面
- 通知一覧画面 `app/(app)/notifications.tsx`（新規）。各ホームのヘッダーにベルアイコン＋**未読バッジ**。
- `notifications` テーブルの Realtime 購読で未読数を更新。種別フィルタのタブ。

### 実装ステップ
1. migration（RPC 2本 ＋ publication 追加）→ 2. features 追加 → 3. 通知一覧画面（まず Realtime なしの一覧＋既読）→ 4. ベル＋バッジ＋Realtime → 5. 種別フィルタ

### 受け入れ条件
未読件数がバッジ表示され、一覧で既読化（1件/一括）でき、種別で絞れ、新着がリアルタイム反映。

### 規模・分割
中（UI主体）。**BE担当**（RPC2本）／**FE担当**（通知画面＋バッジ＋realtime）。依存: notifications（既存）。

---

## 4. AI推薦のデモ統合（F-MATCH-03 / PR #59）

### 現状（PR #59 の実態を反映）
`feat/recommendation-api`（PR #59）に **基盤一式が構築済み**: `recommendation-service/`（Python ML サービス・Docker・学習）＋ `supabase/migrations/...recommendation.sql` ＋ **クライアント連携も実装済み**。
- **クライアント連携は `recipient/matching.tsx` を改修**して実装済み（＋ `features/recommend.ts`・`lib/database.types.ts`）。**`driver/agents.tsx`（配達員ロール画面）は触っていない**。
- 第一統合先は **`recipient/matching.tsx`（受取人フロー）**に固定。配達員画面への展開は必要なら二次対応。

### 統合計画（残作業に絞る）
1. **PR #59 レビュー＆マージ**（codex+subagent）。`recommendation.sql` migration を Supabase に適用。
2. **推薦サービスの稼働方法を確定**: ローカル/Docker/ホスティング先、エンドポイントURL、`.env`。デモ当日の起動手順を文書化。
3. **フォールバック検証（最優先）**: 推薦サービス停止/タイムアウト時に既存 `matchNearbyAgent`/`find_nearby_agents`（距離順）へ自動フォールバックすること（PR#59に実装ありとされるが要検証）。デモが推薦依存で落ちないこと。
4. **デモ台本**: 「AIが評価・距離・対応時間からおすすめ代理人を提示」を `recipient/matching.tsx` で見せる流れ。
- ※「クライアントの並び替え実装」は**PR#59で完了済み**のため新規工数は小。残るのはマージ・migration・稼働・検証。

### 評価連動（F-REVIEW-01 と連動させる場合）
推薦サービス/候補RPC（`get_recommendation_candidates` 等）の特徴量に **現状 `avg_rating`/`review_count` は含まれていない**。評価を推薦スコアに効かせるなら、RPCとサービス特徴量への平均評価追加が別途必要（評価機能の後続タスク）。

### 受け入れ条件
推薦サービス稼働時はスコア順で代理人が並び、停止時もフォールバックで `recipient/matching.tsx` が正常動作。

### 規模・リスク・分割
中〜大。可動部品が多い（別Pythonサービス常時起動・モデル・本番URL）。**インフラ担当**（サービス起動/デプロイ）／**検証担当**（停止時フォールバック）／（評価連動するなら）**BE担当**（特徴量追加）。
- リスク: デモ当日のサービス起動。→ フォールバック検証を最優先。推薦は「上乗せ」に留める。

---

## 推奨着手順

1. **通知強化（#3）**: 新規テーブル不要・既存拡張で最も低リスク。まず「Realtime なしの一覧＋既読」から始め、RPC2本＋publication追加を**同じ小migration**で固める。
2. **メッセージ（#1）** / **評価（#2）**: どちらも新規テーブル1つで自己完結。並行可。**RLS を先にレビューしてから FE 着手**。評価は推薦の「おすすめ順」にも効く（連動は特徴量追加が別途必要）。
3. **AI推薦統合（#4）**: 最後。統合先は **`recipient/matching.tsx` に固定**（PR#59で実装済み）。残作業はマージ＋migration＋サービス稼働＋フォールバック検証。

各機能とも「BE（migration+RLS+RPC）」と「FE（features+画面）」に割れるので、2人1組での並列がやりやすい。BEタスクには **RLS の `with check` 条件・publication 追加**を必ず含めること。
