-- 機能6: 保管期限
-- parcels に保管期限の列を追加し、delivered_to_agent への遷移時に
-- DBトリガで storage_started_at / storage_deadline_at を自動セットする。
-- 遷移は Edge Function (verify-agent-qr) / RPC (update_parcel_status) 側で起きるため、
-- クライアントではなくトリガで全経路を捕捉する。

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
