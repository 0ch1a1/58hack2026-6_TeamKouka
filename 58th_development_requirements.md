# ShareKeep 開発要件定義書

最終更新: 2026-06-13

## 0. このドキュメントについて

- **位置づけ**: ShareKeep の**正本となる要件定義書**。機能ごとに「概要・対象ロール・画面・API/ロジック・データ・受け入れ条件・実装状況・担当メモ」を定義し、そのまま実装担当へ渡せる粒度を目指す。
- **関連文書**:
  - `58th_hackathon_coin_team_spec.md` … チームの議論まとめ（背景・検討課題の詳細）。本書の背景資料。
  - `presentation_project_overview.md` … 発表用の概要。
  - `docs/react-native-supabase-guide.md` … Supabase 接続の実装ガイド。
  - `maki-docs/` … 統合作業の記録・アイデアメモ・各機能の実装計画。
- **実装状況の凡例**:
  - ✅ 実装済み（main にマージ済み）
  - 🟡 一部実装 / モック（最低限は動くが要件未充足）
  - ❌ 未実装
  - ⚠️ 既知の課題・技術的負債

---

## 1. プロジェクト概要

- **テーマ（社会課題 / CSV）**: 宅配の「再配達」によるCO2排出・配送コストの逼迫を、地域のつながりで削減する。
- **ターゲット**: 宅配ボックスのない一軒家/小規模アパート在住、日中不在が多い、EC をよく使う、近隣に受取スポットが少ない利用者。
- **解決策**: 同じマンションや半径50m以内の「日中在宅の人（代理人）」が不在者の荷物を一時代理受領するマッチングアプリ。
- **インセンティブ**: 代理人にポイント付与・育成（ゲーミフィケーション）。配送会社は再配達コスト削減。
- **基本フロー**:
  1. 受取人が不在 → 2. 配達員が代理人を探す（事前指定→近隣の順）→ 3. 代理人がQR提示、配達員が読み取り「代理人キープ中」→ 4. 受取人へ代理人情報を通知 → 5. 受取人が受取に行く → 6. 受取人QRを代理人が読み取り「引き渡し完了」。

---

## 2. ロールと権限

| ロール | DB値 | できること |
| --- | --- | --- |
| 受取人 | `recipient` | 荷物登録、代理受取依頼、代理人選択、QR提示、評価 |
| 代理人 | `agent` | プロフィール登録、代理受取、QR提示・読み取り、受取人との連絡 |
| 配達員 / 配送会社 | `delivery_company` | 荷物管理、代理人確認、代理人QR読み取り |

- ロールは `profiles.role`（enum: `recipient` / `agent` / `delivery_company`）を唯一の正とする。旧 `driver` は廃止。
- ログイン後、`delivery_company` は `/(app)/driver` へ、それ以外は受取人/代理人ホームへ遷移する。✅

---

## 3. 機能要件

各機能は `F-<領域>-<番号>` でIDを振る。担当へはこの単位で割り当て可能。

### 3.A 認証・ユーザー管理

#### F-AUTH-01 ユーザー登録・サインイン ✅
- **概要**: メール+パスワードで登録・ログイン。受取人/代理人と配達員で導線を分ける。
- **ロール**: 全ロール
- **画面**: サインアップ、サインイン、配達員サインアップ/サインイン
- **API**: `signUpRecipient`（features/auth.ts）/ `signUpWithProfile`（**lib/auth.ts**・配達員含む全ロール）/ `signIn` / `signOut` / `getCurrentUser`
- **データ**: `auth.users`, `profiles`
- **受け入れ条件**: 登録後にプロフィール行が作られ、ログインでロール別ホームに着く。
- **実装状況**: ✅（`app/(auth)/*`）

#### F-AUTH-02 ロール管理・プロフィール CRUD ✅
- **概要**: ロールを含むプロフィールの作成・取得・更新・削除。ロール判定の共通化。
- **API**: `getProfile` / `getMyRole`（enum検証つき）/ `upsertProfile` / `deleteProfile` / `deleteMyAccount`
- **受け入れ条件**: `getMyRole` は不正値/旧値を弾き enum3値 or null を返す。
- **実装状況**: ✅

#### F-AUTH-03 配送会社アカウント管理 🟡
- **概要**: 配送会社の作成・更新・削除・一覧。配達員ユーザーと会社の紐付け。
- **API**: `createDeliveryCompany` / `updateDeliveryCompany` / `deleteDeliveryCompany` / `listDeliveryCompanies`
- **実装状況**: 🟡 会社CRUDのAPIはあるが、**配達員ユーザー→会社IDの正規紐付けが無い**（デモは `DEMO_DELIVERY_COMPANY_ID` 固定）。⚠️ 下記 ⚠️-01 参照。

### 3.B 荷物管理

#### F-PARCEL-01 荷物の作成・取得・ステータス更新 ✅
- **概要**: 荷物の作成、一覧/詳細取得、ステータス更新と履歴保存。配送会社/受取人/代理人/追跡番号の紐付け。
- **API**: `createParcel` / `fetchMyParcels` / `fetchParcel` / `fetchDriverParcels` / `updateParcelStatus`（RPC側で履歴保存）
- **データ**: `parcels`, `parcel_status_histories`
- **実装状況**: ✅
- **⚠️ 伝票番号の扱い**: 受取人画面（`packages.tsx`）に伝票番号入力欄はあるが、その値は現状 `createParcel`（引数は `recipientId` / `deliveryCompanyId` のみ）に渡らず、`tracking_no` はサーバ自動採番。「受取人が実際の伝票番号を登録する」要件を残すなら `createParcel` の引数追加が必要。

#### F-PARCEL-02 ステータス定義 ✅
- **遷移**: `created`(配達前) → `out_for_delivery`(配達中) → `delivery_failed`(不在/代理受付待ち) → `agent_assigned`(代理人決定) → `delivered_to_agent`(代理人キープ中) → `handed_to_recipient`/`completed`(引き渡し完了)
- **受け入れ条件**: UI表示は受取人=3状態集約（`toUIStatus`）、配達員=生status（`DRIVER_STATUS_LABEL`）。
- **実装状況**: ✅（`lib/status.ts`）

### 3.C 代理人プロフィール

#### F-AGENTPROF-01 プロフィール編集・取得 🟡
- **概要**: 住所/緯度経度/受取可能曜日/開始・終了時刻/緊急連絡先/優先設定の保存・取得。住所はジオコーディングで緯度経度化。
- **画面**: 代理人プロフィール編集
- **API**: `upsertAgentProfile` / `geocodeAgentAddress`
- **データ**: `agent_profiles`（住所/曜日/時間）、緊急連絡先は `profiles.phone`
- **実装状況**: 🟡 住所/曜日/時間は編集・取得とも実装済み。**緊急連絡先は保存のみ**（`profiles.phone` へ直更新するがフォームへ再取得しない）。**優先設定は未実装**（入力項目なし）。`app/(app)/agent/profile.tsx`
- **残作業**: 緊急連絡先の再取得（編集時に既存値を表示）、優先設定の入力・保存。

#### F-AGENTPROF-02 顔写真 ❌
- **概要**: 任意の顔写真を Storage に保存し、受取人/配達員に表示。
- **データ**: Storage bucket（顔写真用）+ `agent_profiles` に参照列
- **実装状況**: ❌（Storage 未整備。要件のみ）

### 3.D マッチング

#### F-MATCH-01 近隣代理人検索 ✅
- **概要**: 緯度経度・半径・受取可能時間で代理人を抽出。
- **API**: `findNearbyAgents` / `getAgentLocations`（地図用に緯度経度・実績つき）
- **⚠️ 半径の注意**: コンセプトは「半径50m以内」だが、受取人 `matching.tsx` は実機GPS誤差を考慮し**デモ都合で `radiusMeters: 5000`（5km）**を渡している。本番の距離要件（50m/100m段階）は別途確定し、実値を合わせること。
- **実装状況**: ✅（検索ロジック）

#### F-MATCH-02 マッチング作成・割り当て ✅
- **概要**: 荷物に代理人を割り当て、`delivery_matches` 作成、ステータスを `agent_assigned` へ、代理人へ通知（DB通知行の作成。通知一覧UI表示は F-NOTIF-01 で未強化）。
- **API（画面別）**:
  - 配達員マップ `driver/agents.tsx` → `getAgentLocations` + `assignAgentToParcel`（手動割り当て）
  - 受取人 `matching.tsx` → `matchNearbyAgent`（近隣自動マッチ）
- **データ**: `delivery_matches`
- **実装状況**: ✅（割り当て自体）。通知は DB行作成までで、UI表示の強化は F-NOTIF-01 参照。

#### F-MATCH-03 優先マッチング（事前指定→近隣） ❌
- **概要**: 受取人が事前指定した代理人を最優先 → 同建物 → 半径50m → 100m の順で探索。受取可能曜日/時間/対応可否/保管可能数/トラブル履歴で判定。
- **API案**: `find_best_agent_for_parcel(parcel_id)`
- **実装状況**: ❌（現状は手動選択 or 単純近隣検索）

### 3.E QR認証

#### F-QR-01 QRトークン生成 ✅
- **概要**: 代理人用/受取人用のワンタイムQRトークン生成（有効期限・使用済み管理）。
- **API**: `generateQrToken`（qrType: agent/recipient）
- **データ**: `qr_tokens`
- **実装状況**: ✅

#### F-QR-02 QR検証とステータス遷移（冪等） ✅
- **概要**: 配達員が代理人QRを検証→`delivered_to_agent`。代理人が受取人QRを検証→`completed`。二重読み取りでも処理済みなら成功を返す（冪等）。
- **API**: `verifyAgentQr` / `verifyRecipientQr`（Edge Function）
- **受け入れ条件**: 未使用QRは検証・遷移、使用済みでも期待ステータス到達済みなら `success:true`、存在しない/期限切れ/種別違いは `success:false`。
- **実装状況**: ✅ ／ ⚠️ エラーは現状メッセージ文字列依存（⚠️-02）。

### 3.F 配達員 / 配送会社画面

#### F-DRIVER-01 配達員ホーム（荷物リスト） ✅
- **概要**: 自社の担当荷物を一覧表示し、状態別アクション（配達開始/不在報告/代理人を探す/QRを読む）を出す。
- **画面**: `app/(app)/driver/index.tsx`
- **API**: `fetchDriverParcels` / `startDelivery` / `reportDeliveryFailed`
- **受け入れ条件**: status に応じ `driverActionsFor` のアクションのみ表示。多重操作ロック・focus復帰時の再取得・エラー/空/再試行表示あり。
- **実装状況**: ✅

#### F-DRIVER-02 代理人マッチング（地図＋リスト） ✅
- **概要**: 代理人を地図ピン＋リストで表示し、対象荷物へ割り当て。地図が出ない環境ではリストで割り当て可能（Error Boundary フォールバック）。
- **画面**: `app/(app)/driver/agents.tsx`（react-native-maps）
- **個人情報保護**: 割り当て前は詳細住所（部屋番号等）を出さない。
- **実装状況**: ✅

#### F-DRIVER-03 代理人QR読み取り ✅
- **概要**: カメラで代理人QRを読み、`verifyAgentQr` で `delivered_to_agent` へ。二重読み取りガード、エラー3種出し分け、整合チェック。
- **画面**: `app/(app)/driver/scan.tsx`（expo-camera）
- **実装状況**: ✅

### 3.G 受取人フロー（画面）

#### F-RCPT-01 荷物一覧・配達待ち・受取準備・完了 ✅
- **概要**: 荷物一覧、マッチング待機、代理人到着後の受取準備（代理人情報・「今から取りに行く」・受取人QR表示）、引き渡し完了（CO2表示）。
- **画面**: `recipient/packages.tsx` / `matching.tsx` / `pickup-ready.tsx` / `delivery-complete.tsx`
- **実装状況**: ✅

#### F-RCPT-02 代理受取依頼の作成 ❌
- **概要**: 荷物ごとに「代理受取を許可するか・希望代理人・受取期限・注意事項・対象外条件」を事前登録。
- **データ案**: `parcel_proxy_requests`
- **実装状況**: ❌

#### F-RCPT-03 ホワイトリスト型代理人選択 ❌
- **概要**: 受取人が信頼する代理人をホワイトリスト管理し、候補表示・評価/対応時間順で並べる。
- **データ**: `agent_whitelists`
- **API案**: ホワイトリスト追加/削除/取得
- **実装状況**: ❌

### 3.H 代理人フロー（画面）

#### F-AGENT-01 請負リスト・QR表示・受取人QR読み取り ✅
- **概要**: マッチング通知/請負リスト、配達員向けQR表示、荷物キープ中ステータス、受取人QR読み取り、引き渡し完了。
- **画面**: `app/(app)/agent/parcels.tsx`
- **実装状況**: ✅ ／ 注: 「デモ用: 受領済みにする」ボタンは配達員scanが使えない場面のフォールバック。本来導線は F-DRIVER-03。

### 3.I 通知

#### F-NOTIF-01 通知の取得・既読 🟡
- **概要**: マッチング成立/荷物到着/引き渡し完了などの通知取得・既読。
- **API**: `fetchMyNotifications` / `markNotificationRead`
- **データ**: `notifications`
- **実装状況**: 🟡 取得・1件既読はあり。**未読件数取得・一括既読・種別フィルタ・プッシュ/リアルタイム表示は未実装**。

### 3.J メッセージ ❌

#### F-MSG-01 受取人⇆代理人メッセージ ❌
- **概要**: 荷物ごとのメッセージルーム、送信・一覧・送信者識別・日時保存。
- **データ**: `handover_messages`
- **実装状況**: ❌

### 3.K 評価 ❌

#### F-REVIEW-01 代理人評価 ❌
- **概要**: 引き渡し完了後に受取人が代理人を評価（点数・コメント）。平均評価・件数を算出し、おすすめ順に利用。
- **データ**: `agent_reviews`
- **実装状況**: ❌

### 3.L ポイント・実績（ゲーミフィケーション）

#### F-POINT-01 ポイント付与・残高・履歴 🟡
- **概要**: 引き渡し完了時に代理人へポイント付与。残高・増減履歴の取得。
- **API**: `consumeAgentPoints` / `recordAgentDeliveryCompletion`（付与）。残高/履歴取得APIは要追加。
- **データ**: `point_transactions`
- **実装状況**: 🟡 付与系のバックエンドはあるが、残高・履歴取得APIと **UI（残高表示・特典交換）は未実装/モック**。

#### F-POINT-02 実績・レベル・育成ビジュアル 🟡
- **概要**: 完了件数のインクリメント、レベル・実績の取得、レベルアップ判定。ホームの育成ビジュアル（木）に反映。
- **データ**: `achievements`
- **実装状況**: 🟡 ホームに木の育成ビジュアルあり。**XP/Points は仮値（`app/(app)/index.tsx` で `0` 固定・Supabase未接続）**。実績取得APIとの接続は未。

### 3.M CO2削減量

#### F-CO2-01 CO2削減の計算・表示・集計 🟡
- **概要**: 引き渡し完了時にCO2推定削減量を算出・保存。ユーザー別/代理人別/全体の集計。
- **データ**: `co2_reduction_logs` / `parcels.co2_saved_kg`
- **受け入れ条件**: 算出式・係数（例: 再配達1回 ≈ 0.5kg-CO2）・丸め・保存タイミングを明確に定義する（未定だと担当ごとに値がぶれる）。完了画面（`recipient/delivery-complete.tsx`）は `parcels.co2_saved_kg`（サーバ値）をそのまま表示しており、フロントに固定値ロジックは無い＝**算出はサーバ側の責務**。
- **実装状況**: 🟡 完了画面に削減量表示あり。**算出式の確定・集計API（個人別/全体）は未実装**。

### 3.N トラブル・保管期限

#### F-TROUBLE-01 トラブル報告 ❌
- **概要**: 紛失/破損/誤受け渡し等の報告（種別・詳細・写真・対応ステータス）。
- **データ案**: `parcel_incident_reports`
- **実装状況**: ❌（ボタンのみモック想定）

#### F-STORAGE-01 保管期限管理 ❌
- **概要**: 荷物ごとの保管期限保存、期限前通知、超過時のステータス変更・通知。
- **実装状況**: ❌

---

## 4. データモデル

### 4.1 必要テーブル
`profiles` / `agent_profiles` / `delivery_companies` / `parcels` / `parcel_status_histories` / `delivery_matches` / `qr_tokens` / `notifications` / `point_transactions` / `achievements` / `co2_reduction_logs` / `agent_whitelists`(❌) / `agent_reviews`(❌) / `handover_messages`(❌)

### 4.2 Storage
- 代理人顔写真用 bucket（❌ 未整備）。任意登録。公開範囲は受取人・配達員が確認できる範囲に制限。

---

## 5. API / Function 一覧（実装状況つき）

| API | 状況 |
| --- | --- |
| ユーザー登録 / ロール管理 / プロフィール CRUD | ✅ |
| 代理人プロフィール作成・更新 / ジオコーディング | ✅ |
| 荷物 作成 / 一覧 / 詳細 / ステータス更新 | ✅ |
| 代理人検索 / 近隣検索 / マップ用位置取得 | ✅ |
| マッチング作成・割り当て | ✅ |
| QR 生成 / 検証（agent・recipient、冪等） | ✅ |
| 通知 取得 / 既読 | 🟡（未読件数・種別フィルタ無し） |
| 配送会社 CRUD | 🟡（ユーザー紐付け無し） |
| ポイント 付与 / 完了記録 | 🟡（残高・履歴取得APIは未） |
| ホワイトリスト 追加/削除/取得 | ❌ |
| メッセージ 送信/取得 | ❌ |
| 代理人評価 作成/取得 | ❌ |
| 実績・レベル取得 | ❌ |
| CO2削減ログ集計（個人別/全体） | ❌ |
| トラブル報告 / 保管期限管理 | ❌ |
| 優先マッチング（best agent） | ❌ |

---

## 6. 実装優先順位 / ロードマップ

### 6.1 完了済み（基盤）
荷物ステータス管理、QR生成・検証、受取人/代理人/配達員の基本画面、認証・ロール管理、代理人プロフィール管理、近隣マッチング、配達員フロー一式。

### 6.2 次に実装（サービス化）
1. 通知の強化（未読件数・種別フィルタ・プッシュ/リアルタイム）
2. ホワイトリスト型代理人選択（F-RCPT-03）
3. 代理受取依頼作成（F-RCPT-02）
4. メッセージ（F-MSG-01）
5. 評価（F-REVIEW-01）
6. 優先マッチング（F-MATCH-03）

### 6.3 余裕があれば（価値の可視化・発展）
1. ポイント残高/履歴・特典交換UI（F-POINT-01）
2. 実績・レベルの育成ビジュアル接続（F-POINT-02）
3. CO2削減集計API・ダッシュボード（F-CO2-01）
4. トラブル報告（F-TROUBLE-01）/ 保管期限管理（F-STORAGE-01）
5. 顔写真 Storage（F-AGENTPROF-02）

---

## 7. 既知の課題・技術的負債

- **⚠️-01 配達員と配送会社IDの紐付け**: 現状 `delivery_company` ロールはあるが、配達員ユーザー→`delivery_companies.id` の正規紐付けが無く、配達員リストは `DEMO_DELIVERY_COMPANY_ID` 固定。`delivery_company_members` 等のテーブル or `profiles.delivery_company_id` 追加が必要。RLS で「自社の荷物のみ」を担保する設計も併せて要検討。
- **⚠️-02 QR検証エラーの契約**: `verify-agent-qr` / `verify-recipient-qr` のエラーがメッセージ文字列依存で、フロントの分類（期限切れ/無効/通信失敗）が脆い。Edge Function 側で機械可読な `code` と対象 `parcel_id` を返す契約に寄せると、scan画面の整合チェック（別荷物QR誤読の検出）も堅牢化できる。
- **⚠️-03 RLS の網羅確認**: 各ロールが必要な行だけ読める/書けることの確認。特に配達員ロールが `parcels` / `fetchParcel` を読めるか（scan の整合チェックに影響）。
- **⚠️-04 サーバ側ロジックは本リポジトリ未追跡**: Edge Function / RPC / RLS（`supabase/` 配下）はこのリポジトリにソースが無い。本書の ✅/🟡 はフロント層（`features/` 呼び出し・画面）との整合で判定しており、**QR検証の冪等遷移・CO2算出・ポイント付与・RLS のサーバ側実装は別途検証が必要**。
