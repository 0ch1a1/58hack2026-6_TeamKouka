-- 機能9: 追記専用監査ログ（append-only ハッシュチェーン）＋ 検証UI 用テーブル
-- 引き渡し等のイベントを時系列で連結したハッシュチェーンとして残し、後からの改変を検知しやすくする。
-- 限界（正直な保証範囲）: 単一サーバ／運営権限(service_role)は回避可能＝「内部の誤操作・後付け改変の検知補助」。
-- MVP はハッシュをクライアント計算（expo-crypto）で append し、検証UIで再計算・突合する（外部アンカリングはしない）。

create table if not exists parcel_events (
  id              uuid primary key default gen_random_uuid(),
  parcel_id       uuid references parcels(id),
  event_type      text not null,            -- registered/absence_reported/matched/handoff_primary/handoff_secondary/completed
  actor_id        uuid references profiles(id),
  client_event_id uuid not null unique,     -- クライアント採番の冪等キー（DEFAULTは付けない）
  payload_text    text not null default '{}', -- ハッシュ対象の生文字列（このバイト列をそのままハッシュ）
  payload         jsonb,                    -- 照会用（ハッシュには使わない）
  prev_hash       text,                     -- 直前イベントの hash（先頭はNULL）
  hash            text not null,            -- SHA-256
  created_at      timestamptz not null default now()
);

-- 追記専用の強制（UPDATE/DELETE を拒否）。※ owner/service_role はトリガを無効化でき回避可能（限界）。
create or replace function reject_mutation_parcel_events() returns trigger as $$
begin
  raise exception 'parcel_events is append-only (% rejected)', TG_OP;
end;
$$ language plpgsql;

drop trigger if exists trg_no_update_delete_parcel_events on parcel_events;
create trigger trg_no_update_delete_parcel_events
  before update or delete on parcel_events
  for each row execute function reject_mutation_parcel_events();

alter table parcel_events enable row level security;

-- 参照/作成: 当該parcelの recipient / assigned_agent のみ。INSERT は actor 本人。
create policy parcel_events_select on parcel_events for select
  using (exists (select 1 from parcels p where p.id = parcel_id
          and (auth.uid() = p.recipient_id or auth.uid() = p.assigned_agent_id)));
create policy parcel_events_insert on parcel_events for insert
  with check (actor_id = auth.uid() and exists (select 1 from parcels p where p.id = parcel_id
          and (auth.uid() = p.recipient_id or auth.uid() = p.assigned_agent_id)));
-- UPDATE/DELETE ポリシーは作らない（トリガでも拒否）。
