# 配達業者側画面 実装計画

作成: 2026-06-13 / 対象: ShareKeep（Expo Router アプリ）
仕様の正: リポジトリ直下 `58th_hackathon_coin_team_spec.md`（§3.1「配達業者用の画面」/ §6.1 優先度2 / §7.5）

このドキュメントは「計画」のみ。実装着手は別途。

---

## 1. スコープ（確定）

- **範囲**: フル4フェーズ（ロール分岐 → 荷物リスト → 代理人マッチング → QRスキャン → 仕上げ）
- **地図**: `react-native-maps` を導入して実地図にピン表示
- **MVP上の会社ID**: 現行DB/フロントには「配達員ユーザー → delivery_companies.id」の正規紐づけが無い。まずは `DEMO_DELIVERY_COMPANY_ID` の荷物を配達員画面に表示し、発表後に会社メンバー管理へ拡張する。

## 1.5 レビュー追記（実装前に潰すべき点）

- **配送会社IDの解決**: `profiles.role = delivery_company` はあるが、`profiles.company_name` と `delivery_companies.id` は外部キーで繋がっていない。Phase 1 はデモ固定IDで進め、将来は `delivery_company_members` 等のテーブルか profile 側の `delivery_company_id` 追加が必要。
- **初期ステータス**: 受取人の `createParcel()` は `created` を返す可能性が高い。配達員リストは `created` も表示対象に含め、「配達開始」→ `out_for_delivery`、「不在報告」→ `delivery_failed` の2段階操作にする。
- **マッチング位置情報**: `matchNearbyAgent()` は緯度経度が必須。配達員画面だけで実行するなら「配達員の現在地」を配達先付近とみなすか、代理人リストから `assignAgentToParcel()` で手動割当する。荷物テーブルに配送先緯度経度は無い前提で設計する。
- **features層の追加**: 画面から `supabase.from('parcels')` を直叩きしない。配達員用の `fetchDriverParcels()` / `reportDeliveryFailed()` などを `features/parcels.ts` に足す方が、既存の統合方針と合う。
- **地図はリスト併用が必須**: `react-native-maps` は端末/Expo Go/Android APIキーの影響を受ける。デモの成立条件は「代理人を選べること」なので、地図が壊れてもリストで割当できるUIにする。

---

## 2. 現状把握

- 配達業者側の画面は**丸ごと未実装**。`maki-docs/integration-tasks.md` にも「配達員が agent QR を読む画面は未実装」と記載。
- 認証画面のみ存在: `app/(auth)/sign-in-driver.tsx` / `sign-up-driver.tsx`。
- ロール名は型統一済みで **`delivery_company`**（旧 `driver` は廃止）。テーマ色 `colors.driver = '#4B5563'`。
- バックエンド連携層（`features/parcels.ts`）に必要 API はほぼ揃っている:
  - `getAgentLocations()` … 地図用の代理人一覧（緯度経度つき）
  - `findNearbyAgents()` / `matchNearbyAgent()` / `assignAgentToParcel()` … マッチング
  - `verifyAgentQr(token)` … 代理人QR照合（Edge Function、冪等化済み）
  - `updateParcelStatus()` … ステータス更新
  - `subscribeParcel()` … Realtime 購読
- **既知の障害（要対応）**: `app/_layout.tsx` はログイン済みユーザーを全員 `/(app)`（受取人/代理人ホーム）へ `replace` する。**ロール分岐が無い**ため、配達業者でログインしても受取人ホームに着いてしまう。

## 3. 仕様が求める配達業者画面（spec §3.1）

1. 配達業者用のマップ表示
2. 代理人の情報（住所）
3. 配達品物のリスト表示（配達失敗時に代理人のおすすめを決める）
4. 代理人QRコード読み取り用のカメラ起動画面

参考ステータス遷移（spec §6.2）:
`created → out_for_delivery → delivery_failed → agent_assigned → delivered_to_agent → handed_to_recipient → completed`
配達業者が触るのは主に `out_for_delivery`〜`delivered_to_agent` の区間。

---

## 4. 実装計画（4フェーズ）

### Phase 0: ロール別ルーティング（前提・必須）
- ログイン後にプロファイルの `role` を見て分岐。`delivery_company` なら `/(app)/driver` へ `replace`。
- 実装箇所候補: `app/_layout.tsx` のセッション復帰／`onAuthStateChange`、または `(app)/index.tsx` 冒頭で `getProfile()` → ロール判定し `Redirect`。
- 新 route group `app/(app)/driver/` を作成。`_layout.tsx`（Stack, headerShown:false）も追加。
- 受取人/代理人は従来どおり `/(app)` のまま（既存挙動を壊さない）。
- 推奨: `app/_layout.tsx` でセッション有無だけを見て `/(app)` に入れ、`app/(app)/index.tsx` 側で profile ロード後に `delivery_company` を `/(app)/driver` へ送る。RootLayoutで非同期 profile 取得まで抱えると、認証状態変更時の redirect ループを作りやすい。
- profile 取得中は `ActivityIndicator` を表示し、取得失敗時は通常ホームに落とすか、ログアウト導線を出す。

### Phase 1: 配達員ホーム（荷物リスト）— 最優先
- ファイル: `app/(app)/driver/index.tsx`
- 自社の配達対象荷物（`status` ∈ `created` / `out_for_delivery` / `delivery_failed` / `agent_assigned` / `delivered_to_agent`）をリスト表示。
  - MVP取得は `DEMO_DELIVERY_COMPANY_ID` で `parcels.delivery_company_id` をフィルタ（`lib/config.ts` 参照）。
  - `completed` は通常非表示。確認用フィルタで表示できる程度にする。
- 各荷物カードのアクション:
  - `created`: 「配達開始」→ `updateParcelStatus(id, 'out_for_delivery')`
  - 「配達失敗にする」→ `updateParcelStatus(id, 'delivery_failed')`
  - `delivery_failed`: 「代理人を探す」→ Phase 2 のマッチング画面へ遷移（`parcelId` を渡す）
  - `agent_assigned`: 「代理人QRを読む」→ Phase 3 のスキャン画面へ遷移
- UI は既存 `agent/parcels.tsx` のリスト＋カード（`ScreenHeader`, `Card`, `colors.driver`）を踏襲。
- ログアウト導線（`signOut()`）。
- 追加する features 関数候補:
  - `fetchDriverParcels(deliveryCompanyId: string)`
  - `startDelivery(parcelId: string)` → `out_for_delivery`
  - `reportDeliveryFailed(parcelId: string)` → `delivery_failed`

### Phase 2: 代理人マッチング画面（地図＋代理人情報）
- ファイル: `app/(app)/driver/agents.tsx`
- `react-native-maps` を導入し `MapView` ＋ `Marker` で代理人ピン表示。
  - データは `getAgentLocations()`（緯度経度・住所・受取可能曜日/時間つき）。
  - 個人情報保護方針: 選択前は最小限の住所のみ。部屋番号等の詳細は割り当て後に表示。
  - 地図とは別にリスト表示も併設（地図が出ない端末/Expo Go 対策のフォールバック）。
- ピン/リスト選択 → 対象荷物に割り当て: `assignAgentToParcel({parcelId, agentId, distanceMeters})` → `agent_assigned`。
- 「おすすめ代理人」演出を入れる場合は、まずアプリ内で簡易スコアを計算する。
  - 例: 住所が近い / 対応時間内 / 現在の請負数が少ない / 完了数が多い。
  - 本格推薦APIは `recommendation-api.md` 側の別タスクに切り出す。
- `matchNearbyAgent()` を使う場合は、配達員の現在地権限を取り、現在地を配達先付近とみなして呼ぶ。ただし荷物に配送先座標が無いため、MVPでは手動選択の方が説明しやすい。
- 割り当て完了でホームへ戻り、リスト再取得。

#### react-native-maps 導入メモ
- 依存追加: `npx expo install react-native-maps`。
- Expo Go では iOS は Apple Maps が動くが、Android で Google Maps を使う場合は API キーと `app.json` への `config.googleMaps` 設定、Dev Client / EAS ビルドが必要になりうる。
- ハッカソンデモ前提なら **iOS シミュレータ + Apple Maps** が最短。Android 実機が必要なら Dev Client ビルドを別途検討。
- リスク回避として「地図が初期化できない場合はリスト表示にフォールバック」を必ず入れる。

### Phase 3: 代理人QR読み取りカメラ（デモの目玉・優先度2）
- ファイル: `app/(app)/driver/scan.tsx`
- `expo-camera` の `CameraView` + `useCameraPermissions`（`agent/parcels.tsx` と同じ実装パターン）でQR読み取り。
- 読み取った token を `verifyAgentQr(token)` に渡す。
  - 成功 → 対象荷物が `delivered_to_agent` に遷移。完了メッセージ表示。
  - 冪等化済み（spec §7.1）なので二重読み取りでも `success: true`。期限切れ/種別違いは `false`。
- スキャン後の重複読み取りガード（`scanned` フラグ）を入れる。
- `scan.tsx` は `parcelId` を params で受け取り、スキャン成功後に `fetchParcel(parcelId)` で表示ステータスを確認する。Edge Function自体は token から対象荷物を解決するが、画面表示の整合性チェックとして parcelId を持っておく。
- エラー文言は3種類に分ける:
  - 無効なQR / 種別違い
  - 期限切れ
  - 通信失敗
- 代理人側の「配達員から受領」暫定ボタンは、デモ保険として残す。ただし配達員画面完成後は文言を「デモ用: 受領済みにする」へ変えて、本来導線と混同しないようにする。

### Phase 4: 仕上げ
- ナビゲーション: driver ホームに「代理人を探す」「QRスキャン」へのタブ or ボタン導線。
- Realtime: 表示中の荷物を `subscribeParcel()` で購読しステータス変化を反映。
- 空状態・ローディング・エラー表示（`ActivityIndicator` / Alert）。
- 役割テーマ統一（`colors.driver`）。
- ステータス表示は `lib/status.ts` に配達員用ラベルを追加して集約する。受取人向け `toUIStatus()` とは分ける。
- 最低限のテスト:
  - `fetchDriverParcels` の型/マッピング確認
  - driver ホームの状態別ボタン表示
  - scan 画面の二重読み取りガード

---

## 5. 追加/変更するファイル一覧（想定）

| 種別 | パス | 内容 |
| --- | --- | --- |
| 変更 | `app/_layout.tsx` or `app/(app)/index.tsx` | ロール別リダイレクト |
| 新規 | `app/(app)/driver/_layout.tsx` | driver Stack レイアウト |
| 新規 | `app/(app)/driver/index.tsx` | 荷物リスト（ホーム） |
| 新規 | `app/(app)/driver/agents.tsx` | 代理人マップ＋マッチング |
| 新規 | `app/(app)/driver/scan.tsx` | 代理人QRスキャン |
| 変更 | `features/parcels.ts` | 配達員用 fetch / status 更新 helper |
| 変更 | `lib/status.ts` | 配達員向けステータスラベル |
| 変更 | `package.json` | `react-native-maps` 追加 |
| 変更 | `app.json` | （Android Google Maps を使う場合のみ）maps 設定 |

新規バックエンド API 実装は不要。ただし画面からの直叩きを避けるため、`features/parcels.ts` には配達員用 helper を追加する。

---

## 6. 優先順位（デモ最短で動かす順）

1. Phase 0（ロール分岐）… これが無いと配達員画面に到達できない
2. Phase 1（荷物リスト）… 配達業者の入口
3. Phase 3（QRスキャン）… spec §6.1 優先度2、デモの目玉
4. Phase 2（代理人選択）… 地図導入の工数があるため後ろ。リストだけ先行も可
5. Phase 4（仕上げ）

デモ最短版に絞る場合:

1. ロール分岐
2. `created` / `out_for_delivery` / `agent_assigned` を表示する配達員リスト
3. `agent_assigned` の荷物に対するQRスキャン
4. 代理人選択は既存の受取人 `matching` か代理人側暫定ボタンで代替

---

## 7. 未確定・確認したい点

- デモ環境は iOS シミュレータ中心か、Android 実機も必要か（react-native-maps の構成に影響）。
- 配達業者ログイン時に使う会社ID（`Test Delivery` seed）で荷物がひもづいているか要確認（`lib/config.ts` / Supabase seed）。
- 「配達失敗時のおすすめ代理人」を自動提案（`find_best_agent_for_parcel` 相当）まで作るか、手動選択だけにするか。
- 配達員アカウントを「配送会社管理者」と「現場ドライバー」に分けるか。現状の role は `delivery_company` だけなので、MVPでは「配達員兼会社アカウント」として扱う。
- `created` の荷物を配達員が見てよい前提で進めるか。厳密にするなら受取人登録後に配送会社側で `out_for_delivery` にする操作が必要。

---

## 8. git worktree 並列実装計画

### 8.1 並列化の基本方針

4フェーズをそのまま4人で分担すると、`features/parcels.ts` / `lib/status.ts` / `package.json` / `app/(app)/index.tsx` といった**共有ファイルで必ず衝突**する。そこで「共有ファイルを触る作業を Wave 0 で先に確定 → 画面ごとに Wave 1 で並列」の二段構えにする。

**鉄則: Wave 1 の各 worktree は “新規ファイルの追加のみ” に限定し、共有ファイルは一切編集しない。** これで並列ブランチ同士の衝突をゼロにする。

```
Wave 0（直列・1ブランチ）   共有の土台を確定して main へマージ
        │
        ├─ Wave 1-A（worktree）  driver/index.tsx
        ├─ Wave 1-B（worktree）  driver/agents.tsx
        └─ Wave 1-C（worktree）  driver/scan.tsx     ← 3本を同時並行
        │
Wave 2（直列・1ブランチ）   3本マージ後の結線・仕上げ・テスト
```

### 8.2 Wave 0: 土台（直列・並列化しない）

ブランチ: `feat/driver-foundation`（main から分岐）

ここで**共有ファイルを全部触り切る**。Wave 1 が参照する「契約（関数シグネチャ・型・ルート・定数）」を確定させるのが目的。

| 対象ファイル | 作業 |
| --- | --- |
| `features/parcels.ts` | `fetchDriverParcels(companyId)` / `startDelivery(id)` / `reportDeliveryFailed(id)` を実装（薄いラッパなので実体まで作る）。戻り型 `DriverParcel` をexport |
| `lib/status.ts` | `DRIVER_STATUS_LABEL` と、状態別アクション判定ヘルパを追加（受取人用 `toUIStatus` とは分離） |
| `lib/config.ts` | `DEMO_DELIVERY_COMPANY_ID` は実在確認済み。追加変更は基本不要 |
| `app/(app)/driver/_layout.tsx` | driver の Stack レイアウト（新規だがルートの土台なので Wave 0 に入れる） |
| `app/(app)/index.tsx` | ロール分岐リダイレクト（profile ロード後 `delivery_company` を `/(app)/driver` へ）。profile 取得中は `ActivityIndicator` |
| `package.json` / `package-lock.json` | `npx expo install react-native-maps`（地図は B だが依存は土台で入れる） |
| `app.json` | （Android Google Maps を使う場合のみ）maps 設定 |
| `app/(app)/driver/index.tsx` 等 | **プレースホルダ**を置いてルートを解決可能にする（中身は Wave 1 で各worktreeが上書き） |

Wave 0 をマージするまで Wave 1 は開始しない。**これが唯一の直列ボトルネック**なので、契約だけ素早く固めて即マージする。

### 8.3 Wave 1: 画面の並列実装（git worktree で3本同時）

Wave 0 マージ後の main から、3つの worktree を切る。各 worktree は**担当の1ファイルのみ**を編集する。

```bash
# リポジトリ直下で実行
git worktree add ../TeamKouka-driver-home   -b feat/driver-home   main
git worktree add ../TeamKouka-driver-agents -b feat/driver-agents main
git worktree add ../TeamKouka-driver-scan   -b feat/driver-scan   main
```

| Worktree / ブランチ | 唯一の編集ファイル | 参照する契約（Wave 0 で確定済み） |
| --- | --- | --- |
| `feat/driver-home` | `app/(app)/driver/index.tsx` | `fetchDriverParcels` / `startDelivery` / `reportDeliveryFailed` / `DRIVER_STATUS_LABEL`。各カードから agents・scan へ `router.push` |
| `feat/driver-agents` | `app/(app)/driver/agents.tsx` | `getAgentLocations` / `assignAgentToParcel` / `react-native-maps`。地図＋リスト併用（フォールバック必須） |
| `feat/driver-scan` | `app/(app)/driver/scan.tsx` | `verifyAgentQr` / `fetchParcel`。`agent/parcels.tsx` のカメラ実装を踏襲 |

各 worktree はそれぞれ `npm install`（または `npm ci`）が必要。`node_modules` は worktree ごとに独立。

> Claude Code で進める場合は、Agent ツールを `isolation: "worktree"` で3つ同時起動すれば、上記3ブランチを各エージェントが並行実装できる。各エージェントへの指示は「指定の1ファイルだけを作る／共有ファイルは絶対に編集しない」と明記する。

### 8.4 Wave 2: 結線・仕上げ（直列）

ブランチ: `feat/driver-finish`

1. `feat/driver-home` → `feat/driver-agents` → `feat/driver-scan` の順に main へマージ（順序は任意だが衝突しない想定なので一本ずつ確認しながら）。
2. 画面間ナビゲーションの最終確認（home ↔ agents ↔ scan の params 受け渡し）。
3. Realtime 購読（`subscribeParcel`）、空状態・ローディング・エラー表示の統一。
4. 代理人側「配達員から受領」暫定ボタンの文言を「デモ用」に変更（§4 Phase 3 参照）。
5. テスト追加（`fetchDriverParcels` のマッピング / home の状態別ボタン / scan の二重読み取りガード）。

### 8.5 衝突マトリクス（このとおりなら Wave 1 は無衝突）

| ファイル | Wave0 | home | agents | scan | Wave2 |
| --- | :---: | :---: | :---: | :---: | :---: |
| `features/parcels.ts` | ✏️ | 読のみ | 読のみ | 読のみ | （必要なら）✏️ |
| `lib/status.ts` | ✏️ | 読のみ | 読のみ | 読のみ | ✏️ |
| `app/(app)/index.tsx` | ✏️ | – | – | – | – |
| `app/(app)/driver/_layout.tsx` | ✏️ | – | – | – | – |
| `package.json` | ✏️ | – | – | – | – |
| `driver/index.tsx` | (placeholder) | ✏️ | – | – | – |
| `driver/agents.tsx` | (placeholder) | – | ✏️ | – | – |
| `driver/scan.tsx` | (placeholder) | – | – | ✏️ | – |

✏️=編集 / 読のみ=import して使うだけ。Wave 1 の3本が ✏️ する行が重ならない＝衝突しない。

### 8.6 後片付け

```bash
git worktree remove ../TeamKouka-driver-home
git worktree remove ../TeamKouka-driver-agents
git worktree remove ../TeamKouka-driver-scan
git branch -d feat/driver-home feat/driver-agents feat/driver-scan
```

### 8.7 並列化の損益分岐

- Wave 0（土台）と Wave 2（仕上げ）は直列。**並列で効くのは Wave 1 の3画面のみ**。
- 3画面はボリュームが近く独立性が高いので、worktree 並列の効果が出やすい区間。
- 逆に Wave 0 を飛ばして最初から並列にすると、共有ファイル衝突の解決コストで並列の利得が消える。**Wave 0 を最優先で素早く終わらせるのが全体最短**。
