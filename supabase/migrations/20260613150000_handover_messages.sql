-- =============================================================================
-- 荷物ごとのメッセージ機能（F-MSG-01）
--   handover_messages : 受取人 ⇆ 代理人 が荷物単位でやり取りするメッセージ
--
-- RLS（厳格化）:
--   * read   : 対象 parcel の recipient_id / assigned_agent_id 本人のみ
--   * insert : sender_id = auth.uid() かつ 上記いずれか本人のみ
--               （送信者偽装・無関係な荷物への投稿を防ぐ）
--   * Realtime: supabase_realtime publication に追加（追加しないと購読が発火しない）
--
-- 前提（次期機能 実装計画 2026-06-13）:
--   * parcels(id) / profiles(id) は PK。新テーブル側から FK を張る。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------
create table if not exists public.handover_messages (
  id         uuid primary key default gen_random_uuid(),
  parcel_id  uuid not null references public.parcels(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id),
  body       text not null check (length(btrim(body)) > 0),  -- 空本文禁止
  created_at timestamptz not null default now()
);

-- 一覧取得（parcel_id で絞り created_at 昇順）の補助
create index if not exists handover_messages_parcel_id_created_at_idx
  on public.handover_messages (parcel_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.handover_messages enable row level security;

-- read: 対象 parcel の受取人 / 割り当て代理人 本人のみ
drop policy if exists handover_messages_read on public.handover_messages;
create policy handover_messages_read on public.handover_messages
  for select
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_id
        and auth.uid() in (p.recipient_id, p.assigned_agent_id)
    )
  );

-- insert: 送信者本人 かつ 対象 parcel の受取人 / 割り当て代理人 本人のみ
drop policy if exists handover_messages_insert on public.handover_messages;
create policy handover_messages_insert on public.handover_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.parcels p
      where p.id = parcel_id
        and auth.uid() in (p.recipient_id, p.assigned_agent_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- publication への追加は冪等でない（既に登録済みだとエラーで migration が失敗）。
-- 重複登録時の duplicate_object を握りつぶして冪等にする。
do $$
begin
  alter publication supabase_realtime add table public.handover_messages;
exception
  when duplicate_object then null;
end $$;

-- =============================================================================
-- NOTE: この migration は未適用。レビュー後に手動で適用すること。
--       （DB へは自動適用していない）
-- =============================================================================
