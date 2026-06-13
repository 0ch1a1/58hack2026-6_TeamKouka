# ShareKeep 統合 — 並列実行タスク計画

最終更新: 2026-06-13 / 作成: maki
方針の背景は [`integration-plan.md`](./integration-plan.md) を参照。
このドキュメントは **subagent に並列で振るための作業分割表**。

---

## 0. 進め方の全体像

```
[ STAGE A: 土台(直列・ブロッカー) ] ── 完了後 ──> [ STAGE B: 画面リワイヤ(並列) ] ──> [ STAGE C: 検証 ]
```

- **STAGE A が全並列タスクの前提**。ここが終わるまで STAGE B は始めない。
- STAGE B は **ファイル所有が重複しないよう分割済み** → そのまま並列で投げてよい。
- 各 subagent は必ず後述の **§2 共有契約（マッピング表）** に従うこと。ここがズレると統合が壊れる。

---

## 1. STAGE A: 土台（直列・1人で完結 / 一部着手済み）

> ⚠️ ここは並列にしない。共有ファイル（supabase.ts / database.types.ts / status.ts / features）を触るため。
> レビュー結果（subagent 2件）を反映し、**A0 / A8 をブロッカーとして追加**した。

| # | 内容 | 対象ファイル | 状態 |
| --- | --- | --- | --- |
| **A0** | **🔴 remote バックエンド実挙動の確認**（最重要ブロッカー） | Supabase `zbmrmblakoszzecdnptn` | ⬜ 未着手 |
| A1 | `.env` 作成（`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`） | `ShareKeep/.env` | ⬜ 未着手 |
| A2 | supabase client を堅牢版に差し替え（PUBLISHABLE_KEY / processLock / AppState） | `ShareKeep/lib/supabase.ts` | ⬜ 未着手 |
| A3 | バックエンド連携層を移植（database/sharekeep-app/features/ をコピー）＋ **`fetchMyParcels` に表示名 JOIN（`delivery_companies(name)`, `profiles!assigned_agent_id(full_name)`）を追加** | `ShareKeep/features/parcels.ts`, `auth.ts` | ⬜ 未着手 |
| A4 | `ParcelStatus` / `Role` をバックエンド基準に更新 ＋ **`Role`/`UserRole` の二重定義を単一化**（`database.types.ts` の `Role` を正とし features から re-export） | `ShareKeep/lib/database.types.ts`, `features/auth.ts` | ⬜ 未着手 |
| **A5** | **ステータス集約モジュール作成**。`toUIStatus`（§2-1）に加え、**DB status 定数と遷移判定ヘルパも集約**（B2/B3 は生 status を直接比較するため。例: `isStoredAtAgent(s)=s==='delivered_to_agent'`, `isHandedOff(s)=s==='handed_to_recipient'\|\|s==='completed'`） | `ShareKeep/lib/status.ts`（新規） | ⬜ 未着手 ＝ **B1/B2/B3 のブロッカー** |
| A6 | **`expo-location` を依存追加**。バージョンは手書きせず **`npx expo install expo-location`** で SDK56 互換版を入れる。B2 で確定使用 | `ShareKeep/package.json` | ⬜ 未着手（B2 のブロッカー） |
| A7 | `lib/supabase.ts` の旧ヘルパ整理。特に **lib版 `upsertAgentProfile` を rename/削除**（features 版と同名衝突 → B6 の取り違え防止）。`getDeliveryMatch` は B3 で当面使用のため残置 | `ShareKeep/lib/supabase.ts` | ⬜ 未着手 |
| **A8** | **設計は決定済み（実装未）**: B1=デモ用固定 delivery_company_id 定数化 / B2=expo-location 実機取得＋auto `match_nearby_agent` / B7 認証の role 経路（下記）。定数は `lib/config.ts` 等に集約 | `ShareKeep/lib/config.ts`（新規予定） | ⬜ 未着手（方針のみ確定） |

### A0 で remote 確認する項目（B 着手前の必須裏取り）
- `create_parcel(p_recipient_id, p_delivery_company_id)`: delivery_company_id は NULL 許容か / tracking_no は trigger 採番か
- `assign_agent_to_parcel` / `match_nearby_agent`: 実行後 status が `agent_assigned` まで自動で進むか
- `verify-agent-qr`: 成功時 `delivered_to_agent` に遷移するか
- `verify-recipient-qr`: 成功時 `handed_to_recipient` か `completed` か（§2-1 の遷移判定に直結）
- `profiles`: auth metadata トリガ自動生成か / `upsert_profile` 必須か / **RLS が直 insert を弾くか**（ShareKeep 現行 `lib/auth.ts:35` の直 insert が本番で失敗しないか）
- `qr_type` の許容値に `'agent'/'recipient'` があるか（`'driver'` は廃止）
- 上記 RPC/Edge Function が当該プロジェクトに deploy 済みか
- **デモ用 delivery_company の seed**: `list_delivery_companies` で既存IDを1件取得 or `create_delivery_company` で作成し、そのIDを A8 の定数に設定

**A0 → A4〜A8 を終わらせてから STAGE B を開始。**

### A0 裏取り結果（2026-06-13 完了 / CLI で live `zbmrmblakoszzecdnptn` を直接確認）

> 確定事実。各 subagent はこれを §2 契約と併せて参照すること。

- **RPC/Edge Function**: 計画記載は全て remote に存在。`verify_agent_qr`/`verify_recipient_qr` は **RPC＋Edge 両方**（Edge は同名 RPC の薄いラッパ、`verify_jwt=true`）。`generate_qr_token` は **RPC のみ**（戻り `text`）。`geocode-agent-address`/`delete-my-account` も Edge で ACTIVE。
- **create_parcel**: `(p_recipient_id, p_delivery_company_id) RETURNS parcels`。**delivery_company_id は実質必須**（存在しない/NULL は例外）。**tracking_no は trigger 採番**（`PK+YYYYMMDD+6桁`）＝渡さない。`auth.uid()<>recipient_id` は例外。
- **デモ用 delivery_company（A8 定数）**: 既存 seed 2件。**`d98697e6-e71d-463f-9d59-a706817db938`（"Test Delivery"）を採用**（新規作成不要）。
- **assign/match → agent_assigned**: 両者とも自動進行＋`delivery_matches` 行作成（assign=`'selected'` / match=`'matched'`）。**match は近傍0件で `null` 返し無反応**。**両者とも非冪等**（再呼び出しで行重複）→ B2 は多重呼び出しガード必須。`find_nearby_agents` デフォルト半径 **50m**・営業日/時間帯フィルタあり。
- **verify_agent_qr**: 成功時 `delivered_to_agent` に遷移。副作用は受取人通知のみ（ポイント/CO2なし）。agent 種別トークン必須。
- **verify_recipient_qr**: 成功時 **`completed` に直行**（`handed_to_recipient` は経由しない・実データ0件）。**ポイント+100（type=`proxy_delivery_complete`, 付与先=代理人）＋ CO2（retry_count×0.42kg を parcels.co2_saved_kg）を自動付与**。
- **profiles 作成**: **auth トリガ `handle_new_auth_user` が自動生成**（metadata の role/full_name/phone/company_name/employee_id を取り込み、role 既定=recipient）。RLS `profile_insert_own` は自分の行 insert を許可するが、**トリガが先に作るため直 insert は PK 重複で失敗の恐れ** → **`lib/auth.ts:35` の直 insert は廃止**し metadata 投入 or `upsertProfile`（conflict 更新）に寄せる。
- **qr_type**: 許容は **`'agent'`/`'recipient'` のみ**（`'driver'` 廃止）。`generate_qr_token` は `auth.uid()` 必須＋自分の荷物の自分用 QR のみ。
- **role enum** `user_role`: `'recipient'`/`'agent'`/`'delivery_company'` の3値（`'driver'` 不可）。
- **parcel_status enum**: §2-1 の7値と完全一致。`handed_to_recipient` は定義のみ（実フロー未使用）。
- **delivery_matches.status**: `text`・制約なし。実値は `'matched'`/`'selected'` の2種のみ。`ParcelStatus` ヘルパ流用禁止。
- **point_transactions**: `user_id`/`points`/`transaction_type`/`created_at` のみ、**`parcel_id` 無し**。RLS `auth.uid()=user_id`（自分の行のみ）。→ B4 は荷物単位の報酬特定不可＝「最新/累計」表示に。**報酬の受取は代理人**＝受取人画面 delivery-complete では自分の point 行は0件になりうる。
- **geocode-agent-address**: Nominatim に **単一住所文字列 `q=address`** を投げる。保存は `agent_profiles.location`（PostGIS geography）＋ `address`（display_name で上書き）/`address_detail`。→ B6 は **`郵便番号|住所|部屋` 連結のままだとジオコ失敗**。住所本体を `address`、部屋等を `addressDetail` に分離が必須。
- **delivered_to_agent への呼び口（B8）**: `update_parcel_status` RPC は `can_access_parcel`（assigned_agent も許可）で **`updateParcelStatus(parcelId,'delivered_to_agent')` 可**（副作用なし）。ポイント/CO2 は後段 `verify_recipient_qr`（completed）で付くため B8 で updateParcelStatus を使っても報酬計算は壊れない。
- **🔴→✅ Realtime publication**: 当初 `supabase_realtime` は **メンバー0件**で `subscribeParcel` が一切発火しない状態だった。**2026-06-13 に `alter publication supabase_realtime add table public.parcels, public.delivery_matches` を適用済み**（現メンバー: `parcels, delivery_matches`）。→ B2/B3 の realtime 前提は成立。

---

## 2. 共有契約（全 subagent 必読・ここが唯一の正）

### 2-1. ParcelStatus（DB=正） → UI 表示ステータス変換

`lib/status.ts` に実装。受取人リストは 3 状態（waiting / stored / completed）。

| DB status (正) | UI status | ラベル | 意味 |
| --- | --- | --- | --- |
| `created` | `waiting` | 配達待ち | 登録直後 |
| `out_for_delivery` | `waiting` | 配達待ち | 配送中 |
| `delivery_failed` | `waiting` | 再配達待ち | 不在等 |
| `agent_assigned` | `waiting` | 代理人手配済み | 代理人決定・まだ預かり前 |
| `delivered_to_agent` | `stored` | 保管中 | **代理人が保管中＝受取人は取りに行ける** |
| `handed_to_recipient` | `completed` | 受取完了 | 引き渡し済み |
| `completed` | `completed` | 受取完了 | 完了 |

```ts
// lib/status.ts (実装イメージ)
import type { ParcelStatus } from './database.types';
export type UIStatus = 'waiting' | 'stored' | 'completed';
export function toUIStatus(s: ParcelStatus | string | null): UIStatus {
  if (s === 'completed' || s === 'handed_to_recipient') return 'completed';
  if (s === 'delivered_to_agent') return 'stored';
  return 'waiting';
}
export const UI_STATUS_LABEL: Record<UIStatus, string> = {
  waiting: '配達待ち', stored: '保管中', completed: '受取完了',
};
```

### 2-2. QR種別マッピング（ShareKeep 旧 → バックエンド正）

| ShareKeep 旧 (qr_type) | バックエンド正 (qrType) | 用途 | 使う関数 |
| --- | --- | --- | --- |
| `'driver'`（配達員用QR） | `'agent'` | 代理人が配達員に提示→受領確定 | 生成 `generateQrToken({qrType:'agent'})` / 検証 `verifyAgentQr(token)` |
| `'recipient'`（引き渡し確認QR） | `'recipient'` | 受取人が代理人に提示→引き渡し確定 | 生成 `generateQrToken({qrType:'recipient'})` / 検証 `verifyRecipientQr(token)` |

> 重要: ShareKeep 各画面の `supabase.from('qr_tokens')...` 直叩き（生成/検証/used更新）は **すべて廃止**し、
> `generateQrToken` / `verifyAgentQr` / `verifyRecipientQr`（Edge Function）に置換する。
> 検証 Edge Function 側が「used 更新・ステータス遷移・ポイント/CO2 付与」をトランザクションで処理する想定。

### 2-3. Role マッピング

| ShareKeep 旧 | バックエンド正 |
| --- | --- |
| `'driver'` | `'delivery_company'` |
| `'recipient'` | `'recipient'` |
| `'agent'` | `'agent'` |

### 2-4. ステータス遷移（誰がどの関数で進めるか）

```
created ──(recipient: matchNearbyAgent / assignAgentToParcel)──> agent_assigned
agent_assigned ──(配達員→代理人 受け渡し: 代理人がagentQR提示→verifyAgentQr)──> delivered_to_agent
delivered_to_agent ──(受取人→代理人 引き渡し: 受取人がrecipientQR提示→verifyRecipientQr)──> handed_to_recipient / completed
```

### 2-5. features の主要関数（`ShareKeep/features/parcels.ts` / `auth.ts`）

- 受取人: `createParcel` / `fetchMyParcels` / `subscribeParcel` / `matchNearbyAgent` / `findNearbyAgents` / `assignAgentToParcel`
- QR: `generateQrToken` / `verifyAgentQr` / `verifyRecipientQr`
- 代理人: `upsertAgentProfile` / `geocodeAgentAddress` / `getAgentLocations` / `recordAgentDeliveryCompletion`
- 通知/ポイント: `fetchMyNotifications` / `markNotificationRead` / `consumeAgentPoints`
- 認証: `signUpRecipient` / `signIn` / `signOut` / `getProfile` / `upsertProfile` / `getErrorMessage`

---

## 3. STAGE B: 画面リワイヤ（並列タスク・ファイル所有重複なし）

各タスクは独立ファイルを所有するため **同時に subagent へ投げてOK**。
共通ルール: **UI/レイアウト/スタイルは変更しない。データ取得・更新のロジックのみ features 呼び出しに差し替える。** `toUIStatus`（A5）を使う。

> ⚠️ 共有ファイルを編集する **B7（認証）と B5（agent/complete 新規）以外は、`lib/` を編集しないこと**。型の追加が要る場合は STAGE A 担当へ依頼（並列で lib を触らない）。

### B1. 受取人 — 荷物一覧 ⚠️ A0/A8 確定後に着手
- 所有: `app/(app)/recipient/packages.tsx`
- 変更: 直 `from('parcels').select(...)` → `fetchMyParcels(user.id)` / 直 `insert({status:'pending'})` → `createParcel({recipientId, deliveryCompanyId})`
- **【決定】deliveryCompanyId は A8 の「デモ用固定ID定数」を使う**（`lib/config.ts` 等から import）。`create_parcel` は **tracking_no を受け取らない（サーバ採番）**点に注意 — 登録モーダルの「伝票番号入力」は create_parcel に渡さない。伝票番号UIの扱い（残す/隠す）はデモ方針に合わせ最小変更で。
- ステータス表示は A5 の `toUIStatus`。pickup-ready/matching への遷移判定も A5 のヘルパ（`isStoredAtAgent` 等）を使い、`'stored'` ハードコードを排除
- realtime は `subscribeParcel` か既存 channel 維持可

### B2. 受取人 — マッチング中 ⚠️「純リワイヤ」ではなく新規実装。A6 確定後に着手
- 所有: `app/(app)/recipient/matching.tsx`
- **現状は RPC を呼ばず realtime 待ちのみ → マッチング呼び出しを新規追加する**
- **【決定】方式 = expo-location 実機取得 ＋ auto `match_nearby_agent`**: マウント時に位置取得（A6 の expo-location、権限処理込み）→ `matchNearbyAgent({parcelId, lat, lng})` を能動呼び出し → `subscribeParcel` で status が `delivered_to_agent`（A5 `isStoredAtAgent`）になったら `pickup-ready` へ遷移。現状の `payload.new.status === 'stored'` 判定を新ステータスに修正
- 位置情報の権限拒否時のUI（フォールバック表示）も最小実装

### B3. 受取人 — 受取準備（保管中）
- 所有: `app/(app)/recipient/pickup-ready.tsx`
- 変更: 代理人情報取得（`getDeliveryMatch` / agent_profiles）は当面維持可。**引き渡し確認QRは `generateQrToken({parcelId, userId, qrType:'recipient'})` に置換**（`from('qr_tokens')` 直 select 廃止）。`subscribeParcel` で `completed` 検知→`delivery-complete` へ遷移を追加すると尚良

### B4. 受取人 — 引き渡し完了
- 所有: `app/(app)/recipient/delivery-complete.tsx`
- 変更: parcel の `tracking_no`/`co2_saved_kg` は `fetchMyParcels` or 単体取得に寄せる。ポイントは `point_transactions` 直叩き維持でも可（features に専用関数なし → §4）
- **🐛 既存バグ修正**: 現状 `point_transactions` を `transaction_type='delivery_complete'` で**全ユーザー横断の最新1件**取得（`delivery-complete.tsx:37-43`、user_id フィルタ無し）。他人のポイントを表示しうる → user_id フィルタ追加（RLS が無い前提なら必須）

### B5. 代理人 — 請負リスト（QRハンドシェイクの中核）
- 所有: `app/(app)/agent/parcels.tsx` ＋ **新規 `app/(app)/agent/complete.tsx`**
- 変更:
  - 「配達員用QR」: `from('qr_tokens')` 直 select 廃止 → `generateQrToken({parcelId, userId, qrType:'agent'})`
  - 「受取人QRスキャン」: スキャン後の `from('qr_tokens')`/`from('parcels')`/`from('delivery_matches')` 手動 update を **全廃** → `verifyRecipientQr(scannedToken)` 1 本に置換
  - 成功後の遷移先 `/(app)/agent/complete` が **未実装** → 新規作成（delivery-complete を流用した代理人向け完了画面）
- 注意: `delivery_matches` 一覧取得は当面直叩き維持可（features に「自分の請負一覧」関数が無い → §4）

### B6. 代理人 — プロファイル
- 所有: `app/(app)/agent/profile.tsx`
- 変更: 直 `from('agent_profiles').upsert(...)` → **`geocodeAgentAddress({userId, address, addressDetail, availableDays, startTime, endTime})`**（住所→緯度経度はサーバ側 Edge Function に任せる＝ lat/lng を端末で持たなくて済む）。緊急連絡先の `profiles.update(phone)` は `upsertProfile` に寄せる
- 注意: 現状 address を `'郵便番号|住所|部屋'` の `|` 連結で保存。バックエンドの想定フォーマットと一致するか §4 で確認

### B7. 認証クラスタ（lib/auth.ts を共有するため1タスクに集約）⚠️ A0 確定後に着手
- 所有: `lib/auth.ts` ＋ `app/(auth)/sign-in.tsx` / `sign-up.tsx` / `sign-in-driver.tsx` / `sign-up-driver.tsx`
- **前提（レビュー H1）**: features の `signUpRecipient` は role を `'recipient'` 固定。**agent / delivery_company を作る関数が無い**。さらに ShareKeep は **role でルーティングせず**、受取/代理は `(app)/index.tsx` のローカル mode トグルで切替（DB role を読む箇所はゼロ）。
- **role 経路の方針（要 A0 裏取り後に最終確定）**:
  - 受取人登録 = `signUpRecipient`（role=recipient のまま）。代理人は別 role を作らず「recipient が代理モードも使う」現行設計を踏襲（mode トグル）。
  - 配達員登録(`sign-up-driver`) = role `delivery_company` が必要 → features に汎用 signup が無いため、`auth.signUp({options.data:{role:'delivery_company', ...}})` ＋ `upsertProfile({role:'delivery_company', companyName, employeeId})` で実装。
- 変更:
  - `lib/auth.ts` の `signUpWithProfile` を上記方針で features ベースに再実装。**直 `from('profiles').insert`（`lib/auth.ts:35`）は RLS 失敗の恐れ → A0 の裏取り結果に従い廃止 or 維持を判断**
  - sign-in 系: `signIn(email, password)` に統一
  - `sign-up-driver.tsx`: role を **`'driver'` → `'delivery_company'`** に変更

---

## 4. 確認事項

### 4-1. 決定済み（ユーザー判断ずみ）
- ✅ **B1 deliveryCompanyId**: **デモ用固定 delivery_company_id を定数化**して使う（A8）。配送会社選択UIは作らない。
- ✅ **B2 位置情報/マッチ方式**: **`expo-location`(A6) 実機取得 ＋ auto `match_nearby_agent`**。
- ✅ **B5 agent/complete 新規画面**: 今回スコープ外（一旦保留）。`agent/parcels.tsx:137` の `/(app)/agent/complete` 遷移は dangling のまま残置 or 暫定で `delivery-complete` 等へ仮遷移。

### 4-2. A0 で remote 裏取りが必要（B 着手前のブロッカー / §1 の A0 に集約）
- [ ] **profiles の作成経路**（auth metadata トリガ vs `upsert_profile` RPC vs 直 insert）と **RLS が直 insert を弾くか**。← B7 の実装方針が変わる最重要点
- [ ] **RPC / Edge Functions のデプロイ確認**: `create_parcel` / `match_nearby_agent` / `assign_agent_to_parcel` / `verify-agent-qr` / `verify-recipient-qr` / `geocode-agent-address` が `zbmrmblakoszzecdnptn` に存在するか。
- [ ] **ステータス遷移の実挙動**: `assign/match → agent_assigned` 自動進行か / `verify-recipient-qr` 成功時が `handed_to_recipient` か `completed` か（§2-1 の遷移判定に直結）。
- [ ] **デモ用 delivery_company の seed**: `list_delivery_companies` で既存ID取得 or `create_delivery_company` で作成し A8 定数に設定。

### 4-3. B 着手後でも対応可（当面ワークアラウンドで進める）
- [ ] **B5(保留)/B6: features に「代理人の請負一覧取得」関数が無い** → 当面 `delivery_matches` 直叩き維持で進める。
- [ ] **B6: agent_profiles の住所フォーマット** `'郵便番号|住所|部屋'` 連結が `geocodeAgentAddress` の想定と合うか（合わなければ B6 内で整形）。

---

## 5. STAGE C: 検証（B 完了後・直列）

- [ ] 型チェック: `cd ShareKeep && npx tsc --noEmit`（旧 enum 参照の取りこぼし検出）
- [ ] 旧直叩き/旧定数の残存チェック（**パターン拡張・対象に lib も含める**）:
  ```sh
  grep -rnE "from\('(parcels|qr_tokens|delivery_matches|agent_profiles|profiles|point_transactions)'\)|'pending'|'waiting'|'matched'|'stored'|'delivering'|'driver'|getDeliveryMatch|getParcels|getAgentProfile" ShareKeep/app ShareKeep/lib
  ```
  - 旧ヘルパ（`getDeliveryMatch` 等）が残る場合は意図的残置か確認。lib版 `upsertAgentProfile` の参照が features 版と取り違えていないか確認（A7）。
- [ ] E2E: 受取人 登録→マッチング→保管→QR引き渡し→完了 / 代理人 プロファイル→請負→agentQR→受取人QRスキャン
- [ ] `database/` フォルダを削除 or `archive/` 退避、CLAUDE.md 更新

---

## 6. 並列割り当ての推奨

> レビュー反映: **7並列を一斉に投げるのは時期尚早**。土台と設計確定を先行させ、安全なものから波状に投入する。

| 波 | 同時実行タスク | 備考 |
| --- | --- | --- |
| **Wave 0a** | **A0**（remote 裏取り） | 🔴 最優先・単独。これ無しに B は始めない |
| Wave 0b | A4(型単一化) / A5(status集約) / A6(expo-location) / A7(lib整理) / A8(定数化) | A0 後に直列気味に。すべて lib/ ＝ 1人で順に処理 |
| **Wave 1** | **B3 / B4 / B6 を並列**（比較的安全・設計依存が小） | ファイル所有排他。各 subagent に §2 契約を渡す |
| **Wave 2** | **B1 / B2 / B7 を投入**（A8/A0 の設計確定が前提） | B1=固定ID, B2=expo-location+auto, B7=role経路 を確定後に再定義して投入 |
| Wave 3 | STAGE C 検証 | 直列。tsc と §5 の拡張 grep を回す |

> ※ B5（agent/complete）は今回スコープ外。
> 各 subagent へのプロンプトには「§2 共有契約」＋「担当タスクの所有ファイル＋変更内容」＋（B1/B2/B7 は §4-1 の決定事項）を渡せば自己完結する。
> **lib/ は STAGE A 担当のみが触る**こと（B タスクは lib を編集しない。型追加が要るなら A 担当へ集約）。

---

## 7. クロスレビュー結果（codex + subagent ×2）と計画修正

レビュー総合判定: **このまま STAGE B 並列は不可。** A0/A5/A8 完了＋下記の動線の穴を解消してから、まず B4/B6 程度に限定して並列化するのが妥当。
以下は両レビューが一致 or codex が新規発見した重大事項と、計画への反映。

### 7-1. 🔴 動線の穴（最重要・要・方針決定）
- **[未解決の最重要] 受取人フローが `delivered_to_agent` で詰まる**。`created → agent_assigned`（B2 のマッチ）までは進むが、`agent_assigned → delivered_to_agent` は **「配達員が代理人の agentQR をスキャン → `verifyAgentQr`」で起こる想定**。だが ShareKeep に**配達員が agentQR をスキャンする画面が無い**（agent/parcels は agentQR を「提示」するだけ、スキャンするのは別主体）。→ matching → pickup-ready が成立しない。
  - 対応案: ①配達員用スキャン画面を追加（スコープ拡大）/ ②代理人画面に「配達員から受領」ボタンを足し自分で `verifyAgentQr` 相当を呼ぶ / ③デモは status を手動/外部で進める前提と明記。**→ §8 で要決定。**
- **[B5 スコープ矛盾]** §3 B5 は `agent/complete.tsx` 新規作成を所有に含むが、§4-1 で「B5 スコープ外」。矛盾。→ **B5 はスコープ外で確定**し、`agent/parcels.tsx:137` の `/(app)/agent/complete` 遷移は暫定で既存画面へ差すか dangling 明記。Stage C に「route 存在チェック」を追加。

### 7-2. 🟠 STAGE A 担当に追加で寄せる作業（B の前にやる）
- **[A3拡張] `fetchMyParcels` が表示名(配送会社名・代理人名)を返さない**。現 `packages.tsx` は JOIN で会社名/代理人名を表示。features 版は ID のみ。→ **A 段階で `fetchMyParcels` の select に JOIN を追加**（features を A 担当が拡張）。さもないと B1 が features を触り並列所有が崩れる。
- **[A0拡張] 裏取り項目を追加**: `generate_qr_token` の戻り値型(string?) / Edge Function の戻り形(`{success,error}`) と JWT/認可条件 / **Realtime publication が `parcels`・`delivery_matches` で有効か** / `match_nearby_agent` が `delivery_matches` 行を作るか・**冪等か(既割当parcelへの再呼び出し挙動)** / `delivery_matches.status` の値集合 / `point_transactions` の user_id/transaction_type/parcel_id 有無 / `geocode-agent-address` の保存カラム実体。
- **[A5拡張] `isHandedOff(s)=s==='handed_to_recipient'||s==='completed'` を必須提供**。B3 の完了遷移（pickup-ready → delivery-complete）は「尚良」ではなく **E2E 必須**（他に受取人を完了画面へ進める契機が無い）。
- **[A5注記] `delivery_matches.status`（matched/storing/delivering 等）は別 enum。`ParcelStatus` 用ヘルパを適用しない**こと。必要なら `DeliveryMatchStatus` を別途定義。

### 7-3. 🟠 タスク順序・所有の修正
- **[B3↔B6 依存] 住所フォーマットの契約衝突**。B6 は `geocodeAgentAddress(address, addressDetail)` に寄せる一方、B3 は `agent_profiles.address` を `郵便番号|住所|部屋` で split 維持 → **B3 は B6 の保存形式に依存。並列不可、B6→B3 の順**にする（Wave 分割を見直し）。
- **[B1] `packages.tsx` のローカル `UIStatus`/`toUIStatus` を削除して A5 から import**（二重定義回避）。`agent_assigned` も `waiting` に潰れるため、**手配済みの荷物タップで matching に再入→`matchNearbyAgent` 多重呼び出し**しないようガード（A0 の冪等性確認とセット）。
- **[B4] point_transactions に `parcel_id` が無い**（型上）。user_id フィルタだけでは「この荷物の報酬」を保証できない → A0 の生成仕様確認後、parcel_id 付き取得を features に足すか、表示を「最新報酬」に落とすか決める。

### 7-4. 🟢 検証(STAGE C)強化
- B5 スコープ外により `agent/parcels.tsx` に旧 `'driver'`/`qr_tokens`直叩き/手動 status update が**意図的に残る** → §5 grep は **agent 系を除外 or 「既知の残存」と注記**（誤検出防止）。
- grep 追加パターン: `rg -n "supabase\.auth|from\([\"']|agent/complete|payload\.new\.status|ParcelStatus \| string" ShareKeep`、ダブルクォート `.from("...")`、dangling route、`delivery_matches.status` と旧 UI status の区別。
- **[棚卸し精度]** `lib/supabase.ts` の実消費は `getDeliveryMatch` のみ。`getParcels`/`getAgentProfile`/lib版`upsertAgentProfile`/`getProfile`/`getCurrentUser` は **dead code** → A7 は「未使用5関数を一括削除、`getDeliveryMatch` のみ残置」と確定。

### 7-5. 修正後の推奨 Wave（更新）
| 波 | タスク | 前提 |
| --- | --- | --- |
| Wave 0a | A0（拡張版・§7-2） | 最優先・単独 |
| Wave 0b | A3拡張(fetchMyParcels JOIN) / A4 / A5(isHandedOff含む) / A6(expo install) / A7 / A8 | A0 後・lib は1人 |
| Wave 1 | **B4 / B6 / B8 を並列**（B3 は B6 依存のため外す。B8=代理人受領ボタン） | A0/A5/A8 完了後 |
| Wave 1.5 | **B3**（B6 の住所保存形式確定後） | B6 完了後 |
| Wave 2 | B1 / B2 / B7 | A0/A8 決定後（agentQR 経路は §8-1 で確定済み） |
| Wave 3 | STAGE C 検証（§7-4 強化版） | 直列。受取人 E2E は B2+B8+B3 が揃って完走 |

## 8. 要・方針決定

### 8-1. 決定済み
- ✅ **agentQR 経路（§7-1）= 代理人画面に「受領」ボタンを追加**。`agent/parcels.tsx` に「配達員から受領」ボタンを置き、代理人自身が `agent_assigned → delivered_to_agent` を進める。配達員スキャン画面は作らない。
  - → 下記 **B8（最小タスク）** として新設。`agent/parcels.tsx` の **このボタン追加のみ**を扱い、agent 画面の全面リワイヤ（B5）はスコープ外のまま。
  - 進め方: 「受領」押下で `updateParcelStatus(parcelId, 'delivered_to_agent')`（最小）。サーバ側で CO2/ポイント等の副作用が `verify-agent-qr` に紐づくなら `verifyAgentQr` 経由が要るため、**A0 で `delivered_to_agent` 遷移の正しい呼び口（updateParcelStatus 可否 / verifyAgentQr 必須か）を確認**してから B8 実装。

### B8. 代理人 — 「受領」ボタン（最小・E2E 完走用）
- 所有: `app/(app)/agent/parcels.tsx`（**B5 とは別。B8 はこのボタン追加に限定**。既存の qr_tokens 直叩き等 B5 範囲は触らない）
- 変更: 各請負カードに「配達員から受領」ボタンを追加 → `updateParcelStatus(parcelId,'delivered_to_agent')`（A0 の確認次第で `verifyAgentQr`）。これで受取人側 matching(B2) の `subscribeParcel` が発火 → pickup-ready(B3) へ進む
- 注意: B8 と B5（スコープ外）が同一ファイルのため、**将来 B5 を実施する際は B8 の変更を取り込む**前提（今は B8 のみ）

### 8-2. 未決定（デモ前に合意）
- [ ] **配達員(delivery_company)ログイン後の行き先**（現状 mode トグルに受取/代理しか無く配達員画面が無い）。デモで配達員ロールを使うか。今回の受取人/代理人フロー（B8 で完走）だけでデモするなら配達員ログインは不要。
