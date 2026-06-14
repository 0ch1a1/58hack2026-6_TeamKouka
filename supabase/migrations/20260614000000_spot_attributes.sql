-- =============================================================================
-- スポット属性の追加 + 推薦候補RPCへの反映 delta migration
--
-- base(20260613140000_recommendation.sql) → avg_rating delta(20260613160000_reco_add_avg_rating.sql)
-- の後に当てる delta。
--   1. agent_profiles に「スポット種別 / 保管枠 / 当日利用可否 / 審査ステータス」の列を追加。
--   2. get_recommendation_candidates の戻り型末尾に上記 5 列を追加して返す。
--
-- RPC の形は実DB(ライブ)の現行定義を踏襲する:
--   language sql / stable / SECURITY INVOKER / set search_path = public。
--   service_role 限定は in-body ガードではなく EXECUTE 権限(public revoke + service_role grant)で担保。
--   引数・既存戻り列・st_dwithin 半径フィルタ・avg_rating/review_count の left join・ORDER BY は現行版を踏襲。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. agent_profiles へスポット属性列を追加（再実行安全: ADD COLUMN IF NOT EXISTS + ガード付き CHECK）
-- ---------------------------------------------------------------------------
alter table public.agent_profiles
  add column if not exists spot_type             text    not null default 'store',
  add column if not exists max_storage_count     int     not null default 5,
  add column if not exists current_storage_count int     not null default 0,
  add column if not exists is_available_today    boolean not null default true,
  -- 既定 'approved': 既存デモ代理人を可視のまま保つMVP方針(grandfathering)。
  -- 本番では default 'pending_review' とし、審査通過分だけ明示的に approved へ更新すること。
  add column if not exists review_status         text    not null default 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_profiles_spot_type_check'
      and conrelid = 'public.agent_profiles'::regclass
  ) then
    alter table public.agent_profiles
      add constraint agent_profiles_spot_type_check
      check (spot_type in ('store', 'facility', 'manager_room', 'individual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_profiles_review_status_check'
      and conrelid = 'public.agent_profiles'::regclass
  ) then
    alter table public.agent_profiles
      add constraint agent_profiles_review_status_check
      check (review_status in ('pending_review', 'approved', 'rejected', 'suspended'));
  end if;

  -- 保管枠の整合性: 非負かつ current <= max（空き枠表示・満枠判定が壊れないように）
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_profiles_storage_count_check'
      and conrelid = 'public.agent_profiles'::regclass
  ) then
    alter table public.agent_profiles
      add constraint agent_profiles_storage_count_check
      check (
        max_storage_count >= 0
        and current_storage_count >= 0
        and current_storage_count <= max_storage_count
      );
  end if;
end$$;

comment on column public.agent_profiles.spot_type is
  'スポット種別: store(店舗) / facility(施設) / manager_room(管理人室) / individual(個人宅)';
comment on column public.agent_profiles.max_storage_count is
  '最大保管可能数';
comment on column public.agent_profiles.current_storage_count is
  '現在の保管数（空き = max_storage_count - current_storage_count）';
comment on column public.agent_profiles.is_available_today is
  '本日の受け入れ可否';
comment on column public.agent_profiles.review_status is
  '審査ステータス: pending_review / approved / rejected / suspended';

-- ---------------------------------------------------------------------------
-- 2. 推薦候補RPC を再定義し、スポット属性 5 列を戻り型末尾に追加
--    戻り型(OUT列)を変更するため、まず既存関数を削除してから作り直す。
--    引数シグネチャは現行版と完全一致させること（誤った関数を消さないため）。
-- ---------------------------------------------------------------------------
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
  join public.profiles pr
    on pr.id = ap.user_id
  left join (
    select
      r.agent_id,
      avg(r.rating)::numeric as avg_rating,
      count(*)::int          as review_count
    from public.agent_reviews r
    group by r.agent_id
  ) rev
    on rev.agent_id = ap.user_id
  where ap.location is not null
    and st_dwithin(ap.location, target.location, p_radius_m)
  order by distance_meters asc;
$function$;

comment on function public.get_recommendation_candidates is
  '推薦用の近接代理人候補と特徴量（距離・時間帯・実績・保管負荷・評価avg_rating/review_count・スポット属性spot_type/保管枠/当日可否/審査状態）を返す。半径のみで絞り、各種スコアはサービス側で算出。service_role 専用。';

-- 既定では CREATE FUNCTION が PUBLIC に EXECUTE を付与するため、現行ACL(service_role限定)に合わせて
-- PUBLIC を剥奪し service_role にのみ付与する。
revoke execute on function public.get_recommendation_candidates(
  double precision,
  double precision,
  integer,
  text[]
) from public;

grant execute on function public.get_recommendation_candidates(
  double precision,
  double precision,
  integer,
  text[]
) to service_role;
