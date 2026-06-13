-- =============================================================================
-- 通知強化（F-NOTIF-01）
--   1. get_unread_notification_count : 自分(auth.uid())の未読(read_at is null)件数
--   2. mark_all_notifications_read    : 自分(auth.uid())の未読を全て read_at=now() に
--   3. publication 追加               : notifications を supabase_realtime に登録
--
-- 前提（実DB確認済み・2026-06-13, project zbmrmblakoszzecdnptn）:
--   * public.notifications は既存（22行）。本 migration ではテーブル定義は変更しない。
--     列: id / user_id / parcel_id / notification_type / title / body /
--         payload / read_at / created_at
--   * 既存 RPC mark_notification_read（1件既読）が稼働中。
--   * 既存 publication supabase_realtime には parcels / delivery_matches のみ登録済み。
--
-- 設計方針:
--   * クライアントから user_id を受けず、内部で auth.uid() を使う
--     （クライアント渡しの userId を信用しない）。
--   * security definer + search_path 固定（既存 RPC 群に倣う）。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 未読件数（自分の分のみ）
-- ---------------------------------------------------------------------------
create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

comment on function public.get_unread_notification_count is
  'ログインユーザ(auth.uid())の未読通知(read_at is null)件数を返す。user_id はクライアントから受けない。';

-- ---------------------------------------------------------------------------
-- 2. 一括既読（自分の未読を全て read_at=now() に）
-- ---------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
       set read_at = now()
     where user_id = auth.uid()
       and read_at is null
    returning 1
  )
  select count(*)::int from updated;
$$;

comment on function public.mark_all_notifications_read is
  'ログインユーザ(auth.uid())の未読通知を全て既読(read_at=now())にし、既読化した件数を返す。';

-- ---------------------------------------------------------------------------
-- 3. Realtime publication へ notifications を追加
--    （未追加だと postgres_changes 購読が発火しない）
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;

-- =============================================================================
-- 未適用 / レビュー後手動適用:
--   この migration は DB に未適用です。レビュー後に手動で適用してください。
--   （例: supabase db push もしくは MCP apply_migration）
--   注意: alter publication ... add table は再実行不可（既に登録済みだとエラー）。
--         二重適用を避けるため、適用済みかは
--         `select * from pg_publication_tables where pubname='supabase_realtime';`
--         で確認すること。
-- =============================================================================
