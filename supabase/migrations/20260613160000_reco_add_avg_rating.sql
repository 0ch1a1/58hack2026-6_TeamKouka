-- =============================================================================
-- 推薦候補RPCに評価(avg_rating / review_count)を追加する delta migration
--
-- base(20260613140000_recommendation.sql) 適用後に当てる delta。DB未適用。
--   * 元の get_recommendation_candidates の引数・戻り列・ロジックをそのまま土台にし、
--     戻り型の末尾に avg_rating numeric / review_count integer の 2 列のみ追加する。
--   * 戻り型に列を追加するため CREATE OR REPLACE では変更できない。
--     よって DROP FUNCTION → CREATE で再定義する。
--   * agent_reviews(20260613150100) を agent_id で集約(avg/count)して left join する。
--     評価が無い代理人は avg_rating=NULL / review_count=0 を返す
--     （Python 側 build_features は avg_rating=None を中立値 0.5 に正規化する）。
--   * 前提テーブル: public.agent_reviews(agent_id uuid, rating int 1..5)
-- =============================================================================

-- 戻り型（OUT 列）を変更するため、まず既存関数を削除する。
-- 引数シグネチャは base と完全一致させること（誤った関数を消さないため）。
drop function if exists public.get_recommendation_candidates(
  double precision,
  double precision,
  integer,
  text[]
);

create function public.get_recommendation_candidates(
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
  active_load          integer,
  avg_rating           numeric,
  review_count         integer
)
language sql
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
    )                                                    as active_load,
    rev.avg_rating                                       as avg_rating,
    coalesce(rev.review_count, 0)                        as review_count
  from public.agent_profiles ap
  cross join target
  join public.profiles pr on pr.id = ap.user_id
  left join (
    select
      r.agent_id,
      avg(r.rating)::numeric as avg_rating,
      count(*)::int          as review_count
    from public.agent_reviews r
    group by r.agent_id
  ) rev on rev.agent_id = ap.user_id
  where ap.location is not null
    and st_dwithin(ap.location, target.location, p_radius_m)
  order by distance_meters asc;
$$;

comment on function public.get_recommendation_candidates is
  '推薦用の近接代理人候補と特徴量（距離・時間帯・実績・現在の保管負荷・評価avg_rating/review_count）を返す。半径のみで絞り、時間帯/評価スコアはサービス側で算出。';
