# ShareKeep バックエンド統合 対応方針

最終更新: 2026-06-13 / 作成: maki

## 0. ゴール

`database/sharekeep-app`（仮フロント + 本物のバックエンド連携層）と
`ShareKeep`（真のフロントエンド）を統合し、
**「真フロント（ShareKeep）の見た目・画面遷移」を保ったまま、データ層を `database` 側の本物のバックエンド連携に載せ替える。**

結論を先に書くと:

> **ShareKeep をベースにする。`database/sharekeep-app/features/` のバックエンド連携層を ShareKeep に移植し、ShareKeep 各画面の `supabase.from(...)` 直叩きを features 関数の呼び出しに置き換える。** あわせてステータス enum / role 型 / 環境変数名の不整合を解消する。

---

## 1. 現状把握

### 1-1. ShareKeep（= 真フロント・採用側）

| 項目 | 内容 |
| --- | --- |
| Expo / RN | Expo **56** / RN 0.85.3 / React 19.2.3（新しい） |
| ルーティング | **expo-router**（ファイルベース。`app/(auth)`, `app/(app)/recipient`, `app/(app)/agent`） |
| UI | 共有UI基盤あり（`components/ui`: Card/ScreenHeader/InfoRow/PrimaryButton/StatusBadge、`components/auth`、3D の `TreeScene`） |
| 型 | `lib/database.types.ts` あり |
| **データ層** | **`supabase.from(...)` 直叩き**（`parcels` を直接 insert/select、`agent_profiles` upsert など）。サーバ側ロジックを通らない素朴な実装 |
| supabase client | `EXPO_PUBLIC_SUPABASE_ANON_KEY` を使用 |
| `.env` | **無し**（要追加） |

主要画面（直叩き箇所）:
- `app/(app)/recipient/packages.tsx` … `parcels` を直接 select / insert（`status: 'pending'`）
- `app/(app)/recipient/matching.tsx`, `pickup-ready.tsx`, `delivery-complete.tsx`
- `app/(app)/agent/parcels.tsx` … `qr_tokens` / `parcels` / `delivery_matches` を直接操作
- `app/(app)/agent/profile.tsx` … `agent_profiles` / `profiles` を直接 upsert
- `app/(auth)/sign-in.tsx`, `sign-in-driver.tsx`, `lib/auth.ts` … 認証は `supabase.auth` 直叩き + `profiles` 直 insert

### 1-2. database/sharekeep-app（= 仮フロント・バックエンド供給側）

| 項目 | 内容 |
| --- | --- |
| Expo / RN | Expo **54** / RN 0.81.5 / React 19.1.0（古い） |
| ルーティング | expo-router 無し。単一 `App.tsx` + タブ state（使い捨て） |
| UI | 最低限の確認用画面（AgentScreen/AuthScreen/ParcelDetailScreen/QrScanScreen/HomeScreen） |
| **データ層** | **本物**。`features/parcels.ts` / `features/auth.ts` が **RPC + Edge Functions** で実装済み |
| supabase client | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を使用 / `processLock` / AppState の autoRefresh 制御あり |

`features/parcels.ts` が提供する本物の連携（= 移植対象の中核）:
- RPC: `create_parcel` / `update_parcel_status` / `generate_qr_token` / `find_nearby_agents` /
  `match_nearby_agent` / `assign_agent_to_parcel` / `upsert_agent_profile` /
  `consume_agent_points` / `get_agent_locations` / `mark_notification_read` /
  `record_agent_delivery_completion` / delivery_companies CRUD / `get_profile` / `upsert_profile` / `delete_profile`
- Edge Functions: `verify-agent-qr` / `verify-recipient-qr` / `geocode-agent-address` / `delete-my-account`
- Realtime: `subscribeParcel`
- 型: `Parcel` / `ParcelStatus` / `NearbyAgent` / `AppNotification`

---

## 2. 統合方針（どっちに寄せるか）

- **フロント基盤 = ShareKeep を採用**（expo-router・共有UI・新しい Expo 56）。
- **データ層 = database 側の `features/` を採用**（RPC/Edge Function 経由が「正」。直叩きは破棄）。
- `database/sharekeep-app` の UI（App.tsx / screens / QrTokenView）は原則破棄。
  ただし **QR 周り（`QrTokenView`, `QrScanScreen` のロジック）は ShareKeep に同等画面が薄いため、移植時の参照元として残す**。

---

## 3. 本質的な不整合（統合前に必ず潰す）

これがこの統合の山場。型の差ではなく**バックエンドとの契約の差**なので、合わせ先は必ず `database`（=正）側。

### 3-1. ParcelStatus enum が完全に別物 ⚠️ 最重要
- ShareKeep: `pending | waiting | matched | stored | delivering | completed`
- database(正): `created | out_for_delivery | delivery_failed | agent_assigned | delivered_to_agent | handed_to_recipient | completed`
- 対応: **database 側の enum を正とする。** ShareKeep の `database.types.ts` を更新し、
  各画面の UI 表示用ステータス（`waiting/stored/completed` 等）への変換は `toUIStatus()` のような
  **マッピング関数に集約**する（DB値→表示値の対応表を 1 箇所で管理）。

### 3-2. Role 型の差
- ShareKeep: `recipient | agent | driver`
- database(正): `recipient | agent | delivery_company`
- 対応: `delivery_company` に統一。`sign-in-driver.tsx` 等の「driver」表記を `delivery_company` に揃える。

### 3-3. 書き込み経路の差（直叩き → RPC）
- ShareKeep の `parcels` 直 insert（`packages.tsx`）は、サーバ側の tracking_no 採番 / CO2 計算 /
  通知生成などを**バイパスしてしまう恐れ**。`create_parcel` RPC に置換する。
- `agent_profiles` の直 upsert も `upsert_agent_profile` / `geocode-agent-address` に置換。

### 3-4. 環境変数名の差
- ShareKeep: `EXPO_PUBLIC_SUPABASE_ANON_KEY` / database: `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- 対応: **`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` に統一**（database 側 client 実装が完成度高いため）。
  ShareKeep に `.env` を新規作成（`database/.env` の値を流用、Supabase プロジェクトは同一: `zbmrmblakoszzecdnptn`）。

### 3-5. supabase client 実装の差
- database 側 client は `processLock` + AppState autoRefresh 制御ありで堅牢。
- 対応: **ShareKeep の `lib/supabase.ts` を database 版で置き換える**（env 変数名も合わせて統一）。

### 3-6. Expo SDK バージョン差
- ShareKeep 56 / database 54。**ShareKeep(56) に揃える。**
- `features/` は素の TypeScript + `@supabase/supabase-js` のみ依存なので SDK 非依存 → 移植は容易。
  QR 画面を移植する場合のみ `expo-camera` / `react-native-qrcode-svg` のバージョン整合を確認。

---

## 4. 作業ステップ

### Phase 0: 準備
1. ブランチ作成（例: `feat/integrate-backend`）。
2. ShareKeep に `.env` 作成（`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`）。`.gitignore` 確認。
3. ShareKeep の `lib/supabase.ts` を database 版に差し替え（env 変数名統一）。

### Phase 1: バックエンド連携層の移植
4. `database/sharekeep-app/features/parcels.ts` と `features/auth.ts` を `ShareKeep/features/` にコピー。
5. ShareKeep の `lib/database.types.ts` に `ParcelStatus` / `UserRole` を database 基準で統一。
   既存 `Profile/Parcel/...` 型と features 内型の重複を整理（features 側を正にするか、`lib/database.types.ts` に集約）。
6. `features/*` が import している `../lib/supabase` のパスを ShareKeep 構成に合わせる。

### Phase 2: 画面のリワイヤ（直叩き → features 呼び出し）
画面ごとに置換。**UI/レイアウトは変えず、データ取得・更新だけ差し替える。**
7. `recipient/packages.tsx`: 直 insert → `createParcel` / 直 select → `fetchMyParcels`。`toUIStatus` を新 enum 対応に。
8. `recipient/matching.tsx`: `find_nearby_agents` / `match_nearby_agent` / `assign_agent_to_parcel` に接続。
9. `recipient/pickup-ready.tsx` / `delivery-complete.tsx`: `generate_qr_token` / `verify-recipient-qr` / `update_parcel_status`。
10. `agent/parcels.tsx`: `qr_tokens`/`parcels`/`delivery_matches` 直叩き → `generateQrToken` / `verifyAgentQr` / `updateParcelStatus`。
11. `agent/profile.tsx`: `agent_profiles` 直 upsert → `upsertAgentProfile` / `geocodeAgentAddress`。
12. `lib/auth.ts` & `sign-in*.tsx` & `sign-up*.tsx`: `signUpRecipient` / `signIn` / `upsertProfile` に統一。`driver`→`delivery_company`。
13. Realtime 購読を `subscribeParcel` に寄せる（各画面の自前 channel を共通化）。

### Phase 3: QR フロー
14. database 側 `QrTokenView` / `QrScanScreen` のロジックを ShareKeep の該当画面へ移植（UI は ShareKeep 共有UIで再構成）。
15. `expo-camera` のバージョン整合確認（ShareKeep は `~56.0.8`）。

### Phase 4: 検証・後始末
16. 主要フロー E2E 確認: 受取人 荷物登録 → マッチング → 保管 → QR 受渡し → 完了 / 代理人 プロフィール登録 → 荷物受領。
17. `database/` フォルダを削除 or `archive/` に退避（参照済みなら削除）。
18. CLAUDE.md / docs を統合後の構成に更新。

---

## 5. リスク・確認事項（要・チーム合意）

- [ ] **ステータス enum マッピングの妥当性**: 旧 `pending/stored` を新 enum のどの値に対応させるか、表示文言含めチーム合意が必要（3-1）。
- [ ] **Supabase プロジェクトが ShareKeep でも同一か**: database は `zbmrmblakoszzecdnptn`。RPC/Edge Function がこのプロジェクトに deploy 済みである前提。要確認。
- [ ] **Edge Functions のデプロイ状況**: `verify-agent-qr` 等が本番プロジェクトに存在するか。
- [ ] **既存データの status 値**: 既に `pending` 等で入っているレコードがある場合、マイグレーションが必要か。
- [ ] **driver / delivery_company の用語統一**: UI 文言（「配達業者」表記）まで波及するため要確認。

---

## 6. 進め方の推奨

- Phase 0→1 は依存が強いので一気に。
- Phase 2 は**画面1枚ずつ PR**にすると、ShareKeep の直近リファクタ（共有UI移行）と同じ粒度でレビューしやすい。
- まず `recipient/packages.tsx` を 1 枚通しで完成させ、移植パターン（直叩き→features、enum 変換）を確立してから横展開する。
