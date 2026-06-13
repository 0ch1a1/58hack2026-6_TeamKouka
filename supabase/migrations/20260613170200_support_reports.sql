-- 機能8: 簡易トラブル報告
-- 報告の記録のみ（責任判定・補償は対象外）。RLSは handover_messages 規約に倣い、
-- 当該parcelの recipient / assigned_agent のみ参照・作成できる。

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
