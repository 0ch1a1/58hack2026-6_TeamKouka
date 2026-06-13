# 中間者おすすめ 推薦スコアリングAPI 設計メモ

> `feature-ideas.md` の **案2（代理人スコアリングマッチング）** の深掘り版。
> 受取人が「荷物を預ける中間者（代理人）」を選ぶ際に、Supabaseのデータ＋距離などから候補をスコアリングして並べる推薦APIの設計。**独立Python MLサービス**＋**Supabase migration**＋**クライアント実装**の3層構成で進める方針。
> ※本ファイルは設計メモ。実コードは未実装（着手時にこの設計に沿って作る）。
>
> 現在の ShareKeep 本体には未接続。バックエンド統合の進捗は [`integration-tasks.md`](./integration-tasks.md) を参照。

---

## 0. DB実態調査の結果（Supabase MCP・読み取り専用で確認済み / 2026-06-13）

設計の前提を実DB（`project_id=zbmrmblakoszzecdnptn`）で検証した結果：

| 項目 | 結果 | 設計への影響 |
|---|---|---|
| PostGIS | **3.3.7 有効** | `::geography` / `st_dwithin` 前提でOK |
| `agent_profiles.location` | **`geography` 型** | 距離計算は確定。「想定」ではなく確認済み |
| `parcels.status` enum | `created`/`out_for_delivery`/`delivery_failed`/`agent_assigned`/`delivered_to_agent`/`handed_to_recipient`/`completed` | `active_load` 集計は `agent_assigned`/`delivered_to_agent` |
| `find_nearby_agents` | `lat/lng` を**呼び出し側から受領**。半径＋曜日＋時間帯（Asia/Tokyo・深夜跨ぎ対応）で**ハードフィルタ済み** | ロジック流用可。ただし推薦は時間帯を**ソフトスコア化**したいので別RPCにする |
| `parcel_status_histories` | 存在（イベントログ） | 案5の監査ログに流用候補 |
| 既存テーブル | `co2_reduction_logs`/`point_transactions`/`achievements`/`notifications` あり | 演出系はDDLゼロで可 |

### 距離の起点：受取人座標がDBに無い → 自宅住所を登録して使う（確定）

`profiles`・`parcels` に緯度経度・住所カラムが**無い**ことを確認（該当カラム0件）。既存 `find_nearby_agents` も**アプリが lat/lng を渡す**設計。

**決定（§1.5で詳細）**：起点は**登録した受取人の自宅座標**を既定とし、GPSは「今ここで探す」任意上書きにする。理由は、本アプリが「近所で預かる」サービスである以上、欲しいのは**自宅の近所**の代理人であり、GPSの「現在地」は出先だとズレるため。住所方式は操作も少ない（初回登録1回→以降0タップ）。受取人座標は `recipient_profiles` を新設して保持する。

### データ状況（デモ準備）

- 代理人 `agent_profiles` は**現状1件のみ**／recipient 5件／`delivery_matches` 0件。
- **ランキングを成立させるには代理人を複数シード必須**（`location`/`available_days`/`level`/`completed_deliveries` をバラけさせる）。

> 補足：`spatial_ref_sys`（PostGIS標準の座標系参照テーブル）がRLS無効と警告が出るが、これは公開定義テーブルでユーザーデータではないため通常は無害。

---

## 1. 何を作るか / なぜこの形か

### 既存実装で「欠けているピース」

チームのバックエンドは Postgres RPC 中心で、`features/parcels.ts` に既に揃っている：

- `find_nearby_agents(lat, lng, radius_m, target_at)` → `NearbyAgent[]`（user_id, address, **distance_meters**）
- `get_agent_locations()` → agentの `location`/`available_days`/`start_time`/`end_time`/`level`/`completed_deliveries`
- `match_nearby_agent(...)` / `assign_agent_to_parcel(parcel_id, agent_id, distance_meters)`

つまり**「距離・時間帯で候補を絞る」ところまでは実装済み**。足りないのは、それらを**合算スコアで順位付けして"オススメ"を提示する層**。本APIはこの欠落を埋める。

### 構成（3層）

```
[Expo App / 受取人]
   │  POST /recommend { parcel_id, lat, lng, radius_m }
   ▼
[Python ML サービス (FastAPI + scikit-learn)]      ← 本体。学習済みモデルで推論
   │  rpc get_recommendation_candidates(lat,lng,radius)   （service_roleで取得）
   ▼
[Supabase / Postgres + PostGIS]
   ├─ get_recommendation_candidates : 近接代理人 + 特徴量
   └─ recommendation_logs           : 推薦結果 + 選択/成否ラベル（再学習用）
```

- **なぜ別Pythonサービス**：本格ML（scikit-learn等）を使いたいという要件。Edge Function(Deno)やPostgresでは学習・推論ライブラリが扱いにくい。推論自体は軽量なので別サービスで十分。
- **なぜ migration（CLI）**：チームが supabase CLI（`supabase/` プロジェクト, `project_id=zbmrmblakoszzecdnptn`, PG17）で管理しているため、DB側は migration ファイルで追加する。

### デプロイ権限についての注意（事実）

`.env` には anon(publishable) キーしか無く、DB管理/service_role/CLIアクセスは未確認。**migration適用・Pythonサービスのデプロイはアクセス権を持つメンバーが行う前提**。設計に沿った「動かせる一式」は用意できるが、適用は手動。

---

## 1.5 距離の起点と受取人座標（確定）

### 方針

- **既定**：受取人の**登録した自宅住所の座標**を起点にする。サインアップ/設定で住所を1回入力→ジオコーディング→座標を保存。以降の推薦は**0タップ**・常に自宅基準で安定。
- **任意上書き**：「今いる場所で探す」ボタンで `expo-location` の端末GPSを使い、その場の座標で `/recommend` を叩く（出先で受け取りたい時用）。
- 距離の計算自体は PostGIS（`st_distance`/`st_dwithin`, geography）で既に解決済み。**足りなかったのは起点だけ**で、本節でそれを確定する。

### 操作数の比較（なぜ自宅住所を既定にするか）

| 方式 | 初回 | 毎回 | 起点の正確さ |
|---|---|---|---|
| 登録住所（既定） | 住所入力1回 | 0タップ | ◎ 常に自宅の近所 |
| GPS（任意） | 権限許可1回 | 0タップ | △ 現在地依存（出先だとズレる） |

### 受取人座標の持ち方：`recipient_profiles` 新設（`agent_profiles` と対称）

`profiles` に直接列を足すと役割混在で汚れるため、代理人と同じパターンの専用テーブルにする。

```sql
create table if not exists public.recipient_profiles (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  address       text,
  address_detail text,
  location      geography(Point, 4326),   -- 自宅座標（agent_profiles.location と同型）
  updated_at    timestamptz not null default now()
);
alter table public.recipient_profiles enable row level security;
-- 本人のみ参照・更新
create policy recipient_profiles_self on public.recipient_profiles
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### ジオコーディング（既存 Edge Function の流用）

代理人側に `geocode-agent-address`（住所→座標で `agent_profiles` を upsert）が既にある。**受取人版**を同じ作りで用意：

- 案A：汎用化して `geocode-address(role, ...)` にし、`recipient_profiles` にも書けるようにする
- 案B：`geocode-recipient-address` を新設（最短）

クライアントは住所入力時にこれを呼び、`recipient_profiles.location` を埋める。`upsert_agent_profile` に対応する `upsert_recipient_profile(p_user_id, p_address, p_lat, p_lng, p_address_detail)` RPC も併せて用意。

### `/recommend` への受け渡し

- 既定：クライアントが `recipient_profiles.location` から取得した `lat/lng` を `/recommend` に渡す（or サーバが recipient_id から引く）。
- 上書き：GPS座標を渡せばそちらを起点にする。
- いずれも `get_recommendation_candidates(p_lat, p_lng, ...)` に渡すだけで距離・距離スコアまで算出される。

### 着手時の追加TODO（本節由来）

- `recipient_profiles` テーブル＋RLS＋`upsert_recipient_profile` RPC を migration に追加
- ジオコーディング Edge Function の受取人対応（案A/B）
- サインアップ/設定画面に受取人住所入力を追加
- `database.types.ts` に `RecipientProfile` 型追記

---

## 2. 機械学習についての正直な整理（重要）

- **真の教師あり学習にはラベル付きデータ（どの代理人が選ばれた／配達成功したか）が必要だが、現時点で存在しない。**
- そこで2段階で進める：
  1. **ブートストラップ期**：既知の妥当なスコア関数＋ノイズで**合成データを生成し、そこでモデルを学習**（GradientBoosting等）。同時に**推薦ログ（特徴量→選択→成否）を蓄積**する。
  2. **本学習期**：`recommendation_logs` に実データが溜まったら、それで**再学習**して合成モデルを置き換える。
- 推論は GBM の確率出力（or 線形モデルのドット積）なので**軽量**。本格ML（勾配ブースティング）でも推論コストは小さい。
- 「合成データ学習である」ことはデモ・発表で正直に述べる。`recommendation_logs` の存在で「使うほど賢くなる導線がある」ことを示せるのが審査向きのストーリー。

---

## 3. DB migration 設計（`supabase/migrations/<ts>_recommendation.sql`）

### 3-1. 候補取得 + 特徴量 RPC

`get_recommendation_candidates(lat, lng, radius_m, active_statuses)` を新設。`find_nearby_agents` と似るが、**スコアリングに必要な特徴量（実績・現在の保管負荷）まで一括で返す**のが差分。

返す列（特徴量の素データ）：

| 列 | 用途 | 出所 |
|---|---|---|
| `user_id`, `full_name` | 識別・表示 | profiles |
| `distance_meters` | 距離スコア | PostGIS `st_distance(location, point)` |
| `available_days`(text[]) | 曜日マッチ | agent_profiles |
| `start_time` / `end_time` | 時間帯マッチ | agent_profiles |
| `level` | 信頼の代理指標 | agent_profiles |
| `completed_deliveries` | 実績 | agent_profiles |
| `points` | 補助 | agent_profiles |
| `active_load` | 負荷分散 | `count(parcels where assigned_agent_id=? and status in active)` |

設計上の注意：
- `agent_profiles.location` は **geography 型（確認済み）**。`::geography` キャストはそのまま有効。
- **find_nearby_agents との役割分担**：既存 `find_nearby_agents` は曜日・時間帯で**ハードフィルタ**（窓外は除外）し自動マッチに使う。一方 `get_recommendation_candidates` は**半径のみで絞り、曜日/時間帯は生データのまま返す**＝Python側で**ソフトスコア化**（窓外でも下位候補として残す）。曜日/時刻判定ロジック（`available_days` の `Dy`/`Day` 突合、Asia/Tokyo、深夜跨ぎ）は find_nearby_agents の実装を踏襲する。
- `active_load` の「対応中」status は確定enum `agent_assigned`/`delivered_to_agent` を既定に、引数 `p_active_statuses` で調整可。
- `capacity`（同時保管上限）は現スキーマに無いので、**Python側の定数（既定3）**で扱う。列を足すなら `agent_profiles.capacity int default 3`。
- 起点 `p_lat`/`p_lng` は**アプリから渡す**（DBに受取人座標は無い／§0参照）。

```sql
create or replace function public.get_recommendation_candidates(
  p_lat double precision, p_lng double precision,
  p_radius_m integer default 2000,
  p_active_statuses text[] default array['agent_assigned','delivered_to_agent']
) returns table (
  user_id uuid, full_name text, distance_meters double precision,
  available_days text[], start_time time, end_time time,
  level integer, completed_deliveries integer, points integer, active_load integer
) language sql stable as $$
  select ap.user_id, pr.full_name,
    st_distance(ap.location::geography, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography),
    ap.available_days, ap.start_time::time, ap.end_time::time,
    coalesce(ap.level,1), coalesce(ap.completed_deliveries,0), coalesce(ap.points,0),
    (select count(*)::int from public.parcels p
       where p.assigned_agent_id = ap.user_id and p.status = any(p_active_statuses))
  from public.agent_profiles ap
  join public.profiles pr on pr.id = ap.user_id
  where ap.location is not null
    and st_dwithin(ap.location::geography, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography, p_radius_m)
  order by 3 asc;
$$;
```

### 3-2. 推薦ログ（再学習用ラベル）

```sql
create table if not exists public.recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references public.parcels(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  candidate_agent_id uuid references public.profiles(id) on delete set null,
  features jsonb not null default '{}'::jsonb,   -- 推論時の特徴量ベクトル（再学習の入力）
  score double precision, rank integer, model_version text,
  chosen boolean not null default false,          -- 受取人が選んだか（ラベルA）
  outcome text,                                   -- 'completed'|'failed'|null（ラベルB）
  created_at timestamptz not null default now()
);
alter table public.recommendation_logs enable row level security;
-- 受取人は自分宛のみ参照。INSERT は service_role(Pythonサービス) が RLS バイパスで実施。
create policy reco_logs_select_own on public.recommendation_logs
  for select using (recipient_id = auth.uid());
```

### 3-3. ラベル付与用 RPC（security definer）

- `mark_recommendation_chosen(parcel_id, agent_id)` … 受取人が中間者確定時に `chosen` を立てる
- `record_recommendation_outcome(parcel_id, outcome)` … 配達成否（`completed`/`failed`）を選択行に記録

この2つで「特徴量 → 選択 → 成否」が揃い、教師データになる。

---

## 4. Python ML サービス設計（`recommendation-service/`）

### ディレクトリ構成（予定）

```
recommendation-service/
  app/
    main.py            # FastAPI: /recommend /feedback /retrain /health
    schemas.py         # pydantic 入出力
    features.py        # ★特徴量エンジニアリング（学習・推論で共有）
    model.py           # モデル load/predict/explain（pkl無しはルールベースfallback）
    supabase_client.py # service_role で候補取得・ログ書込
    config.py          # env 読み込み
  training/
    generate_synthetic.py  # 合成学習データ生成
    train.py               # 学習（合成 or 実ログ）→ models/model.joblib
  models/                  # 学習済みモデル成果物
  requirements.txt         # fastapi, uvicorn, scikit-learn, pandas, numpy, joblib, supabase, pydantic
  Dockerfile
  .env.example             # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODEL_PATH ...
  README.md
```

### 特徴量（`features.py` で学習・推論共有）

候補の素データ → 0–1正規化した特徴ベクトルへ。**学習と推論で同じ関数を使う**ことが最重要（ズレると精度崩壊）。

| 特徴量 | 計算 | 意味 |
|---|---|---|
| `distance_score` | `clamp(1 - distance/DIST_MAX, 0,1)`（DIST_MAX≈2000m） | 近いほど高 |
| `time_score` | 現在時刻が窓内なら中心ほど高（0.5–1）、窓外は小（0.15）、未設定は1 | 在宅しやすさ（自己申告） |
| `day_match` | 今日が `available_days` に含まれば1（未設定は1） | 曜日一致 |
| `experience` | `clamp(completed_deliveries/20,0,1)` | 実績 |
| `level_score` | `clamp((level-1)/4,0,1)` | 信頼の代理指標 |
| `capacity_score` | `clamp(1 - active_load/capacity,0,1)`（capacity既定3） | 負荷分散 |
| `is_weekend` / `is_evening` | 文脈フラグ | 時間帯文脈 |

> 注：`time_score`/`day_match` は**自己申告であって在宅"予測"ではない**点を明記（誇大表現を避ける）。`available_days` の曜日トークン（en/和/数値）は正規化して判定。

### モデル（`model.py` / `train.py`）

- **主モデル**：`GradientBoostingClassifier`（受諾/成功確率 `P` を出力＝スコア）。
- **説明用**：併走の `LogisticRegression`（標準化済み係数 × 特徴値 = 各因子の寄与）で「**なぜこの順位か**」のスコア内訳を返す（doc案2の「内訳バー」に対応）。
- **fallback**：`models/model.joblib` が無ければ**ルールベース重み**（distance0.30/time0.25/...）でドット積→sigmoid。これにより**学習前でもサービスは動く**。
- **学習**：
  - `generate_synthetic.py`：素データを妥当な分布でサンプリング→既知の効用関数＋ノイズで `chosen/success` ラベルを生成→`features.py` で特徴化→CSV。
  - `train.py`：CSV（既定）or `recommendation_logs`（`--from-logs`）で学習、AUC を出力、`models/model.joblib`（features順, gbm, logreg, scaler, version）を保存。

### APIエンドポイント

| メソッド | パス | 役割 |
|---|---|---|
| POST | `/recommend` | `{parcel_id?, recipient_id?, latitude, longitude, radius_m?, top_k?, target_at?}` → 候補取得→特徴化→推論→ランキング→`recommendation_logs` 書込→返却 |
| POST | `/feedback` | `{parcel_id, agent_id}` → `mark_recommendation_chosen` |
| POST | `/retrain` | `recommendation_logs` で再学習（管理用） |
| GET | `/health` | 死活＋ロード中モデルversion |

`/recommend` レスポンス例：

```json
{
  "model_version": "synthetic-v1",
  "generated_at": "2026-06-13T13:30:00Z",
  "recommendations": [
    {
      "agent_id": "uuid", "full_name": "山田", "rank": 1,
      "score": 0.87, "distance_meters": 320,
      "breakdown": {"distance_score":0.84,"time_score":1.0,"day_match":1,"experience":0.6,"level_score":0.75,"capacity_score":0.67},
      "reasons": ["今が受取可能時間", "徒歩圏(320m)", "実績多数"]
    }
  ]
}
```

---

## 5. クライアント実装（`ShareKeep/features/recommend.ts`）

既存 `features/parcels.ts` の流儀に合わせる：

```ts
// 候補をスコア順で取得（Python ML サービス）
export async function recommendAgents(params: {
  parcelId?: string; latitude: number; longitude: number;
  radiusMeters?: number; topK?: number;
}): Promise<RecommendedAgent[]>  // fetch POST `${EXPO_PUBLIC_RECOMMENDATION_URL}/recommend`

// 受取人が中間者を確定したら選択ラベルを記録（DB側RPC）
export async function markRecommendationChosen(parcelId: string, agentId: string)
  // supabase.rpc('mark_recommendation_chosen', { p_parcel_id, p_agent_id })
```

- 受取人の中間者選択画面（`recipient/matching.tsx` 付近）で `recommendAgents` を呼び、スコア順＋内訳バーで表示。
- 確定時に既存 `assignAgentToParcel` ＋ `markRecommendationChosen` を呼ぶ。
- `EXPO_PUBLIC_RECOMMENDATION_URL` を `.env` に追加（要 .gitignore 済み確認）。

---

## 6. 段階的な進め方（着手プラン）

1. **migration**：`get_recommendation_candidates` ＋ `recommendation_logs` ＋ ラベルRPC を1ファイルで追加（PostGIS有効化が前提なら併せて）。`database.types.ts` に `RecommendationLog` 型追記
2. **Pythonサービス（fallback優先）**：まずルールベースfallbackで `/recommend` を動かし、候補取得→ランキング→ログ書込のE2Eを通す
3. **合成学習**：`generate_synthetic.py` → `train.py` で `model.joblib` 生成、サービスが自動でMLモデルに切替
4. **クライアント連携**：`recommend.ts` ＋ 受取人選択画面でスコア順表示・内訳バー
5. **本学習（将来）**：`recommendation_logs` が溜まったら `train.py --from-logs` で再学習

---

## 7. 既知の限界・正直な但し書き

- **学習は当面合成データ**。実ラベルが溜まるまで「使うほど賢くなる」は導線のみ（`recommendation_logs`）。
- `time_score`/`day_match` は**自己申告**で在宅を保証・予測しない。
- `distance_meters` は直線距離（PostGIS）で経路・交通は考慮しない。
- `capacity` はスキーマ未定義のため定数（既定3）。厳密化するなら列追加。
- Pythonサービスは **service_role キーを持つサーバ**＝秘密鍵管理が必要。クライアントには絶対に置かない。
- `parcels.status` の「対応中」語彙は実装と要同期（`p_active_statuses`）。
- デプロイ（migration適用・サービス常駐）はアクセス権を持つメンバーが実施。
