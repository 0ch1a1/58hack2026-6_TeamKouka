# 推薦API デプロイ手順書（あなたが実行するタスク）

> 推薦サービス（`recommendation-service/`）を **Supabase 準備 → ローカル Docker → ローカル Kubernetes** の順で立ち上げる手順。
> 設計の背景は [`infra-kubernetes-plan.md`](./infra-kubernetes-plan.md)、API契約は [`recommendation-api.md`](./recommendation-api.md)、進捗は [`recommendation-next-steps.md`](./recommendation-next-steps.md)。
>
> **各 Part の末尾に「✅ 完了条件」がある。そこを満たしてから次へ進むこと**（どこで詰まったか切り分けやすくする）。
> Part A は Docker / k8s どちらでも必須。時間がなければ **Part B（Docker）で止めても推薦機能はデモできる**。Part C（k8s）は発表用の上積み。

---

## 用語・前提

- プロジェクト: Supabase `zbmrmblakoszzecdnptn`（1つだけ。seed/サービスは本番DBに書き込む）
- 必要ツール: `supabase` CLI / `docker` / （Part C のみ）`kubectl` と `kind` または Docker Desktop の Kubernetes
- 認証強化（PR #64）により、サービスは `SUPABASE_ANON_KEY` と `ADMIN_API_KEY` も必要。**infra-kubernetes-plan.md の古い env リストではなく本書を正とする。**

---

## Part A. Supabase 準備（Docker/k8s 共通・必須）

### A1. Supabase PAT を再発行
過去の会話に PAT (`sbp_2671…`) が露出したため、Dashboard でいったん revoke → 新規発行し、`supabase login` し直す。
```bash
supabase login   # 新しい PAT を貼る
supabase link --project-ref zbmrmblakoszzecdnptn
```

### A2. 鍵・URL を控える
Supabase Dashboard → **Project Settings → API** から取得：

| 値 | 使い道 | 秘密? |
|---|---|---|
| Project URL | `SUPABASE_URL` | 公開可 |
| publishable key（`sb_publishable_…`） | `SUPABASE_ANON_KEY`（JWT検証）/ アプリの `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公開可 |
| **service_role key** | seed・サービスのDB書込 | **秘密** |
| `ADMIN_API_KEY` | `/retrain` 保護用。自分で生成 → `openssl rand -hex 16` | **秘密** |

### A3. migration 適用（**2ファイル**入る）
```bash
supabase db push
```
適用されるもの：
- `20260613140000_recommendation.sql`（基盤: RPC・recommendation_logs・recipient_profiles）
- `20260613160000_recommendation_rpc_guards.sql`（認証強化: 所有者ガード・権限絞り）

**検証**（適用後に実行し、関数が存在するか確認）：
```bash
supabase db query --linked "select proname from pg_proc where proname in
('get_recommendation_candidates','mark_recommendation_chosen','upsert_recipient_profile','get_recipient_coordinates','record_recommendation_outcome');"
```
→ 5件返ればOK。

### A4. 代理人シード（ランキング成立に必須）
`ShareKeep/.env` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を入れてから：
```bash
cd ShareKeep
npm install
npm run seed:agents      # 代理人8人（距離/時間/実績がバラけた状態）
```
**検証**：
```bash
supabase db query --linked "select count(*) from agent_profiles where location is not null;"
```
→ 8（前後）件あればOK。デモ後の片付けは `npm run unseed:agents`。

### ✅ Part A 完了条件
- `supabase db push` 成功、上記5関数が存在
- `agent_profiles` に座標付き代理人が複数件

---

## Part B. ローカル Docker で推薦サービスを動かす

### B1. サービス用 `.env` を作成
```bash
cd recommendation-service
cp .env.example .env
```
`.env` を編集（A2 の値）：
```
SUPABASE_URL=https://zbmrmblakoszzecdnptn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=（service_role）
SUPABASE_ANON_KEY=（publishable）
ADMIN_API_KEY=（openssl rand -hex 16 の出力）
RECOMMENDATION_REQUIRE_AUTH=true
MODEL_PATH=models/model.joblib
```

### B2. （任意）モデル学習
未学習でも **ルールベース fallback** で動く。学習するなら：
```bash
pip install -r requirements.txt
python -m training.generate_synthetic
python -m training.train     # models/model.joblib が生成される
```

### B3. build & run
```bash
docker build -t sharekeep-recommendation:local .
docker run --rm --env-file .env -p 8000:8000 sharekeep-recommendation:local
```

### B4. `/health` を確認（別ターミナル）
```bash
curl -s localhost:8000/health
```
→ `{"ok":true,"model_version":"...","fallback":true/false,"model_path":"..."}` が返ればOK。

### B5. `/recommend` のスモークテスト
認証必須(`true`)のままだと curl には JWT が要る。**ローカル確認時だけ** 一時的に `.env` で `RECOMMENDATION_REQUIRE_AUTH=false` にして再起動し、座標付きで叩く：
```bash
curl -s -X POST localhost:8000/recommend \
  -H 'Content-Type: application/json' \
  -d '{"latitude":35.681,"longitude":139.767,"radius_m":5000,"top_k":5}'
```
→ `recommendations` 配列が距離/スコア順で返ればOK。**確認できたら `RECOMMENDATION_REQUIRE_AUTH=true` に戻す**（本番はアプリのJWTで認証）。

### B6. アプリから接続
`ShareKeep/.env` に追加（実機は `localhost` 不可 → PC の LAN IP を使う）：
```
EXPO_PUBLIC_RECOMMENDATION_URL=http://<PCのLAN IP>:8000
```
アプリを再起動 → 受取人で荷物登録 → マッチング画面で**スコア順の代理人カード（内訳バー＋理由）**が出ればOK。出ない場合は自動マッチにフォールバックしているので、`/health` 到達性と URL を確認。

### ✅ Part B 完了条件
- `GET /health` 200
- `POST /recommend` が候補を返す
- アプリのマッチング画面に推薦カードが表示される

---

## Part C. ローカル Kubernetes に載せる（発表用の上積み）

manifests は `k8s/recommendation/` に用意済み（`namespace / secret.example / configmap / deployment / service`）。

### C1. ローカルクラスタ準備
`kind` の例：
```bash
kind create cluster --name sharekeep
```
（Docker Desktop の Kubernetes を有効化しているならそれでも可）

### C2. イメージをクラスタに読み込む
ローカルビルドした image を kind に渡す（レジストリ不要）：
```bash
kind load docker-image sharekeep-recommendation:local --name sharekeep
```
> Docker Desktop k8s の場合はこの手順は不要（同じ Docker デーモンを参照するため）。

### C3. secret を作成（実値・コミットしない）
```bash
cd k8s/recommendation
cp secret.example.yaml secret.yaml   # secret.yaml は .gitignore 済み
# secret.yaml の REPLACE_… を service_role / ADMIN_API_KEY に置換
```
configmap.yaml の `SUPABASE_ANON_KEY` の `REPLACE_WITH_PUBLISHABLE_KEY` も実値に置換。

### C4. apply
```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### C5. Pod 起動確認
```bash
kubectl get pods -n sharekeep
kubectl logs deploy/recommendation-api -n sharekeep
```
→ `recommendation-api-…` が `Running`、readinessProbe(/health) が通ること。

### C6. port-forward して確認
```bash
kubectl port-forward svc/recommendation-api 8000:8000 -n sharekeep
curl -s localhost:8000/health
```

### C7. アプリから接続
- PC上で port-forward 中なら `EXPO_PUBLIC_RECOMMENDATION_URL=http://<PCのLAN IP>:8000`
- 実機で LAN が使えない場合は `ngrok http 8000` か `cloudflared` でトンネルし、その https URL を使う

### ✅ Part C 完了条件
- `kubectl get pods -n sharekeep` で Running
- port-forward 経由で `/health` 200
- アプリから推薦カード表示

---

## トラブルシュート

| 症状 | 確認 |
|---|---|
| アプリで推薦カードが出ず常に自動マッチ | `EXPO_PUBLIC_RECOMMENDATION_URL` 到達性、`/health` 200、再起動したか |
| `/recommend` が 401 | 本番は正しい挙動（JWT必須）。curl確認時は一時的に `REQUIRE_AUTH=false` |
| `/recommend` が 404（parcel not found） | 認証ユーザと parcel.recipient_id 不一致。自分の荷物で試す |
| `/recommend` が 502 candidates | migration 未適用 / 代理人 seed なし / service_role 不正 |
| `/retrain` が 503 | `ADMIN_API_KEY` 未設定。設定し `X-Admin-Key` ヘッダで叩く |
| Pod が CrashLoopBackOff | `kubectl logs` で env 不足を確認（特に service_role / anon） |
| 実機から localhost に繋がらない | LAN IP / ngrok / cloudflared を使う |

## 注意
- `SUPABASE_SERVICE_ROLE_KEY` と `ADMIN_API_KEY` は**絶対にコミットしない**（`secret.yaml` は .gitignore 済み）。
- seed / サービスは**本番DBに書き込む**。デモ後は `npm run unseed:agents`。
- 推薦APIが落ちてもアプリは**自動マッチにフォールバック**して止まらない（実装済み）。
