-- 機能8: 配達員ライブ位置トラッキング（ダミー座標＋Realtime）
-- 配達員/代理人が現在地・進捗を upsert し、受取人画面で「近づいています」進捗を表示する。
-- 地図は必須にせず、progress(0..100) の進捗バー＋到着予測でデモ成立。

create table if not exists delivery_locations (
  parcel_id  uuid primary key references parcels(id),
  lat        double precision,
  lng        double precision,
  progress   int not null default 0,            -- 0..100
  updated_at timestamptz not null default now()
);

alter table delivery_locations enable row level security;

-- 参照: 当該parcelの recipient / assigned_agent のみ（handover_messages 規約に倣う）。
create policy delivery_locations_select on delivery_locations for select
  using (exists (select 1 from parcels p where p.id = parcel_id
          and (auth.uid() = p.recipient_id or auth.uid() = p.assigned_agent_id)));

-- 書込（upsert）: 当該parcelの assigned_agent のみ（配達員は会社紐付けが弱いため MVP は代理人に限定）。
create policy delivery_locations_insert on delivery_locations for insert
  with check (exists (select 1 from parcels p where p.id = parcel_id and auth.uid() = p.assigned_agent_id));
create policy delivery_locations_update on delivery_locations for update
  using (exists (select 1 from parcels p where p.id = parcel_id and auth.uid() = p.assigned_agent_id))
  with check (exists (select 1 from parcels p where p.id = parcel_id and auth.uid() = p.assigned_agent_id));

-- Realtime 配信対象に追加（受取人画面の購読用）。
-- 既に publication に登録済みでも失敗しないようガード（handover_messages migration と同方針・冪等）。
do $$
begin
  alter publication supabase_realtime add table delivery_locations;
exception when duplicate_object then null;
end $$;
