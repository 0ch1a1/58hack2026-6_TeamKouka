-- =============================================================================
-- 中間者おすすめ 推薦スコアリング基盤
--   1. recipient_profiles            : 受取人の自宅座標（距離の起点 / agent_profiles と対称）
--   2. upsert_recipient_profile      : 住所→座標を保存
--   3. get_recommendation_candidates : 近接代理人 + スコアリング特徴量（半径のみで絞る/時間帯はソフト）
--   4. recommendation_logs           : 推薦結果 + 選択/成否ラベル（再学習用）
--   5. mark_recommendation_chosen    : 受取人が選んだ候補を記録
--   6. record_recommendation_outcome : 配達成否を学習ラベルとして付与
--
-- 検証済み前提（Supabase MCP, project zbmrmblakoszzecdnptn, 2026-06-13）:
--   * PostGIS 3.3.7 有効 / agent_profiles.location は geography(Point,4326)
--   * parcels.status enum: created/out_for_delivery/delivery_failed/
--       agent_assigned/delivered_to_agent/handed_to_recipient/completed
--   * profiles.id -> auth.users.id (FK)。シードは auth ユーザ作成が前提
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 受取人プロファイル（自宅座標 = 距離の起点）
-- ---------------------------------------------------------------------------
create table if not exists public.recipient_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  address        text,
  address_detail text,
  location       geography(Point, 4326),     -- agent_profiles.location と同型
  updated_at     timestamptz not null default now()
);

alter table public.recipient_profiles enable row level security;

drop policy if exists recipient_profiles_self on public.recipient_profiles;
create policy recipient_profiles_self on public.recipient_profiles
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. 受取人住所の upsert（upsert_agent_profile と対称）
--    ジオコーディングは Edge Function 側で行い、lat/lng を渡す想定
-- ---------------------------------------------------------------------------
create or replace function public.upsert_recipient_profile(
  p_user_id        uuid,
  p_address        text,
  p_lat            double precision,
  p_lng            double precision,
  p_address_detail text default null
)
returns void
language sql
security definer
set search_path = public
as $$
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
$$;

comment on function public.upsert_recipient_profile is
  '受取人の自宅住所と座標(lat/lng)を保存。推薦の距離起点に使う。';

-- ---------------------------------------------------------------------------
-- 2b. 受取人座標の取り出し（lat/lng）
--     Python サービスが recipient_id だけ渡された時に起点を解決するのに使う。
--     security definer にせず RLS(recipient_profiles_self)に従う＝本人/サービスのみ。
-- ---------------------------------------------------------------------------
create or replace function public.get_recipient_coordinates(
  p_recipient_id uuid
)
returns table (lat double precision, lng double precision)
language sql
stable
set search_path = public
as $$
  select st_y(location::geometry) as lat,
         st_x(location::geometry) as lng
  from public.recipient_profiles
  where user_id = p_recipient_id
    and location is not null;
$$;

comment on function public.get_recipient_coordinates is
  '受取人の自宅座標を lat/lng で返す（推薦の距離起点解決用）。';

-- ---------------------------------------------------------------------------
-- 3. 推薦候補 + 特徴量
--    find_nearby_agents と違い「半径のみ」で絞り、曜日/時間帯は生データで返す
--    （Python側でソフトスコア化＝窓外でも下位候補として残すため）
-- ---------------------------------------------------------------------------
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

comment on function public.get_recommendation_candidates is
  '推薦用の近接代理人候補と特徴量（距離・時間帯・実績・現在の保管負荷）を返す。半径のみで絞り、時間帯スコアはサービス側で算出。';

-- ---------------------------------------------------------------------------
-- 4. 推薦ログ（特徴量・スコア・選択/成否ラベル）
-- ---------------------------------------------------------------------------
create table if not exists public.recommendation_logs (
  id                 uuid primary key default gen_random_uuid(),
  parcel_id          uuid references public.parcels(id)  on delete set null,
  recipient_id       uuid references public.profiles(id) on delete set null,
  candidate_agent_id uuid references public.profiles(id) on delete set null,
  features           jsonb            not null default '{}'::jsonb,
  score              double precision,
  rank               integer,
  model_version      text,
  chosen             boolean          not null default false,  -- ラベルA: 受取人が選んだか
  outcome            text,                                     -- ラベルB: 'completed'|'failed'|null
  created_at         timestamptz      not null default now()
);

create index if not exists idx_reco_logs_parcel  on public.recommendation_logs(parcel_id);
create index if not exists idx_reco_logs_chosen   on public.recommendation_logs(chosen);
create index if not exists idx_reco_logs_outcome  on public.recommendation_logs(outcome);

alter table public.recommendation_logs enable row level security;

-- 受取人は自分宛の推薦ログのみ参照可。INSERT は service_role(Pythonサービス) が RLS バイパスで実施。
drop policy if exists reco_logs_select_own on public.recommendation_logs;
create policy reco_logs_select_own on public.recommendation_logs
  for select
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. 受取人が選んだ候補を記録（ラベルA）
-- ---------------------------------------------------------------------------
create or replace function public.mark_recommendation_chosen(
  p_parcel_id uuid,
  p_agent_id  uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recommendation_logs
     set chosen = (candidate_agent_id = p_agent_id)
   where parcel_id = p_parcel_id;
$$;

comment on function public.mark_recommendation_chosen is
  '受取人が中間者を確定した際、その parcel の推薦ログに選択フラグを立てる。';

-- ---------------------------------------------------------------------------
-- 6. 配達成否を学習ラベルとして付与（ラベルB / 選ばれた候補の行に）
-- ---------------------------------------------------------------------------
create or replace function public.record_recommendation_outcome(
  p_parcel_id uuid,
  p_outcome   text          -- 'completed' | 'failed'
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recommendation_logs
     set outcome = p_outcome
   where parcel_id = p_parcel_id
     and chosen = true;
$$;

comment on function public.record_recommendation_outcome is
  '配達の最終成否を、選ばれた候補の推薦ログに記録（再学習の教師ラベル）。';
