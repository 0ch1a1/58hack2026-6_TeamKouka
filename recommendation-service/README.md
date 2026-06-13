# ShareKeep Recommendation Service

中間者おすすめの推薦スコアリング API です。Supabase の `get_recommendation_candidates` RPC で候補を取り、FastAPI + scikit-learn でスコア順に並べます。

## 正直な前提

- 当面の学習データは合成データです。`recommendation_logs` に実際の選択・成否ラベルが溜まったら、`--from-logs` で再学習して置き換える想定です。
- `time_score` と `day_match` は代理人の自己申告された対応時間・曜日との一致であり、在宅を保証または予測するものではありません。
- 距離は PostGIS の直線距離です。経路距離や交通状況は考慮していません。
- `SUPABASE_SERVICE_ROLE_KEY` は本番 DB へ強い権限を持つため、サーバの `.env` のみに置き、クライアントやリポジトリに含めないでください。

## 環境変数

`.env.example` を参考に `recommendation-service/.env` を作成します。

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MODEL_PATH=models/model.joblib
DEFAULT_RADIUS_M=2000
DEFAULT_TOP_K=5
DEFAULT_CAPACITY=3
APP_TIMEZONE=Asia/Tokyo
RATE_LIMIT_PER_MIN=60
RATE_LIMIT_BURST=10
CACHE_TTL_SECONDS=30
```

`latitude`/`longitude` がリクエストに無い場合、`recipient_id` から受取人座標を解決します。実DBでは `recipient_profiles.location` を `ST_Y(location::geometry) as lat`, `ST_X(location::geometry) as lng` で返す `get_recipient_coordinates(p_recipient_id)` RPC を用意するのが推奨です。

`RATE_LIMIT_PER_MIN` と `RATE_LIMIT_BURST` は `/recommend` と `/feedback` にだけ適用される IP 単位の in-process token bucket です。`CACHE_TTL_SECONDS` は `/recommend` の短期キャッシュ TTL で、最大 512 件まで保持します。

## 起動

```bash
cd recommendation-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 学習

合成データを作って学習します。

```bash
cd recommendation-service
python -m training.generate_synthetic
python -m training.train
```

実ログで再学習する場合:

```bash
python -m training.train --from-logs
```

## API

- `GET /health`: ロード中モデルの version と fallback 状態を返します。
- `GET /metrics`: 認証不要で Prometheus テキスト形式のカウンタを返します。
- `POST /recommend`: 候補取得、特徴量化、推論、ランキング、`recommendation_logs` への保存を行います。
- `POST /feedback`: `mark_recommendation_chosen(p_parcel_id, p_agent_id)` を呼び、選ばれた候補を記録します。
- `POST /retrain`: `recommendation_logs` から再学習して `models/model.joblib` を更新します。

`models/model.joblib` が無い場合も、距離・時間・曜日・実績・レベル・保管負荷のルールベース fallback で動作します。

## Docker

```bash
cd recommendation-service
docker build -t sharekeep-recommendation .
docker run --env-file .env -p 8000:8000 sharekeep-recommendation
```
