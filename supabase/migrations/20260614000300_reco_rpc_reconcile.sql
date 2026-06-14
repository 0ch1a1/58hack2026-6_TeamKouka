-- =============================================================================
-- get_recommendation_candidates の統合（reconcile）
--
-- 経緯:
--   - 20260614000000_spot_attributes: RPC を 19 列(距離+特徴量+評価+スポット属性)へ拡張
--     （language sql / invoker / service_role 限定）。
--   - 20260614000200_..._security_definer: RPC を security definer 化したが、
--     #99 以前の 12 列定義で CREATE OR REPLACE したため spot_type / 保管枠 /
--     review_status / avg_rating / review_count が欠落（#99 の拡張を巻き戻す回帰）。
--
-- 本 migration で両者の要件を統合する:
--   - security definer + authenticated 付与（受取人アプリが直接 RPC を呼べる: whitelist 方式）
--   - 19 列を返す（推薦サービスのハードフィルタ/除外理由/カード表示が spot 属性を読める）
--   - role='agent' で受取人/配送会社の stray な agent_profiles 行を候補から除外
-- =============================================================================

create or replace function public.get_recommendation_candidates(
  p_lat             double precision,
  p_lng             double precision,
  p_radius_m        integer  default 2000,
  p_active_statuses text[]   default array['agent_assigned', 'delivered_to_agent']
)
returns table (
  user_id               uuid,
  full_name             text,
  address               text,
  address_detail        text,
  distance_meters       double precision,
  available_days        text[],
  start_time            time,
  end_time              time,
  level                 integer,
  completed_deliveries  integer,
  points                integer,
  active_load           integer,
  avg_rating            numeric,
  review_count          integer,
  spot_type             text,
  max_storage_count     int,
  current_storage_count int,
  is_available_today    boolean,
  review_status         text
)
language sql
security definer
stable
set search_path = public
as $function$
  with target as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as location
  )
  select
    ap.user_id,
    pr.full_name,
    ap.address,
    ap.address_detail,
    st_distance(ap.location, target.location) as distance_meters,
    ap.available_days,
    ap.start_time,
    ap.end_time,
    coalesce(ap.level, 1),
    coalesce(ap.completed_deliveries, 0),
    coalesce(ap.points, 0),
    (
      select count(*)::int
      from public.parcels p
      where p.assigned_agent_id = ap.user_id
        and p.status::text = any(p_active_statuses)
    ) as active_load,
    rev.avg_rating,
    coalesce(rev.review_count, 0),
    ap.spot_type,
    ap.max_storage_count,
    ap.current_storage_count,
    ap.is_available_today,
    ap.review_status
  from public.agent_profiles ap
  cross join target
  join public.profiles pr on pr.id = ap.user_id
  left join (
    select r.agent_id, avg(r.rating)::numeric as avg_rating, count(*)::int as review_count
    from public.agent_reviews r
    group by r.agent_id
  ) rev on rev.agent_id = ap.user_id
  where ap.location is not null
    and pr.role = 'agent'                                -- 受取人/配送会社の混入を防ぐ
    and st_dwithin(ap.location, target.location, p_radius_m)
  order by distance_meters asc;
$function$;

comment on function public.get_recommendation_candidates is
  '近接代理人候補と特徴量(距離/時間/実績/保管負荷/評価/スポット属性)を返す。security definer + authenticated 付与で受取人アプリから直接呼べる。role=agent のみ。';

-- 受取人アプリ(authenticated)と推薦サービス(service_role)の双方から呼べるようにする。
grant execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) to authenticated, service_role;
