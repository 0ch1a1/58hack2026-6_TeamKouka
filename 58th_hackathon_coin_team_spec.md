# 58ハッカソン 硬貨チーム ShareKeep 統合仕様書

最終更新: 2026-06-14
対象リポジトリ: `58hack2026-6_TeamKouka`
対象アプリ: `ShareKeep/`
対象推薦サービス: `recommendation-service/`
対象DB定義: 既存 Supabase remote + `supabase/migrations/`

---

## 0. このドキュメントの位置づけ

このドキュメントは、初期のアイデアメモではなく、**現時点の実装と統合した ShareKeep の仕様書**である。

もともとの `58th_hackathon_coin_team_spec.md` は、5/28・6/9 時点の議論、画面案、検討課題、将来案を広く含んでいた。一方で、現在の実装では以下が進んでいる。

- Expo Router + React Native の画面構成がほぼ固まった。
- Supabase Auth / RPC / Realtime / Edge Function 呼び出し前提の実装が入った。
- 受取人、代理人、配達員の主要フローが画面として接続された。
- QR による代理人受領、受取人引き渡し、ステータス遷移が実装された。
- AI推薦サービスが `recommendation-service/` として追加され、アプリ側から利用できるようになった。
- メッセージ、評価、通知強化、地域貢献カード、完了演出、プライバシー段階開示が実装に入った。
- 保管期限、代理人顔写真、簡易トラブル報告が実装に入った。
- セキュリティ強化 migration（内部関数のEXECUTE剥奪、入力長チェックを含む）が追加された。

そのため、本書では「アイデアとして欲しいもの」と「今動くもの」を混ぜず、次の4層で整理する。

| 層 | 意味 |
| --- | --- |
| コンセプト | 発表で説明する社会課題、ターゲット、価値 |
| 現行MVP | 現在のコードで成立しているユーザーフロー |
| 実装仕様 | 画面、API、DB、推薦サービス、状態遷移 |
| 残課題 | デモ前に直すべきもの、将来機能、運用前提 |

実装状況の凡例:

| 記号 | 意味 |
| --- | --- |
| ✅ | 現在のリポジトリに実装済み |
| 🟡 | 一部実装済み、またはデモ用・運用前提あり |
| 🚧 | 実装はあるが、DB適用・env・外部サービス起動などの運用作業が必要 |
| ❌ | 未実装 |
| ⚠️ | 仕様上または実装上の注意点 |

---

## 1. プロダクト概要

### 1.1 サービス名

**ShareKeep**

不在時の荷物を、近くの信頼できる代理人が一時的に預かることで、再配達を減らす地域型マッチングアプリ。

### 1.2 解決したい社会課題

宅配の再配達は、配送会社の人手不足、配送コスト、CO2排出、受取人の待ち時間を増やす。特に宅配ボックスがない一軒家や小規模集合住宅では、受取人が日中不在だと再配達が発生しやすい。

ShareKeep はこの課題を、地域にいる「日中受け取れる人」と「不在がちな受取人」をつなげることで解決する。

### 1.3 CSVとしての価値

ShareKeep は単なる便利アプリではなく、CSV（Creating Shared Value）の観点で次の価値を作る。

| ステークホルダー | 価値 |
| --- | --- |
| 受取人 | 再配達を待たずに、帰宅後に近所で荷物を受け取れる |
| 代理人 | 地域貢献、ポイント、実績、評価、育成演出による参加動機 |
| 配送会社 | 再配達コスト削減、配送完了率向上、不在対応削減 |
| 地域 | CO2削減、近隣協力、協力者ネットワークの可視化 |
| 企業・自治体 | ESG / CSV 施策として説明しやすい定量指標 |

### 1.4 ターゲット

主対象:

- 宅配ボックスがない一軒家、小規模アパート、古い集合住宅に住む人
- 日中不在が多い人
- EC・フリマアプリ・通販をよく使う人
- コンビニ、PUDO、郵便局などの受取拠点が近くに少ない人

代理人候補:

- 在宅ワーカー
- シニア
- 管理人室
- 地域店舗
- 小規模施設
- 宅配受け取りを許容できる登録済みユーザー

現実運用では、個人代理人だけでなく、登録済み店舗・施設・管理人室を含める方が安全性と責任分界を設計しやすい。

---

## 2. 現行MVPの全体像

### 2.1 MVPで成立している体験

現在の実装では、次の体験がアプリ上で成立している。

1. ユーザーがサインアップまたはサインインする。
2. 受取人は荷物を登録する。
3. 配達員は担当荷物を確認し、配達開始、不在報告、代理人探索、代理人QR読み取りを行う。
4. 受取人はマッチング画面で近くの代理人を探す。
5. 推薦サービスが設定されていれば、候補をスコア順で表示し、受取人が選択する。
6. 推薦サービスが未設定または失敗した場合は、従来の距離ベース自動マッチにフォールバックする。
7. 代理人は請負リストで荷物を確認し、配達員向けQRを表示する。
8. 配達員が代理人QRを読むと、荷物は `delivered_to_agent` になる。
9. 受取人は代理人情報を確認し、受取人QRを表示する。
10. 代理人が受取人QRを読むと、荷物は完了状態になる。
11. 完了画面でCO2削減量、完了演出、代理人評価フォームが表示される。
12. 受取人と代理人は荷物単位でメッセージを送受信できる。
13. 通知一覧、未読バッジ、一括既読、Realtime更新が動く。
14. ホーム画面に3Dの木、地域貢献カード、受取/代理モード切替が表示される。

### 2.2 現行MVPの主な構成

| 領域 | 実装 |
| --- | --- |
| フロントエンド | Expo / React Native / Expo Router |
| UI部品 | `components/ui/*`、`Ionicons`、`react-native-qrcode-svg`、`expo-camera` |
| 地図 | `react-native-maps`。表示不能時はリストへフォールバック |
| 3D演出 | `@react-three/fiber/native` + `three` による木の成長表示 |
| 認証 | Supabase Auth |
| DB | Supabase Postgres |
| Realtime | `parcels`、`delivery_matches`、`notifications`、`handover_messages` |
| QR | Supabase RPCでトークン生成、Edge Function呼び出しで検証 |
| 推薦 | FastAPI + scikit-learn + Supabase service role |
| テスト | Jest、pytest |

### 2.3 重要なデモ前提

| 項目 | 現状 |
| --- | --- |
| 配送会社ID | `ShareKeep/lib/config.ts` の `DEMO_DELIVERY_COMPANY_ID`。既定は固定値だが `EXPO_PUBLIC_DEMO_DELIVERY_COMPANY_ID` で上書き可 |
| 荷物の伝票番号 | 入力欄はあるが、実際は `create_parcel` 側で自動採番 |
| 受取人の現在地 | `expo-location` で取得。推薦・近隣探索の起点 |
| 推薦サービス | `EXPO_PUBLIC_RECOMMENDATION_URL` がある時だけ利用 |
| 推薦失敗時 | `matchNearbyAgent` へ自動フォールバック |
| 代理人受領 | 本来は配達員QRスキャン。代理人画面にデモ用フォールバックボタンあり |
| CO2削減量 | `parcels.co2_saved_kg` の値を表示 |
| ポイント/XP | ホーム表示は現状 `0` 固定。代理人への付与バックエンドは存在 |
| DB migration | 一部ファイルに「未適用」注記あり。実DB適用状況は別途確認が必要 |

---

## 3. ロールと権限

### 3.1 ロール定義

ロールは `ShareKeep/lib/database.types.ts` の `Role` を正とする。

```ts
export type Role = 'recipient' | 'agent' | 'delivery_company';
```

| ロール | DB値 | 主な画面 | できること |
| --- | --- | --- | --- |
| 受取人 | `recipient` | `/(app)/recipient/*` | 荷物登録、代理人選択、代理人情報確認、受取人QR提示、評価、メッセージ |
| 代理人 | `agent` | `/(app)/agent/*` | 代理人プロフィール登録、請負確認、配達員QR提示、受取人QR読み取り、メッセージ |
| 配達員/配送会社 | `delivery_company` | `/(app)/driver/*` | 荷物一覧、配達開始、不在報告、代理人探索、代理人QR読み取り |

旧 `driver` ロールは使わない。

### 3.2 ロール別遷移

ログイン後、`getMyRole()` が `profiles.role` を読み、ロールを判定する。

- `delivery_company` の場合: `/(app)/driver` へリダイレクト
- `recipient` / `agent` の場合: 通常ホーム `/(app)/` へ
- ロール取得失敗時: 通常ホームへフォールバック

該当実装:

- `ShareKeep/features/auth.ts`
- `ShareKeep/lib/auth.ts`
- `ShareKeep/app/(app)/index.tsx`
- `ShareKeep/app/(app)/driver/_layout.tsx`

---

## 4. 荷物ステータスと状態遷移

### 4.1 DBステータス

`ParcelStatus` は次の7状態。

```ts
created
out_for_delivery
delivery_failed
agent_assigned
delivered_to_agent
handed_to_recipient
completed
```

### 4.2 基本遷移

| ステータス | 意味 | 主な遷移元 | 主な遷移先 |
| --- | --- | --- | --- |
| `created` | 荷物作成済み、配達前 | 荷物登録 | `out_for_delivery` |
| `out_for_delivery` | 配達中 | 配達開始 | `delivery_failed` |
| `delivery_failed` | 不在、代理受付待ち | 不在報告 | `agent_assigned` |
| `agent_assigned` | 代理人決定 | 代理人割当 | `delivered_to_agent` |
| `delivered_to_agent` | 代理人が保管中 | 代理人QR検証 | `completed` / `handed_to_recipient` |
| `handed_to_recipient` | 受取人へ引き渡し済み | 受取人QR検証 | 完了扱い |
| `completed` | 完了 | 受取人QR検証 | 終了 |

### 4.3 UI上の集約

受取人の荷物一覧では、DBの7状態を3状態に集約する。

| UI状態 | 含まれるDB状態 | 表示 |
| --- | --- | --- |
| `waiting` | `created`, `out_for_delivery`, `delivery_failed`, `agent_assigned` | 配達待ち |
| `stored` | `delivered_to_agent` | 保管中 |
| `completed` | `handed_to_recipient`, `completed` | 受取完了 |

該当実装:

- `ShareKeep/lib/status.ts`
- `toUIStatus`
- `isStoredAtAgent`
- `isHandedOff`

### 4.4 クエスト風表示

デモで流れが伝わりやすいように、DBステータスを「クエスト風」の文言へ変換している。

| DB状態 | クエスト表示 |
| --- | --- |
| `created` | クエスト準備中 |
| `out_for_delivery` | お届けに向かっています |
| `delivery_failed` | キーパー探索中 |
| `agent_assigned` | キーパー決定！ |
| `delivered_to_agent` | ご近所さんが預かり中 |
| `handed_to_recipient` | クエストクリア目前！ |
| `completed` | クエストクリア！ |

該当実装:

- `QUEST_STATUS_META`
- `QuestStatusBar`
- `StatusBadge`

内部状態は変えず、表示専用の変換として扱う。

---

## 5. 現行画面仕様

### 5.1 認証画面

対象:

- `ShareKeep/app/(auth)/sign-in.tsx`
- `ShareKeep/app/(auth)/sign-up.tsx`
- `ShareKeep/app/(auth)/sign-in-driver.tsx`
- `ShareKeep/app/(auth)/sign-up-driver.tsx`
- `ShareKeep/components/auth/*`

機能:

- メールとパスワードでサインアップ/サインイン
- 受取人/代理人向け導線
- 配達員/配送会社向け導線
- パスワード確認と6文字以上チェック
- `profiles` にロール、氏名、電話番号、会社名、社員IDを保存する設計

実装状況: ✅

注意:

- 配達員ユーザーと `delivery_companies.id` の正規紐付けは未完成。
- 配達員画面では現状 `DEMO_DELIVERY_COMPANY_ID` を固定で使う。

### 5.2 ホーム画面

対象:

- `ShareKeep/app/(app)/index.tsx`
- `ShareKeep/components/TreeScene.tsx`
- `ShareKeep/components/RegionalContributionCard.tsx`

機能:

- ShareKeepロゴ表示
- XP / P 表示
- 通知ベルと未読バッジ
- 受取モード/代理モード切替
- 3D木の育成表示
- 地域貢献カード
- 受取人の荷物一覧への導線
- 代理人プロフィール、請負リストへの導線
- 配達員ロールの場合は配達員ホームへ自動遷移

実装状況: 🟡

実装済み:

- 3D木の表示
- 通知ベル
- 地域貢献カード
- モード切替
- 画面遷移

未完成:

- XPとポイントは `0` 固定で、DBのポイント・実績とは未接続。
- 木のステージは現状固定XPから算出。

### 5.3 受取人: 荷物一覧

対象:

- `ShareKeep/app/(app)/recipient/packages.tsx`
- `ShareKeep/features/parcels-recipient.ts`

機能:

- 自分の荷物一覧取得
- 状態フィルタ: すべて / 配達待ち / 保管中 / 受取完了
- クエスト風ステータスバッジ
- クエスト進捗バー
- 代理人名表示
- 荷物登録モーダル
- Realtimeで `parcels` 変化を反映

実装状況: ✅

注意:

- モーダルには伝票番号入力欄があるが、入力値は `createParcel` に渡していない。
- 受付番号/追跡番号はサーバ側 `create_parcel` が自動採番する。
- 配送会社IDは `DEMO_DELIVERY_COMPANY_ID` 固定。

### 5.4 受取人: マッチング

対象:

- `ShareKeep/app/(app)/recipient/matching.tsx`
- `ShareKeep/app/(app)/recipient/useMatchingLogic.ts`
- `ShareKeep/features/recommend.ts`
- `ShareKeep/features/parcels-recipient.ts`
- `ShareKeep/lib/scoring.ts`
- `ShareKeep/lib/geo.ts`

機能:

- 端末の現在地取得
- 推薦サービス利用可否判定
- 推薦候補の取得
- 推薦候補をスコア順に表示
- 総合スコアを0-100点で表示
- 距離、対応しやすい時間帯、実績の3因子バー表示
- 理由タグ表示
- 確定前の住所段階開示
- 候補選択後、`assignAgentToParcel` で代理人を確定
- `markRecommendationChosen` で選択ログを記録
- 推薦サービス未設定/失敗/候補ゼロ時は `matchNearbyAgent` へフォールバック
- `parcels` Realtime購読で `delivered_to_agent` を検知し、受取準備画面へ遷移

実装状況: 🚧

アプリ側は実装済み。ただし推薦サービスを使うには次が必要。

- `EXPO_PUBLIC_RECOMMENDATION_URL` の設定
- `recommendation-service/` の起動
- 推薦関連SQLの適用
- 代理人seedまたは実データ

注意:

- 検索半径は `SEARCH_RADIUS_M = 5000`。コンセプトの50mより広い。デモで候補が出ない事故を避けるため。
- プライバシー段階開示は住所文字列の出し分けであり、k-匿名性までは保証しない。

### 5.5 受取人: 受取準備

対象:

- `ShareKeep/app/(app)/recipient/pickup-ready.tsx`

機能:

- 代理人情報表示
- 代理人住所/部屋番号表示
- 追跡番号表示
- 保管期限バッジ表示（`StorageDeadlineBadge`）
- 「今から取りに行く」ボタン
- 受取人QR生成・表示
- 「問題を報告」ボタン、トラブル報告フォーム（`SupportReportForm`）
- メッセージ画面への導線
- `parcels` Realtime購読で完了状態を検知し、完了画面へ遷移

実装状況: 🟡

実装済み:

- 代理人情報の取得
- 受取人QR生成
- QRモーダル
- 完了遷移
- メッセージ導線
- 保管期限バッジ表示（DB側は `20260613170000_storage_deadline.sql` 適用が必要）
- トラブル報告UI（DB側は `20260613170200_support_reports.sql` 適用が必要）

未完成:

- 「今から取りに行く」は現状アラートのみ。DB上の進捗更新や通知送信は未実装。
- 配達進捗の「あと何分」表示は未実装。

### 5.6 受取人: 完了画面

対象:

- `ShareKeep/app/(app)/recipient/delivery-complete.tsx`
- `ShareKeep/components/CompletionModal.tsx`
- `ShareKeep/features/reviews.ts`

機能:

- 引き渡し完了表示
- CO2削減量表示
- 荷物情報表示
- 完了演出モーダル
- 紙吹雪アニメーション
- CO2削減量カウントアップ
- 地域貢献カード表示
- 代理人評価フォーム
- 投稿済み評価の表示
- 二重投稿時の復旧

実装状況: ✅

注意:

- 完了演出は受取人画面ではポイント表示なし。代理人へのポイントはサーバ側処理。
- `agent_reviews` migration の適用状況によって評価機能はDB側で動作可否が変わる。

### 5.7 代理人: プロフィール

対象:

- `ShareKeep/app/(app)/agent/profile.tsx`
- `ShareKeep/features/parcels-agent.ts`

機能:

- 住所入力
- 郵便番号入力
- 部屋番号入力
- 受取可能曜日選択
- 受取可能時間帯入力
- 緊急連絡先入力
- 顔写真の任意アップロード/削除（`AvatarPicker`、`features/avatar.ts`）
- `geocode-agent-address` Edge Function経由で住所を緯度経度化
- `agent_profiles` 保存

実装状況: 🟡

実装済み:

- 住所、部屋番号、曜日、時間帯の保存と再取得
- 緊急連絡先の保存
- 顔写真アップロード/削除（DB側は `20260613170100_agent_avatar.sql` と Storage バケット `agent-avatars` が必要）

未完成:

- 緊急連絡先は保存するが、フォーム表示時に既存値（`profiles.phone`）を再取得していない。
- 優先設定は未実装。
- 保管可能上限の設定UIは未実装。

### 5.8 代理人: 請負リスト

対象:

- `ShareKeep/app/(app)/agent/parcels.tsx`

機能:

- 自分が割り当てられた `delivery_matches` の一覧表示
- 受取人名表示
- クエスト風ステータス表示
- 配達員用QR生成・表示
- 受取人QRスキャン
- カメラ権限取得
- `verifyRecipientQr` 呼び出し
- メッセージ画面への導線
- `delivery_matches` Realtime購読
- デモ用「受領済みにする」ボタン

実装状況: ✅

注意:

- 本来の代理人受領は、配達員が代理人QRを読む流れ。
- `agent_assigned` から `delivered_to_agent` へ進める「デモ用: 受領済みにする」ボタンは、配達員スキャンが使えない場面のフォールバック。
- 代理人向けの完了演出専用画面は未実装。

### 5.9 配達員: ホーム

対象:

- `ShareKeep/app/(app)/driver/index.tsx`
- `ShareKeep/features/parcels-driver.ts`

機能:

- 担当荷物一覧取得
- 完了済みを除く配送中ステータスを表示
- 配達開始
- 不在報告
- 代理人を探す
- 代理人QRを読む
- ステータスごとの操作ボタン制御
- クエスト進捗バー表示
- 通知ベル
- ログアウト
- Pull to refresh
- エラー時の再試行
- 多重操作ガード
- focus復帰時の再取得

実装状況: ✅

注意:

- 配送会社IDは固定。
- 配達員と会社の正規紐付けは今後の課題。

### 5.10 配達員: 代理人探索

対象:

- `ShareKeep/app/(app)/driver/agents.tsx`
- `ShareKeep/features/parcels-agent.ts`

機能:

- `getAgentLocations` で代理人位置、対応条件、実績、評価を取得
- 地図ピン表示
- リスト表示
- 地図が使えない場合のリストフォールバック
- 代理人の対応曜日、時間、実績、評価表示
- 割り当て前は詳細住所を出さない
- 代理人を対象荷物へ割り当て
- 多重割り当て防止

実装状況: ✅

注意:

- `get_agent_locations` は代理人の住所・座標などPIIを返すため、`delivery_company` のみ実行可能にする必要がある。
- `20260613170000_security_hardening_min.sql` で anon/public 実行権限剥奪と未認証拒否が追加されている。

### 5.11 配達員: 代理人QR読み取り

対象:

- `ShareKeep/app/(app)/driver/scan.tsx`

機能:

- カメラ権限取得
- 代理人QR読み取り
- `verifyAgentQr` 呼び出し
- `delivered_to_agent` への遷移確認
- 二重読み取りガード
- 読み取り成功表示
- 別荷物QRの可能性がある場合の警告
- 無効、期限切れ、通信失敗のエラー表示
- カメラ権限拒否時の設定導線

実装状況: ✅

注意:

- エラー分類は現状 `Error.message` の文字列依存。Edge Function側が機械可読なエラーコードを返す形に寄せると堅い。

### 5.12 メッセージ画面

対象:

- `ShareKeep/app/(app)/messages/[parcelId].tsx`
- `ShareKeep/features/messages.ts`
- `supabase/migrations/20260613150000_handover_messages.sql`

機能:

- 荷物単位のメッセージ一覧
- 受取人/代理人の吹き出し出し分け
- メッセージ送信
- Realtime購読
- UUID形式の `parcelId` 検証
- 取得世代ガード
- 送信中表示
- 送信エラー表示

実装状況: 🚧

アプリ側は実装済み。DB側は `handover_messages` migration の適用が必要。

RLS方針:

- 読めるのは対象荷物の `recipient_id` または `assigned_agent_id`
- 送信できるのは本人かつ対象荷物の関係者
- `sender_id = auth.uid()` を必須にして送信者偽装を防止

### 5.13 通知画面

対象:

- `ShareKeep/app/(app)/notifications.tsx`
- `ShareKeep/features/notifications.ts`
- `supabase/migrations/20260613150200_notifications_enhance.sql`

機能:

- 通知一覧取得
- 未読/既読表示
- 未読件数表示
- 1件既読
- 一括既読
- 種別フィルタ
- Realtime購読
- ホーム/配達員ホームの通知ベル
- 未読バッジ
- 楽観更新
- エラー時の再取得

実装状況: 🚧

アプリ側は実装済み。DB側は以下のRPCとRealtime publicationが必要。

- `get_unread_notification_count`
- `mark_all_notifications_read`
- `notifications` の `supabase_realtime` publication登録

---

## 6. バックエンド/API仕様

### 6.1 認証・プロフィールAPI

対象:

- `ShareKeep/features/auth.ts`
- `ShareKeep/lib/auth.ts`

| API | 役割 |
| --- | --- |
| `signUpRecipient` | 受取人登録 |
| `signUpWithProfile` | ロール付き登録 |
| `signIn` | ログイン |
| `signOut` | ログアウト |
| `getCurrentUser` | 現在ユーザー取得 |
| `getProfile` | プロフィール取得 |
| `getMyRole` | ロール取得とenum検証 |
| `upsertProfile` | プロフィール更新 |
| `deleteProfile` | プロフィール削除 |
| `deleteMyAccount` | アカウント削除Edge Function呼び出し |

### 6.2 荷物API

対象:

- `ShareKeep/features/parcels-recipient.ts`
- `ShareKeep/features/parcels-driver.ts`
- `ShareKeep/features/parcels-agent.ts`

| API | 役割 |
| --- | --- |
| `createParcel` | 荷物作成 |
| `fetchMyParcels` | 受取人の荷物一覧 |
| `fetchParcel` | 単一荷物取得 |
| `subscribeParcel` | 荷物Realtime購読 |
| `matchNearbyAgent` | 近隣代理人の自動マッチ |
| `assignAgentToParcel` | 指定代理人を割り当て |
| `fetchDriverParcels` | 配達員の担当荷物一覧 |
| `startDelivery` | 配達開始 |
| `reportDeliveryFailed` | 不在報告 |
| `updateParcelStatus` | 荷物ステータス更新 |

### 6.3 QR API

| API | 役割 |
| --- | --- |
| `generateQrToken` | 代理人用/受取人用QRトークン生成 |
| `verifyAgentQr` | 配達員が代理人QRを検証 |
| `verifyRecipientQr` | 代理人が受取人QRを検証 |

想定:

- QRはワンタイムトークン。
- 有効期限と使用済みフラグを持つ。
- Edge Function側でステータス遷移、ポイント、CO2などの副作用を処理する。
- 二重読み取りは冪等に扱う設計。

### 6.4 代理人API

| API | 役割 |
| --- | --- |
| `geocodeAgentAddress` | 住所をジオコーディングし代理人プロフィール保存 |
| `upsertAgentProfile` | 代理人プロフィール保存 |
| `findNearbyAgents` | 近隣代理人検索 |
| `getAgentLocations` | 配達員向け代理人地図/一覧データ |
| `recordAgentDeliveryCompletion` | 代理人完了実績の記録 |
| `consumeAgentPoints` | ポイント消費 |

### 6.5 通知API

| API | 役割 |
| --- | --- |
| `fetchMyNotifications` | 自分の通知一覧取得 |
| `markNotificationRead` | 1件既読 |
| `getUnreadNotificationCount` | 未読件数取得 |
| `markAllNotificationsRead` | 一括既読 |
| `subscribeNotifications` | 通知Realtime購読 |

### 6.6 メッセージAPI

| API | 役割 |
| --- | --- |
| `fetchMessages` | 荷物単位のメッセージ一覧 |
| `sendMessage` | メッセージ送信 |
| `subscribeMessages` | メッセージRealtime購読 |

### 6.7 評価API

| API | 役割 |
| --- | --- |
| `createReview` | 完了済み荷物に対する代理人評価投稿 |
| `fetchReviewForParcel` | 対象荷物の投稿済み評価取得 |
| `getAgentRating` | 代理人の平均評価・件数取得 |

評価ルール:

- 1荷物1評価。
- 受取人本人のみ投稿可能。
- 完了済み荷物のみ評価可能。
- `agent_id` はクライアント指定ではなく、`parcels.assigned_agent_id` からDB側で導出。

### 6.8 地域貢献API

対象:

- `ShareKeep/features/stats.ts`

機能:

- 完了済み荷物を集計
- 再配達防止件数
- CO2削減kg合計
- 協力者数

現状はクライアント側集計。RLSにより、呼び出しユーザーが参照できる行だけが集計対象になる。

---

## 7. データモデル

### 7.1 主要テーブル

現行コードが前提としている主要テーブル:

| テーブル | 役割 |
| --- | --- |
| `profiles` | 全ユーザー共通プロフィール |
| `agent_profiles` | 代理人の住所、位置、対応曜日、時間、レベル、ポイント、完了件数 |
| `recipient_profiles` | 受取人の住所、位置。推薦の距離起点 |
| `delivery_companies` | 配送会社 |
| `parcels` | 荷物本体 |
| `delivery_matches` | 荷物と代理人のマッチ履歴 |
| `parcel_status_histories` | 荷物ステータス履歴 |
| `qr_tokens` | QRトークン |
| `point_transactions` | ポイント増減履歴 |
| `co2_reduction_logs` | CO2削減ログ |
| `achievements` | 実績 |
| `notifications` | 通知 |
| `handover_messages` | 荷物単位メッセージ |
| `agent_reviews` | 代理人評価 |
| `support_reports` | 簡易トラブル報告（記録のみ） |
| `recommendation_logs` | 推薦ログ、特徴量、スコア、選択/成否ラベル |

### 7.2 profiles

主な列:

- `id`
- `role`
- `full_name`
- `phone`
- `company_name`
- `employee_id`
- `created_at`

`role` は `recipient` / `agent` / `delivery_company`。

### 7.3 agent_profiles

主な列:

- `user_id`
- `address`
- `address_detail`
- `location`
- `available_days`
- `start_time`
- `end_time`
- `level`
- `points`
- `completed_deliveries`
- `avatar_url`（顔写真のStorageオブジェクトパス。null=未設定/オプトアウト）

使い道:

- 代理人プロフィール画面
- 近隣探索
- 配達員地図
- AI推薦候補
- スコアリング
- 地域貢献や実績表示の元データ

### 7.4 parcels

主な列:

- `id`
- `tracking_no`
- `recipient_id`
- `delivery_company_id`
- `assigned_agent_id`
- `status`
- `retry_count`
- `co2_saved_kg`
- `storage_started_at`（保管開始時刻。`delivered_to_agent` 遷移時にDBトリガで自動セット）
- `storage_deadline_at`（保管期限。同上）
- `storage_overdue_notified_at`（期限超過通知済みフラグ）
- `created_at`
- `updated_at`

使い道:

- 受取人荷物一覧
- 配達員荷物一覧
- ステータス遷移
- CO2表示
- メッセージ、評価、推薦の紐付け

### 7.5 delivery_matches

主な列:

- `id`
- `parcel_id`
- `recipient_id`
- `agent_id`
- `distance_meters`
- `status`
- `created_at`

使い道:

- 代理人請負リスト
- 受取準備画面の代理人情報取得
- メッセージ権限判定

### 7.6 handover_messages

追加 migration:

- `supabase/migrations/20260613150000_handover_messages.sql`

主な列:

- `id`
- `parcel_id`
- `sender_id`
- `body`
- `created_at`

RLS:

- 対象荷物の受取人または割り当て代理人のみ閲覧可。
- 送信者本人かつ対象荷物の関係者のみinsert可。

### 7.7 agent_reviews

追加 migration:

- `supabase/migrations/20260613150100_agent_reviews.sql`

主な列:

- `id`
- `parcel_id`
- `agent_id`
- `reviewer_id`
- `rating`
- `comment`
- `created_at`

制約:

- `rating` は1-5。
- `parcel_id` はunique。1荷物1評価。

### 7.8 support_reports

追加 migration:

- `supabase/migrations/20260613170200_support_reports.sql`

主な列:

- `id`
- `parcel_id`
- `reporter_id`
- `category`（`damaged` / `opened` / `wet` / `overdue` / `lost` / `other`）
- `status`
- `note`
- `created_at`

RLS:

- `handover_messages` に倣い、当該荷物の受取人または割り当て代理人のみ参照・作成可。
- `reporter_id = auth.uid()` を必須にして報告者偽装を防止。

位置づけ:

- 報告の記録のみ。責任判定・補償ロジックは対象外。

### 7.9 recommendation_logs

追加 migration:

- `supabase/migrations/20260613140000_recommendation.sql`

主な列:

- `id`
- `parcel_id`
- `recipient_id`
- `candidate_agent_id`
- `features`
- `score`
- `rank`
- `model_version`
- `chosen`
- `outcome`
- `created_at`

使い道:

- 推薦候補の保存
- 受取人が選んだ候補の記録
- 配達完了/失敗の成否ラベル
- 将来の再学習

---

## 8. AI推薦サービス

### 8.1 目的

距離だけで代理人を選ぶのではなく、以下の要素を使って「おすすめ代理人」をスコア順に表示する。

- 距離
- 対応時間
- 対応曜日
- 配達実績
- 代理人レベル
- 現在の保管負荷
- 週末かどうか
- 夕方以降かどうか
- 平均評価

### 8.2 構成

| 領域 | ファイル |
| --- | --- |
| API | `recommendation-service/app/main.py` |
| 特徴量化 | `recommendation-service/app/features.py` |
| モデル | `recommendation-service/app/model.py` |
| 推薦ロジック | `recommendation-service/app/recommendation_service.py` |
| Supabase接続 | `recommendation-service/app/supabase_client.py` |
| スキーマ | `recommendation-service/app/schemas.py` |
| 学習 | `recommendation-service/training/*` |
| アプリ連携 | `ShareKeep/features/recommend.ts` |
| UI | `ShareKeep/app/(app)/recipient/matching.tsx` |

### 8.3 API

| Endpoint | 機能 |
| --- | --- |
| `GET /health` | モデル状態、fallback状態、model pathを返す |
| `GET /metrics` | Prometheus形式のメトリクス |
| `POST /recommend` | 候補取得、特徴量化、推論、ランキング、推薦ログ保存 |
| `POST /feedback` | 選択された代理人を記録 |
| `POST /retrain` | 推薦ログから再学習 |

### 8.4 認証と安全性

`/recommend` と `/feedback` は、Supabase Auth の Bearer token を検証する。

方針:

- `RECOMMENDATION_REQUIRE_AUTH=true` が本番デフォルト。
- 認証済みの場合、`recipient_id` はクライアント申告値ではなくJWT由来を正とする。
- `parcel_id` がある場合は、対象荷物が認証ユーザーのものか検証する。
- 所有者不明、不一致、存在しない荷物は拒否する。
- Supabase接続には service role を使うが、サービス内で所有者チェックを行う。
- `/retrain` は `X-Admin-Key` で保護する。
- `/recommend` と `/feedback` にはIP単位のtoken bucket rate limitがある。
- `X-Forwarded-For` は `TRUST_FORWARDED_FOR=true` の時のみ信用する。

### 8.5 キャッシュ

`/recommend` は短期TTLキャッシュを持つ。

キャッシュキーには以下を含める。

- `parcel_id`
- 起点座標または `recipient_id`
- 半径
- top_k
- target_at

`parcel_id` をキーに含める理由:

- 別の荷物で同じ推薦結果を使い回すと `recommendation_logs` が保存されず、学習経路が壊れるため。

### 8.6 モデル

モデルファイルがある場合:

- `models/model.joblib` を読み込み、GBMで推論する。

モデルファイルがない場合:

- `fallback-rules-v1` としてルールベースでスコアリングする。

fallback の主な重み:

- `distance_score`: 0.30
- `time_score`: 0.25
- `day_match`: 0.10
- `experience`: 0.15
- `level_score`: 0.10
- `capacity_score`: 0.10
- `rating_score`: 0.12

### 8.7 アプリ側の挙動

`ShareKeep/features/recommend.ts` では、`EXPO_PUBLIC_RECOMMENDATION_URL` がある時だけ推薦サービスを使う。

未設定の場合:

- `isRecommendationEnabled()` がfalse。
- 受取人マッチングは `matchNearbyAgent` にフォールバック。

サービス失敗時:

- Alertでデモを止めず、自動マッチへフォールバック。

候補が返った場合:

- `matching.tsx` が候補一覧を表示。
- 受取人が選ぶ。
- `assignAgentToParcel` で代理人を確定。
- `markRecommendationChosen` で選択ログを記録。

### 8.8 推薦サービスの運用手順

詳細は `maki-docs/recommendation-runbook.md` を正とする。

最小手順:

1. Supabase SQL Editorで推薦関連migrationを適用する。
2. 必要なら合成データでモデルを生成する。
3. `recommendation-service/.env` を用意する。
4. Dockerまたはuvicornでサービスを起動する。
5. `ShareKeep/.env` に `EXPO_PUBLIC_RECOMMENDATION_URL` を設定する。
6. Expoアプリを再起動する。

未設定でもアプリは動く。推薦機能だけが距離マッチへフォールバックする。

---

## 9. セキュリティとプライバシー

### 9.1 個人情報の段階開示

方針:

- 候補一覧や確定前画面では、詳細住所や部屋番号を出さない。
- 確定後、受取に必要な範囲で住所を表示する。
- 配達員の代理人探索では `address_detail` を割り当て前に表示しない。
- 推薦候補一覧では距離ベースの概略ラベルを表示する。

実装:

- `ShareKeep/lib/geo.ts`
- `discloseAddress`
- `ShareKeep/app/(app)/recipient/matching.tsx`
- `ShareKeep/app/(app)/driver/agents.tsx`

注意:

- geohash丸めや概略表示は、統計的なk-匿名性を保証しない。
- 代理人が少ない地域では、概略でも特定につながる可能性がある。

### 9.2 QRによる本人確認

QRの役割:

| QR種別 | 提示者 | 読み取り者 | 結果 |
| --- | --- | --- | --- |
| agent QR | 代理人 | 配達員 | `delivered_to_agent` |
| recipient QR | 受取人 | 代理人 | `completed` / 完了 |

設計方針:

- ワンタイムトークン
- 有効期限あり
- 使用済み管理
- 二重読み取り時は冪等に扱う
- QR種別違い、期限切れ、無効トークンは拒否

### 9.3 推薦候補RPCの保護

`get_recommendation_candidates` は代理人の氏名、住所、位置、対応条件、評価などを返すため、クライアント直叩き禁止が望ましい。

`20260613160000_recommendation_rpc_guards.sql` では次を行う。

- 候補取得RPCを `service_role` 限定にする。
- `mark_recommendation_chosen` と `record_recommendation_outcome` に所有者チェックを追加。
- `upsert_recipient_profile` に本人チェックを追加。
- anon/publicからの実行権限を剥奪。

### 9.4 get_agent_locationsの保護

`get_agent_locations` は配達員向けに代理人の位置と住所を返す。

`20260613170000_security_hardening_min.sql` では次を行う。

- 未認証ユーザーを拒否。
- `delivery_company` 以外を拒否。
- anon/publicから実行権限を剥奪。

### 9.5 ポイント消費の保護

`consume_agent_points` はポイント残高を減らす処理であり、他人のポイント消費を防ぐ必要がある。

`20260613170000_security_hardening_min.sql` では次を行う。

- `auth.uid() <> p_agent_id` の場合は拒否。
- 正数ポイントのみ許可。
- 残高不足時は拒否。
- `point_transactions` に負の履歴を記録。

### 9.6 grant_agent_pointsの内部化

代理人へのポイント付与は、QR完了処理などサーバ側からだけ呼ばれるべきで、クライアントが任意に実行できるべきではない。

`20260613170000_security_hardening_min.sql` では、`grant_agent_points` の authenticated実行権限を剥奪している。

### 9.7 内部専用関数のEXECUTE剥奪

`record_agent_delivery_completion` と `save_co2_reduction` は、`verify_recipient_qr`（SECURITY DEFINER）から内部的に呼ばれる関数であり、クライアントが直接実行できるべきではない。

`20260613180000_security_revoke_internal_fns.sql` では、これらの authenticated 実行権限を剥奪している（REST経由で任意 `agent_id` の配達実績カウンタを水増しされる経路を塞ぐ）。

### 9.8 入力長チェック

`20260613190000_security_input_length_checks.sql` では、ユーザー入力を受けるRPC/テーブルに対する長さ制約を追加し、過大入力による負荷や保存崩れを防ぐ。

---

## 10. CO2削減、ポイント、実績、演出

### 10.1 CO2削減

現状:

- `parcels.co2_saved_kg` を完了画面に表示。
- 地域貢献カードでは完了済み荷物の `co2_saved_kg` を合算。

表示箇所:

- `delivery-complete.tsx`
- `CompletionModal.tsx`
- `RegionalContributionCard.tsx`

方針:

- MVPでは厳密な排出量計算ではなく推定値として扱う。
- 発表では「再配達1回を防いだ推定CO2削減」と説明する。

将来:

- `防げた再配達回数 × 平均再配達距離 × 車両排出係数`
- 地域別、月別、配送会社別の集計

### 10.2 ポイント

現状:

- サーバ側にはポイント付与/消費系のRPCがある。
- `recordAgentDeliveryCompletion`
- `consumeAgentPoints`
- `point_transactions`
- ホーム画面のポイント表示は未接続で `0` 固定。

実装状況: 🟡

必要な追加:

- 代理人ポイント残高取得API
- ポイント履歴一覧
- 特典交換画面
- 完了後の代理人向け獲得ポイント表示

### 10.3 実績・レベル

現状:

- `agent_profiles.level`
- `agent_profiles.completed_deliveries`
- `achievements`
- 3D木のステージ計算

実装状況: 🟡

未接続:

- ホームのXP/木ステージとDB上の実績
- 称号一覧
- レベルアップ通知
- 代理人向け完了演出

### 10.4 完了演出

現状:

- 受取人完了画面で `CompletionModal` を表示。
- 「クエストクリア！」
- CO2削減量カウントアップ
- 紙吹雪
- 地域貢献カード

実装状況: ✅

---

## 11. ハッカソンデモの標準シナリオ

### 11.1 推薦サービスなしの安定デモ

最も壊れにくいデモ。

1. 受取人でログイン。
2. 荷物一覧を開く。
3. 荷物を登録する。
4. 配達員でログイン。
5. 配達開始を押す。
6. 不在報告を押す。
7. 代理人を探す。
8. リストから代理人を割り当てる。
9. 代理人でログイン。
10. 請負リストで配達員用QRを表示する。
11. 配達員が代理人QRを読む。
12. 受取人画面で受取準備へ進む。
13. 受取人QRを表示する。
14. 代理人が受取人QRを読む。
15. 完了画面でCO2削減と評価を見せる。

このルートでは、推薦サービスが落ちていても成立する。

### 11.2 推薦サービスありのデモ

推薦機能を見せるデモ。

前提:

- `EXPO_PUBLIC_RECOMMENDATION_URL` 設定済み
- `recommendation-service` 起動済み
- 推薦SQL適用済み
- 代理人データseed済み

流れ:

1. 受取人が荷物一覧から配達待ち荷物を開く。
2. 位置情報を許可する。
3. 推薦候補がスコア順に表示される。
4. 距離、対応時間、実績のバーと理由タグを説明する。
5. 受取人が代理人を選ぶ。
6. 以降は通常のQRフローに進む。

説明ポイント:

- 候補は距離だけではない。
- 評価、実績、対応時間、現在の保管負荷も見る。
- 確定前は詳細住所を出さない。
- 選択ログは再学習に使える。

### 11.3 発表で強調する価値

- 再配達削減によるCO2削減
- 配送会社の負担軽減
- 受取人の待ち時間削減
- 代理人の参加動機づけ
- 地域貢献の可視化
- QR認証と履歴による最低限の安全性
- AI推薦は落ちても通常マッチングにフォールバックする堅牢性

---

## 12. 現行実装と未実装の一覧

### 12.1 実装済み

| 領域 | 状況 |
| --- | --- |
| 認証 | ✅ |
| ロール判定 | ✅ |
| 受取人荷物一覧 | ✅ |
| 荷物登録 | ✅ |
| 配達員荷物一覧 | ✅ |
| 配達開始/不在報告 | ✅ |
| 配達員の代理人探索 | ✅ |
| 代理人割り当て | ✅ |
| 代理人請負リスト | ✅ |
| QR生成 | ✅ |
| 代理人QR読み取り | ✅ |
| 受取人QR読み取り | ✅ |
| Realtimeによるステータス反映 | ✅ |
| クエスト風ステータス | ✅ |
| 地域貢献カード | ✅ |
| 完了演出 | ✅ |
| 代理人評価UI/API | 🚧 |
| メッセージUI/API | 🚧 |
| 通知一覧/未読/一括既読 | 🚧 |
| 保管期限バッジUI/DB | 🚧 |
| トラブル報告UI/API | 🚧 |
| 代理人顔写真UI/API | 🚧 |
| 推薦サービス連携 | 🚧 |
| 推薦サービス本体 | ✅ |
| セキュリティ強化migration | 🚧 |

`🚧` は「コードはあるが、DB migration適用やenv/サービス起動が必要」という意味。

### 12.2 一部実装

| 領域 | 現状 | 残り |
| --- | --- | --- |
| 代理人プロフィール | 住所/時間/曜日/顔写真は保存 | 緊急連絡先再取得、優先設定、保管上限 |
| ポイント | RPCはある | 残高表示、履歴、特典交換UI |
| 実績/育成 | 3D木はある | DB実績との接続、称号一覧 |
| CO2 | 表示と集計はある | 算出式の明確化、地域別集計 |
| 配達進捗 | ステータス表示はある | 到着予定、現在地、進捗バー |
| 配送会社 | 固定会社IDで動く | ユーザーと会社の正規紐付け |

### 12.3 未実装

| 機能 | 内容 |
| --- | --- |
| 代理受取依頼の詳細設定 | 荷物ごとの代理受取許可、希望代理人、期限、注意事項 |
| ホワイトリスト代理人 | 受取人が信頼できる代理人を管理 |
| 外装写真ログ | 受領時/引き渡し時の写真記録 |
| 監査ログUI | 状態遷移履歴の時系列表示 |
| 配送会社管理画面 | 会社作成、ユーザー紐付け、担当者管理 |
| プッシュ通知 | OSレベル通知 |
| 特典交換 | ポイント利用 |
| 店舗/施設受取スポット | 個人代理人以外の運用モデル |

---

## 13. 重要な仕様上の注意

### 13.1 50mコンセプトと実装半径の違い

コンセプトでは「同じマンションや半径50m以内」を主軸としている。

ただし現行実装では、受取人マッチングの探索半径は `SEARCH_RADIUS_M = 5000`。

理由:

- 実機GPS誤差
- seedデータ不足
- デモで候補が出ない事故を避けるため

本番設計では、50m、100m、同一建物、同一町内などの段階探索に戻すべき。

### 13.2 伝票番号入力と実DBのズレ

受取人の荷物登録モーダルには伝票番号入力欄がある。

現状:

- 入力値は送信されない。
- `create_parcel` RPCがサーバ側で `tracking_no` を採番する。

本当に伝票番号登録を要件にするなら:

- `createParcel` に `trackingNo` 引数を追加
- `create_parcel` RPCを変更
- 入力バリデーション追加
- 重複チェック方針を決める

### 13.3 配送会社ID固定

`DEMO_DELIVERY_COMPANY_ID` は実DB seedに依存している。既定は固定値だが、`EXPO_PUBLIC_DEMO_DELIVERY_COMPANY_ID` で上書きできる。

DBを作り直す、seedが変わる、remoteを変える場合は、このUUIDが無効になる。env未設定なら固定値が使われるため、remote側に該当会社が存在する必要がある。

将来:

- 配達員プロフィールに `delivery_company_id` を持たせる。
- ログインユーザーの会社IDから `fetchDriverParcels` する。

### 13.4 DB migrationの適用状況

ローカルの `supabase/migrations/` には、いくつか「未適用」注記のあるmigrationがある。

本書はリポジトリ上の実装仕様をまとめているが、実DBに適用済みかは別問題。

デモ前に確認すべきもの:

- `handover_messages`
- `agent_reviews`
- `notifications` Realtime publication
- `recommendation_logs`
- `get_recommendation_candidates`
- `mark_recommendation_chosen`
- `get_agent_locations`
- `consume_agent_points`
- `grant_agent_points` 権限
- `storage_deadline`（保管期限トリガと列）
- `agent_avatar`（顔写真列とStorageバケット `agent-avatars`）
- `support_reports`（トラブル報告テーブルとRLS）
- 内部専用関数のEXECUTE剥奪（`security_revoke_internal_fns`）
- 入力長チェック（`security_input_length_checks`）

### 13.5 Edge Functionのローカル実体

アプリコードは以下のEdge Functionを呼び出す。

- `verify-agent-qr`
- `verify-recipient-qr`
- `geocode-agent-address`
- `delete-my-account`

ただし、現在のリポジトリ内には `supabase/functions/*` の実装ファイルは存在しない。

つまり、これらはremote側に存在する前提であり、リポジトリだけで完全再現するにはEdge Function定義のエクスポートまたは再作成が必要。

---

## 14. デモ前チェックリスト

### 14.1 アプリ

- `ShareKeep/.env` にSupabase URLとpublishable/anon keyがある。
- Expoアプリが起動できる。
- サインインできる。
- 受取人、代理人、配達員のテストユーザーがある。
- `DEMO_DELIVERY_COMPANY_ID` がremote DBに存在する。
- `npm run test` が通る、または既知の失敗を把握している。

### 14.2 DB

- 基本テーブルが存在する。
- `profiles.role` が3値enumに揃っている。
- `agent_profiles.location` が入った代理人seedがある。
- `delivery_companies` にデモ会社がある。
- `parcels` のstatus enumが現行コードと一致している。
- Realtime publicationに必要テーブルが入っている。
- RLSがデモユーザーの操作を邪魔していない。

### 14.3 QR

- `generate_qr_token` RPCが動く。
- `verify-agent-qr` が動く。
- `verify-recipient-qr` が動く。
- カメラ権限を許可できる。
- QR二重読み取りでデモが壊れない。

### 14.4 推薦

- 推薦なしデモをまず確認する。
- 推薦ありデモを使う場合、`recommendation-service` を起動する。
- `EXPO_PUBLIC_RECOMMENDATION_URL` を設定する。
- `/health` が成功する。
- `/recommend` が401/502/空候補にならない。
- 候補が出ない場合は半径、代理人位置、曜日時間、seedを確認する。

### 14.5 発表

- 再配達削減の社会課題を説明できる。
- QRによる安全な受け渡しを説明できる。
- CO2削減と地域貢献カードを見せられる。
- AI推薦は距離だけでないことを説明できる。
- 実運用では対象外荷物や責任分界が必要と説明できる。

---

## 15. 実運用に向けたルール案

### 15.1 対象外荷物

MVPまたは実運用初期では、次を対象外にする。

- 冷蔵・冷凍品
- 高額商品
- 大型荷物
- 着払い
- 本人限定受取
- 医薬品
- 危険物
- 壊れやすい荷物
- 生体、食品など温度/衛生リスクが高いもの

### 15.2 保管期限

方針:

- 原則当日中
- 最大24時間
- 期限前通知
- 期限超過時は受取人再通知または配送会社回収

現行実装:

- 保管期限のDB（`parcels.storage_deadline_at` 等、遷移時にトリガで自動セット）とUI（`StorageDeadlineBadge`）は実装済み。
- 期限前通知/期限超過時の自動回収フローは未実装（`storage_overdue_notified_at` 列はあるが運用処理は未接続）。

### 15.3 トラブル対応

必要なトラブル種別:

- 紛失
- 破損
- 誤受け渡し
- 開封痕
- 水濡れ
- 期限超過
- 受取人が来ない
- 代理人が応答しない

必要な証跡:

- QR検証時刻
- 受領時刻
- 引き渡し時刻
- ステータス履歴
- 外装写真
- メッセージ履歴
- 担当配送会社

現行実装:

- ステータス履歴、QR、メッセージ、評価の土台はある。
- 簡易トラブル報告（`support_reports`、`SupportReportForm`）は実装済み。ただし記録のみで、責任判定・補償・運営確認フローは未実装。
- 外装写真、監査ログUIは未実装。

### 15.4 個人代理人と店舗代理人

個人代理人は地域性を出しやすいが、責任や安全性の設計が重い。

実運用初期は、次の順で導入すると現実的。

1. 管理人室、店舗、施設など登録済みスポット
2. 本人確認済みの個人代理人
3. 実績/評価が一定以上の個人代理人
4. ホワイトリスト型の個人代理人

---

## 16. 今後の優先順位

### 16.1 デモ安定性のために優先

1. migration適用状況の確認
2. Edge Functionの存在確認
3. テストユーザー/seed整備
4. 推薦なし標準デモの通し確認
5. `DEMO_DELIVERY_COMPANY_ID` の確認
6. QRフローの実機確認
7. メッセージ・評価・通知のDB適用確認

### 16.2 見栄えと説得力のために優先

1. ホームのXP/ポイントをDB接続
2. 代理人完了時のポイント演出
3. 推薦理由の文言調整
4. 地域貢献カードの数値seed
5. 保管期限の期限前通知/超過対応フロー（UI/DB列は実装済み）
6. トラブル報告の運営確認フロー（報告記録は実装済み）

### 16.3 実運用に近づけるために優先

1. 配達員と配送会社の正規紐付け
2. 受取人の住所/受取希望設定
3. ホワイトリスト代理人
4. 対象外荷物チェック
5. 保管期限の期限超過対応（バッジ/DB列は実装済み）
6. 外装写真ログ
7. トラブル報告の運営確認フロー（報告記録は実装済み）
8. ポイント特典交換
9. 監査ログUI
10. 店舗/施設スポット対応

---

## 17. 関連ファイル

### 17.1 アプリ主要ファイル

| ファイル | 役割 |
| --- | --- |
| `ShareKeep/app/(app)/index.tsx` | ホーム |
| `ShareKeep/app/(app)/recipient/packages.tsx` | 受取人荷物一覧 |
| `ShareKeep/app/(app)/recipient/matching.tsx` | 代理人選択/マッチング |
| `ShareKeep/app/(app)/recipient/useMatchingLogic.ts` | マッチングロジック |
| `ShareKeep/app/(app)/recipient/pickup-ready.tsx` | 受取準備 |
| `ShareKeep/app/(app)/recipient/delivery-complete.tsx` | 完了画面 |
| `ShareKeep/app/(app)/agent/profile.tsx` | 代理人プロフィール |
| `ShareKeep/app/(app)/agent/parcels.tsx` | 代理人請負リスト |
| `ShareKeep/app/(app)/driver/index.tsx` | 配達員ホーム |
| `ShareKeep/app/(app)/driver/agents.tsx` | 配達員代理人探索 |
| `ShareKeep/app/(app)/driver/scan.tsx` | 配達員QR読み取り |
| `ShareKeep/app/(app)/messages/[parcelId].tsx` | メッセージ |
| `ShareKeep/app/(app)/notifications.tsx` | 通知 |

### 17.2 feature層

| ファイル | 役割 |
| --- | --- |
| `ShareKeep/features/auth.ts` | 認証/プロフィール |
| `ShareKeep/features/parcels.ts` | parcels API barrel |
| `ShareKeep/features/parcels-recipient.ts` | 受取人向け荷物API |
| `ShareKeep/features/parcels-driver.ts` | 配達員向け荷物API |
| `ShareKeep/features/parcels-agent.ts` | 代理人/QR/通知/会社API |
| `ShareKeep/features/recommend.ts` | 推薦サービス連携 |
| `ShareKeep/features/messages.ts` | メッセージ |
| `ShareKeep/features/notifications.ts` | 通知 |
| `ShareKeep/features/reviews.ts` | 評価 |
| `ShareKeep/features/stats.ts` | 地域貢献集計 |
| `ShareKeep/features/support.ts` | トラブル報告 |
| `ShareKeep/features/avatar.ts` | 代理人顔写真 |

### 17.3 lib層

| ファイル | 役割 |
| --- | --- |
| `ShareKeep/lib/status.ts` | ステータス、クエスト表示、配達員アクション |
| `ShareKeep/lib/scoring.ts` | 説明可能スコアと推薦breakdown集約 |
| `ShareKeep/lib/geo.ts` | プライバシー段階開示 |
| `ShareKeep/lib/constants.ts` | XP閾値、検索半径、フォールバック位置 |
| `ShareKeep/lib/config.ts` | デモ配送会社ID |
| `ShareKeep/lib/error.ts` | エラーメッセージ抽出 |
| `ShareKeep/lib/database.types.ts` | 型定義 |

### 17.4 推薦サービス

| ファイル | 役割 |
| --- | --- |
| `recommendation-service/app/main.py` | FastAPI |
| `recommendation-service/app/features.py` | 特徴量化 |
| `recommendation-service/app/model.py` | モデルとfallback |
| `recommendation-service/app/recommendation_service.py` | 推薦処理本体 |
| `recommendation-service/app/supabase_client.py` | Supabase接続 |
| `recommendation-service/app/ratelimit.py` | Rate limit |
| `recommendation-service/app/cache.py` | TTL cache |
| `recommendation-service/training/train.py` | 学習 |
| `recommendation-service/training/generate_synthetic.py` | 合成データ生成 |

### 17.5 migration

| ファイル | 役割 |
| --- | --- |
| `20260613140000_recommendation.sql` | 推薦基盤 |
| `20260613150000_handover_messages.sql` | メッセージ |
| `20260613150100_agent_reviews.sql` | 評価 |
| `20260613150200_notifications_enhance.sql` | 通知強化 |
| `20260613160000_reco_add_avg_rating.sql` | 推薦候補に評価追加 |
| `20260613160000_recommendation_rpc_guards.sql` | 推薦RPC保護 |
| `20260613170000_security_hardening_min.sql` | セキュリティ強化 |
| `20260613170000_storage_deadline.sql` | 保管期限（列・トリガ） |
| `20260613170100_agent_avatar.sql` | 代理人顔写真（列・Storage） |
| `20260613170200_support_reports.sql` | トラブル報告テーブル |
| `20260613180000_security_revoke_internal_fns.sql` | 内部専用関数のEXECUTE剥奪 |
| `20260613190000_security_input_length_checks.sql` | 入力長チェック |

### 17.6 主要コンポーネント

| ファイル | 役割 |
| --- | --- |
| `ShareKeep/components/TreeScene.tsx` | 3D木の育成表示 |
| `ShareKeep/components/RegionalContributionCard.tsx` | 地域貢献カード |
| `ShareKeep/components/CompletionModal.tsx` | 完了演出モーダル |
| `ShareKeep/components/StorageDeadlineBadge.tsx` | 保管期限バッジ |
| `ShareKeep/components/SupportReportForm.tsx` | トラブル報告フォーム |
| `ShareKeep/components/SupportReportBadge.tsx` | トラブル報告バッジ |
| `ShareKeep/components/Avatar.tsx` | 代理人顔写真表示 |
| `ShareKeep/components/AvatarPicker.tsx` | 代理人顔写真選択/アップロード |

---

## 18. まとめ

ShareKeep の現在地は、「再配達削減」という社会課題に対して、受取人・代理人・配達員の3者フローをアプリ上で通せる段階にある。

現在の強み:

- QRで受け渡しの節目を作れている。
- ステータス遷移が画面とRealtimeでつながっている。
- 代理人候補の推薦とフォールバックが両立している。
- メッセージ、評価、通知、地域貢献、完了演出までデモ価値がある。
- 推薦ログを将来の再学習に使える構造がある。

現在の弱み:

- DB migrationとremoteの適用状況が仕様書だけでは保証できない。
- Edge Function実装がリポジトリ内にない。
- 配送会社IDが既定では固定（env上書きは可）。
- XP/ポイント/実績UIがDBに未接続。
- 保管期限の超過対応、トラブル報告の運営確認は未接続（土台は実装済み）。
- 外装写真、責任分界は未実装。

したがって、ハッカソン発表では「MVPとして通る体験」と「実運用で必要な安全設計」を分けて説明するのがよい。

MVPの主張:

> 不在時の荷物を近隣代理人に安全に一時保管してもらい、QR認証とステータス履歴で受け渡しを管理する。再配達を減らし、CO2削減と地域貢献を可視化する。代理人選定は距離だけでなく、時間帯・実績・評価を含む推薦で支援する。

この主張は、現行実装と整合している。
