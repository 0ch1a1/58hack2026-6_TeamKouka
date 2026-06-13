-- =============================================================================
-- 推薦RPCのセキュリティ強化（レビュー指摘 high/critical への対応）
--
-- 前提: 20260613140000_recommendation.sql が適用済みであること。
--
-- 方針:
--   * security definer 関数（任意IDを受ける）に所有者チェックを追加する。
--     - 認証ユーザ（auth.uid() が非NULL）は「自分の」リソースのみ操作可。
--     - service_role（auth.uid() が NULL）は信頼サーバとして従来どおり全件操作可。
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
  if auth.uid() is not null and auth.uid() <> p_user_id then
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
  if auth.uid() is not null and not exists (
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
  if auth.uid() is not null and not exists (
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
-- 4. 候補取得は service_role 限定に（代理人の氏名・住所などPIIを返すため）。
--    クライアントは Python サービス経由でのみ取得する。
-- ---------------------------------------------------------------------------
revoke execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) from public;

grant execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) to service_role;
