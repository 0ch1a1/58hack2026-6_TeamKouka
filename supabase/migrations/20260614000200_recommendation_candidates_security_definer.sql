-- get_recommendation_candidates を security definer に変更する。
--
-- 経緯: authenticated ユーザ（受取人）からこの RPC を呼ぶと、
--   agent_profiles の RLS によって FROM agent_profiles が 0 行になり
--   候補が一切返らなかった（20260613160100 で service_role 限定にしたため）。
--   20260614000100 で EXECUTE 権限を authenticated に付与済みだが、
--   language sql (non-definer) のままでは RLS が caller 権限で評価されるため
--   依然 0 件になる。security definer にすることで関数所有者権限で agent_profiles
--   を全件参照できるようにする。
create or replace function public.get_recommendation_candidates(
  p_lat             double precision,
  p_lng             double precision,
  p_radius_m        integer  default 2000,
  p_active_statuses text[]   default array['agent_assigned', 'delivered_to_agent']
)
returns table (
  user_id              uuid,
  full_name            text,
  address              text,
  address_detail       text,
  distance_meters      double precision,
  available_days       text[],
  start_time           time,
  end_time             time,
  level                integer,
  completed_deliveries integer,
  points               integer,
  active_load          integer
)
language sql
security definer
stable
set search_path = public
as $$
  with target as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as location
  )
  select
    ap.user_id,
    pr.full_name,
    ap.address,
    ap.address_detail,
    st_distance(ap.location, target.location)            as distance_meters,
    ap.available_days,
    ap.start_time,
    ap.end_time,
    coalesce(ap.level, 1)                                as level,
    coalesce(ap.completed_deliveries, 0)                 as completed_deliveries,
    coalesce(ap.points, 0)                               as points,
    (
      select count(*)::int
      from public.parcels p
      where p.assigned_agent_id = ap.user_id
        and p.status::text = any(p_active_statuses)
    )                                                    as active_load
  from public.agent_profiles ap
  cross join target
  join public.profiles pr on pr.id = ap.user_id
  where ap.location is not null
    and st_dwithin(ap.location, target.location, p_radius_m)
  order by distance_meters asc;
$$;

-- EXECUTE 権限（20260614000100 で付与済みだが念のため明示）
grant execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) to authenticated;
