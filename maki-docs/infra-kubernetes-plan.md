# ShareKeep Kubernetes / インフラ実装計画

## 目的

ShareKeep本体は Expo + Supabase で成立しているため、無理に全体をKubernetes化しない。Kubernetesは **推薦API・期限通知worker・監視** のような「アプリ外の運用サービス」を動かす基盤として使う。

発表で言いたいことは次の通り。

- 代理人推薦を独立サービス化し、利用増に合わせてスケールできる
- 保管期限通知のような定期処理をCronJobで運用できる
- 推薦回数・通知件数・エラー率を監視し、サービス運用の絵が見せられる

DB、認証、Storageは引き続き Supabase を使う。PostgresをKubernetesに載せるのは今回のスコープ外。

---

## 全体構成

```text
[Expo App]
  |
  | EXPO_PUBLIC_RECOMMENDATION_URL
  v
[Kubernetes]
  |
  |-- recommendation-api Deployment
  |     FastAPI + scikit-learn
  |     /health, /recommend, /feedback, /retrain
  |
  |-- deadline-worker CronJob
  |     保管期限が近い/超過した荷物を確認
  |     Supabase notifications へ通知行を作成
  |
  |-- monitoring
        Prometheus / Grafana

[Supabase]
  |
  |-- parcels
  |-- agent_profiles
  |-- recommendation_logs
  |-- notifications
  |-- co2_reduction_logs
```

### Kubernetesに載せるもの

| コンポーネント | 役割 | 優先度 |
|---|---|---:|
| `recommendation-api` | 代理人候補をスコア順に返すFastAPIサービス | 高 |
| `deadline-worker` | 保管期限前/期限超過通知を定期作成するworker | 中 |
| `monitoring` | 推薦APIとworkerのメトリクスを見る | 中 |
| `photo-worker` | 外装写真のメタデータ処理/OCRの将来拡張 | 低 |

### Kubernetesに載せないもの

| 対象 | 理由 |
|---|---|
| Supabase Postgres | 管理DBを使う方が安全。K8s上でDB運用までやると重すぎる |
| Expoアプリ | モバイルアプリなのでK8s対象ではない |
| Supabase Auth / Storage | 既存基盤を使う |

---

## 実装順

### Phase 0. デモ安定化

Kubernetesに入る前に、アプリのデモ導線を固定する。

| 作業 | 成果物 |
|---|---|
| デモ用ユーザーを固定 | 受取人/代理人/配達員アカウント |
| seedデータ整備 | 代理人複数人、距離/時間/実績がバラけた状態 |
| 成功シナリオ文書化 | QR完了までの手順 |
| 失敗時フォールバック確認 | 推薦APIが落ちても従来マッチングで動く |

ここが不安定なままKubernetesを触ると、原因がアプリかインフラか切り分けづらくなる。

### Phase 1. `recommendation-api` をローカルDockerで安定化

既に `recommendation-service/Dockerfile` があるため、まずコンテナ単体で動かす。

| 作業 | 成果物 |
|---|---|
| `.env` 整備 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ADMIN_API_KEY`, `RECOMMENDATION_REQUIRE_AUTH`, `MODEL_PATH`（認証はPR #64で追加。詳細は kubernetes-runbook.md） |
| Docker build/run | `sharekeep-recommendation` image |
| `/health` 確認 | model version / fallback状態が返る |
| `/recommend` 確認 | Supabase RPCから候補取得、スコア順で返る |

完了条件:

- `GET /health` が成功する
- `POST /recommend` が候補を返す
- Expo側の `EXPO_PUBLIC_RECOMMENDATION_URL` をローカルURLに向けると推薦カードが表示される

### Phase 2. Kubernetesローカル環境に載せる

最初はクラウドではなく、`kind` または Docker Desktop Kubernetes で十分。

追加する想定ディレクトリ:

```text
k8s/
  recommendation/
    namespace.yaml
    secret.yaml.template   # apply対象外の拡張子（ダミー値の誤適用防止）
    configmap.yaml
    deployment.yaml
    service.yaml
```

作るリソース:

| リソース | 内容 |
|---|---|
| `Namespace` | `sharekeep` |
| `Secret` | `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY` |
| `ConfigMap` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RECOMMENDATION_REQUIRE_AUTH`, `DEFAULT_RADIUS_M`, `DEFAULT_TOP_K`, `DEFAULT_CAPACITY`, `APP_TIMEZONE`, `MODEL_PATH` |
| `Deployment` | `recommendation-api` 1 replica（readiness=`/ready`, liveness=`/health`） |
| `Service` | ClusterIP。ローカルは `kubectl port-forward` で公開 |

完了条件:

- `kubectl get pods -n sharekeep` で `recommendation-api` が `Running`
- `kubectl port-forward svc/recommendation-api 8000:8000 -n sharekeep`
- `http://localhost:8000/health` が成功
- Expoアプリから `http://localhost:8000/recommend` を叩ける

### Phase 3. `deadline-worker` をCronJobで作る

保管期限機能を入れた後に実装する。ハッカソンらしいインフラ要素として一番自然。

役割:

- `parcels.storage_deadline_at` が近い荷物を検索
- 期限3時間前/1時間前/期限超過で通知行を作成
- 重複通知を避ける

追加する想定:

```text
workers/
  deadline-worker/
    Dockerfile
    requirements.txt
    main.py

k8s/
  deadline-worker/
    cronjob.yaml
    configmap.yaml
    secret.yaml.template
```

CronJob例:

| 項目 | 値 |
|---|---|
| schedule | `*/10 * * * *` |
| concurrencyPolicy | `Forbid` |
| restartPolicy | `OnFailure` |
| 実行内容 | 期限前/期限超過通知の作成 |

完了条件:

- `kubectl create job --from=cronjob/deadline-worker deadline-worker-manual -n sharekeep` で手動実行できる
- 期限間近の荷物に対して `notifications` 行が作成される
- 二重実行しても同じ通知が増殖しない

### Phase 4. 監視を入れる

まずは最低限でよい。

| メトリクス | 目的 |
|---|---|
| `recommendation_requests_total` | 推薦APIが何回呼ばれたか |
| `recommendation_errors_total` | 推薦API失敗数 |
| `recommendation_latency_seconds` | 推薦APIの応答時間 |
| `deadline_worker_runs_total` | worker実行回数 |
| `deadline_notifications_created_total` | 通知作成件数 |

実装方針:

1. FastAPIに `/metrics` を追加
2. `prometheus-client` を導入
3. Prometheusでscrape
4. Grafanaで簡単なダッシュボードを作る

発表では「推薦APIの呼び出し数」「失敗数」「期限通知件数」が見えれば十分。

### Phase 5. CI/CD

時間が余ったら入れる。最初からやると重い。

| 作業 | 内容 |
|---|---|
| GitHub Actions | Docker image build |
| Container Registry | GHCRにpush |
| Kubernetes deploy | `kubectl apply` または Argo CD |
| 環境分離 | `staging` / `demo` namespace |

最小構成:

```text
push to main
  -> docker build recommendation-service
  -> push ghcr.io/<owner>/sharekeep-recommendation:<sha>
  -> kubectl set image deployment/recommendation-api ...
```

Argo CDは見栄えが良いが、ハッカソン本体の安定が先。

---

## 実装優先度

| 順位 | 作業 | 理由 |
|---:|---|---|
| 1 | `recommendation-api` のDocker起動確認 | 既にDockerfileがあり、最短でK8sに繋がる |
| 2 | K8s manifests作成 | Kubernetes学習として一番基本になる |
| 3 | ExpoからK8s上の推薦APIへ接続 | アプリ機能とインフラがつながる |
| 4 | `deadline-worker` CronJob | ShareKeepの保管期限機能と直結して自然 |
| 5 | `/metrics` + Prometheus/Grafana | 運用っぽさが強く、発表で見せやすい |
| 6 | CI/CD | 余裕があれば |
| 7 | Argo CD / GitOps | 将来枠 |

---

## 具体的なファイル追加計画

### Step 1. Kubernetes manifests

```text
k8s/recommendation/namespace.yaml
k8s/recommendation/secret.yaml.template
k8s/recommendation/configmap.yaml
k8s/recommendation/deployment.yaml
k8s/recommendation/service.yaml
```

`secret.yaml.template` はダミー値だけ置き、本物の `SUPABASE_SERVICE_ROLE_KEY` はコミットしない。

### Step 2. ローカル起動手順

```text
maki-docs/kubernetes-runbook.md
```

内容:

- Docker image build
- kind/Docker Desktop Kubernetesでのapply
- port-forward
- Expo側 `.env` の設定
- トラブルシュート

### Step 3. Deadline worker

```text
workers/deadline-worker/
k8s/deadline-worker/
```

最初はPythonで十分。Supabase clientで期限対象を検索し、通知行を作る。

### Step 4. Observability

```text
k8s/monitoring/
```

最初はローカル用の簡易manifestでよい。Helm導入は後回し。

---

## 注意点

- `SUPABASE_SERVICE_ROLE_KEY` は絶対にリポジトリへコミットしない
- Kubernetes Secretも `secret.yaml.template` のみにする
- ExpoアプリからローカルK8sへ接続する場合、実機では `localhost` が使えない。必要ならPCのLAN IP、ngrok、cloudflaredを使う
- 推薦APIが落ちてもアプリが止まらないよう、既存の近隣マッチングへフォールバックする
- Kubernetes化は「本番運用の完全再現」ではなく、推薦/通知/監視を切り出す実装デモとして扱う

---

## 発表での説明例

> ShareKeep本体はSupabaseで素早く作り、推薦APIや期限通知のような運用サービスはKubernetes上に分離しました。これにより、推薦処理だけをスケールさせたり、期限通知をCronJobとして安全に定期実行できます。さらにPrometheus/Grafanaで推薦回数や通知処理件数を可視化し、アプリだけでなく運用まで見据えた構成にしています。
