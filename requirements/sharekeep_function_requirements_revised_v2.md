# ShareKeep 開発機能要件定義書 改訂版 v2

最終更新: 2026-06-13  
対象: `0ch1a1/58hack2026-6_TeamKouka` / `ShareKeep/` / `recommendation-service/` / `supabase/`  
位置づけ: 実装担当に渡すための機能要件一覧。既存の `58th_development_requirements.md` をベースに、足りない機能と発表評価に効く要件を追加した改訂版。

---

## 0. 改訂方針

今回の改訂では、既存の「代理人マッチングアプリ」寄りの要件を、**承認済み代理受取スポットを使う再配達削減インフラ**として再整理した。

主な修正点は以下。

1. UI・発表上の名称を「代理人」から「代理受取スポット」へ寄せる
2. 代理受取スポットの `spot_type`, `review_status`, `保管枠`, `今日対応可能`, `受取可能時間` を追加
3. 受取人の代理受取条件設定を追加
4. 推薦に、距離だけでなく、時間・空き枠・安全性・配達員迂回・除外理由を追加
5. 荷物保管後の自由入力チャットを、受取調整ステータス中心に再設計
6. 保管証跡 `parcel_custody_events` を追加
7. 保管期限・期限超過・配送会社回収を追加
8. トラブル報告と報酬保留を追加
9. 請求イベント `billing_events` とスポット報酬イベント `spot_reward_events` を追加
10. デモに必要な seed と受け入れ条件を追加

---

## 1. 実装状況の凡例

| 記号 | 意味 |
| --- | --- |
| ✅ | 実装済み、または既存要件上は完了扱い |
| 🟡 | 一部実装 / モック / 要件未充足 |
| ❌ | 未実装 |
| 🚧 | 実装中 / 別ブランチ・別サービスに基盤あり |
| ⚠️ | 既知の課題、仕様要確認、技術的負債 |

### 1.1 優先度の凡例

| 優先度 | 意味 |
| --- | --- |
| P0 | 発表・デモで見せたい。最短で評価に効く |
| P1 | サービスとして成立させるために必要 |
| P2 | 将来拡張・本番運用向け |

---

## 2. ロールと権限

| ロール | DB値 | UI表示 | できること |
| --- | --- | --- | --- |
| 受取人 | `recipient` | 受取人 | 荷物登録、代理受取条件設定、スポット候補選択、受取調整、QR提示、評価、トラブル報告 |
| 代理受取スポット | `agent` | 代理受取スポット | スポットプロフィール登録、スケジュール・保管枠管理、荷物保管、受取人QR読み取り、受取調整、報酬確認 |
| 配達員 / 配送会社 | `delivery_company` | 配達員 / 配送会社 | 荷物管理、不在報告、スポット候補確認、スポットQR読み取り、自社荷物管理 |
| 運営管理者 | `admin` 追加案 | 運営 | スポット審査、トラブル対応、報酬保留解除、配送会社管理、監査ログ閲覧 |

### 2.1 命名ルール

- DB・既存コードでは互換性のため `agent` を残してよい。
- UI、発表、README、画面文言では `代理人` より **`代理受取スポット`** を優先する。
- 個人の協力者は `個人スポット` と呼び、店舗・施設・管理人室と同列のスポット種別として扱う。

---

## 3. 全体機能一覧

| 領域 | 機能 | 優先度 | 状況 |
| --- | --- | --- | --- |
| 認証 | サインアップ / サインイン / ロール管理 | P0 | ✅ |
| 配送会社 | 配送会社アカウント・メンバー紐付け | P1 | 🟡 |
| 荷物 | 荷物登録・一覧・詳細・ステータス履歴 | P0 | ✅ |
| 代理受取条件 | 荷物ごとの代理受取許可・条件設定 | P0 | ❌ |
| スポット | スポットプロフィール・スケジュール・保管枠 | P0 | 🟡 |
| 推薦 | 候補抽出・スコアリング・理由表示・除外理由 | P0 | 🚧/🟡 |
| QR | スポットQR・受取人QR・冪等検証 | P0 | ✅ |
| 保管証跡 | 荷物の責任移転イベントログ | P0 | ❌ |
| 受取調整 | 今から行く・到着予定・遅延・定型連絡 | P0 | 🟡/❌ |
| 通知 | 通知取得・既読・種別・未読件数 | P1 | 🟡 |
| 評価 | スポット評価・平均評価・実績反映 | P1 | 🟡/❌ |
| トラブル | 紛失/破損/誤受け渡し報告 | P1 | 🟡/❌ |
| 保管期限 | 期限設定・期限前通知・期限超過対応 | P0/P1 | 🟡 |
| 報酬/請求 | billing_events / spot_reward_events | P0 | ❌ |
| ポイント | 残高・履歴・報酬反映 | P1 | 🟡 |
| CO2 | 削減量計算・表示・集計 | P0/P1 | 🟡 |
| 運営管理 | スポット審査・報酬保留・事故対応 | P2 | ❌ |

---

## 4. 機能要件詳細

## 4.A 認証・ユーザー管理

### F-AUTH-01 ユーザー登録・サインイン

- **優先度**: P0
- **状況**: ✅
- **対象ロール**: 全ロール
- **概要**: メール + パスワードで登録・ログインする。登録時にロールを付与し、ログイン後はロール別ホームへ遷移する。
- **画面**: サインアップ、サインイン、配達員サインアップ/サインイン
- **データ**: `auth.users`, `profiles`
- **受け入れ条件**:
  - 登録後に `profiles` 行が作られる
  - `profiles.role` に `recipient`, `agent`, `delivery_company` のいずれかが入る
  - ログイン後、ロール別のトップ画面へ遷移する

### F-AUTH-02 ロール管理・プロフィール CRUD

- **優先度**: P0
- **状況**: ✅
- **概要**: プロフィール作成・取得・更新・削除、ロール判定を共通化する。
- **データ**: `profiles`
- **受け入れ条件**:
  - 不正なロール値を UI がそのまま信用しない
  - `recipient`, `agent`, `delivery_company` 以外は null またはエラー扱いにする

### F-AUTH-03 表示名・電話番号・連絡先

- **優先度**: P1
- **状況**: 🟡
- **概要**: 受取人、代理受取スポット、配達員の連絡用プロフィール情報を管理する。
- **データ**: `profiles.phone`, `profiles.display_name`
- **不足**:
  - 代理受取スポットプロフィール編集時、緊急連絡先の再取得・表示が弱い
  - 確定前/確定後で電話番号の公開範囲を分ける必要がある
- **受け入れ条件**:
  - 候補確定前は詳細な個人連絡先を表示しない
  - 確定後、必要な範囲でスポット連絡先を表示できる

---

## 4.B 配送会社・配達員管理

### F-CARRIER-01 配送会社 CRUD

- **優先度**: P1
- **状況**: 🟡
- **概要**: 配送会社の作成・更新・削除・一覧を管理する。
- **データ**: `delivery_companies`
- **不足**:
  - デモ用会社ID固定から脱却できていない
  - 配達員ユーザーと配送会社の正規紐付けが弱い
- **受け入れ条件**:
  - 配送会社が複数あっても、自社の荷物のみ参照できる
  - 配達員ユーザーがどの会社に属するか判定できる

### F-CARRIER-02 配送会社メンバー管理

- **優先度**: P1
- **状況**: ❌
- **概要**: 配達員ユーザーを配送会社に紐付ける。
- **データ案**:

```text
delivery_company_members
- id
- delivery_company_id
- user_id
- role: admin / driver / viewer
- status: active / invited / suspended
- created_at
```

- **受け入れ条件**:
  - 配達員は所属会社の荷物だけ読める
  - 管理者は自社の配達員を追加・停止できる
  - RLS で会社境界を担保する

---

## 4.C 荷物管理

### F-PARCEL-01 荷物の作成・取得・一覧

- **優先度**: P0
- **状況**: ✅/🟡
- **対象ロール**: 受取人、配達員、代理受取スポット
- **概要**: 荷物を作成し、ロールに応じた一覧・詳細を取得する。
- **データ**: `parcels`
- **不足**:
  - 受取人が入力した伝票番号が `createParcel` に渡っていない場合がある
  - 荷物サイズ・荷物種別・対象外荷物判定が弱い
- **追加カラム案**:

```text
parcels
- tracking_no
- parcel_size: small / medium / large
- parcel_type: normal / chilled / frozen / fragile / high_value / restricted
- delivery_company_id
- recipient_id
- assigned_agent_id
- storage_started_at
- storage_deadline_at
- co2_saved_kg
```

- **受け入れ条件**:
  - 受取人が入力した伝票番号を保存できる
  - 荷物種別が代理受取対象外なら、代理受取フローに進めない
  - ロールごとに見える荷物が制御される

### F-PARCEL-02 ステータス定義・履歴

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 荷物ステータスの遷移と履歴を管理する。
- **既存ステータス**:

```text
created
out_for_delivery
delivery_failed
agent_assigned
delivered_to_agent
handed_to_recipient
completed
```

- **推奨表示名**:

| DBステータス | UI表示 |
| --- | --- |
| `created` | 配達準備中 |
| `out_for_delivery` | 配達中 |
| `delivery_failed` | 不在 / 代理受取先を調整中 |
| `agent_assigned` | 代理受取スポット決定 |
| `delivered_to_agent` | 代理受取スポットで保管中 |
| `handed_to_recipient` | 受取人へ引き渡し済み |
| `completed` | 完了 |

- **受け入れ条件**:
  - ステータス変更時に `parcel_status_histories` が保存される
  - 不正な遷移は拒否する
  - UI文言は「代理人キープ中」ではなく「代理受取スポットで保管中」に寄せる

### F-PARCEL-03 荷物対象外条件

- **優先度**: P1
- **状況**: ❌
- **概要**: 代理受取に向かない荷物を除外する。
- **対象外荷物**:

```text
- 冷蔵 / 冷凍
- 生鮮食品
- 高額品
- 危険物
- 本人限定受取
- 着払い
- 大型荷物
- 破損リスクが高いもの
```

- **受け入れ条件**:
  - 荷物登録時に対象外荷物なら警告する
  - 推薦時にスポットの受入可能種別と照合する

---

## 4.D 受取人の代理受取条件

### F-RCPT-REQ-01 代理受取条件の作成

- **優先度**: P0
- **状況**: ❌
- **対象ロール**: 受取人
- **概要**: 荷物ごと、またはプロフィール設定として代理受取条件を登録する。
- **画面案**: 荷物登録画面、代理受取設定画面
- **データ案**:

```text
parcel_proxy_requests
- id
- parcel_id
- recipient_id
- use_proxy_receiving
- max_distance_meters
- allow_individual_spots
- allowed_spot_types: store / facility / manager_room / individual[]
- preference_template: safety / distance / night / usual / auto
- desired_pickup_start_time
- desired_pickup_end_time
- note
- status: active / canceled / expired
- created_at
- updated_at
```

- **受け入れ条件**:
  - 受取人が「個人スポットNG」を設定できる
  - 探索距離を設定できる
  - 受取希望時間を設定できる
  - 推薦APIがこの条件を参照する

### F-RCPT-REQ-02 お気に入り / NGスポット

- **優先度**: P1
- **状況**: ❌
- **概要**: 受取人が使いたいスポット・使いたくないスポットを管理する。
- **データ案**:

```text
recipient_spot_preferences
- id
- recipient_id
- agent_id
- preference_type: favorite / blocked
- note
- created_at
```

- **受け入れ条件**:
  - `blocked` のスポットは推薦候補に出ない
  - `favorite` のスポットは条件を満たす場合にスコア加点される

### F-RCPT-REQ-03 設定テンプレート

- **優先度**: P0
- **状況**: ❌
- **概要**: 受取人が迷わず設定できるように、テンプレートを用意する。
- **テンプレート**:

| テンプレート | 内容 |
| --- | --- |
| 安全重視 | 店舗/施設/管理人室を優先、個人スポット除外 |
| 近さ重視 | 1km以内を優先、距離スコアを強化 |
| 夜に受け取りたい | 夜間受取可能スポットを優先 |
| いつもの場所 | お気に入りスポットを優先 |
| おまかせ | 推薦APIに任せる |

- **受け入れ条件**:
  - デモでは「安全重視 / 1km以内 / 個人NG / 19時以降」を選べる

---

## 4.E 代理受取スポットプロフィール・スケジュール

### F-SPOT-01 スポットプロフィール編集

- **優先度**: P0
- **状況**: 🟡
- **対象ロール**: 代理受取スポット
- **概要**: スポットの住所、位置、種別、営業時間、連絡先、受入条件を登録する。
- **既存**: 住所、曜日、開始時刻、終了時刻の土台あり
- **追加カラム案**:

```text
agent_profiles
- spot_type: store / facility / manager_room / individual
- review_status: pending_review / approved / rejected / suspended
- max_storage_count
- current_storage_count
- is_available_today
- accepts_auto_assign
- accepts_individual_recipients
- delivery_accept_start_time
- delivery_accept_end_time
- recipient_pickup_start_time
- recipient_pickup_end_time
- same_day_cutoff_time
- accepted_parcel_types
- max_parcel_size
- public_address_label
- pickup_instruction
```

- **受け入れ条件**:
  - スポット種別を登録できる
  - 今日対応可能 ON/OFF を切り替えられる
  - 同時保管可能数を登録できる
  - 候補カードに「店舗スポット」「空き枠 2/5」などを表示できる

### F-SPOT-02 基本スケジュール

- **優先度**: P1
- **状況**: ❌/🟡
- **概要**: 曜日ごとの配達員受取可能時間と受取人引き渡し時間を管理する。
- **データ案**:

```text
agent_availability_rules
- id
- agent_id
- day_of_week
- delivery_accept_start_time
- delivery_accept_end_time
- recipient_pickup_start_time
- recipient_pickup_end_time
- max_storage_count
- is_active
- created_at
- updated_at
```

- **受け入れ条件**:
  - 配達員から受け取れる時間と、受取人へ渡せる時間を別に設定できる
  - 推薦時に受取人希望時間と照合できる

### F-SPOT-03 日付別例外・臨時休業

- **優先度**: P2
- **状況**: ❌
- **概要**: 特定日だけ休み、短縮営業、臨時対応を設定する。
- **データ案**:

```text
agent_availability_exceptions
- id
- agent_id
- date
- is_closed
- delivery_accept_start_time
- delivery_accept_end_time
- recipient_pickup_start_time
- recipient_pickup_end_time
- max_storage_count_override
- note
- created_at
```

### F-SPOT-04 保管枠管理

- **優先度**: P0/P1
- **状況**: ❌/🟡
- **概要**: 同時保管可能数と現在保管数を管理し、満枠なら推薦から除外する。
- **受け入れ条件**:
  - `delivered_to_agent` 時に `current_storage_count` を増やす
  - `completed` または回収時に `current_storage_count` を減らす
  - 満枠スポットは候補から除外する
  - MVP では seed 値で `空き枠 2/5` を表示するだけでも可

### F-SPOT-05 顔写真 / スポット写真

- **優先度**: P2
- **状況**: ❌
- **概要**: 任意でスポット写真・受取口写真を登録する。
- **データ**: Storage bucket + `agent_profiles.photo_url`
- **注意**:
  - 個人宅の顔写真より、店舗外観や受取口写真の方が自然
  - 確定前の公開範囲に注意する

---

## 4.F 推薦・マッチング

### F-RECO-01 近隣スポット検索

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 位置情報と探索範囲から候補スポットを取得する。
- **不足**:
  - 現行の半径検索はデモ都合で広めになりがち
  - スポット種別、審査状態、保管枠、受取時間のフィルタが弱い
- **受け入れ条件**:
  - 指定距離外の候補は出さない
  - 未承認スポットは出さない
  - 個人NG設定なら個人スポットを除外する

### F-RECO-02 ハードフィルタ

- **優先度**: P0
- **状況**: ❌/🟡
- **概要**: 成立しない候補を推薦前に除外する。
- **除外条件**:

```text
- review_status != approved
- is_available_today = false
- current_storage_count >= max_storage_count
- 探索距離外
- 配達員迂回距離が許容外
- 受取人希望時間と合わない
- 荷物タイプが対象外
- 個人スポットで受取人が許可していない
- NGスポット
- トラブル履歴が基準超過
```

- **受け入れ条件**:
  - 除外された候補について、少なくともデモでは理由を表示できる

### F-RECO-03 スコアリング

- **優先度**: P0
- **状況**: 🚧/🟡
- **概要**: 候補スポットを距離・時間・信頼度・保管枠・配達員迂回距離で並べる。
- **スコア要素**:

```text
distance_score      30%
schedule_score      20%
trust_score         20%
capacity_score      10%
detour_score        10%
spot_type_score      5%
preference_score     5%
```

- **受け入れ条件**:
  - `score` だけでなく `reasons` を返す
  - 候補カードに推薦理由が表示される
  - 最短距離の候補が条件不一致なら除外できる

### F-RECO-04 推薦レスポンス契約

- **優先度**: P0
- **状況**: ❌/🟡
- **APIレスポンス案**:

```ts
type RecommendedSpot = {
  agent_id: string;
  display_name: string;
  spot_type: 'store' | 'facility' | 'manager_room' | 'individual';
  distance_meters: number;
  walking_minutes: number;
  pickup_window_label: string;
  capacity_label: string;
  score: number;
  reasons: string[];
  public_address_label: string;
};

type ExcludedSpot = {
  agent_id: string;
  display_name: string;
  distance_meters: number;
  reason: string;
};

type RecommendResponse = {
  parcel_id: string;
  recommended_spots: RecommendedSpot[];
  excluded_spots: ExcludedSpot[];
  fallback_used: boolean;
};
```

- **受け入れ条件**:
  - UIで `recommended_spots` と `excluded_spots` を表示できる
  - 推薦APIが落ちた場合はルールベースで候補を返せる

### F-RECO-05 推薦ログ・選択ログ

- **優先度**: P1
- **状況**: 🟡/❌
- **概要**: 表示候補、選択候補、除外理由、最終選択をログに残す。
- **データ案**:

```text
recommendation_logs
- id
- parcel_id
- recipient_id
- request_payload
- response_payload
- chosen_agent_id
- chosen_at
- created_at
```

- **目的**:
  - 将来の推薦学習
  - なぜそのスポットになったかの説明
  - トラブル時の監査

---

## 4.G マッチング・割り当て

### F-MATCH-01 スポット割り当て

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 荷物に代理受取スポットを割り当て、ステータスを `agent_assigned` にする。
- **データ**: `delivery_matches`, `parcels.assigned_agent_id`
- **受け入れ条件**:
  - 割り当て時に通知が作られる
  - 割り当て時に保管枠を仮押さえできるとよい
  - 確定前は詳細住所を出しすぎない

### F-MATCH-02 自動仮割当

- **優先度**: P1
- **状況**: ❌
- **概要**: 受取人が一定時間反応しない場合、事前条件に合う1位候補へ仮割当する。
- **受け入れ条件**:
  - 不在報告後、指定秒数で自動仮割当できる
  - 候補なしの場合は再配達フローへ戻す
  - 個人スポットへの自動割当は受取人許可がある場合のみ

---

## 4.H QR認証・保管証跡

### F-QR-01 QRトークン生成

- **優先度**: P0
- **状況**: ✅
- **概要**: スポット用QR、受取人用QRを生成する。
- **データ**: `qr_tokens`
- **受け入れ条件**:
  - QRは有効期限付き
  - 使用済みトークンは再利用できない
  - ただし期待ステータスに到達済みなら冪等に成功扱いできる

### F-QR-02 スポットQR検証

- **優先度**: P0
- **状況**: ✅/⚠️
- **概要**: 配達員がスポットQRを読み取り、荷物を `delivered_to_agent` にする。
- **不足**:
  - エラー種別が文字列依存の場合、機械可読 `code` が必要
- **受け入れ条件**:
  - QR種別違い、期限切れ、別荷物QRを検出できる
  - 成功時に保管開始時刻と保管期限を設定する

### F-QR-03 受取人QR検証

- **優先度**: P0
- **状況**: ✅/⚠️
- **概要**: 代理受取スポットが受取人QRを読み取り、荷物を `completed` にする。
- **受け入れ条件**:
  - 受取人QRは、該当荷物・該当受取人・該当スポットでのみ有効
  - 完了時に保管枠を解放する
  - 完了時にCO2、報酬、請求イベントが発生する

### F-CUSTODY-01 保管証跡イベント

- **優先度**: P0
- **状況**: ❌
- **概要**: 荷物の責任状態をイベントログとして残す。
- **データ案**:

```text
parcel_custody_events
- id
- parcel_id
- event_type: assigned_to_spot / delivered_to_spot / stored / pickup_intent_created / handed_to_recipient / issue_reported / returned_to_carrier
- from_actor_id
- from_actor_type: driver / spot / recipient / system
- to_actor_id
- to_actor_type: driver / spot / recipient / system
- qr_verified
- photo_url
- location_lat
- location_lng
- note
- created_at
```

- **受け入れ条件**:
  - スポットQR検証時に `delivered_to_spot` が記録される
  - 受取人QR検証時に `handed_to_recipient` が記録される
  - 画面またはデバッグ表示で保管ログを確認できる

---

## 4.I 配達員 / 配送会社画面

### F-DRIVER-01 配達員ホーム

- **優先度**: P0
- **状況**: ✅
- **概要**: 自社の担当荷物を一覧表示し、状態別アクションを出す。
- **アクション**:

```text
- 配達開始
- 不在報告
- 代理受取スポットを探す
- スポットQRを読む
```

- **受け入れ条件**:
  - ステータスごとに必要な操作だけ表示する
  - 自社荷物のみ表示する

### F-DRIVER-02 不在報告

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 不在時に `delivery_failed` へ更新し、推薦フローへ進める。
- **追加要件**:
  - 不在報告時に推薦APIを呼び出す
  - 受取人条件がない場合は通常再配達へ戻せる

### F-DRIVER-03 スポット候補確認

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 地図・リストで候補スポットを確認し、配送先として選ぶ。
- **不足**:
  - 代理受取スポットの種別、空き枠、受取可能時間の表示
  - 配達員迂回距離の表示
- **受け入れ条件**:
  - 地図が使えない環境でもリストで選べる
  - 詳細住所は割り当て後に表示する

### F-DRIVER-04 QR読み取り

- **優先度**: P0
- **状況**: ✅
- **概要**: カメラでスポットQRを読み、荷物をスポット保管中にする。
- **受け入れ条件**:
  - 二重読み取りで壊れない
  - 読み取り失敗時の理由が分かる

---

## 4.J 受取人画面

### F-RCPT-01 荷物一覧・登録

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 受取人が荷物を登録・確認する。
- **追加要件**:
  - 伝票番号を保存する
  - 荷物種別・サイズを設定する
  - 代理受取を利用するか選べる

### F-RCPT-02 代理受取条件設定

- **優先度**: P0
- **状況**: ❌
- **概要**: 荷物ごとに代理受取条件を設定する。
- **画面項目**:

```text
- 代理受取を利用する
- 探索距離
- 個人スポットを許可する
- 受取希望時間
- 安全重視 / 近さ重視 / 夜間受取重視 / おまかせ
```

- **受け入れ条件**:
  - デモで「個人NG」を指定できる
  - 推薦結果に反映される

### F-RCPT-03 推薦候補選択

- **優先度**: P0
- **状況**: 🟡
- **概要**: 推薦候補を受取人に表示し、スポットを選べる。
- **候補カード表示**:

```text
- スポット名
- スポット種別
- 距離 / 徒歩目安
- 本日の受取可能時間
- 空き枠
- 評価 / 実績
- 推薦理由
- 概略住所
```

- **受け入れ条件**:
  - `みどり商店 / 店舗 / 650m / 18:00〜21:00 / 空き2/5` を表示できる
  - `山田さん宅 / 個人NGのため除外` を表示できる

### F-RCPT-04 受取準備 / 受取調整

- **優先度**: P0
- **状況**: 🟡/❌
- **概要**: 荷物がスポットで保管された後、受取人が到着予定を共有する。
- **画面項目**:

```text
- 代理受取スポット情報
- 本日の受取可能時間
- 保管期限
- 今から取りに行く
- 10分後 / 30分後 / 19:30ごろ
- 遅れる
- 本日中に行けない
- 受取人QR
- 問題を報告
```

- **データ**: `pickup_intents`
- **受け入れ条件**:
  - ボタン押下で `pickup_intents` が作成される
  - スポット側に到着予定が表示される

### F-RCPT-05 完了画面

- **優先度**: P0
- **状況**: 🟡
- **概要**: 引き渡し完了後、CO2削減・評価・請求/報酬イベントを表示する。
- **追加表示**:

```text
- CO2削減量
- 配送会社請求イベント: pending
- スポット報酬イベント: pending
- スポット評価
```

- **受け入れ条件**:
  - 完了時に `billing_events` と `spot_reward_events` が作成またはモック表示される

---

## 4.K 代理受取スポット画面

### F-SPOT-UI-01 スポットホーム / 保管中荷物一覧

- **優先度**: P0
- **状況**: ✅/🟡
- **概要**: 代理受取スポットが保管中の荷物を確認する。
- **追加表示**:

```text
- 現在保管数 3/5
- 今日対応可能 ON/OFF
- 保管中荷物リスト
- 受取人到着予定
- 保管期限
- トラブル報告ボタン
```

- **受け入れ条件**:
  - 受取人が「19:30ごろ取りに行く」を押すと荷物カードに表示される

### F-SPOT-UI-02 スポットQR表示

- **優先度**: P0
- **状況**: ✅
- **概要**: 配達員に読み取らせるQRを表示する。
- **受け入れ条件**:
  - 該当荷物・該当スポット用のQRである
  - 期限切れ時は再発行できる

### F-SPOT-UI-03 受取人QR読み取り

- **優先度**: P0
- **状況**: ✅
- **概要**: 受取人のQRを読み取り、引き渡し完了にする。
- **受け入れ条件**:
  - 完了時に保管枠が解放される
  - 報酬イベントが作成される

### F-SPOT-UI-04 混雑モード / 一時停止

- **優先度**: P1
- **状況**: ❌
- **概要**: 忙しい時に新規受付を止められる。
- **画面項目**:

```text
- 今日対応可能 ON/OFF
- 30分停止
- 本日停止
- 現在の保管数
```

- **受け入れ条件**:
  - OFF のスポットは推薦候補から除外される

---

## 4.L 受取調整・メッセージ

### F-PICKUP-01 受取意図 `pickup_intents`

- **優先度**: P0
- **状況**: ❌
- **概要**: 受取人が取りに向かう意思・到着予定を保存する。
- **データ案**:

```text
pickup_intents
- id
- parcel_id
- recipient_id
- agent_id
- eta_minutes
- scheduled_at
- status: on_the_way / scheduled / delayed / canceled / arrived / completed
- message
- created_at
- updated_at
```

- **受け入れ条件**:
  - 受取人が「今から行く」「19:30ごろ」を登録できる
  - スポット側に到着予定が表示される
  - 通知が作成される

### F-PICKUP-02 定型メッセージ

- **優先度**: P0/P1
- **状況**: 🟡/❌
- **概要**: 自由入力より先に、運用に必要な定型連絡を用意する。
- **受取人テンプレート**:

```text
- 今から取りに行きます
- 約10分で到着します
- 約30分で到着します
- 19時ごろに取りに行きます
- 少し遅れます
- 本日中に行けません
- 場所がわかりません
```

- **スポットテンプレート**:

```text
- お待ちしています
- 本日は○時まで受取可能です
- 入口はこちらです
- 受取時にQRを表示してください
- 保管期限が近づいています
```

### F-MSG-01 自由入力メッセージ

- **優先度**: P1
- **状況**: 🟡/❌
- **概要**: 荷物単位で受取人とスポットがメッセージできる。
- **データ**: `handover_messages`
- **注意**:
  - 自由入力は補助にする
  - 主導線は `pickup_intents` と定型ボタン

---

## 4.M 通知

### F-NOTIF-01 通知取得・既読

- **優先度**: P1
- **状況**: 🟡
- **概要**: 通知一覧、既読、未読件数を扱う。
- **データ**: `notifications`
- **不足**:
  - 未読件数
  - 一括既読
  - 種別フィルタ
  - リアルタイム/プッシュ通知

### F-NOTIF-02 通知種別追加

- **優先度**: P0/P1
- **状況**: ❌/🟡
- **追加種別**:

```text
parcel_assigned_to_spot
parcel_delivered_to_spot
pickup_intent_created
pickup_delayed
storage_expiring
storage_expired
incident_reported
reward_pending
reward_confirmed
billing_event_created
```

- **受け入れ条件**:
  - 受取人が荷物保管開始を知れる
  - スポットが受取人の到着予定を知れる
  - 期限超過前に通知できる

---

## 4.N 評価・信頼度

### F-REVIEW-01 スポット評価

- **優先度**: P1
- **状況**: 🟡/❌
- **概要**: 完了後、受取人がスポットを評価する。
- **データ案**:

```text
agent_reviews
- id
- parcel_id
- recipient_id
- agent_id
- rating
- comment
- tags
- created_at
```

- **受け入れ条件**:
  - 完了後のみ評価できる
  - 平均評価・件数を候補カードに表示できる
  - 推薦の `trust_score` に反映できる

### F-TRUST-01 安心ラベル

- **優先度**: P0/P1
- **状況**: ❌
- **概要**: 候補カードに安全性をタグで表示する。
- **ラベル例**:

```text
- 本人確認済み
- 店舗スポット
- 夜間受取OK
- 過去30件トラブルなし
- 外装写真記録あり
```

- **受け入れ条件**:
  - 候補カードにタグ表示できる
  - 数字だけではなく人間に伝わる安心材料を出す

---

## 4.O 保管期限・トラブル

### F-STORAGE-01 保管期限設定

- **優先度**: P0
- **状況**: 🟡/❌
- **概要**: スポット保管開始時に保管期限を設定する。
- **データ**: `parcels.storage_started_at`, `parcels.storage_deadline_at`
- **受け入れ条件**:
  - `delivered_to_agent` 時に保管開始時刻と期限が入る
  - 受取人画面とスポット画面に期限が表示される

### F-STORAGE-02 期限超過対応

- **優先度**: P1
- **状況**: ❌
- **概要**: 保管期限を過ぎた荷物を配送会社回収または再配達へ戻す。
- **データ案**:

```text
storage_escalations
- id
- parcel_id
- escalation_type: carrier_pickup / redelivery / support_review
- status: pending / requested / resolved / canceled
- note
- created_at
```

- **受け入れ条件**:
  - 期限超過時に通知が出る
  - スポット報酬が保留される
  - 配送会社回収依頼に進める

### F-INCIDENT-01 トラブル報告

- **優先度**: P1
- **状況**: 🟡/❌
- **概要**: 紛失、破損、誤受け渡しなどを報告する。
- **データ案**:

```text
parcel_incident_reports
- id
- parcel_id
- reported_by
- reporter_role
- incident_type: lost / damaged / wrong_handover / recipient_no_show / qr_error / other
- description
- photo_url
- status: open / investigating / resolved / rejected
- created_at
- updated_at
```

- **受け入れ条件**:
  - 受取人・スポット・配達員が問題を報告できる
  - 報告があると報酬イベントが `held` になる

---

## 4.P 報酬・請求・ポイント

### F-BILLING-01 配送会社請求イベント

- **優先度**: P0
- **状況**: ❌
- **概要**: ShareKeep 経由で完了した荷物について、配送会社への請求イベントを作る。
- **データ案**:

```text
billing_events
- id
- parcel_id
- delivery_company_id
- recipient_id
- agent_id
- event_type: completed_via_sharekeep
- amount
- status: pending / confirmed / canceled / refunded
- created_at
- confirmed_at
```

- **受け入れ条件**:
  - 完了画面またはデバッグ画面で `配送会社請求イベント pending` を表示できる
  - 実決済は不要

### F-REWARD-01 スポット報酬イベント

- **優先度**: P0
- **状況**: ❌
- **概要**: 代理受取スポットに付与する報酬を台帳管理する。
- **データ案**:

```text
spot_reward_events
- id
- parcel_id
- agent_id
- reward_type: point / cash / coupon / store_promotion
- reward_amount
- status: pending / confirmed / held / canceled
- reason
- created_at
- confirmed_at
```

- **受け入れ条件**:
  - 完了時に報酬イベントが `pending` で作られる
  - トラブルなしなら `confirmed` にできる
  - トラブルありなら `held` にできる

### F-POINT-01 ポイント残高・履歴

- **優先度**: P1
- **状況**: 🟡
- **概要**: スポット報酬をポイントとして表示する。
- **データ**: `point_transactions`
- **不足**:
  - 残高取得API
  - 履歴表示UI
  - 特典交換UI
- **受け入れ条件**:
  - スポットが自分の獲得予定・確定ポイントを見られる

### F-ACHIEVEMENT-01 実績・レベル

- **優先度**: P2
- **状況**: 🟡
- **概要**: 代理受取件数や地域貢献を可視化する。
- **表示例**:

```text
- 今月の受取件数
- 累計再配達回避件数
- レベル
- バッジ
```

---

## 4.Q CO2・分析

### F-CO2-01 CO2削減量計算

- **優先度**: P0/P1
- **状況**: 🟡
- **概要**: 再配達回避による CO2 削減量を計算して表示する。
- **データ**: `co2_reduction_logs`, `parcels.co2_saved_kg`
- **受け入れ条件**:
  - 算出式と係数をサーバ側に寄せる
  - 完了画面で削減量を表示できる
  - MVP では固定係数でもよい

### F-CO2-02 スポット貢献ダッシュボード

- **優先度**: P1/P2
- **状況**: ❌
- **概要**: 代理受取スポットが地域貢献を確認できる。
- **表示例**:

```text
今月の貢献
- 受取件数: 12件
- 再配達回避: 12回
- 推定CO2削減: 3.4kg
- 付与予定ポイント: 1,200pt
```

---

## 4.R 運営管理・RLS・監査

### F-ADMIN-01 スポット審査

- **優先度**: P2
- **状況**: ❌
- **概要**: 代理受取スポットの承認・停止・却下を管理する。
- **データ**: `agent_profiles.review_status`
- **受け入れ条件**:
  - `approved` のみ推薦対象になる
  - `suspended` は即時候補から外れる

### F-ADMIN-02 トラブル対応管理

- **優先度**: P2
- **状況**: ❌
- **概要**: 運営がトラブル報告を確認し、報酬保留・解除を判断する。
- **受け入れ条件**:
  - `parcel_incident_reports` を一覧できる
  - `spot_reward_events.status` を変更できる

### F-SEC-01 RLS整理

- **優先度**: P1
- **状況**: ⚠️
- **概要**: ロールごとに閲覧・更新できるデータを制御する。
- **確認項目**:

```text
- 受取人は自分の荷物だけ読める
- スポットは自分に割り当てられた荷物だけ読める
- 配送会社は自社の荷物だけ読める
- 通知は本人のみ読める
- メッセージは関係者のみ読める
- 報酬イベントは対象スポットと運営のみ読める
- 請求イベントは配送会社と運営のみ読める
```

### F-AUDIT-01 監査ログ

- **優先度**: P1/P2
- **状況**: ❌/🟡
- **概要**: ステータス変更、QR検証、保管証跡、報酬変更をログとして残す。
- **受け入れ条件**:
  - トラブル時に「いつ誰が何をしたか」を追える

---

## 5. データモデル一覧

### 5.1 既存・継続利用

```text
profiles
agent_profiles
delivery_companies
parcels
parcel_status_histories
delivery_matches
qr_tokens
notifications
point_transactions
achievements
co2_reduction_logs
handover_messages
agent_reviews
```

### 5.2 追加推奨テーブル

```text
parcel_proxy_requests
recipient_spot_preferences
agent_availability_rules
agent_availability_exceptions
pickup_intents
parcel_pickup_reservations
parcel_custody_events
parcel_incident_reports
storage_escalations
billing_events
spot_reward_events
delivery_company_members
recommendation_logs
```

### 5.3 MVPで最優先の追加テーブル

発表までに絞るなら、以下だけでよい。

```text
parcel_proxy_requests
pickup_intents
parcel_custody_events
billing_events
spot_reward_events
```

`agent_profiles` は新規テーブルを作らず、まずカラム追加または seed で対応してもよい。

---

## 6. API / RPC / Edge Function 一覧

| API / Function | 優先度 | 状況 | 内容 |
| --- | --- | --- | --- |
| `createParcel` | P0 | ✅/🟡 | 荷物作成。伝票番号・荷物種別対応が必要 |
| `fetchMyParcels` | P0 | ✅ | 受取人荷物一覧 |
| `fetchDriverParcels` | P0 | ✅ | 配達員荷物一覧 |
| `updateParcelStatus` | P0 | ✅ | ステータス更新・履歴保存 |
| `createParcelProxyRequest` | P0 | ❌ | 代理受取条件作成 |
| `updateParcelProxyRequest` | P0 | ❌ | 代理受取条件更新 |
| `upsertAgentProfile` | P0 | 🟡 | スポットプロフィール更新。カラム追加必要 |
| `setSpotAvailabilityToday` | P0 | ❌ | 今日対応可能ON/OFF |
| `recommendSpotsForParcel` | P0 | 🚧/🟡 | 推薦候補・除外理由取得 |
| `markRecommendationChosen` | P0 | 🟡 | 選択ログ保存 |
| `assignAgentToParcel` | P0 | ✅/🟡 | スポット割当 |
| `generateQrToken` | P0 | ✅ | QR生成 |
| `verifyAgentQr` | P0 | ✅/⚠️ | スポットQR検証 |
| `verifyRecipientQr` | P0 | ✅/⚠️ | 受取人QR検証 |
| `createPickupIntent` | P0 | ❌ | 到着予定・今から行く |
| `fetchPickupIntentForParcel` | P0 | ❌ | 荷物ごとの到着予定取得 |
| `createCustodyEvent` | P0 | ❌ | 保管証跡記録 |
| `createBillingEvent` | P0 | ❌ | 請求イベント作成 |
| `createSpotRewardEvent` | P0 | ❌ | 報酬イベント作成 |
| `reportParcelIncident` | P1 | ❌ | トラブル報告 |
| `fetchMyNotifications` | P1 | 🟡 | 通知取得 |
| `markNotificationRead` | P1 | 🟡 | 通知既読 |
| `getUnreadNotificationCount` | P1 | ❌ | 未読件数 |
| `createAgentReview` | P1 | 🟡/❌ | 評価作成 |
| `fetchCo2Summary` | P1 | ❌ | CO2集計 |

---

## 7. 画面一覧

### 7.1 受取人

| 画面 | 優先度 | 状況 | 追加すべき内容 |
| --- | --- | --- | --- |
| 荷物一覧 / 登録 | P0 | ✅/🟡 | 伝票番号保存、荷物種別、代理受取条件 |
| 代理受取条件設定 | P0 | ❌ | 探索距離、個人NG、希望時間、テンプレート |
| 候補選択 / マッチング | P0 | 🟡 | スポット種別、時間、空き枠、推薦理由、除外理由 |
| 受取準備 / pickup-ready | P0 | 🟡 | 到着予定、保管期限、受取調整ボタン |
| 完了 | P0 | 🟡 | 請求イベント、報酬イベント、評価 |
| 通知一覧 | P1 | 🟡 | 種別・未読件数 |

### 7.2 代理受取スポット

| 画面 | 優先度 | 状況 | 追加すべき内容 |
| --- | --- | --- | --- |
| スポットプロフィール | P0 | 🟡 | spot_type、保管上限、今日対応可能、受取時間 |
| 保管中荷物一覧 | P0 | ✅/🟡 | 到着予定、保管期限、現在保管数 |
| スポットQR表示 | P0 | ✅ | 文言変更 |
| 受取人QR読み取り | P0 | ✅ | 報酬イベント連動 |
| 報酬/貢献ダッシュボード | P1 | ❌ | 件数、CO2、ポイント |

### 7.3 配達員 / 配送会社

| 画面 | 優先度 | 状況 | 追加すべき内容 |
| --- | --- | --- | --- |
| 配達員ホーム | P0 | ✅ | 文言変更、自社荷物制御 |
| 不在報告 | P0 | ✅/🟡 | 推薦呼び出し |
| スポット候補マップ/リスト | P0 | ✅/🟡 | スポット種別、空き枠、迂回距離 |
| QR読み取り | P0 | ✅ | エラーコード契約 |
| 配送会社管理 | P1 | ❌ | メンバー管理、自社請求イベント |

---

## 8. P0 実装チェックリスト

発表までに最短で評価を取りに行くなら、以下を優先する。

### 8.1 文言変更

- [ ] 画面上の `代理人` を `代理受取スポット` に変更
- [ ] `代理人キープ中` を `代理受取スポットで保管中` に変更
- [ ] 候補選択画面のタイトルを `代理受取スポットを選ぶ` に変更

### 8.2 スポット情報

- [ ] `spot_type` を seed または DB に追加
- [ ] `max_storage_count` を seed または DB に追加
- [ ] `current_storage_count` を seed または DB に追加
- [ ] `is_available_today` を seed または DB に追加
- [ ] 候補カードに `店舗スポット / 空き枠 2/5 / 本日21時まで` を表示

### 8.3 受取人条件

- [ ] 個人スポット可否を設定できる
- [ ] 探索距離を設定できる
- [ ] 希望受取時間を設定できる
- [ ] 安全重視テンプレートを選べる

### 8.4 推薦表示

- [ ] `reasons` を候補カードに表示
- [ ] `excluded_spots` を最低1件表示
- [ ] `山田さん宅: 個人スポットNGのため除外` を見せる
- [ ] `みどり商店: 夜まで受取可・空き枠あり` を1位にする

### 8.5 受取調整

- [ ] `今から行く` または `19:30ごろ取りに行く` を押せる
- [ ] `pickup_intents` または `handover_messages` に保存する
- [ ] スポット側に到着予定を表示する

### 8.6 保管・完了

- [ ] スポットQR読み取りで `delivered_to_agent` になる
- [ ] 保管期限を表示する
- [ ] 受取人QR読み取りで `completed` になる
- [ ] 完了画面に CO2、請求イベント、報酬イベントを表示する

---

## 9. デモ seed 要件

### 9.1 スポット seed

| display_name | spot_type | 距離 | 受取時間 | 保管枠 | 評価 | 結果 |
| --- | --- | ---: | --- | --- | ---: | --- |
| 山田さん宅 | individual | 150m | 18:00〜22:00 | 1/2 | 4.9 | 個人NGで除外 |
| みどり商店 | store | 650m | 18:00〜21:00 | 2/5 | 4.8 | 1位 |
| さくら管理人室 | manager_room | 400m | 09:00〜18:00 | 1/3 | 4.6 | 時間不一致で除外 |
| コワーキングA | facility | 1.2km | 10:00〜22:00 | 4/10 | 4.7 | 2位 |

### 9.2 受取人条件 seed

```text
preference_template: safety
max_distance_meters: 1000
allow_individual_spots: false
desired_pickup_start_time: 19:00
desired_pickup_end_time: 21:00
allowed_spot_types: store, facility, manager_room
```

### 9.3 荷物 seed

```text
parcel_type: normal
parcel_size: small
status: out_for_delivery
recipient_id: demo_recipient
```

---

## 10. 既知の課題・技術的負債

### ⚠️-01 配送会社ID固定

デモ用会社ID固定は、複数配送会社を想定すると破綻する。  
`delivery_company_members` または `profiles.delivery_company_id` で正規化する。

### ⚠️-02 QR検証エラー契約

エラー判定が文字列依存だと UI が壊れやすい。  
Edge Function は機械可読な `code` を返す。

```json
{
  "success": false,
  "code": "QR_EXPIRED",
  "message": "QRの有効期限が切れています",
  "parcel_id": "..."
}
```

### ⚠️-03 RLS確認

配達員、受取人、スポット、配送会社、運営の権限境界を改めて確認する。

### ⚠️-04 `代理人` 文言の残存

画面やDB名は残ってもよいが、UX上は「代理受取スポット」へ寄せる。

### ⚠️-05 受取人が即時選択しない問題

本番では、受取人の即時反応に依存しない自動仮割当が必要。  
MVPでは発表時に説明する。

### ⚠️-06 個人スポットの安全性

個人スポットは、本人確認・審査・受取人許可がない限り候補化しない。  
デモでは「個人NGで除外」を必ず見せる。

---

## 11. 実装ロードマップ

### 11.1 P0: 発表まで

1. 文言を代理受取スポットに統一
2. スポット seed に種別・受取時間・空き枠を追加
3. 候補カードを強化
4. 除外理由を表示
5. 受取人条件設定を簡易実装
6. `pickup_intents` を追加、または既存メッセージで代用
7. スポット側に到着予定を表示
8. 完了画面に請求/報酬イベントを表示
9. 保管期限を表示

### 11.2 P1: サービス化

1. 代理受取条件テーブルを正式実装
2. スポットスケジュール・保管枠を正式実装
3. 保管枠の自動増減
4. 通知強化
5. トラブル報告
6. 報酬保留
7. 配送会社メンバー管理
8. RLS整理
9. 評価・信頼度の推薦反映

### 11.3 P2: 本番運用

1. 運営管理画面
2. スポット本人確認・審査
3. 実決済・請求書
4. 配送会社/EC API連携
5. 写真ログ
6. 本番データによる推薦改善
7. 自治体/地域ダッシュボード

---

## 12. 完了条件

### 12.1 ハッカソン発表の完了条件

以下ができれば、プロダクトの説得力は十分に出る。

```text
- 不在報告から代理受取スポット候補が出る
- 一番近い個人スポットが条件で除外される
- 夜まで受取可能な店舗スポットが1位になる
- 配達員がスポットQRで保管完了できる
- 受取人が到着予定を送れる
- スポット側に到着予定が表示される
- 受取人QRで完了できる
- 完了画面に CO2・請求・報酬が出る
```

### 12.2 サービスとしての完了条件

```text
- スポット審査がある
- 保管枠が正しく制御される
- 受取人が即時反応しなくても自動仮割当できる
- トラブル時に責任状態を追える
- 報酬を保留・確定できる
- 配送会社が自社荷物と請求イベントを管理できる
- RLSでデータ境界が守られる
```

---

## 13. まとめ

改訂後の ShareKeep は、単なる近隣代理人マッチングではない。

- 受取人は、許容距離・時間・スポット種別を設定する
- 代理受取スポットは、空き時間と保管枠を登録する
- 推薦は、近さだけでなく、安全性・時間・空き枠・配達員負担を見て判断する
- 荷物は QR と保管証跡で管理する
- 保管後は、受取調整ボタンで到着予定を共有する
- 完了後は、CO2削減、配送会社請求、スポット報酬が発生する

この形に寄せることで、ShareKeep は「怪しい個人間預かり」ではなく、**地域の承認済みスポットを活用した再配達削減インフラ**として説明できる。
