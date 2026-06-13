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

| # | 内容 | 対象ファイル | 状態 |
| --- | --- | --- | --- |
| A1 | `.env` 作成（`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`） | `ShareKeep/.env` | ✅ 着手済み |
| A2 | supabase client を堅牢版に差し替え（PUBLISHABLE_KEY / processLock / AppState） | `ShareKeep/lib/supabase.ts` | ✅ 着手済み |
| A3 | バックエンド連携層を移植 | `ShareKeep/features/parcels.ts`, `auth.ts` | ✅ 着手済み（コピーのみ） |
| A4 | `ParcelStatus` / `Role` をバックエンド基準に更新 | `ShareKeep/lib/database.types.ts` | ✅ 着手済み |
| **A5** | **UI ステータス変換を集約する新モジュール作成**（§2-1 の表を実装） | `ShareKeep/lib/status.ts`（新規） | ⬜ 未着手 ＝ **STAGE B のブロッカー** |
| A6 | `expo-location` を依存追加（matching で使用予定） | `ShareKeep/package.json` | ⬜ 未着手（§4 の判断次第） |
| A7 | `lib/supabase.ts` の旧ヘルパ（getParcels/getDeliveryMatch 等）の扱い整理（残置 or features へ寄せる） | `ShareKeep/lib/supabase.ts` | ⬜ 未着手（残置でも可。B 完了後に未使用なら削除） |

**A5 を最優先で終わらせること。** 完了の合図をもって STAGE B を一斉スタート。

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

### B1. 受取人 — 荷物一覧
- 所有: `app/(app)/recipient/packages.tsx`
- 変更: 直 `from('parcels').select(...)` → `fetchMyParcels(user.id)` / 直 `insert({status:'pending'})` → `createParcel({recipientId, deliveryCompanyId})`
- `toUIStatus` でステータス表示。realtime は `subscribeParcel` か既存 channel 維持可
- 注意: `createParcel` は `deliveryCompanyId` 必須。登録モーダルの「伝票番号入力」だけでは足りない → §4 の確認事項

### B2. 受取人 — マッチング中
- 所有: `app/(app)/recipient/matching.tsx`
- 変更: マウント時に `matchNearbyAgent({parcelId, lat, lng})` を能動呼び出し（位置情報は expo-location / A6）。`subscribeParcel` で `delivered_to_agent` になったら `pickup-ready` へ遷移（現状の `'stored'` 判定を新ステータスに修正）
- 注意: 位置取得方式は §4 の確認事項

### B3. 受取人 — 受取準備（保管中）
- 所有: `app/(app)/recipient/pickup-ready.tsx`
- 変更: 代理人情報取得（`getDeliveryMatch` / agent_profiles）は当面維持可。**引き渡し確認QRは `generateQrToken({parcelId, userId, qrType:'recipient'})` に置換**（`from('qr_tokens')` 直 select 廃止）。`subscribeParcel` で `completed` 検知→`delivery-complete` へ遷移を追加すると尚良

### B4. 受取人 — 引き渡し完了
- 所有: `app/(app)/recipient/delivery-complete.tsx`
- 変更: parcel の `tracking_no`/`co2_saved_kg` は `fetchMyParcels` or 単体取得に寄せる。ポイントは `point_transactions` 直叩き維持でも可（features に専用関数なし → §4）

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

### B7. 認証クラスタ（lib/auth.ts を共有するため1タスクに集約）
- 所有: `lib/auth.ts` ＋ `app/(auth)/sign-in.tsx` / `sign-up.tsx` / `sign-in-driver.tsx` / `sign-up-driver.tsx`
- 変更:
  - `lib/auth.ts` の `signUpWithProfile` を features ベースに再実装（`auth.signUp` の metadata に role/full_name/phone/company_name/employee_id を載せ、必要なら `upsertProfile` RPC）。**直 `from('profiles').insert` は RLS で失敗の恐れ → 廃止**
  - sign-in 系: `signIn(email, password)` に統一（直 `auth.signInWithPassword` でも可だが features に寄せると一貫）
  - `sign-up-driver.tsx`: role を **`'driver'` → `'delivery_company'`** に変更
- 注意: profiles がトリガ自動生成か RPC 経由か、バックエンドの実装に合わせる（§4）

---

## 4. 確認事項（実装前にチームで握る・各 subagent への前提）

- [ ] **B1: `createParcel` の `deliveryCompanyId`**。受取人の荷物登録に配送会社IDが要る。UI は伝票番号のみ。
      → 配送会社選択 UI を足すか、デフォルト会社IDを使うか、登録フロー自体を見直すか。
- [ ] **B2: 位置情報の取得方法**。`matchNearbyAgent` は recipient の lat/lng が必要。
      → `expo-location`(A6) で実機取得 / デモ用固定座標 / 別画面でマッチングをトリガ、のどれか。
- [ ] **B5/B6: features に「代理人の請負一覧取得」関数が無い**。当面 `delivery_matches` 直叩き維持で進めるか、features に追加するか。
- [ ] **B6: agent_profiles の住所フォーマット**。`'郵便番号|住所|部屋'` 連結が `geocodeAgentAddress` の想定と合うか。
- [ ] **認証(B7): profiles の作成経路**（auth metadata トリガ vs `upsert_profile` RPC vs 直 insert）。バックエンドの真の挙動を確認。
- [ ] **RPC / Edge Functions のデプロイ確認**: `match_nearby_agent` / `verify-agent-qr` / `verify-recipient-qr` / `geocode-agent-address` が対象プロジェクト（`zbmrmblakoszzecdnptn`）に存在するか。
- [ ] **ステータス遷移のトリガ主体**: `agent_assigned → delivered_to_agent` を agentQR 検証で起こす設計でよいか（§2-4）。

---

## 5. STAGE C: 検証（B 完了後・直列）

- [ ] 型チェック: `cd ShareKeep && npx tsc --noEmit`（旧 enum 参照の取りこぼし検出）
- [ ] 旧直叩きの残存チェック: `grep -rn "from('parcels')\|from('qr_tokens')\|from('delivery_matches')\|'pending'\|'stored'\|'driver'" ShareKeep/app`
- [ ] E2E: 受取人 登録→マッチング→保管→QR引き渡し→完了 / 代理人 プロファイル→請負→agentQR→受取人QRスキャン
- [ ] `database/` フォルダを削除 or `archive/` 退避、CLAUDE.md 更新

---

## 6. 並列割り当ての推奨

| 波 | 同時実行タスク | 備考 |
| --- | --- | --- |
| Wave 0 | A5（+ 必要なら A6/A7） | ブロッカー。最優先で単独実行 |
| Wave 1 | B1 / B2 / B3 / B4 / B5 / B6 / B7 を並列 | ファイル所有が排他なので 7 並列可。各 subagent に §2 契約を必ず渡す |
| Wave 2 | STAGE C 検証 | 直列。tsc とリワイヤ残存 grep を回す |

> 各 subagent へのプロンプトには「§2 共有契約」と「担当タスクの所有ファイル＋変更内容」だけ渡せば自己完結する。
> lib/ を複数 subagent が同時に触らないことだけ厳守（型追加が要るなら A 担当へ集約）。
