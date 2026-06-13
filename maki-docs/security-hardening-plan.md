# セキュリティ強化 実装計画（P1〜P4）

作成: 2026-06-13 / 対象: 既存バックエンド（Supabase）のセキュリティ堅牢化
要件定義書: [`../58th_development_requirements.md`](../58th_development_requirements.md)

> **改訂履歴**
> - 2026-06-13 初版。
> - 2026-06-13 **レビュー反映（サブエージェント＋codex の並列レビュー）**。実DB（関数定義・`pg_policies`・`get_advisors`）で再裏取りし、初版の過大評価を訂正。`agent_profiles` のPII全公開・Edge Function面・推薦サービスを追加。訂正箇所は各節の「⚠️訂正」「＋追加」で明示。
> - 2026-06-13 **最終実装方針を確定**（下記「最終実装方針」節）。今回は B / D / get_agent_locations の3点のみ実装、A/C他は見送り。適用は `db push` ではなく SQL Editor 直実行。
> - 2026-06-13 **3点のライブ適用を独立に再検証**（`pg_get_functiondef`/`proacl` 直読み）。現行ライブ＝`grant_agent_points` proacl `{postgres, service_role}`（authenticated 剥奪済）／`consume_agent_points` 本体に `if auth.uid() is null or auth.uid() <> p_agent_id then raise`／`get_agent_locations` は `auth.uid() is null or v_role <> 'delivery_company'` ＋ proacl から anon 消滅。**3点とも適用確認**。重複適用を避けるため検証用に作成した PR #77 はクローズ（B/PII は no-op、D はライブの厳格版guardを上書きする方向のため）。

---

## 最終実装方針（確定・2026-06-13）

デモまでの残り時間と本番共有DBでの事故リスクを踏まえ、**全部はやらない**判断。

### 今回実装する（3点・追加的/低リスク・QRと読取経路に非接触）

> **✅ 適用済み（2026-06-13・SQL Editor直実行）**。read-onlyで検証済み：`grant_agent_points` はadvisorの「authenticated実行可」から消滅、`get_agent_locations` は「anon実行可」から消滅、`consume_agent_points` に本人ガード反映を確認。migration履歴の正式突合せ（`db pull`）はデモ後。

| 項目 | 内容 | 確認済みの事実 |
| --- | --- | --- |
| **B** | `grant_agent_points` の `authenticated` EXECUTE 剥奪（内部専用化） | proacl=`{authenticated, service_role}`（anon無）。クライアント直接呼び出し口なし＝内部専用。`verify_recipient_qr`(DEFINER)経由は継続動作 |
| **D** | `consume_agent_points` に本人ガード追加（クライアント呼び出しは維持） | proacl=`{authenticated, service_role}`。`parcels.ts:330` でリワード消費に使用 |
| **get_agent_locations** | anon素通り是正（`is null or` ＋ `anon, public` EXECUTE剥奪） | proacl に **`anon`＋PUBLIC** あり＝**未認証でREST実行可**。`auth.uid() is not null and ...` で anon が役割チェックを素通りし全代理人の氏名/住所/座標が返る（**現に悪用可能**と確定） |

→ migration: [`../supabase/migrations/20260613170000_security_hardening_min.sql`](../supabase/migrations/20260613170000_security_hardening_min.sql)

### 今回は見送り（発表用に「既知課題＋是正方針」としてドキュメント化）
- **A**（`agent_profiles` PII RLS `qual:true`）／**C**（QR二重消費の原子化）。
  - 理由: base schema がリポジトリに無く、`pickup-ready.tsx`/`find_nearby_agents` 依存や **QR受け渡し＝デモの山場** を本番共有DBで触ることになり、しくじるとデモが死ぬ。upside に対し downside が重すぎる。
- Edge Function CORS／`geocode-agent-address` userId／推薦Pythonサービスも同様に後続。

### 適用方法（`db push` は使わない）
- `supabase db push --dry-run` で **remote に16個のローカル未取得migration（`20260612090035`〜`20260613032535`）が存在**＝履歴不一致を確認。`db push` は通らず、`migration repair`＋`db pull` が必要だが、これは履歴テーブルを書き換える操作でデモ前は高リスク。
- **採用**: 3点のSQLは小さく冪等（`revoke`＋`create or replace`×2＋`revoke`）なので、**Supabase Dashboard → SQL Editor に直接貼って実行**。migration履歴を一切触らない。
- リポジトリの `20260613170000_security_hardening_min.sql` は**正本ドキュメントとして残置**。`db pull` による履歴の正式突合せ＝**デモ後**に実施。
- 適用後に read-only（MCP SELECT / `get_advisors`）で proacl・関数定義・advisor差分を検証。

## 方針（結論）

- **AWS等のインフラ追加は不要**。守るべき面はインフラ層ではなくアプリのロジック層（RLS・RPC・QR検証・Edge Function）にある。Supabaseのmigration＋設定で完結。
- **ただし「サーバ不要」ではない**：推薦API（`recommendation-service`）は `SUPABASE_SERVICE_ROLE_KEY` を持つFastAPIで、これを置く実行環境（Cloud Run / Render / Railway 等の秘密鍵を安全に保持できるホスト）は必要。AWSである必要はない、が正確な表現。
- 実装（SQL/関数書き換え）自体は短時間。工数の大半はレビューと本番反映の判断。

## 前提（実DB再確認済み・2026-06-13）

Supabase `project_id=zbmrmblakoszzecdnptn` の public スキーマ・関数定義(`pg_get_functiondef`)・`pg_policies`・`get_advisors(security)` を確認:

- **良い点（すでに出来ている）**:
  - アプリ12テーブルすべて RLS 有効（`spatial_ref_sys` 除く＝PostGIS系システムテーブル）。
  - QRトークンは `encode(gen_random_bytes(32),'hex')`＝**256bit乱数で推測不能**。`expires_at`（既定15分）・`used` フラグあり。
  - QR検証は Edge Function `verify-recipient-qr` / `verify-agent-qr`（ともに `verify_jwt:true`）経由でサーバ実行。
  - `generate_qr_token` は `auth.uid()` 照合＋`can_access_parcel` で発行者を制限済み。
  - 多くのRPCに **`auth.uid()` ガードが既に存在**（`create_parcel`・`assign_agent_to_parcel`・`upsert_agent_profile`・`update_parcel_status` 等）。全関数に `SET search_path` 設定済み。
- **問題点（実害あり/確定）**: 後述の「確定した実害」を参照。

> 基盤スキーマ（`parcels`/`qr_tokens`/`points`系・各RPC）は**リポジトリの `supabase/migrations/` に存在せず**リモート直書き状態。本対応を機に `supabase db pull` で正本化する。適用前に `pg_get_functiondef` / `proacl` の抜粋をmigrationコメントに残し、属人的根拠にしない。

---

## 確定した実害（レビューで再評価）

| # | 事象 | 実害 | 評価 |
| --- | --- | --- | --- |
| A | **`agent_profiles` のSELECTポリシーが `qual: true`** | 全ログインユーザが**全代理人の住所・部屋番号・座標・稼働時間を閲覧可能**（PII漏洩） | **最重要・確定**。初版で見落とし |
| B | **`grant_agent_points(agent_id, points)` に `auth.uid()` 照合なし** | `authenticated` がRESTで直接叩き、**任意の代理人（自分含む）にポイント任意付与** | **重大・確定**。唯一の真の権限昇格 |
| C | **QR検証のTOCTOUレース** | `verify_recipient_qr`/`verify_agent_qr` が「SELECT used=false → UPDATE used=true」で非アトミック。並行スキャンで**ポイント二重付与・状態二重遷移** | **重大・確定** |
| D | **`consume_agent_points` に `auth.uid()` 照合なし** | 他人の代理人ポイントを消費＝**残高ドレインの嫌がらせ**（攻撃者の利益にはならない） | 中・確定。初版は「最優先」としたが過大 |
| E | Edge Function `geocode-agent-address` が `userId` をbodyで受領 | `upsert_agent_profile` 側に `auth.uid()<>p_user_id` ガード**あり**＝通常は防御済み。残るは `auth.uid() is null` スキップ経路のみ | 低。初版で未言及 |
| F | Edge Function の CORS が `Access-Control-Allow-Origin: *` | `verify_jwt:true` のため致命的ではないが多層防御の観点で要検討 | 低〜中。初版で未言及 |

### ⚠️ 初版の訂正（過大評価だった箇所）

- **`assign_agent_to_parcel`「anonで誰でも割当可能」は誤り**。実関数に `if v_parcel.recipient_id is distinct from auth.uid() then raise exception` があり、当該荷物の受取人本人以外は失敗する（anonは `auth.uid()=null` で弾かれる）。**残る論点はadvisorのWARN（anonにEXECUTEが残る衛生上の問題）のみで、実害なし**。
- **`create_parcel`「anon悪用の入口」は誤り**。anonにそもそもEXECUTEが付与されていない（`authenticated`のみ）。`auth.uid() is not null and <> p_recipient_id` ガードも既存。
- これらは初版がadvisorのWARNだけを見て関数本体を読まずに「実害」と断定したもの。**真に実害があるのは A/B/C と、嫌がらせ規模の D**。

---

## P1: RLSの網羅と穴 ＋ PII

**現状**: アプリ全テーブルRLS有効、`auth.uid()`ベースのポリシー整備済み。`profiles`(own-only)・`delivery_matches`(recipient/agent本人のみ)は適切。

**やること（優先度順）**:
1. **【最優先・確定A】`agent_profiles` のSELECTポリシー是正**。現状 `agent_profile_read` が `qual: true`＝全公開。代理人住所・座標を含むため、
   - 自分の行＋「自分が受取人で当該代理人が割当済みのparcelがある」行のみに絞る、もしくは
   - 直接SELECTを禁止し、必要な住所は `SECURITY DEFINER` 関数（必要最小フィールドのみ返す）経由にする。
   - ⚠️ `pickup-ready.tsx`（`agent_profiles.address` 直読み）・`find_nearby_agents`/`get_agent_locations`（マッチング用）が壊れないか必ず確認してから絞る。
2. **【確定B/D】内部専用・特権関数の `EXECUTE` 剥奪／本人ガード**。`grant_agent_points` / `record_agent_delivery_completion` / `save_co2_reduction` / `create_notification` から `revoke execute ... from anon, authenticated`（DEFINERなので `verify_*` からの内部呼び出しは継続）。
   - **⚠️ `verify_recipient_qr` / `verify_agent_qr` 自身は revoke 対象に含めないこと**。Edge Functionが `ANON_KEY`＋呼び出し元の `Authorization` でRPC実行＝呼び出し元ロール(`authenticated`)で動くため、剥がすと正規フローが壊れる。advisorのWARNリストには `verify_*` も載るが、これらは**残す**。
   - `revoke` はオーバーロード別に引数型まで正確指定。PostgREST経由で必要な関数は `service_role` にgrant。
3. **RLSポリシーの実地監査**（A同列の優先）。`point_transactions` / `notifications` / `parcels` / `agent_profiles` を別ユーザーJWTで実際に叩き、JOIN越しのPII露出含め「他人の行が読めない/書けない」を検証。
4. **【＋追加】`get_agent_locations()` のanon分岐バグ**。`supabase/migrations/20260613150100_agent_reviews.sql:188` の `if auth.uid() is not null and v_role <> 'delivery_company'` は、anon(`auth.uid() is null`)だと例外を通り抜け全代理人の氏名・住所・座標を返す論理。現状anonにEXECUTEは無く即時悪用は不可だが、`auth.uid() is null or v_role <> 'delivery_company'` に直して多層防御化。
5. `spatial_ref_sys`（RLS無効・実害低）は `anon` から `revoke select`。
6. **スキーマのコード化**: `supabase db pull` で基盤スキーマと本対応をmigration正本化。

工数: 1=1h（影響確認込み）、2=数分、3=15〜30分、4,5,6=数分。

## P2: QR受け渡しの堅牢化

**現状（良い点）**: 256bit乱数トークン・15分失効・`used`フラグ・`verify_jwt:true`・発行者制限済み。**エントロピーは問題なし**。

**やること**:
1. **【確定C・最重要】二重消費(TOCTOU)の原子化**。`verify_recipient_qr`/`verify_agent_qr` の「SELECT→UPDATE」を1本の `UPDATE…RETURNING` に統合し、消費を関数先頭で原子的に確定:
   ```sql
   update public.qr_tokens set used = true
   where token = p_token and qr_type = 'recipient'
     and used = false and expires_at > now()
   returning * into v_qr;
   if not found then return false; end if;
   ```
   - ⚠️ 後続の `parcels.status` 更新・`grant_agent_points`・`record_agent_delivery_completion`・`save_co2_reduction` は**同一DB関数内のまま**にし、Edge Functionから複数RPCに割らない（QR消費後に後続だけ失敗する中途半端状態を防ぐ）。WHEREには `qr_type`・`used=false`・`expires_at>now()`・期待statusまで含め、`returning` 結果を後続更新の唯一の根拠にする。
2. **検証者ロールの束縛**（中）。`verify_recipient_qr` は現状トークンさえ知れば誰でも呼べる（秘匿性頼み）。`auth.uid()` が当該parcelの関係者かを関数内で確認し多層防御化。
3. **状態遷移ガード**。`verify_agent_qr` は前状態を問わず `delivered_to_agent` に上書きする。`status in ('out_for_delivery','agent_assigned')` 等の前提を確認し不正遷移を弾く。

工数: 1,3=1〜1.5h、2=要件次第で+1h。

## P3: 特権操作の集約とレート制限

**やること**:
1. **【確定B】`grant_agent_points` を内部専用化** — P1-2のrevokeで対応。付与は `verify_recipient_qr` 経由のみに。
2. **【確定D】`consume_agent_points` に本人ガード追加**: 先頭に `if auth.uid() is null or auth.uid() <> p_agent_id then raise exception`。リワード消費はクライアント本人操作なのでrevokeでなくガード追加が正。嫌がらせ規模なので中優先。
3. **クライアントAPI契約の整合**（＋追加）。`ShareKeep/features/parcels.ts` に `assignAgentToParcel`(315) / `consumeAgentPoints`(330) / `recordAgentDeliveryCompletion`(459) の呼び出し口がある。完全内部化する関数はアプリ側の公開APIも削除/非公開化し、残す関数は必ず `auth.uid()`/role/ownership ガードを持たせる。
4. **レート制限**（低）: トークンが256bitのためQR総当りは非現実的。Supabase Auth標準のログイン/OTP試行制限の有効確認で十分。**推薦API・Edge Functionには別途レート制限を検討**。

工数: 2〜3で1h。

## P4: 認証・入力検証 ＋ Edge Function ＋ 推薦サービス

**やること**:
1. **Leaked Password Protection 有効化**（advisor WARN）。Dashboard → Auth → Password で HaveIBeenPwned 照合をON。**コード変更不要・要手作業5分**。
2. **入力長/内容のDB制約**: `handover_messages.body` / `agent_reviews` コメント / `profiles.full_name` 等に `check (char_length(...) <= N)` を付与しRPC側でもバリデート。
3. **【＋追加】Edge Function の監査**:
   - CORS `Access-Control-Allow-Origin: *` をオリジンallowlistに（`verify-recipient-qr` / `geocode-agent-address` 他）。
   - `geocode-agent-address` の `userId` 信用範囲確認（`upsert_agent_profile` の `is not null` スキップ経路を塞ぐ）。
   - `delete-my-account` のJWT必須・本人固定の確認。
4. **【＋追加】推薦Pythonサービス（`recommendation-service`）**:
   - 本番で `RECOMMENDATION_REQUIRE_AUTH=true` 強制（`app/config.py` 既定はfalseで匿名動作可）。
   - CORS allowlist 設定（`app/main.py` に見当たらず）。
   - `X-Admin-Key`（`/retrain`）と `SUPABASE_SERVICE_ROLE_KEY` の保管・ローテーション方針。
   - レート制限。
5. （任意）パスワード最小強度・OTP有効期限。MFAはハッカソン規模では過剰なので除外推奨。

工数: 1=5分、2=1h、3=1〜2h（実体取得込み）、4=1h。

---

## 推奨実行順（レビュー反映後）

1. **P2-1（QR二重消費の原子化）＋ P1-1（agent_profiles PII是正）＋ P1-2のうち `grant_agent_points` 封じ込め** ← ガードで守られていない実害（C/A/B）を同列最優先で。
2. **P3-2（consume本人ガード）＋ P2-3（状態遷移）＋ P1-4（get_agent_locations修正）**。
3. **P4-3（Edge Function監査）＋ P3-3（クライアントAPI整合）**。
4. **P4-1（password protection）** ← Dashboard設定のみ（要手作業）。
5. **P1-3（ポリシー実地監査）＋ P1-6（スキーマ正本化）＋ P4-2（入力制約）＋ P4-4（推薦サービス）**。

> 1〜2のDB変更は単一migration（`supabase/migrations/..._security_hardening.sql`）にまとめて適用可能。

## 担当者の手作業が必要な箇所

- P4-1 の Dashboard 設定（画面操作・5分）。
- migration の本番反映GOサインとレビュー。
- `supabase db push` / `db pull` の実行（`! supabase db push` でセッションから流すことも可）。
- 推薦サービス（P4-4）のホスティング環境設定。
