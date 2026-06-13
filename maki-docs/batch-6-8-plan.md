# 実装計画：バッチ6〜8（保管期限 / 代理人アバター / 簡易トラブル報告）

> 実スキーマ（Supabase本番）を調査して確定した計画。1〜5（DDLゼロ）と違い、**共有本番DBへのDDL＋Storage作成**が前提。
> 進め方：**コミット0（共有・逐次・私）→ Phase1 モジュール3並列（worktree＋subagent）→ Phase2 統合（逐次・私）**。

## スコープ確定事項

| # | 機能 | 確定した方針 |
|---|---|---|
| 6 | 保管期限 | `parcels` に3列追加。期限セットは**DBトリガ**（`delivered_to_agent` 遷移時）。クライアントは**表示専念**。push通知はやらない（画面内バッジ/バナー） |
| 7' | 代理人の顔写真 | **外装写真ログ（旧7）は廃止**。代理人が自分の顔写真を**任意**登録（未設定OK＝オプトアウト）。**全ログインユーザーが閲覧**。`agent_profiles.avatar_url` ＋ 非公開バケット `agent-avatars`（署名URL） |
| 8 | 簡易トラブル報告 | `support_reports` 新設。報告記録のみ（責任判定・補償は対象外） |

### 調査で判明した重要事実
- `agent_profiles` RLS：**SELECT = `true`（全員読める）**、INSERT/UPDATE = `auth.uid()=user_id`（本人のみ）。→ アバターをここに置けば、推薦サービス改修も新RPCも不要で「全員閲覧・本人登録」が成立。
- `profiles` RLS：SELECT = `auth.uid()=id`（自分のみ）。→ アバターを `profiles` に置くと他人が読めないため**不採用**。`agent_profiles` を採用。
- `delivered_to_agent`（保管開始）への遷移は **Edge Function `verify-agent-qr` / RPC `update_parcel_status`** 側で起きる（クライアント外）。→ 期限セットは**BEFORE UPDATE トリガ**で全経路を捕捉する。
- `parcels` 列：id, tracking_no, recipient_id, delivery_company_id, assigned_agent_id, status(enum), retry_count, co2_saved_kg, created_at, updated_at。期限列は無し。
- status enum：`created/out_for_delivery/delivery_failed/agent_assigned/delivered_to_agent/handed_to_recipient/completed`。「保管中」= `delivered_to_agent`。
- 配達員↔荷物は `delivery_company_id`（会社）でのみ紐づき、`profiles` に会社FKが無い（`company_name` はtext）。→ 顔写真の閲覧は「全員」にしたことで配達員RLS問題は**消滅**。
- Storageバケットは現状ゼロ。migrationは `supabase/migrations/`（`YYYYMMDDHHMMSS_name.sql` 規約）で管理。Edge Functionはリポジトリ未配置のため**触らない**（トリガ方式を採用）。
- RLS規約は `handover_messages`（当該parcelの recipient/assigned_agent のみ INSERT/SELECT）に倣う。

---

## コミット0（共有・逐次・私が実施）

> DB適用の可否はユーザー承認後に実行。MCP `apply_migration` で本番適用し、同内容を `supabase/migrations/` にもコミット（traceability）。

### migration 1: `20260613170000_storage_deadline.sql`（機能6）
```sql
alter table parcels
  add column if not exists storage_started_at          timestamptz,
  add column if not exists storage_deadline_at         timestamptz,
  add column if not exists storage_overdue_notified_at timestamptz; -- MVP未使用（将来の超過通知連打防止用に予約）

create or replace function set_storage_deadline() returns trigger
language plpgsql as $$
begin
  if new.status = 'delivered_to_agent'
     and new.status is distinct from old.status
     and new.storage_started_at is null then
    new.storage_started_at := now();
    -- 原則当日中(JST)・最大24時間。JSTの当日終端 と now+24h の早い方。
    new.storage_deadline_at := least(
      (date_trunc('day', timezone('Asia/Tokyo', now())) + interval '1 day' - interval '1 second')
        at time zone 'Asia/Tokyo',
      now() + interval '24 hours'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_set_storage_deadline on parcels;
create trigger trg_set_storage_deadline
  before update on parcels
  for each row execute function set_storage_deadline();
```

### migration 2: `20260613170100_agent_avatar.sql`（機能7'）
```sql
alter table agent_profiles add column if not exists avatar_url text; -- Storageオブジェクトパス。null=未設定（オプトアウト）

insert into storage.buckets (id, name, public)
  values ('agent-avatars','agent-avatars', false)
  on conflict (id) do nothing;

-- 閲覧: 全ログインユーザー（=「全員」）。書込/更新/削除: 本人パス {user_id}/... のみ。
create policy agent_avatars_read   on storage.objects for select to authenticated
  using (bucket_id = 'agent-avatars');
create policy agent_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy agent_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy agent_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```

### migration 3: `20260613170200_support_reports.sql`（機能8）
```sql
create table if not exists support_reports (
  id          uuid primary key default gen_random_uuid(),
  parcel_id   uuid not null references parcels(id),
  reporter_id uuid not null references profiles(id),
  category    text not null,                 -- damaged / opened / wet / overdue / lost / other
  status      text not null default 'open',  -- open / reviewing / resolved
  note        text,
  created_at  timestamptz not null default now()
);
alter table support_reports enable row level security;
create policy support_reports_select on support_reports for select
  using (exists (select 1 from parcels p where p.id = parcel_id
          and (auth.uid() = p.recipient_id or auth.uid() = p.assigned_agent_id)));
create policy support_reports_insert on support_reports for insert
  with check (reporter_id = auth.uid() and exists (select 1 from parcels p where p.id = parcel_id
          and (auth.uid() = p.recipient_id or auth.uid() = p.assigned_agent_id)));
```

### その他コミット0作業
- `npx expo install expo-image-picker`（SDK54対応版を自動選択）。`app.json` の `plugins` に権限付きで追加：
  ```json
  ["expo-image-picker", { "photosPermission": "プロフィール写真の選択に使用します", "cameraPermission": "プロフィール写真の撮影に使用します" }]
  ```
- `generate_typescript_types` → `lib/database.types.ts` 更新（`AgentProfile.avatar_url`、`Parcel.storage_*`、`SupportReport` 追加）。**全エージェントが参照するので必ずコミット0で確定**。
- ブランチ `feat/batch-6-8-base` を切ってコミット0をコミット＋push。Phase1 のworktreeはここから分岐。

---

## Phase 1：モジュール3並列（worktree＋subagent・交差なし）

各エージェントは **新規 `features/*.ts`／`lib/*.ts`／`components/*.tsx` のみ**を作る。**画面ファイルと `features/parcels.ts` には触らない**（=衝突ゼロ）。各自 `tsc`＋`jest` 緑、命名ブランチでコミット、pushしない。

### Agent A — 機能6 保管期限（表示専用）
専有ファイル：
- `lib/storageDeadline.ts`（純ロジック）：
  - `remainingMs(deadlineAt: string | null, now?: Date): number | null`
  - `formatRemaining(deadlineAt, now?): string`（例「残り 3時間20分」）
  - `isOverdue(deadlineAt, now?): boolean`
  - `deadlineState(deadlineAt, now?): 'none' | 'normal' | 'soon' | 'overdue'`（soon=残り1時間以内 等のしきい値）
- `lib/__tests__/storageDeadline.test.ts`（境界：null/超過/残り時間/soonしきい値）
- `components/StorageDeadlineBadge.tsx`：propは **`deadlineAt: string | null`**（fetchには依存しない）。`deadlineState` で色・文言（normal=緑「当日中」, soon=橙, overdue=赤「期限超過」, none=非表示）
注意：DBトリガが列をセットするので、A は**列の取得や status 遷移には関与しない**。`StorageDeadlineBadge` は値を prop で受ける純表示。

### Agent B — 機能7' 代理人アバター
専有ファイル：
- `features/avatar.ts`：
  - `uploadAgentAvatar(userId: string, localUri: string): Promise<string>`：`agent-avatars/{userId}/avatar.jpg` に upload（`upsert: true`）→ `agent_profiles.avatar_url` をパスで update → パス返却。
    - RN実装注意：`fetch(localUri)` → `.arrayBuffer()` で取得し `supabase.storage.from('agent-avatars').upload(path, bytes, { contentType:'image/jpeg', upsert:true })`。`decode`/base64経由でも可。空uri/失敗時throw。
  - `removeAgentAvatar(userId): Promise<void>`：オブジェクト削除＋ `avatar_url=null`（オプトアウト）。
  - `getAgentAvatarUrls(agentIds: string[]): Promise<Record<string, string>>`：`agent_profiles` から `user_id, avatar_url` を `in` で一括取得（SELECT=true なので他人分も読める）→ `createSignedUrls` で署名URL化（TTL例3600s）→ `{agentId: signedUrl}`。null/空は除外。
- `components/Avatar.tsx`：`{ uri?: string | null; name?: string | null; size?: number }`。uriあれば画像、無ければ頭文字プレースホルダ（既存theme使用）。
- `components/AvatarPicker.tsx`：`expo-image-picker` で選択/撮影 → `uploadAgentAvatar` → 表示更新。**「写真を外す」**でオプトアウト（`removeAgentAvatar`）。権限拒否時の文言も。
- 画面配線：`app/(app)/agent/profile.tsx` に `AvatarPicker` を追加（**この画面はBのみが触る**）。任意項目として明示（未設定でも保存可）。
- テスト：`getAgentAvatarUrls` のマッピング整形を中心に最小限（supabaseはモック）。
境界：`features/avatar.ts`・`components/Avatar*.tsx`（新規）・`agent/profile.tsx`（Bのみ）。他と非交差。

### Agent C — 機能8 簡易トラブル報告
専有ファイル：
- `features/support.ts`：
  - `SUPPORT_CATEGORIES`（`damaged/opened/wet/overdue/lost/other` ＋日本語ラベル）
  - `createSupportReport(p: { parcelId: string; category: string; note?: string }): Promise<void>`：`reporter_id = auth.uid()` を埋めて insert。
  - `fetchSupportReports(parcelId: string): Promise<SupportReport[]>`
- `components/SupportReportForm.tsx`：カテゴリchip選択＋任意メモ＋送信（送信中/完了/失敗ハンドリング）。
- `components/SupportReportBadge.tsx`（任意）：open報告ありの小バッジ。
- `lib/__tests__/support.test.ts`：カテゴリ定数・整形の最小テスト。
境界：新規ファイルのみ。画面には配線しない（Phase2で統合）。

---

## Phase 2：統合（私・逐次・1ファイルずつ）

衝突源の画面/共有モジュールをまとめて担当：
1. `features/parcels.ts`：`fetchParcel` / `fetchMyParcels` / `fetchDriverParcels` の select に `storage_started_at, storage_deadline_at` を追加。
2. `app/(app)/agent/parcels.tsx`：保管中カードに `StorageDeadlineBadge`、自分の `Avatar`、受取/引き渡し付近に「問題を報告」→ `SupportReportForm`。
3. `app/(app)/recipient/packages.tsx` ＋ `recipient/pickup-ready.tsx`：`StorageDeadlineBadge`、「問題を報告」導線。
4. `app/(app)/recipient/matching.tsx`：`AgentCard` に代理人 `Avatar` を表示。候補の `agent_id` 群で `getAgentAvatarUrls` を一括取得しマップ注入（Bの関数を使用）。
5. 全体 `tsc`＋`jest` → 最新 `main` を取り込み（衝突解消）→ PR作成。

---

## リスク・限界（明示）
- 期限の**定期push通知はやらない**。画面表示時に `deadlineState` で判定するのみ（`pg_cron`/Edge Functionは将来枠）。`storage_overdue_notified_at` はMVP未使用。
- 期限の**タイムゾーン**：JST固定で算出（トリガ内 `Asia/Tokyo`）。サーバ now() がUTCでも当日終端はJST基準になる。
- **顔写真は本人同意のもとアプリ全ユーザーに公開**（信頼シグナル）。非公開バケット＋署名URL＝未ログインには出ない。本人がいつでも削除可。生体認証や本人性保証はしない（目視確認の補助）。
- 画像アップロードはRNの `fetch(uri).arrayBuffer()` 経路に依存（端末差異に注意）。署名URLにはTTLがあるため画面表示の都度発行。
- DB変更は**本番共有プロジェクトに即反映**。巻き戻しは drop/revert を別途要する。
- `public.spatial_ref_sys` のRLS無効は**従来からの既存事項**で本バッチ対象外（PostGIS参照テーブル）。
