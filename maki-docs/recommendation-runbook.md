# AI推薦 起動・デモ Runbook

作成: 2026-06-13 / 対象: `recommendation-service/`（FastAPI + scikit-learn GBM）をデモで動かす手順
関連: ロジック解説は [`recommendation-ml-plan.md`](./recommendation-ml-plan.md) / 要件 F-MATCH-03

> 結論: アプリ側のコード実装は完了済み。本書の作業は **SQL適用・モデル生成・サービス起動・env設定・seed** の運用だけ。
> 推薦サービスが落ちても、アプリは距離マッチング（`matchNearbyAgent`）にフォールバックするので最低限デモは成立する（`isRecommendationEnabled` / `EXPO_PUBLIC_RECOMMENDATION_URL` 未設定で自動フォールバック）。

---

## 0. 全体像

```
[Supabase] get_recommendation_candidates(候補+特徴量の生データ, PII含む=service_role限定)
      │
[Pythonサービス /recommend]  生データ→9特徴量→GBMでスコア化→理由つきで返す
      │  (EXPO_PUBLIC_RECOMMENDATION_URL)
[ShareKeep アプリ] recipient/matching「代理人を選ぶ」= おすすめ順に表示→選択→記録
```
- 推薦対象: **受取人に対する「荷物を預ける代理人(中間者)」のおすすめ**。
- スコア: 距離/対応時間/曜日/実績/レベル/空き/週末/夕方/**評価(avg_rating)** の9特徴量を GBM が 0–1 確率化 → 0–100点表示。

---

## 1. SQL 適用（Supabase SQL Editor で、この順に）

MCP は read-only のため CLI/MCP では当てられない。**ダッシュボードの SQL Editor** で `supabase/migrations/` の3ファイルを **上から順に** 全文貼り付け→Run:

1. `20260613140000_recommendation.sql` … base（`recipient_profiles` / `recommendation_logs` / 5 RPC）
2. `20260613160000_reco_add_avg_rating.sql` … `get_recommendation_candidates` を DROP+CREATE して `avg_rating`/`review_count` を追加
3. `20260613160000_recommendation_rpc_guards.sql` … 候補RPCを **service_role 限定** に grant ＋ 他RPCの所有者ガード

**順番が重要**: ②で関数を作り直し → ③でその関数に grant し直す依存。逆だと権限が外れる。`DROP`/`CREATE` の「destructive operations」警告は想定どおりなので Run でOK（テーブル削除は含まない）。

> 適用確認: `select proname from pg_proc where proname in ('get_recommendation_candidates','mark_recommendation_chosen','record_recommendation_outcome','upsert_recipient_profile','get_recipient_coordinates');`

---

## 2. モデル生成（ローカル・1回）

`models/model.joblib` は .gitignore 対象＝git に載らないので、動かす環境で生成する。

```bash
cd recommendation-service
PYTHONPATH=. python3 training/generate_synthetic.py   # 合成データ生成（models/synthetic_train.csv）
PYTHONPATH=. python3 training/train.py                # 学習 → models/model.joblib
```
- 実証済み: 合成8000行 / test AUC ≈ 0.785 / GBM > 線形。
- モデルが無くてもサービスはルールベース fallback で起動する（スコアは出るが学習なし）。

---

## 3. サービス起動（Docker 推奨）

```bash
cd recommendation-service

# 3-1) .env を用意
cp .env.example .env
#   必須: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#   JWT検証用: SUPABASE_ANON_KEY（= アプリの EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY と同値でよい）
#   /retrain 保護: ADMIN_API_KEY（任意。未設定なら /retrain は無効）
#   ローカル検証で認証を切るなら: RECOMMENDATION_REQUIRE_AUTH=false（本番は true）

# 3-2) build
docker build -t sharekeep-recommendation .

# 3-3) run（ローカル生成したモデルをマウントして渡す）
docker run --env-file .env -p 8000:8000 \
  -v "$(pwd)/models:/app/models" \
  sharekeep-recommendation
```

ポイント:
- **`-v $(pwd)/models:/app/models`** が肝。これが無いと image 内にモデルが無く fallback 起動になる。
- モデルを image に焼きたい場合は Dockerfile の `COPY models/.gitkeep ...` を `COPY models ./models` に変更（ビルド前に手順2を実行しておくこと）。

Docker を使わない場合:
```bash
cd recommendation-service && PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000
```

動作確認: `curl http://localhost:8000/health`

---

## 4. アプリ側の接続

ShareKeep の `.env` に追記して再起動:
```
EXPO_PUBLIC_RECOMMENDATION_URL=http://localhost:8000
```
- **実機**で試すなら `localhost` ではなく PC の LAN IP（例 `http://192.168.x.x:8000`）。
- 未設定なら推薦は無効＝距離マッチングにフォールバック（デモ保険）。

---

## 5. seed（推薦が候補を返すために）

- **代理人を数件**: `agent_profiles` に住所＝緯度経度(`location`)・対応曜日/時間・level/completed_deliveries。`ShareKeep/scripts/seed-agents.ts` を利用可（`npm run seed:agents`）。
- 受取人の座標: アプリは**端末GPSの現在地**を距離起点に使うため、`recipient_profiles` の登録は必須ではない（サーバ側フォールバック用）。
- （任意）評価が効くデモにするなら `agent_reviews` に数件入れておくと `avg_rating` が反映される。

---

## 6. デモ当日の最低ライン / トラブルシュート

- **最低ライン**: SQL未適用・サービス未起動でも、`EXPO_PUBLIC_RECOMMENDATION_URL` を空にすれば距離マッチングで通常デモは成立。
- `/recommend` が 401 → `RECOMMENDATION_REQUIRE_AUTH=true` でJWT必須。アプリ経由なら自動付与。`curl`単体検証時は false に。
- 候補が空 → 代理人 seed の `location` が入っているか / 半径(2km)内か / 対応曜日時間を確認。
- スコアが全部同じ/おかしい → モデル未ロード（fallback）か、`get_recommendation_candidates` が PII を返す service_role で呼べているか（③の grant）。

---

## 7. ver2（再学習）への道

起動後も何度でも改良可能。ロックインなし。
- 実ログ: 選択は `mark_recommendation_chosen`、配達成否は `record_recommendation_outcome` で `recommendation_logs` に蓄積。
- 再学習: `python -m training.train --from-logs`（実ログから）または `POST /retrain`（`ADMIN_API_KEY` 必須）→ `models/model.joblib` を更新 → サービス再起動で反映。
- 特徴量の見直し候補（精度向上枠）: level と experience の冗長整理、過去トラブル/承諾率、同一建物フラグ、`HistGradientBoostingClassifier` 化（依存追加なしで高速）。
