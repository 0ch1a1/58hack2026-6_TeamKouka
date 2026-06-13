# ShareKeep 面白くする案メモ（実装仕様版 / 実スキーマ基準）

## 目的

ShareKeep は「再配達削減」「近所の代理受取」「環境貢献の可視化」を軸にしたアプリ。
ハッカソンでは、単なる配送補助アプリではなく、次の2点が伝わる機能が強い。

- 実際の物流現場の課題に効く
- デモで一目で価値が伝わる

本ドキュメントは、レビュー（実現可能性／審査インパクト／設計の正しさ）に加え、**実装済みスキーマ `ShareKeep/lib/database.types.ts` を正**として各案を実装着手レベルまで具体化したもの。`requirements.md` のドラフト5テーブル案（`users`/`deliveries`/`pickup_spots`/`delivery_events`、status整数 `-1〜3`）は**古い**ので参照しない。

---

## `58th_development_requirements.md` と被りにくい追加機能案まとめ

`58th_development_requirements.md` に既に明記されている「近隣マッチング」「QR生成/検証」「ポイント」「CO2表示」「保管期限管理」「トラブル報告」そのものは除外し、**未記載または差分が強いもの**だけを抽出する。

### ほぼ新規で追加価値がある案

| 案 | 追加価値 | 実装コスト | 発表での見せ方 |
|---|---|---:|---|
| 追記専用監査ログ + 検証UI | 引き渡し履歴をハッシュチェーンで残し、後から改変検知の説明ができる | 中 | イベント履歴がOK/NGで検証される画面 |
| 完了時の達成演出 | 完了直後にCO2削減・XP・称号を出し、体験の達成感を作る | 低 | QR完了後にカウントアップ/バナー |
| クエスト風ステータス表示 | 内部statusは変えず、利用者向けに進行状況をわかりやすくする | 低 | 荷物詳細のステップバー |
| 署名付き短期有効QR | 通信不安定時にも真正性と期限を検証できる余力機能 | 高 | 将来機能枠。オンラインQRとの差分説明 |
| AI伝票照合 | 伝票写真から追跡番号を読み取り、取り違え防止を補助 | 高 | OCR照合結果の「一致/不一致の可能性」 |
| LLMトラブル一次対応 | 監査ログを要約し、運営が確認すべき点を出す | 中〜高 | トラブル時の確認ポイントカード |
| 配達員ライブ位置トラッキング | 受取人に「近づいている」感を出す | 中 | ダミー進捗バー/到着予測 |

### 既存要件と少し被るが、差分として足す価値がある案

| 案 | 要件書側の近い項目 | 差分 |
|---|---|---|
| スコアリング理由の可視化 | F-MATCH-03 優先マッチング | AI推薦本体ではなく、距離・対応時間・実績の内訳バーだけを出す軽量版 |
| プライバシー段階開示 | F-DRIVER-02 個人情報保護 | 割当前非表示に加えて、町名/geohash丸め→確定後開示まで段階化 |
| 地域貢献カード | F-CO2-01 CO2集計 | 個人別/全体集計だけでなく、再配達防止回数・CO2・協力者数を発表向けに3指標カード化 |
| 外装写真ログ | F-TROUBLE-01 トラブル報告 | トラブル時だけでなく、代理受取時/引き渡し時の通常ログとして写真を残す |
| 保管期限の運用詳細 | F-STORAGE-01 保管期限管理 | 「原則当日中、最大24時間」「3時間前/1時間前通知」「期限超過バッジ」まで具体化 |

### 実装順

基準は **デモ価値が高い / 既存DBだけで動く / 失敗しても既存フローを壊しにくい** 順。DDL・Storage・Edge Function が必要なものは後ろに回す。

| 順位 | 機能 | 理由 | 依存/注意 |
|---:|---|---|---|
| 1 | クエスト風ステータス表示 | 既存statusの表示差し替えだけで、荷物フローが一気にわかりやすくなる | 内部statusは変更しない |
| 2 | 完了時の達成演出 | QR完了直後の見せ場を作れる。CO2/XP/称号の価値が伝わる | まずは既存値・固定値でも可 |
| 3 | 地域貢献カード | 社会課題への効き方を3指標で説明できる | 全体集計から開始。地域絞り込みは後回し |
| 4 | スコアリング理由の可視化 | F-MATCH-03本体が重くても、推薦理由だけ先に見せられる | 距離/時間/実績のバー表示に絞る |
| 5 | プライバシー段階開示 | サービスとしての現実味が上がる。マッチング画面と相性が良い | 確定前は町名/丸め位置、確定後に詳細 |
| 6 | 保管期限の運用詳細 | 代理受取サービスとして安全説明に効く | まずは期限表示・期限超過バッジ。通知は画面内バナーで可 |
| 7 | 外装写真ログ | トラブル報告より先に「通常時の記録」として入れると自然 | Storage/RLSが必要。写真1枚+状態チップから |
| 8 | 簡易トラブル報告 | 外装写真ログとつなげると説得力が出る | 責任判定はしない。報告記録だけ |
| 9 | 追記専用監査ログ + 検証UI | 信頼性の説明は強いが、DDL/検証ロジックが必要 | Edge Function化するなら工数中 |
| 10 | 配達員ライブ位置トラッキング | 体験は良いが、必須フローではない | 地図なし進捗バーで十分 |
| 11 | LLMトラブル一次対応 | 監査ログがあって初めて価値が出る | 将来機能枠でも成立 |
| 12 | AI伝票照合 | 面白いがOCR/API/個人情報対応が重い | 将来機能枠向き |
| 13 | 署名付き短期有効QR | 技術的には強いが、既存QRが動いているので優先度は低い | オフライン/署名は余力枠 |

### 最短デモパッケージ

時間が短い場合は **1〜5だけ** を入れる。これで「荷物フローがわかりやすい」「完了時に価値が伝わる」「地域貢献が見える」「推薦理由とプライバシー配慮が説明できる」状態になる。

余裕があれば **6〜8** を追加し、代理受取サービスとしての安全面を補強する。**9以降** は発表資料の将来機能枠で十分。

---

## 実装スキーマ（正）— `ShareKeep/lib/database.types.ts`

| テーブル | 主なカラム | 備考 |
|---|---|---|
| `profiles` | id, role(`recipient`/`agent`/`driver`), full_name, phone, company_name, employee_id | ユーザー基盤。`users` ではない |
| `agent_profiles` | user_id, address, **location**(geo), **available_days**(text[]), **start_time**, **end_time**, **level**, **points**, **completed_deliveries** | 代理人情報。`pickup_spots` 相当だが **postal_code / mansion_id は無い**（位置は geo） |
| `parcels` | id, tracking_no, recipient_id, delivery_company_id, assigned_agent_id, **status**(`pending`/`waiting`/`matched`/`stored`/`delivering`/`completed`), retry_count, **co2_saved_kg** | `deliveries` ではない。**status は文字列enum**（整数 -1〜3 ではない） |
| `delivery_matches` | parcel_id, recipient_id, agent_id, **distance_meters**, status | マッチング結果。距離を持つ |
| `qr_tokens` | id, parcel_id, user_id, **qr_type**, token, expires_at, **used**(bool) | `purpose`/`used_at` ではなく `qr_type`/`used` |
| `point_transactions` | user_id, points, transaction_type | ポイント台帳（既存） |
| `co2_reduction_logs` | parcel_id, retry_saved, co2_saved_kg | CO2ログ（既存） |
| `achievements` | user_id, achievement_type | 称号（既存） |
| `delivery_companies` | id, name | — |

### status の遷移（文字列enum）

`pending`（登録済・配達前）→ `waiting`（不在・代理待ち）→ `matched`（代理人へ配送中）→ `stored`（代理キープ中）→ `delivering`（受取人へ／受取人が取りに行く）→ `completed`（完了）

> **運用前提**：スキーマはSupabase側で管理され、リポジトリに migration が無い。DDL変更は Supabase（SQL Editor or 新規migration）で適用し、**`lib/database.types.ts` を手動更新**する。`supabase/functions/`・`supabase/migrations/` ディレクトリは現状未作成なので、Edge Functionを使う案は「Supabase CLI初期化」が事実上のコミット0になる。

---

## 優先順位

主役は **案2 スコアリングマッチング ＋ 案5 監査ログ／CO2可視化 ＋ 演出系 ＋ 保管期限/写真ログ**。署名QR（案1）は「現場でも止まらない」補強トピックに降格。

黄金ストーリー：**スコアリングで賢く割当（案2）→ 再配達を防止＝CO2削減 → 削減量を追記専用ログ（案5）で可視化・蓄積 → エコツリー／地域マップで体験化 → 将来 points で特典交換。**

着手の推奨順（確実に動く順）：

1. **演出系**（完了演出・称号・クエスト風ステータス・2Dエコツリー・地域集計）— **既存テーブルだけで完結＝DDLゼロ**・最低リスク。最初に固めて常時デモ可能な土台に
2. **案2 スコアリングマッチング** — `agent_profiles` の既存カラムでほぼ実装可
3. **案5 追記専用監査ログ＋CO2/XP/points** — 新テーブル `parcel_events` を1枚追加。**案1非依存のMVPを先に**
4. **案4 プライバシー段階開示** — geohash純JS、案2の付加価値
5. **案6 保管期限＋期限前通知＋外装写真ログ/簡易トラブル報告** — 代理受取サービスとしての現実味と安全説明に効く
6. **案7 LLMトラブル一次対応** — Edge Function経由
7. **案8 ライブ位置トラッキング**（ダミー座標＋Realtime）
8. **案1 署名付き短期有効QR** — スコープ管理必須。ハッカソン本番は「オンラインQR検証まで」に削り、署名・オフラインは余力枠
9. **案3 AI伝票照合** — 照合のみに限定

### コミット0（全案共通の前提作業）

- 依存追加：`npm i lottie-react-native react-native-reanimated`（演出系）、必要時 `@noble/ed25519 @noble/hashes expo-crypto expo-secure-store`（案1）、`ngeohash`（案4）。reanimated は babel plugin 設定が必要
- **3D封印の実行**：`@react-three/fiber`/`three`/`expo-gl` は**導入済み**。2D方針なら既存の3Dコンポーネント（`TreeScene` 等）を撤去 or 不使用にする撤去コミットを切る
- Edge Functionを使う案：`supabase init` → `supabase/functions/` 作成、`supabase secrets set` でAPIキー登録

### 表現の補正（技術的に正しい範囲に統一）

- 「ワンタイムQR」→「**署名付き短期有効QR**」（オフラインで保証するのは真正性＋期限のみ。二重使用はサーバ同期時の**事後検知**）
- 「予測／最適化」→「**ルールベーススコアリング＋貪欲法**」（学習データ不在。ハンガリアン法は1対1割当用で複数荷物＝NP困難なGAPに不適合）
- 「改ざん不能／検証可能クレジット」→「**追記専用監査ログ（append-only）**」（単一サーバの限界・garbage-inを明記）
- **3Dは封印**、2D確定。LLM/Vision等の**APIキーはEdge Function裏に秘匿**

### 共通設計ルール（doc内の整合）

- **`parcel_events.client_event_id` は案5で1度だけ定義**。クライアントが採番するUUIDで、`DEFAULT` は付けない（サーバ採番だと冪等性が壊れる）。案1も同じ列を参照する（再定義しない）
- **イベント語彙（event_type）を一元定義**：`registered` / `absence_reported` / `matched` / `handoff_primary`(→`stored`) / `handoff_secondary`(→`completed`) / `completed`。集計・生成・スコアの全箇所でこの語彙を使う
- **ハッシュ対象はクライアント確定の生テキスト**（`payload_text`）に固定。`jsonb` から再シリアライズしてハッシュしない（数値正規化・Unicodeエスケープ・NFCでズレるため）
- **冪等／単調遷移／二重使用は別レイヤ**：①同一 `client_event_id` の再送＝冪等で無視 ②別 `client_event_id` だが status 前提を満たさない＝単調遷移違反で拒否 ③同一QR(`token`)が別端末＝`qr_tokens.used` 既設定で事後検知

---

# 実装仕様

## 案2. 代理人スコアリングマッチング ＋ プライバシー段階開示

### 概要と正直な保証範囲

代理人候補を、**機械学習による在宅確率予測ではなく、自己申告データ（`agent_profiles.available_days`/`start_time`/`end_time`）と現在時刻の一致度＋距離＋実績**のルールベーススコアリングで並べ替える。「最適化」「予測」は使わない。保証は「説明可能な重み付き合算スコアで候補を降順表示し、内訳を提示する」まで。

> 実スキーマは位置ベース（`agent_profiles.location`, `delivery_matches.distance_meters`）。よって**距離はスコアに使う**（requirements.md の「緯度経度マッチング非使用」は古い前提なので踏襲しない）。

| 項目 | 保証する | 保証しない |
|---|---|---|
| 候補抽出 | location 近接（半径内） | 経路・交通状況 |
| スコアリング | 時間帯一致＋距離＋実績の重み合算 | 在宅確率予測・学習ベース最適化 |
| 割当 | 降順ソート/貪欲法 | 大域最適（最小費用流・厳密解） |
| プライバシー | UI段階開示・geohash丸め | k-匿名性・統計的開示制御 |

### スキーマ変更（DDL）

既存 `agent_profiles` に必要な列はほぼ揃っている（`available_days`/`start_time`/`end_time`/`level`/`completed_deliveries`/`location`）。**信頼スコアは `level`・`completed_deliveries` で代替**するので追加列は最小：

```sql
-- 近接抽出を高速化（location が geography 型の前提。PostGIS 有効化済みとする）
CREATE INDEX IF NOT EXISTS idx_agent_profiles_location
  ON agent_profiles USING gist (location);

-- 代理人ごとの同時キープ上限（任意。無ければMVPは固定値 cap=3 をコード側で使う）
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS capacity int DEFAULT 3;
```

> `level`/`completed_deliveries`/`points` は既存。新規列の追加後は `database.types.ts` の `AgentProfile` を更新する。

### スコア関数の定義

候補代理人 `a` のスコア `S(a)` を 0–100 で算出。

| 因子 | 記号 | 範囲 | 重み | データ源 |
|---|---|---|---|---|
| 時間帯マッチ度 | `T` | 0–1 | 0.45 | available_days / start_time / end_time |
| 距離近接度 | `D` | 0–1 | 0.30 | delivery_matches.distance_meters（または location 計算） |
| 実績・信頼 | `R` | 0–1 | 0.25 | min(completed_deliveries,10)/10 と level を合成 |

```
S(a) = 100 * (0.45*T + 0.30*D + 0.25*R)
```

- **時間帯マッチ度 T**：現在の曜日が `available_days` に含まれ、現在時刻が `start_time`〜`end_time` の窓内なら、窓中心に近いほど高得点。**時刻は分換算（h*60+m, 0–1439）してから距離計算**（`hhmm` 直引きは分跨ぎで歪むため）。窓内は最低0.5でクランプ、窓外は0。`start_time > end_time`（深夜跨ぎ）は別枝で判定
- **距離近接度 D**：`D = 1 - min(distance_meters, MAX)/MAX`（MAX例 2000m）
- **実績・信頼 R**：`R = 0.7 * min(completed_deliveries,10)/10 + 0.3 * min(level,5)/5`

重みは `scoring.config.ts` に外出ししデモ中に変更可能に。

### スコアリング理由の可視化（F-MATCH-03 軽量版）

AI推薦のように重い説明機構は作らず、候補カードに **距離・対応時間・実績** の3本バーを表示する。発表では「なぜこの代理人がおすすめか」が一目で伝わることを優先する。

| 表示項目 | 表示例 | 内部値 |
|---|---|---|
| 距離 | 近い 82% | `D * 100` |
| 対応時間 | 今すぐ対応しやすい 94% | `T * 100` |
| 実績 | 受取実績 70% | `R * 100` |
| 総合 | おすすめ度 86 | `S(a)` |

- UI：代理人カード上部に総合スコア、下部に3本の横バー。バー色は距離/時間/実績で固定
- 文言：断定表現（「必ず在宅」等）は使わず、「対応しやすい」「実績が多い」に留める
- 実装：`lib/scoring.ts` は `{ total, factors: { distance, availability, reliability } }` を返す形にする
- MVP：バーは静的 `View` 幅指定で十分。グラフライブラリは不要

### マッチングアルゴリズム

MVP は貪欲法／スコア降順ソート。1代理人が複数荷物を持てる本件は一般化割当（NP困難）で、1対1前提のハンガリアン法は不適合。

```
function assign(parcels, agents):
  for p in parcels:
    cands  = agentsWithinRadius(p, agents, RADIUS)   # location 近接で候補抽出
    scored = sortDesc(cands, by = S(a))              # スコア降順
    for a in scored:
      if a.load < a.capacity:                        # capacity（既定3）
        bind(p, a); a.load += 1; break
```

将来：荷物→代理人→sink に容量=capacity、コスト=`100 - S(a)` で**最小費用流（MCMF）**。デモ規模では過剰。

> 候補 N=3〜5 では貪欲と最適化は結果一致しがち。比較画面は「意図的に順位逆転が起きる配置」を仕込み、その旨を正直に発表する。

### プライバシー段階開示

| 段階 | 受取人住所 | 代理人住所 |
|---|---|---|
| 候補一覧（確定前） | 非表示 | geohash丸め（precision 6 ≒ 数百m四方）＋ラベル |
| マッチ提案中 | 町名まで | 地図上に丸めピン |
| 確定後 | **詳細住所を開示** | 詳細住所を開示 |

`agent_profiles.location` を geohash 化（`ngeohash`）し、確定前は precision を落として表示。**k-匿名性は保証しない**：ターゲット（代理人過疎）では1セル1人が大半で丸めても特定され得る。MVPは「確定前は丸め／確定後に詳細」の運用上の段階開示に割り切る。

発表での説明は「マッチ確定前は町名/丸めた位置だけ、確定後に必要最小限の詳細住所を出す」。配送・受取に必要なタイミングまで詳細住所を出さないことで、サービスとしての現実味を上げる。

### 実装ステップ

1. DDL適用（GiSTインデックス、`capacity`）＋ `database.types.ts` 更新＋ダミー代理人データ投入
2. 近接候補抽出：`agent_profiles` を `ST_DWithin(location, :point, :radius)` で抽出（recipient の位置 or 荷物の届け先基準）
3. `lib/scoring.ts` に `T/D/R` と `S(a)`、重みを `lib/scoring.config.ts` へ
4. 貪欲割当 `assign()`（capacity）
5. 配達員/受取人画面に候補一覧（スコア降順＋**内訳の因子バー**）
6. 段階開示：`lib/geo.ts` に geohash 丸めユーティリティ、確定前/後で住所コンポーネント切替
7. 比較画面：「単純（距離順 or 件数順）」vs「スコアリング順」を左右並置
8. （将来）MCMF をフラグで追加

### MVP落としどころ / デモ / 限界

- **MVP**：`T+D+R` の合算と貪欲のみ。`capacity` 固定3。MCMFは将来枠
- **デモ**：同一エリアに代理人3〜5人を因子衝突配置 → 単純順とスコア順で**順位逆転** → 内訳バーで「なぜこの順位か」 → 段階開示の遷移
- **限界**：`available_*` は自己申告で在宅を保証しない／貪欲近似（GAPはNP困難）／小規模比較は意図シナリオ依存／geohash丸めでも代理人過疎では匿名性は破れうる

---

## 案5. 追記専用監査ログ ＋ CO2/XP/points

### 概要と正直な保証範囲

引き渡し等のイベントを時系列で連結したハッシュチェーンとして新テーブル `parcel_events` に保存し、「いつ・誰が・何を」を**追記専用（append-only）**で残す。

- **できること**：後から1件を書き換え/削除すると以降のハッシュ整合性が崩れ、検証で「どこから壊れたか」を**検知しやすくする**
- **できないこと（明記）**：
  - 「改ざん不能」ではない。**DB管理権限（所有者／service_role）を持つ運営は、トリガを `ALTER TABLE ... DISABLE TRIGGER` / `session_replication_role='replica'` で回避でき、RLSもバイパスする**。全ハッシュを再計算すれば整合を保ったまま書き換え可能。よって追記専用は「運営に対する防御」ではなく「内部の誤操作・後付け改変の検知補助」
  - 真の改ざん検知には**外部アンカリング**（最新ハッシュを外部公開）または分散保持が必要。ハッカソンでは**やらない**（将来展望）
  - **Garbage-in**：入力イベントが偽造されればチェーンは「偽データの正しいチェーン」になるだけ。CO2 の信頼性は引き渡しの**真正性（案1の署名QR）**に依存
  - CO2 値は**概算・固定係数**（再配達1回=0.5kg 等）。`points` は蓄積のみ

### スキーマ変更（DDL）

```sql
-- 監査ログ用の新テーブル（実スキーマに delivery_events は無いため新設）
CREATE TABLE parcel_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id       uuid REFERENCES parcels(id),
  event_type      text NOT NULL,           -- 語彙: registered/absence_reported/matched/handoff_primary/handoff_secondary/completed
  actor_id        uuid REFERENCES profiles(id),
  client_event_id uuid NOT NULL UNIQUE,     -- ★クライアント採番の冪等キー。DEFAULTは付けない
  payload_text    text NOT NULL DEFAULT '{}', -- ハッシュ対象の生JSON文字列（このバイト列をそのままハッシュ）
  payload         jsonb,                    -- 照会用（ハッシュには使わない）
  prev_hash       text,                     -- 直前イベントの hash（先頭はNULL）
  hash            text NOT NULL,            -- SHA-256
  created_at      timestamptz NOT NULL DEFAULT now()  -- サーバ確定値。ハッシュにもこの値を使う
);

-- 追記専用の強制（UPDATE/DELETE を拒否）
CREATE OR REPLACE FUNCTION reject_mutation_parcel_events()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'parcel_events is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_delete_parcel_events
  BEFORE UPDATE OR DELETE ON parcel_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation_parcel_events();

-- RLS: INSERT のみ許可。UPDATE/DELETE ポリシーは作らない。
-- ※ 所有者/service_role はトリガ・RLSを回避できる（上記「正直な保証範囲」参照）
```

`hash = sha256( prev_hash || '|' || parcel_id || '|' || event_type || '|' || actor_id || '|' || created_at(サーバ確定ISO8601) || '|' || payload_text )`。**`payload_text` はクライアントが確定した生文字列をそのまま使い、サーバは再シリアライズしない**。

### CO2/XP/points 計算ロジック（Edge Function `complete-delivery`）

クライアント計算だと前ハッシュ取得と挿入の間で競合するため、サーバでトランザクション＋行ロック：

```ts
// supabase/functions/complete-delivery/index.ts （擬似）
// 0. Authorization ヘッダの JWT を検証し actor_id を解決
// 1. （案1連携時のみ）payload に署名QR検証結果が入っていれば真正性を確認。MVPは無くても成立
// 2. SELECT ... FOR UPDATE で対象 parcel の最新 parcel_events.hash を取得 (= prev_hash)
// 3. created_at をサーバ確定 → hash = sha256(prev_hash|parcel_id|'completed'|actor_id|created_at|payload_text)
// 4. 同一トランザクションで:
//    - INSERT parcel_events(... event_type='completed', client_event_id, payload_text, prev_hash, hash, created_at)
//        ※ client_event_id UNIQUE 衝突 = 冪等（既処理）→ 既存行を返して終了
//    - UPDATE parcels SET status='completed', co2_saved_kg = coalesce(co2_saved_kg,0) + 0.5
//    - INSERT co2_reduction_logs(parcel_id, retry_saved, co2_saved_kg)
//    - UPDATE agent_profiles SET level = ..., points = points + <固定値> WHERE user_id = assigned_agent_id
//    - INSERT point_transactions(user_id, points, transaction_type='delivery_completed')
```

クライアント（検証UI用）の再計算は `expo-crypto`：

```ts
import * as Crypto from 'expo-crypto';
const hash = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  `${prevHash ?? ''}|${parcelId}|${eventType}|${actorId}|${createdAt}|${payloadText}`
);
```

> `created_at` はサーバ確定値を採用。クライアント側ハッシュは**保存済み行の再計算（検証UI）専用**で、INSERT前の予測計算はしない。

### 検証UI

- 対象 parcel の `parcel_events` を `created_at` 昇順で取得
- 先頭から `recompute = sha256(prev|...)` し保存済み `hash` と比較、さらに `events[i].prev_hash === events[i-1].hash`
- 行ごとに OK(緑)/NG(赤)、「最初に壊れた位置」を強調
- **デモ用**：DBの1件を直接改変 → 再検証で**その行以降が連鎖的にNG**。同時に「運営権限なら全hash再計算で緑のまま改変できる」ことも正直に説明

### 実装ステップ / MVP / 限界

1. DDL適用（`parcel_events`・トリガ・RLS）＋ `database.types.ts` に `ParcelEvent` 追加
2. Edge Function `complete-delivery`（prev_hash取得→hash計算→INSERT＋parcels/co2/points更新をトランザクション化）。`supabase init` が前提
3. クライアント：完了アクションで Edge Function 呼び出し、`client_event_id` をクライアント採番
4. 検証UI画面
5. （後付け）案1の署名QR検証結果を `payload_text` に含める連携

- **MVP**：外部アンカリング・分散保持はやらない。`points` は蓄積のみ。固定係数0.5kg（係数も payload に記録し後で差し替え可能に）。**案1非依存で成立**（署名検証結果が無くてもチェーンは機能する）
- **限界**：運営権限による全再計算改変は防げない／入力偽造には無力（真正性は案1依存）／CO2は概算

---

## 案1. 署名付き短期有効QR認証（余力枠）

### 概要と正直な保証範囲

2段階引き渡し（1次: 代理人→配達員 → `stored`、2次: 受取人→代理人 → `completed`）を **Ed25519署名付きの自己検証QR** で認証する。**ハッカソン本番は「オンラインQR検証まで」を必達とし、署名・オフライン同期は余力枠**。

| 検証項目 | オフラインで保証可 |
|---|---|
| QRの真正性（サーバ発行の本物か） | ✅ |
| 有効期限内か（端末時刻ベース） | ✅（限定的・巻き戻し不可） |
| 対象actorの一致 | ✅（`aud` とログイン中の自分のIDを突合） |
| **ワンタイム（二重使用防止）** | ❌（サーバ同期時の事後検知） |

「ワンタイム」と完全オフライン検証は両立しない。本設計はオフラインでは「真正性＋期限内」のみ保証し、二重使用はサーバ同期時に事後検知。**脅威モデルは「悪意ある攻撃者」ではなく「通信不安定による事故」に絞る。**

### スキーマ変更（DDL）

既存 `qr_tokens(id, parcel_id, user_id, qr_type, token, expires_at, used, created_at)` を自己検証QR向けに拡張。`qr_type` が purpose（`primary`/`secondary`）を兼ね、`used`(bool) を同期時にサーバが立てる。

```sql
CREATE TABLE signing_keys (
  kid         text PRIMARY KEY,
  public_key  text NOT NULL,           -- base64url。クライアントに配布（秘匿不要）
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
  -- 秘密鍵はDBに置かず Edge Function Secret に保管
);

ALTER TABLE qr_tokens
  ADD COLUMN kid         text REFERENCES signing_keys(kid),
  ADD COLUMN audience_id uuid,          -- スキャンを許可される相手(aud)
  ADD COLUMN subject_id  uuid,          -- 提示者(sub)
  ADD COLUMN signature   text;          -- 発行時署名（監査用）
-- used(bool) を「サーバが引き渡しイベントを受理した」事後フラグとして使う
```

> `client_event_id` は**案5の `parcel_events` で定義済みの列を使う**（ここで再定義しない）。

### 使用ライブラリ（Expo Go 可否）

| ライブラリ | 用途 | Expo Go | 状態 |
|---|---|---|---|
| `@noble/ed25519` + `@noble/hashes` | Ed25519署名/検証（純JS） | ✅ | 未導入 |
| `expo-crypto` | SHA-512/乱数 | ✅ | 未導入 |
| `expo-camera` | QRスキャン | ✅ | **導入済み** |
| `react-native-qrcode-svg` | QR表示 | ✅ | **導入済み** |
| `expo-secure-store` | ローカル使用済みリスト/同期キュー | ✅ | 未導入 |

noble v2 は同期hash注入が必要：

```ts
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
```

### QR payload 設計

QR文字列 = `base64url(payloadJSON) + "." + base64url(signature)`（JWS風）。

```ts
type QrPayload = {
  v: 1;
  kid: string;                // 鍵ID
  tid: string;                // qr_tokens.id（事後ワンタイム判定キー）
  pid: string;                // parcel_id
  pur: 'handoff_primary'      // 1次: → stored
     | 'handoff_secondary';   // 2次: → completed
  sub: string;                // 提示者 profiles.id
  aud: string;                // スキャン許可相手 profiles.id
  iat: number; exp: number;   // exp = iat + 600 程度
  jti: string;                // nonce（同一端末の連打抑止）
};
```

署名対象は payloadJSON 全体（`kid`/`aud`/`sub` を含む）。本人性は「スキャナ側 `aud === 自分のid`／提示者側 `sub === 自分のid`」の突合で担保（QR自体は本人確認しない＝ログイン済みIDとの突合が根拠）。

### 実装ステップ

1. 鍵準備：Ed25519鍵ペア生成、秘密鍵はEdge Function Secret、公開鍵を `signing_keys` に登録。クライアント起動時に公開鍵キャッシュ
2. 発行：Edge Function `issue-qr` が `auth.uid()` の正当性確認 → `aud` 解決 → `qr_tokens` 行作成（`expires_at = now+10min`、`qr_type`/`signature` 保存）→ 署名QR文字列を返す
3. 表示：`react-native-qrcode-svg`、`exp` カウントダウン、失効後は再発行
4. スキャン＋クライアント検証（オフライン可）：`expo-camera` → ①`kid`で公開鍵取得 ②署名検証 ③`aud`一致 ④`exp`>端末時刻 ⑤`pur`が次遷移と整合（1次=`status==='matched'`、2次=`status==='stored'`）⑥ローカル使用済みリスト未登録 → 成功表示、`parcel_events`（`client_event_id`採番、`tid`含む）を**同期キュー**へ
5. 同期：Edge Function `commit-handoff` が ①`client_event_id`で冪等 ②**サーバ時刻**で`exp`再検証 ③`qr_tokens.used` 既設定なら二重使用を事後検知 ④status単調遷移でUPDATE＋`used=true`
6. 競合解消：2台が成功表示しても `used` を取れるのは一方。負けた側は「処理済み」応答で注意表示

### MVP落としどころ / デモ / 限界

- **本番必達**：オンラインでの「QR発行→表示→スキャン→サーバ検証→status更新」まで（署名なし＝既存 `qr_tokens.token` 照合でもよい）
- **余力枠**：Ed25519署名・オフライン検証・同期キュー・二重使用事後検知
- **捨てる**：鍵ローテーション運用（`signing_keys`は1行）、nonce端末間共有、payload暗号化
- **デモ（余力時）**：両端末を機内モードに→署名QRをオフライン検証で `stored`/`completed` まで進める→機内解除で同期、サーバが `used` を立てCO2反映→同じQRを2台目で→同期時に二重使用検知
- **限界**：オフラインはワンタイム非保証／端末時刻巻き戻しはオフラインで防げない（サーバ再検証で補完）／耐攻撃ではない（payload平文・秘密鍵漏洩で偽造可）／本人確認はログインID突合に依存／「業務が止まらない」のはQR検証シーンのみ（マッチング・Realtime・同期はオンライン必須）

---

## 案3. AI 伝票照合（優先度: 低）

### 概要と正直な保証範囲

代理受取時に伝票を撮影し、OCR/Vision で読み取った追跡番号を `parcels.tracking_no` と照合して**取り違え防止の補助サジェスト**を出す。

- OCRは誤読する。一致/不一致は断定せず**サジェスト**に留め、**最終確認は人**（確定ボタンは人間）
- 破損検知のAI判定は証拠能力なし＝「参考記録」止まり
- 伝票写真には宛名等の個人情報。保存ポリシー（保持期間・アクセス制御・最小化）を定め、APIキーは**Edge Function経由で秘匿**

### 構成 / 実装ステップ / MVP / 限界

```
expo-camera（導入済）/ expo-image-picker（要追加）
  → Supabase Storage（一時バケット, RLS, 署名URL, 自動失効）
  → Edge Function verify-label  ※OCR APIキーは supabase secrets に
  → Vision/OCR API（Google Vision / Document AI 等）
  → tracking_no 正規化（空白/ハイフン除去）＋部分一致 → 確信度(高/中/低)を返す
  → クライアント: 候補提示 → 人が確定
```

- **MVP**：照合のみ。破損検知は「参考記録」フラグ＋写真保存のみ
- **デモ**：伝票撮影→「parcel #XXX と一致（確信度: 高）」→人が確定。別荷物で「不一致の可能性」
- **限界**：OCR精度は照明・手ブレ・手書きで低下／個人情報の保持・最小化が必要／従量課金・レイテンシ・オフライン不可／破損検知AIは証拠能力なし

---

# 体験改善・サポート系（最低リスク・最初に着手）

完了演出・称号・クエスト風ステータス・2Dエコツリー・地域集計は **既存テーブルのみで完結＝DDLゼロ**。**3D（@react-three/fiber/three/expo-gl）は導入済みだが封印し、撤去 or 不使用にする。**

## 完了時の達成演出

- 概要：QRスキャンで `parcels.status='completed'` 直後、CO2削減量・獲得XP（=points/level）・育成結果モーダル。「あなたの代理受取で再配達1回を防ぎました」を主役に
- データ：追加カラム不要。`co2_saved_kg` と `co2_reduction_logs` 累計（`select sum(co2_saved_kg) from co2_reduction_logs join parcels ...`）、`agent_profiles.points/level`
- ライブラリ：`lottie-react-native`（紙吹雪/チェック）、`react-native-reanimated`（カウントアップ）、標準 `Modal`
- ステップ：①`app/(app)/recipient/delivery-complete.tsx`（既存）に `CompletionModal` を組み込み ②カウントアップ＋Lottie ③しきい値跨ぎで称号バナー ④閉じてエコツリー画面へ
- MVP：`co2_saved_kg` は固定値0.5でも可。XP加算は Edge Function（案5 `complete-delivery`）に寄せると競合回避

## エコツリー育成（2D）

- 概要：累計XP（`agent_profiles.level`/`points` or 受取人の `completed`件数）で「芽→若木→成木→花/実」。**3D封印、ステージ別画像＋Lottie/reanimated**
- データ：既存。ステージはクライアントしきい値マップ（例 0/30/80/150）
- ステップ：①`lib/treeStage.ts`（`xpToStage`）②`components/EcoTree.tsx`（ステージ画像切替＋reanimatedで scale/opacity）③**既存3Dツリーコンポーネントを置換/撤去**
- MVP：4ステージ静止画＋軽いLottie

## 地域貢献カード / 地域全体の ShareKeep マップ

- 概要：個人の達成だけでなく、**ShareKeep全体で再配達を何回防いだ / CO2を何kg削減した / 協力者が何人いるか** を表示する。社会課題への効き方を発表で伝えやすくする
- 表示：
  - 再配達防止：`completed` 件数（または `co2_reduction_logs.retry_saved` 合計）
  - CO2削減：`co2_reduction_logs.co2_saved_kg` 合計
  - 協力者：`parcels.assigned_agent_id` の distinct 件数
  - 補助：今日/今週/累計の切替、前回比の小さな差分表示
- UI：ホーム上部または完了後モーダル下部に3指標の横並びカード。地図でなく集計カードで軽量に
- クエリ例：
  ```sql
  select count(*) filter (where p.status = 'completed')        as prevented,
         coalesce(sum(c.co2_saved_kg),0)                       as total_co2,
         count(distinct p.assigned_agent_id)                   as helpers
  from parcels p
  left join co2_reduction_logs c on c.parcel_id = p.id
  where p.status = 'completed';   -- 地域絞り込みは location 近接 or 将来の area_id で
  ```
  > 実スキーマに `mansion_id` が無いので、地域単位は `agent_profiles.location` の近接 or 別途 `area` 概念の追加が必要。MVPは「全体集計カード」でデモ成立
- MVP：全体集計カード1枚。地域別ランキングは余力枠

## 称号システム

- 概要：受取回数/levelに応じ称号（はじめてキーパー／ご近所ガーディアン等）。**既存 `achievements` テーブルを使う**
- データ：`achievements(user_id, achievement_type)`。称号定義はクライアント定数
- ステップ：①`lib/badges.ts`（定義配列：初回=completed1件、ご近所ガーディアン=5件、エコマイスター=level閾値）②完了時に件数/levelを再評価→未獲得→獲得を検出→`achievements` に insert ③プロフィールに一覧（未獲得グレーアウト）
- MVP：2〜3種＋初回獲得バナー

## クエスト風ステータス表示（内部値は不変、UI表示のみ）

| 内部値（ParcelStatus） | UI表示（例） |
|---|---|
| `pending` | クエスト準備中 |
| `waiting` | キーパー探索中 |
| `matched` | お届けに向かっています |
| `stored` | ご近所さんが預かり中 |
| `delivering` | 受け取りに向かっています |
| `completed` | クエストクリア！ |

- ステップ：①`lib/parcelStatus.ts` に `statusLabel(status: ParcelStatus)` と色/アイコンマップ ②既存 `packages.tsx`/`agent/parcels.tsx` の `STATUS_CONFIG` をこのヘルパー経由に統一（重複排除）③横並びステップで進捗可視化
- MVP：文言マップ＋ステップバー。内部 status ロジックには触れない

## 案6. 保管期限・期限前通知・外装写真ログ/簡易トラブル報告

### 概要と正直な保証範囲

代理人が荷物を預かったあと、**原則当日中・最大24時間** の保管期限を明示し、期限前に受取人へ通知する。さらに代理受取時/引き渡し時に外装写真と状態メモを残し、破損・開封痕・水濡れなどがあった場合は簡易トラブル報告として記録する。

これは責任判定や補償を自動化する機能ではない。MVPでは「期限管理」と「問題発生時の記録」を残すところまで。運営判断、配送会社への連絡、補償可否は人間が扱う。

### スキーマ変更（DDL）

```sql
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS storage_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_overdue_notified_at timestamptz;

CREATE TABLE parcel_photo_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id   uuid REFERENCES parcels(id),
  actor_id    uuid REFERENCES profiles(id),
  phase       text NOT NULL, -- received_by_agent / handed_to_recipient / trouble_reported
  photo_url   text NOT NULL,
  condition   text NOT NULL DEFAULT 'ok', -- ok / damaged_box / opened_mark / wet / other
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id   uuid REFERENCES parcels(id),
  reporter_id uuid REFERENCES profiles(id),
  category    text NOT NULL, -- damaged / opened / wet / overdue / lost / other
  status      text NOT NULL DEFAULT 'open', -- open / reviewing / resolved
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

写真は Supabase Storage の `parcel-photos` バケットに保存する。RLSは対象 `parcel` の `recipient_id` / `assigned_agent_id` / 運営のみ参照可。公開URLは使わず署名URLで表示する。

### 保管期限ロジック

- `parcels.status='stored'` へ遷移した時点で `storage_started_at=now()`、`storage_deadline_at=least(date_trunc('day', now()) + interval '1 day', now() + interval '24 hours')`
- 表示文言：`原則当日中、最大24時間まで`
- 期限前通知：期限3時間前と1時間前に受取人へ通知。MVPはアプリ内バナー/ローカル通知でも可
- 期限超過時：受取人へ再通知、代理人画面に「期限超過」バッジ、配達員/運営の回収候補として表示
- `storage_overdue_notified_at` は同じ超過通知の連打防止に使う

> Supabase単体で定期実行するなら `pg_cron` または Edge Function + 外部cronが必要。ハッカソンMVPは画面表示時に期限判定し、期限前/期限超過のUIを見せるだけでも成立する。

### 外装写真ログ

- タイミング：
  - 代理人が受け取る時：外装写真1枚、状態 `ok/damaged_box/opened_mark/wet/other`
  - 受取人へ渡す時：必要なら引き渡し時写真1枚
  - 問題発生時：写真＋メモ＋カテゴリで `support_reports` 作成
- UI：カメラ撮影 → 状態チップ選択 → 任意メモ → 保存
- 保存内容：写真URL、撮影者、フェーズ、状態、メモ、時刻
- 目的：責任判定ではなく、後から状況を確認できるログ。案5の `parcel_events` と併用する場合は `payload_text` に `photo_log_id` / `support_report_id` を含める

### 実装ステップ / MVP / 限界

1. DDL適用（`parcels` の期限列、`parcel_photo_logs`、`support_reports`）＋ `database.types.ts` 更新
2. `stored` 遷移時に `storage_started_at` / `storage_deadline_at` をセット
3. 荷物詳細画面に期限表示（残り時間、期限前、期限超過）
4. 期限前/期限超過の通知UI（MVPは画面内バナー）
5. Supabase Storage `parcel-photos` 作成、撮影/アップロードUI
6. 外装状態チップ＋簡易トラブル報告フォーム
7. `parcel_events` に写真ログ/報告IDを紐付ける

- **MVP**：期限表示、期限超過バッジ、外装写真1枚、状態チップ、報告フォーム。定期push通知は余力枠
- **デモ**：代理人が受取→写真ログ保存→保管期限カウントダウン→期限前通知バナー→受取完了。別シナリオで水濡れ写真＋報告を作成
- **限界**：写真は真正性を完全保証しない／撮影漏れは防げない／期限超過時の回収運用は人間の判断が必要／補償や責任判定は対象外

## 案7. LLM トラブル一次対応エージェント

- 概要：トラブル時に `parcel_events`（案5）を参照し状況を要約、運営が確認すべき点と次アクション候補を提示。**LLMに責任分界点の認定はさせない**（状況要約＋確認ポイントまで）
- データ：`select event_type, actor_id, created_at from parcel_events where parcel_id=:id order by created_at;`。任意で `support_tickets(id, parcel_id, summary, suggested_actions, created_at)` を新設
- ライブラリ：Supabase **Edge Function**（APIキー秘匿）、Anthropic Messages API（`claude-haiku-4-5` 等の軽量モデル＋低temperature）
- ステップ：①`triage-support`（`parcel_id` 受領）②events取得→タイムラインJSON化 ③システムプロンプトで役割厳格化（事実要約／確認点／次アクションのみ。**責任認定・断定は禁止**）④構造化出力（summary/check_points/suggested_actions）⑤要約カード＋「運営に連絡」
- MVP：1荷物ぶんの要約＋確認3点＋次アクション3点。チケット永続化は任意。**案5の `parcel_events` 前提**なので案5の後に着手

## 案8. 配達員ライブ位置トラッキング

- 概要：配達員の現在地を擬似共有し受取人側で「近づいています」を表示。**ダミー座標を一定間隔で Supabase Realtime 送信→受取人画面で進捗表示**に割り切る。地図（react-native-maps）はこだわらない
- スキーマ：
  ```sql
  CREATE TABLE delivery_locations (
    parcel_id  uuid PRIMARY KEY REFERENCES parcels(id),
    lat double precision, lng double precision,
    progress int,            -- 0..100
    updated_at timestamptz DEFAULT now()
  );
  -- RLS（必須）: 当該 parcel の recipient / assigned_agent のみ参照可
  ALTER TABLE delivery_locations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY loc_read ON delivery_locations FOR SELECT
    USING (EXISTS (SELECT 1 FROM parcels p WHERE p.id = parcel_id
            AND (p.recipient_id = auth.uid() OR p.assigned_agent_id = auth.uid())));
  ```
- プライバシー整理（案4と方向が逆な点）：①配達員の生座標は当該配送の受取人にのみ ②受取人位置の精密住所は配達員に出さない（案4の丸め維持）③第三者・集計には個人位置を出さない
- ライブラリ：Supabase Realtime（Postgres Changes or Broadcast）。地図ライブラリ不採用、進捗バー＋テキスト
- ステップ：①`delivery_locations` 作成（上記RLS）②配達員画面でダミー経路を数秒間隔で upsert ③受取人画面で `parcel_id` を subscribe ④progress を進捗バー＋「あと約◯分」⑤progress=100 で完了演出へ
- MVP：地図なし。ダミー進捗 0→100 のバーと到着通知だけでデモ成立
