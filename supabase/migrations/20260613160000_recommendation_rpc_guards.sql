-- =============================================================================
-- 推薦RPCのセキュリティ強化（レビュー指摘 critical/high への対応）
--
-- 前提: 20260613140000_recommendation.sql が適用済みであること。
--
-- 方針:
--   * security definer 関数（任意IDを受ける）に所有者チェックを追加する。
--     - 信頼サーバ（service_role）のみバイパス。判定は JWT クレームの role で行う
--       （`auth.uid() is null` だけだと未ログインの anon も null なので不可）。
--     - それ以外（authenticated）は「自分の」リソースのみ操作可。anon は所有者になれず拒否。
--   * 多層防御として execute 権限も public から剥がし、authenticated/service_role 限定にする。
--   * 代理人候補（PII含む）を返す関数はクライアント直叩きを禁止し service_role 限定にする。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 受取人住所の upsert：本人のみ（service_role はバイパス）
-- ---------------------------------------------------------------------------
create or replace function public.upsert_recipient_profile(
  p_user_id        uuid,
  p_address        text,
  p_lat            double precision,
  p_lng            double precision,
  p_address_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role（信頼サーバ）以外は本人のみ。anon は auth.uid() が null で必ず弾かれる。
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'not authorized to update another user''s profile';
  end if;

  insert into public.recipient_profiles (user_id, address, address_detail, location, updated_at)
  values (
    p_user_id, p_address, p_address_detail,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    now()
  )
  on conflict (user_id) do update
    set address        = excluded.address,
        address_detail = excluded.address_detail,
        location       = excluded.location,
        updated_at     = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 選択ラベル付与：その parcel の受取人本人のみ（service_role はバイパス）
-- ---------------------------------------------------------------------------
create or replace function public.mark_recommendation_chosen(
  p_parcel_id uuid,
  p_agent_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and not exists (
       select 1 from public.parcels p
       where p.id = p_parcel_id and p.recipient_id = auth.uid()
     ) then
    raise exception 'not authorized for this parcel';
  end if;

  update public.recommendation_logs
     set chosen = (candidate_agent_id = p_agent_id)
   where parcel_id = p_parcel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 成否ラベル付与：その parcel の受取人本人のみ（service_role はバイパス）
-- ---------------------------------------------------------------------------
create or replace function public.record_recommendation_outcome(
  p_parcel_id uuid,
  p_outcome   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and not exists (
       select 1 from public.parcels p
       where p.id = p_parcel_id and p.recipient_id = auth.uid()
     ) then
    raise exception 'not authorized for this parcel';
  end if;

  update public.recommendation_logs
     set outcome = p_outcome
   where parcel_id = p_parcel_id
     and chosen = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. execute 権限の多層防御：anon を排除し authenticated/service_role 限定に。
--    （関数内ガードに加え、anon は実行自体できないようにする）
-- ---------------------------------------------------------------------------
revoke execute on function public.upsert_recipient_profile(uuid, text, double precision, double precision, text) from public;
grant  execute on function public.upsert_recipient_profile(uuid, text, double precision, double precision, text) to authenticated, service_role;

revoke execute on function public.mark_recommendation_chosen(uuid, uuid) from public;
grant  execute on function public.mark_recommendation_chosen(uuid, uuid) to authenticated, service_role;

revoke execute on function public.record_recommendation_outcome(uuid, text) from public;
grant  execute on function public.record_recommendation_outcome(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. 候補取得は service_role 限定に（代理人の氏名・住所などPIIを返すため）。
--    クライアントは Python サービス経由でのみ取得する。
-- ---------------------------------------------------------------------------
revoke execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) from public;

grant execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) to service_role;
