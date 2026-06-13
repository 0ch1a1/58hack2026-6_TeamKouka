# 提案：migration履歴と本番DBの乖離を解消し、`supabase db push` 運用に統一する

> 目的：手動でSQL Editorに貼る運用をやめ、**`supabase/migrations/*.sql` ＋ `supabase db push`** だけで本番スキーマを更新できる状態にする。
> ステータス：**✅ 実行完了（2026-06-14）**。

## 実行結果（2026-06-14）
案A（repair-in-place）で実施し完了。最終状態：履歴＝実DB＝repo が一致（12本）、`db push` 稼働。
1. **Phase1 rename**：重複timestamp 2本を一意化（PR #89 マージ）。
2. **Phase2 検証**：subagent3並列で本番DBを read-only 実測 → repo 11本すべて `applied`（権限/revoke系も proacl まで確認・部分適用ゼロ）。
3. **Phase3 repair（applied）**：11本を `migration repair --status applied` で履歴記録。
4. **想定外→対処**：`db push` が Jun12系16本（Remoteのみ）で `Remote migration versions not found in local` 拒否（=P3が実はpushをブロック）。CLI案内どおり `migration repair --status reverted <16本>` で履歴から除去（スキーマ不変）。
5. **Phase4 db push**：新規 `20260613190000_security_input_length_checks`（CHECK制約2本）が `db push` で自動適用＝新ワークフロー稼働を実証。
6. **検証**：`schema_migrations` 12本／Jun12系0／190000記録あり／CHECK制約2本実在 を MCP で確認。

**以後の運用ルール**：スキーマ変更は必ず `supabase migration new <name>` → `supabase db push`。**SQL Editor 直当て禁止**（履歴乖離の再発防止）。

---
（以下は実行時の計画。記録として残す。）

## 1. 現状（`supabase migration list --linked` で確認した事実）

| 区分 | バージョン | 状態 |
|---|---|---|
| Remote のみ（本番履歴にあるが repo に無い） | `20260612090035` 〜 `20260613032535`（16本） | 本番に適用済みだが**対応ファイルがrepoに無い**（初期スキーマ群） |
| Local のみ（repo にあるが本番履歴に無い） | `20260613140000` 〜 `20260613180000`（11本） | スキーマ自体はSQL Editorで適用済みだが**履歴未記録** |

### repo の11本（`supabase/migrations/`）
```
20260613140000_recommendation.sql
20260613150000_handover_messages.sql
20260613150100_agent_reviews.sql
20260613150200_notifications_enhance.sql
20260613160000_reco_add_avg_rating.sql          ← 重複
20260613160000_recommendation_rpc_guards.sql    ← 重複
20260613170000_security_hardening_min.sql       ← 重複
20260613170000_storage_deadline.sql             ← 重複
20260613170100_agent_avatar.sql
20260613170200_support_reports.sql
20260613180000_security_revoke_internal_fns.sql
```

### 問題点（2種類）
- **P1: 履歴未記録**（Localのみ11本）→ `db push` が「未適用」とみなし全部再実行しようとする → **非冪等なDDL（`drop ... ; create`、`revoke`、戻り値変更を伴う `create or replace` 等）が再実行されて失敗・不整合になりうる**（`if not exists`/`or replace` で書かれた行は通る）。結果として push 運用に乗らず、手動SQL Editorをやめられない根本原因。
- **P2: タイムスタンプ重複**（`160000`×2 / `170000`×2）→ migrationのversionは一意必須。重複したままだと `db push`/`repair` が壊れる。
- **P3: Remoteのみ16本**（repoに無い初期群）→ ⚠️**訂正**：当初「pushの障害にならない」としたが**誤り**。`db push` は「リモート履歴にあってローカルに無いversion」を検出すると `Remote migration versions not found in local migrations directory` で**拒否する**。よって push 運用化には、この16本を `supabase migration repair --status reverted <versions>`（履歴行の削除・スキーマ不変）で履歴から外す必要がある。CLI自身もこの対処を案内する。再現性（repoから本番をゼロ再構築）は引き続き持たない＝必要なら別途 `db pull` で baseline 化。

## 2. ゴールと非ゴール
- ゴール：`supabase migration list` で repo の11本が **Local＝Remote（applied）** に揃い、以後の新規migrationは `db push` だけで本番反映できる。
- 非ゴール（今回やらない）：P3（Jun12初期群の完全re-baseline）。再現性は別途。やるとしても本提案の後。

## 3. 前提・リスク
- **DBパスワード**が必要（`db push` / `migration repair` は対話入力 or `--password`）。実行は主担当の端末で。
- **バックアップ必須**：実行前に Supabase ダッシュボードで手動バックアップ（または PITR 有効を確認）。
- **`migration repair` は履歴テーブル（`supabase_migrations.schema_migrations`）だけを変更**し、スキーマ自体は触らない＝比較的安全・`--status reverted` で取り消し可能。
- **他メンバーが同時にスキーマ変更しない時間帯**に実施（主担当が今唯一の触り手なら低リスク）。
- ファイルrename＝versionの変更。マージ済みなので、実施はPRで行い周知する。

## 4. アプローチ（2案）

### 案A：repair-in-place（**推奨**・低リスク）
既存11ファイルを残し、重複だけ直して「適用済み」として履歴に記録する。最小手数で「`db push`が使える」状態にする。

### 案B：baseline squash（**別途設計が必要**・今回は採らない）
`supabase db pull` で現状スキーマをbaselineに吸い出す方向。ただし以下の落とし穴があり「P3も自動で解消」とは言い切れない：
- `db pull` は履歴に既存entryがある場合**全量dumpではなく差分生成**になる。
- **`auth`/`storage` スキーマはデフォルト除外**（`--schema` 指定が要る）。
- `migration squash` は **DML を落とす**ため、`storage.buckets` への行 INSERT（`agent-avatars` 等）や cron/secrets は手動補完が必要。
- fresh DB からの再構築検証まで含めないと再現性は担保できない。

→ 採るなら対象schema指定・DML補完・再構築検証・履歴repair方針まで含めた**別設計**として扱う。本提案のスコープ外。

---

## 5. 詳細手順（案A）

### Phase 0: バックアップ＆確認
1. Supabaseダッシュボードでバックアップ取得（or PITR確認）。
2. `supabase migration list --linked` で現状を保存（差分のbefore記録）。

### Phase 1: 重複タイムスタンプを解消（repo編集→PR）
versionが一意になるようrename（中身は変えない）。例：
```
20260613160000_recommendation_rpc_guards.sql  →  20260613160100_recommendation_rpc_guards.sql
20260613170000_storage_deadline.sql           →  20260613170300_storage_deadline.sql
```
（`reco_add_avg_rating`=160000、`security_hardening_min`=170000 を残す。順序は適用済みのため実害なし＝一意化が目的）
```bash
git mv supabase/migrations/20260613160000_recommendation_rpc_guards.sql supabase/migrations/20260613160100_recommendation_rpc_guards.sql
git mv supabase/migrations/20260613170000_storage_deadline.sql          supabase/migrations/20260613170300_storage_deadline.sql
```
→ PRにして main へ。

### Phase 2: 各migrationの「本番に実在するか」を検証（**全11本・必須**）
repairで「適用済み」と記録する前に、**そのmigrationが作る全オブジェクトが本番に在ること**を確認する。在らないのに `applied` にすると、未適用のスキーマ（特にRPC/列/policy/revoke）が「適用済み」と嘘記録され、将来も二度と当たらなくなる＝最悪パターン。**確認できた version だけ repair する。**

> 注意：各migrationが「何を作るか」は推測せず、**必ず対象の `supabase/migrations/<version>_*.sql` を開いて、その中で作成/変更している実オブジェクトを列挙してから**確認すること。テーブルだけでなく **関数(RPC)・列・policy・trigger・revoke(権限)** まで網羅する（テーブル一覧では検証できないものが多い）。

検証に使う read-only SQL（MCP `execute_sql` か SQL Editor、または `psql`）：
```sql
-- 履歴の現状（Jν12系16本のみのはず）
select version from supabase_migrations.schema_migrations order by 1;

-- テーブル / ビュー存在
select to_regclass('public.support_reports');           -- null なら未適用
-- 列存在
select 1 from information_schema.columns
  where table_schema='public' and table_name='agent_profiles' and column_name='avatar_url';
-- 関数(RPC)存在（引数シグネチャ込みで）
select to_regprocedure('public.get_recommendation_candidates(uuid)');  -- 例。実シグネチャに合わせる
-- policy 存在
select policyname from pg_policies where schemaname='public' and tablename='support_reports';
-- trigger 存在
select tgname from pg_trigger where tgname='trg_set_storage_deadline';
-- 権限/revoke 系（security_hardening_min / security_revoke_internal_fns）は
-- has_function_privilege / has_table_privilege や pg_proc の proacl を直接確認
select proname, proacl from pg_proc where proname in ('<対象関数名>');
```

現時点でMCPで実在確認済み：`support_reports`(table+RLS+policy)、`agent_profiles.avatar_url`、`parcels.storage_*`、`trg_set_storage_deadline`、bucket `agent-avatars`＋storage policy、`handover_messages`/`agent_reviews`/`notifications` の各table。
**未確認（要検証）**：`160100_recommendation_rpc_guards`(RPC/権限)、`170000_security_hardening_min`(権限/policy)、`180000_security_revoke_internal_fns`(revoke)、および `140000`/`150200`/`160000` が実際に作るオブジェクト（ファイルを開いて確認）。

- 未適用/部分適用が見つかったら、その差分だけ**冪等SQLで先に適用**してから repair（ここで適用したスキーマ変更は後述ロールバックの対象外＝手動で戻す必要がある点に注意）。

### Phase 3: 履歴を整合（repair）
まず repair を叩く端末を rename 済みの最新 main に合わせる：
```bash
git pull                          # Phase1 の rename を取り込む
ls supabase/migrations | wc -l    # 11 本
ls supabase/migrations | sed -E 's/_.*//' | sort | uniq -d   # 出力が空（version重複なし）であること
```
Phase2で実在確認できた version を「適用済み」として記録（**SQLは再実行されない**。`--linked` で本番履歴を対象に）：
```bash
supabase migration repair --linked --status applied \
  20260613140000 20260613150000 20260613150100 20260613150200 \
  20260613160000 20260613160100 20260613170000 20260613170100 \
  20260613170200 20260613170300 20260613180000
```
> パスワードは対話入力 or `-p`。**Phase2で未確認/未適用だった version は、適用＆確認できるまでこのリストから外す。**

### Phase 4: 検証
```bash
supabase migration list --linked
# repo の11本が Local=Remote(applied) で揃うこと。Jun12系はRemoteのみのまま（P3・許容）。

supabase db push --dry-run   # ★まず dry-run。適用予定が「空」であることを必ず確認
# （repair漏れ・別の未適用migrationが残っていればここで検知できる。空でなければ Phase2/3 に戻る）

supabase db push   # dry-run が空なら実行。"Remote database is up to date." になれば成功
```

### Phase 5: 運用ルール確立（重要）
- 以後、**スキーマ変更は必ず `supabase/migrations/<ts>_name.sql` を追加 → `supabase db push`**。SQL Editor直接適用は禁止（履歴がまた腐るため）。
- ファイル名のタイムスタンプは一意に（`supabase migration new <name>` で自動採番が安全）。
- READMEかCONTRIBUTINGに3〜5行で明記。CIで「未pushのmigrationが無いか」チェックも将来検討。

## 6. ロールバック
- repairを取り消す場合：`supabase migration repair --linked --status reverted <version>`（履歴テーブルの行を削除するだけ）。
- repair自体はスキーマを触らないので、履歴行を戻すだけで元に戻る。
- ⚠️ **例外**：Phase2で「未適用分を冪等SQLで先に適用」した場合、そのスキーマ変更は repair revert では戻らない（履歴ではなく実スキーマを変えたため）。戻すなら手動で逆DDLを当てる。Phase0のバックアップが最終保険。

## 7. 実行可否の最終判断材料
- ✅ いま主担当が単独で触っている＝競合リスク最小（やるなら今が好機）。
- ⚠️ DBパスワードと手動バックアップが前提。
- ⚠️ Phase2の検証を飛ばさないこと（appliedの嘘記録が最悪パターン）。
- P3（Jun12再現性）は今回スコープ外。必要になったら案Bを別途。
