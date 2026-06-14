# ShareKeep 複数端末デモ Runbook（Approach A）

3ロール（受取人T / 代理人みどり商店 / 配達員 田中渓都）が **同じ実DB行**を読み書きして
連動するデモの準備・実行手順。リモート project `zbmrmblakoszzecdnptn` 前提。

> read-only MCP では DB 書込・スクリプト実行はできない。本書は**ユーザーが実行する**前提の手順書。

---

## 0. 前提・既知の注意

- **配送会社IDは `d98697e6-e71d-463f-9d59-a706817db938` に統一済み**（アプリ定数 `DEMO_DELIVERY_COMPANY_ID` / `ShareKeep/lib/config.ts`）。
  配達員画面は `fetchDriverParcels(DEMO_DELIVERY_COMPANY_ID)` で **会社IDのみ**で絞り込む（`ShareKeep/features/parcels-driver.ts`）。
  デモ荷物はこの会社IDで作らないと配達員に出ない。旧 `b82ef944-...` はバグだったので `demo_setup.sql` で修正済み。
  （`delivery_companies` には同名 "Test Delivery" が2件あるので ID で区別すること。）
- `parcel_status` enum（実DB確認済み）: `created → out_for_delivery → delivery_failed → agent_assigned → delivered_to_agent → handed_to_recipient → completed`。
- **整合崩れの掃除**: `delivery_matches` に「受取人T(d4890a29) が agent_id に入った行（ロール衝突）」と重複行が存在していた。
  `demo_setup.sql` 冒頭の A) クリーンアップで除去する（冪等）。
- env `SUPABASE_SERVICE_ROLE_KEY` とデモ用パスワードは秘匿情報。

---

## 1. 実行順

すべて `ShareKeep/` ディレクトリで実行（`.env` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を設定）。

### ① 代理人 seed（必要な場合のみ）
8体の代理人が未作成なら:
```
npx tsx scripts/seed-agents.ts
```
既に8体 (`sharekeep-seed-agent-1..8@example.com`, role=agent) が存在するなら省略可。

### ② demo_setup.sql を実行
Supabase SQL Editor で `supabase/demo_setup.sql` を貼り付けて実行（または write モード MCP / `supabase db query`）。
内容:
- A) `delivery_matches` のクリーンアップ（ロール衝突行＋重複行の削除、冪等）。
- B) 受取人T の `recipient_profiles`（推薦の origin）。
- 1〜5) 代理人8体を T 基準で再配置・改名（みどり商店/山田さん宅/さくら管理人室/コワーキングA + 残り4体は半径外退避）。
- 6) 通し用 parcel `DEMO-SPOT-0001`（recipient=T, 会社ID=`d98697e6-...`, status=`created`）を作成 or 初期状態へリセット（冪等）。

### ③ デモ用ログイン整備
```
npx tsx scripts/seed-demo-accounts.ts
```
受取人T・配達員のパスワードを既知値へリセットし、代理人 seed の存在を確認。最後に3ログインを表で出力する。
（任意 env: `DEMO_ACCOUNT_PASSWORD` で受取人/配達員のパスワードを上書き可。既定 `ShareKeepDemo2026!`）

---

## 2. 3端末の割当とログイン

`seed-demo-accounts.ts` 実行後に確定する値（既定パスワードの場合）:

| 端末 | ロール | email | パスワード | 備考 |
|---|---|---|---|---|
| 端末1 | 受取人T (recipient) | `test@test.com` | `ShareKeepDemo2026!` | full_name='T'。id `d4890a29-...` |
| 端末2 | 代理人みどり商店 (agent) | `sharekeep-seed-agent-1@example.com` | `ShareKeepSeedAgent2026!` | demo_setup.sql で full_name='みどり商店' に改名 |
| 端末3 | 配達員 (delivery_company) | `tanakakeito1125@gmail.com` | `ShareKeepDemo2026!` | full_name='田中渓都'。id `3dc3d4ff-...` |

> email/パスワードは `seed-demo-accounts.ts` の出力（`console.table`）が正。本表は参考。

---

## 3. 通しクリックパス（DEMO-SPOT-0001）

`parcel_status` の遷移と、更新テーブル・リアルタイム反映先。
実際の書込関数は `ShareKeep/features/*.ts`、画面は `ShareKeep/app/(app)/`。

> **重要な実装事実**:
> - 受取人の「候補選択」は `parcel_agent_whitelist` を書き、**parcels.status を直接 `agent_assigned` にする**（`setAgentWhitelist` / `features/parcels-recipient.ts`）。`select_agent` RPC は無い。
> - `delivery_matches` は**配達員**が「代理人を割り当てる」時に `assign_agent_to_parcel` RPC で作る（受取人ではない）。
> - 代理人画面の「デモ用: 受領済みにする」は、配達員QRスキャン手順の代替デモ用ショートカット。

デモ初期状態: `DEMO-SPOT-0001` は `created`（配達員端末に表示される）。

| # | 操作者 | 画面 / route | 操作（ラベル） | 書込関数 / RPC | 更新テーブル | 新status | リアルタイム反映先 |
|---|---|---|---|---|---|---|---|
| 1 | 配達員 | `/(app)/driver`（配達員ホーム） | 「配達開始」 | `startDelivery`→`update_parcel_status` | parcels | `out_for_delivery` | 配達員リスト |
| 2 | 配達員 | `/(app)/driver` | 「不在報告」 | `reportDeliveryFailed` | parcels | `delivery_failed` | 配達員リスト / 受取人 荷物一覧 |
| 3 | 受取人 | `/(app)/recipient/matching`（代理人を選ぶ） | 「N人をホワイトリストに設定する」（みどり商店を1位に） | `setAgentWhitelist` | parcel_agent_whitelist, parcels | `agent_assigned` | 受取人 荷物一覧 / 配達員リスト |
| 4 | 配達員 | `/(app)/driver/agents`（代理人を探す） | 「この代理人に割り当てる」（ホワイトリストのみ表示=みどり商店） | `assignAgentToParcel`→`assign_agent_to_parcel` | delivery_matches, parcels(assigned_agent_id), **notifications** | `agent_assigned` | 代理人 請負リスト＋**🔔 代理人端末にベル通知**「代理受取の依頼が届きました」 |
| 5 | 配達員 | `/(app)/driver/scan`（代理人QRを読む） | 代理人が出すQRをスキャン | `verifyAgentQr`→edge `verify-agent-qr` | parcels, qr_tokens | `delivered_to_agent` | 代理人 / 受取人 各画面 |
| 5' | （代替）代理人 | `/(app)/agent/parcels`（請負リスト） | 「デモ用: 受領済みにする」 | `updateParcelStatus` | parcels | `delivered_to_agent` | 同上（QRが使えない時の代替） |
| 6 | 受取人 | `/(app)/recipient/pickup-ready`（荷物を受け取る） | 「引き渡し確認QRを表示」 | `generateQrToken`(recipient) | qr_tokens | （変化なし） | — |
| 7 | 代理人 | `/(app)/agent/parcels` | 「受取人QRスキャン」（受取人のQRを読む） | `verifyRecipientQr`→edge `verify-recipient-qr` | parcels, delivery_matches, points/CO2 | `handed_to_recipient`/`completed` | 受取人 pickup-ready→`delivery-complete` へ自動遷移 |

### 通知（ベル）の端末間連動 — デモの"連動感"の核
`notifications` テーブルは `supabase_realtime` に登録済みで、各端末の `NotificationBell` が
自分(user_id)宛ての行を購読し、未読バッジをリアルタイム更新する。デモで見せどころ:

- **step 4（配達員が割当）→ 代理人端末に 🔔 ベル通知**「代理受取の依頼が届きました」。
  これが「代理人が決定した時の通知」の正体。`assign_agent_to_parcel` RPC が
  `create_notification(agent_id, 'agent_assigned', …)` を実行することで発火する（サーバ側RPC・確認済み）。
  → **受取人が候補確定した瞬間ではなく、配達員が割り当てた瞬間に代理人へ飛ぶ**（現状設計どおり）。
- 他のステータス変化（`parcel_status_changed`）も `notifications` に追記され各端末のベルに反映。
- 画面側の即時更新（請負リスト/荷物一覧/pickup-ready/ライブトラッキング/チャット）は
  各テーブルの `postgres_changes` 購読で別途行われる（通知とは独立）。

> ⚠️ 注意: `assign_agent_to_parcel` / `verify-agent-qr` / `verify-recipient-qr` はリモートSupabase側定義で
> リポジトリの migrations に本体が無い。通知発火は実DBのRPC定義（`create_notification` 呼び出し）で確認済みだが、
> Edge Function 2種の通知有無は本体未読のため当日要確認。

### ナラティブ（候補ランキング）
受取人の代理人候補画面では、T 基準の再配置により:
- **みどり商店**（店舗 / 650m東 / 18:00-21:00 / 空き2）= 1位想定
- **コワーキングA**（施設 / 1200m西 / 空き4）= 2位想定
- **山田さん宅**（個人宅 / 150m北・最短）= 個人NGで除外想定
- **さくら管理人室**（管理人室 / 400m南 / 09:00-18:00）= 受取時間外で低順位
- 残り4体 = 半径外で非表示

---

## 4. 再実行・リセット

- `demo_setup.sql` は冪等。再実行すると `DEMO-SPOT-0001` を `created` / 会社ID `d98697e6-...` / 代理人クリアへ巻き戻す。
- 代理人の改名・再配置も現行名/新名どちらでもマッチするため再実行安全。
- パスワードを再設定したい場合は `seed-demo-accounts.ts` を再実行（`updateUserById` で上書き）。

### 確認SQL（任意）
```sql
-- 荷物の初期状態
select tracking_no, status, delivery_company_id, assigned_agent_id
from public.parcels where tracking_no='DEMO-SPOT-0001';

-- delivery_matches に recipient ロールが agent_id に残っていないか（0 になるはず）
select count(*) filter (where p.role='recipient') as agent_is_recipient
from public.delivery_matches dm left join public.profiles p on p.id=dm.agent_id;

-- 候補の距離・スポット種別
select pr.full_name, ap.spot_type, ap.is_available_today,
       round(st_distance(ap.location,(select location from public.recipient_profiles
         where user_id='d4890a29-1251-4ff5-a4b6-3c75d910c76c'))) as dist_m
from public.agent_profiles ap join public.profiles pr on pr.id=ap.user_id
where pr.role='agent' order by dist_m;
```
