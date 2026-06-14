# 推薦システム ロジック解説＋ML計画

作成: 2026-06-13 / 対象: `recommendation-service/`（AI推薦）の中身と、データ・特徴量・モデルの方針
関連: 要件 F-MATCH-03 / `next-features-plan.md` §4 / 設計メモは `feat/recommendation-api` の `recommendation-api.md`

---

## 0. 決定事項（2026-06-13・本タスクでの方針確定）

1. **特徴量に `avg_rating`（評価）を追加する**。`agent_reviews` 実装済みで取得可能な、数少ない“本物”の信頼性シグナル。
   - 反映先: `get_recommendation_candidates`（avg_rating を返す）→ `features.py`（`FEATURE_NAMES` に追加・正規化）→ 学習側 utility と `train.py`。
2. **学習データは一旦 GPT 等で生成して初期学習する**。実ログが無い現状の初期モデルを用意する目的。
   - 「合成データの天井（§2.1）」は理解の上で、初期モデル＋デモ用途として割り切る。GPTで分布の多様性・現実的なエッジケースを足す。
3. **以後は溜まった実データ（`recommendation_logs`）から再学習できるようにする**。`/feedback`・`record_recommendation_outcome`・`train.py` の導線を実データ対応にしておく（“育つ推薦”）。

> 上記を正とする。下の §2〜§3 は背景・トレードオフの整理、§4 は具体ステップ。

---

## 1. いま何を使っているか（現状ロジック）

### アルゴリズム
- **メイン: 勾配ブースティング決定木（scikit-learn `GradientBoostingClassifier`）**。
  - `model.py` が学習済みモデルを `joblib` でロードし、`gbm.predict_proba(X)[:,1]`（＝選ばれる/成功する確率 0–1）を**スコア**として返す。
  - 学習時（`train.py`）は GBM に加え `LogisticRegression`（`StandardScaler` 付き）も学習し `roc_auc_score` で評価（GBMが主、ロジ回帰は比較用）。
- **フォールバック（モデル未学習・ロード失敗時）**: `_fallback_predict` が特徴量の重み付き和を `sigmoid` に通す**ルールベース**。MLが無くても動く安全網。

### 3層構成
1. **Supabase RPC `get_recommendation_candidates`**: 半径内の候補と生データ（距離・対応時間・実績・レベル・請負数）を PostGIS（`st_dwithin`/geography）で返す。
2. **Python サービス（FastAPI）**: 生データ → `features.py` で8特徴量へ変換 → GBM でスコア化 → 理由（`build_reasons`）付きで `/recommend` 返却。`/feedback`・`/retrain` あり。
3. **クライアント**: スコア順に「おすすめ代理人」を 0–100点表示、`mark_recommendation_chosen` で選択を記録（`recommendation_logs`）。

### 特徴量（8個 / `FEATURE_NAMES`）
`distance_score` / `time_score` / `day_match` / `experience` / `level_score` / `capacity_score` / `is_weekend` / `is_evening`
（距離は2km上限正規化、時刻/曜日は Asia/Tokyo）

### 学習データ
`training/generate_synthetic.py` による**合成データ**。ラベルは手作りの utility 式から生成:
```
utility = 0.34*distance + 0.25*time + 0.14*experience + 0.11*day_match
        + 0.10*capacity + 0.08*level + 0.02*(weekend*day) - 0.03*(evening*(1-time))
label   = 1 if rand < sigmoid((utility - 0.56)*6.5 + noise)
```

---

## 2. 正直な評価（ここが論点）

### ⚠️ 2.1 「合成データ学習」は循環している
ラベルは**既知の重み付け utility 式**から作られ、GBM はその式（＋ノイズ）を学習し直しているだけ。
→ **現状の GBM は、フォールバックのルールベースとほぼ同じことを“ML っぽく”再現しているに過ぎない。** 実世界の予測力は乗っていない。「AIで推薦」というデモのストーリーとしては成立するが、精度の根拠は無い。
→ 価値があるのは**枠組み**（特徴量設計・ログ収集・再学習導線）であって、今のモデルの賢さではない、と認識して扱うべき。

### ⚠️ 2.2 特徴量は妥当だが穴がある
妥当: distance / time / day_match / experience / capacity は現実的。
**足りない/見直したい**:
- **`avg_rating`（評価）が未使用**。今回 `agent_reviews` を実装し平均評価が取れるようになったのに特徴量に入っていない。**信頼性の直接シグナルなので最優先で追加候補**。
- **過去のトラブル有無 / 引き受け成功率（承諾率・キャンセル率）**: 仕様の「過去トラブル有無」を反映できていない。
- **同一建物フラグ / より細かい距離帯**（50m/100m段階）: 仕様の優先順位に対応。
- **受取人×代理人の相性・過去履歴**（リピート）: あれば強いが実データ依存。
- `level_score` と `experience` は相関が高く冗長な可能性（どちらかで足りるかも）。
- `is_weekend`/`is_evening` は単独効果が薄い（utility でも係数極小）。落としても影響小。

### 2.3 Hugging Face からモデルを持ってくる？ → この問題には基本不向き
- HF の事前学習モデルは **NLP/画像/音声**が中心。**8個の数値特徴のテーブル型ランキング**に転用できる事前学習モデルは実質ない（tabular は転移学習が効かない領域）。
- HF が活きるとすれば**別の使い方**:
  - 住所や「注意事項」など**テキストを埋め込み（embedding）**して特徴量化する（例: sentence-transformers）。今のデータ量では過剰。
  - **LLM を reranker** として使う（候補＋文脈を渡して並べ替え/説明文生成）。デモの「説明性」には効くが、レイテンシ・コスト・安定性でデモ当日リスク。
- 結論: **テーブル型スコアリングの本体を HF で置き換える筋は薄い。** やるなら「説明文生成」や「テキスト特徴量」の補助に限定。

### 2.4 GPT にデータ生成させる？ → 多様性には有効、ただし天井は同じ
- GPT で「もっと現実的なシナリオ/ラベル付け規則」「エッジケース」を作るのは**合成データの幅を広げる**のに有効。
- ただし**GPT が付けたラベルも“GPTの推測”**であり、実世界の正解ではない（2.1と同じ天井）。GPTラベルを学習しても「GPTの好みを模倣するモデル」になる。
- 使いどころ: 手作り utility 式だけだと単調なので、**多様な分布・非線形な相互作用・現実的なノイズ**を入れて「フォールバックより GBM が勝つ」状況を作る検証用、くらいが妥当。

---

## 3. データ戦略の選択肢（トレードオフ）

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| A 現状維持 | 合成GBM＋フォールバック | 既に動く。「ML使用」の体裁 | 精度の根拠なし（循環） |
| B ルールベースを正とする | フォールバックの重みを手調整し主役に。GBMは任意 | 透明・説明可能・調整容易・デモ安定 | 「ML」感は薄い |
| C 実ログ学習 | `recommendation_logs` を貯めて後日 `train.py` で本物の学習 | 本来の正攻法。枠組みは既にある | データが貯まるまで効かない |
| D GPT合成強化 | GPTで多様な合成データ/ラベル規則を生成→学習 | 分布の幅・エッジケース | ラベルは依然“推測”。天井は同じ |
| E HF/LLM補助 | テキスト埋め込み特徴 or LLM reranker/説明生成 | 説明性・差別化 | 過剰・当日リスク（レイテンシ/コスト） |

---

## 4. 推奨ロードマップ

ハッカソン前提（実データほぼ無し・デモ安定が最優先）での現実解:

1. **まず特徴量に `avg_rating` を足す**（評価は実装済み＝実データが少しある唯一の“本物”シグナル）。`get_recommendation_candidates` と `features.py`・utility 式・`FEATURE_NAMES` に反映。
2. **フォールバック（ルールベース）を“説明できる主役”として磨く**（案B）。重みを意図どおりに手調整し、UIの「理由表示」と一致させる。GBMは「学習済みなら使う／無ければルールベース」のままでよい（既にその設計）。
3. **デモ演出はフォールバックでも成立させる**（推薦サービスが落ちても距離順 `matchNearbyAgent` に退避＝既存フラグ `isRecommendationEnabled`）。これは F-MATCH-03 計画の必須項目。
4. **「本物のML」を語るなら案C**: `recommendation_logs` 収集を回し、データが貯まったら `train.py` で再学習する導線を見せる（“育つ推薦”のストーリー）。
5. GPT合成（案D）は、**GBM がフォールバックに勝つことを示したい時だけ**追加。HF（案E）は説明文生成にだけ限定検討、当日リスクを見て採否。

### 補足: いま“生かす”のに必要な作業（再掲）
- 推薦 migration（`recipient_profiles`/`recommendation_logs`＋5 RPC）が**DB未適用** → 適用要。
- Python サービス稼働＋ `EXPO_PUBLIC_RECOMMENDATION_URL` 設定（PR#66 の k8s 等）。
- 受取人座標（`recipient_profiles`）の登録導線。

---

## 5. 結論（一言で）
いまの推薦は「**手作りスコア式を GBM で再現＋フォールバック**」で、**精度の根拠はまだ無いが枠組みは妥当**。短期は「**評価(avg_rating)を特徴量に足し、説明可能なルールベースを主役に、サービス停止時フォールバックで安定**」が費用対効果が高い。HF はこの問題には不向き、GPT合成は多様化に限定、本物のMLは実ログ(`recommendation_logs`)が貯まってからが王道。
