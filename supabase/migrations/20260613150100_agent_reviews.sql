-- =============================================================================
-- 代理人評価機能（F-REVIEW-01）
--   1. agent_reviews            : 引き渡し完了後の受取人 → 代理人 評価（1荷物1評価）
--   2. RLS                       : 受取人本人・割り当て済み代理人・完了済みのみ insert 可
--   3. create_review(...)        : agent_id をサーバ側で parcels.assigned_agent_id から導出
--   4. get_agent_rating(...)     : 代理人の平均評価・件数
--   5. get_agent_locations(...)  : 既存 RPC を avg_rating / review_count 付きで CREATE OR REPLACE
--
-- 前提（recommendation.sql と同様 / Supabase project zbmrmblakoszzecdnptn, 2026-06-13）:
--   * parcels.status enum: created/out_for_delivery/delivery_failed/
--       agent_assigned/delivered_to_agent/handed_to_recipient/completed
--   * profiles.id -> auth.users.id (FK)。lib/status.ts の isHandedOff と揃え
--     完了判定は ('completed','handed_to_recipient') の双方を許可する。
--   * agent_profiles 列: user_id/address/address_detail/available_days/start_time/
--       end_time/level/completed_deliveries（推薦RPC定義より確認）。profiles.full_name。
--
-- ★このマイグレーションは未適用。レビュー後に手動適用すること（末尾の注記参照）。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. テーブル: agent_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.agent_reviews (
  id          uuid primary key default gen_random_uuid(),
  parcel_id   uuid not null references public.parcels(id),
  agent_id    uuid not null references public.profiles(id),
  reviewer_id uuid not null references public.profiles(id),
  rating      int  not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  constraint agent_reviews_parcel_unique unique (parcel_id)  -- 1荷物1評価
);

create index if not exists agent_reviews_agent_id_idx on public.agent_reviews (agent_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
--    insert: 受取人本人・割り当て済み代理人・完了済み荷物のみ（別人/未完了評価を防止）
--    read  : agent 本人 or 当該受取人（集計用に広めだが auth.uid() は必ず付与）
-- ---------------------------------------------------------------------------
alter table public.agent_reviews enable row level security;

drop policy if exists agent_reviews_insert on public.agent_reviews;
create policy agent_reviews_insert on public.agent_reviews
  for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.parcels p
      where p.id = parcel_id
        and p.recipient_id = auth.uid()
        and p.assigned_agent_id = agent_id
        and p.status in ('completed', 'handed_to_recipient')
    )
  );

drop policy if exists agent_reviews_select on public.agent_reviews;
create policy agent_reviews_select on public.agent_reviews
  for select
  using (
    agent_id = auth.uid()
    or reviewer_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3. RPC: create_review
--    agent_id はクライアント指定させず parcels.assigned_agent_id から導出。
--    security definer だが受取人本人・完了済みを関数内で検証してから insert する。
--    UNIQUE(parcel_id) により二重評価は DB 側でもエラーになる。
-- ---------------------------------------------------------------------------
create or replace function public.create_review(
  p_parcel_id uuid,
  p_rating    int,
  p_comment   text default null
)
returns public.agent_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_agent  uuid;
  v_review public.agent_reviews;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  -- 受取人本人 / 割り当て済み代理人 / 完了済みを満たす荷物から agent_id を導出
  select p.assigned_agent_id
    into v_agent
  from public.parcels p
  where p.id = p_parcel_id
    and p.recipient_id = v_uid
    and p.assigned_agent_id is not null
    and p.status in ('completed', 'handed_to_recipient');

  if v_agent is null then
    raise exception 'parcel not eligible for review';
  end if;

  insert into public.agent_reviews (parcel_id, agent_id, reviewer_id, rating, comment)
  values (p_parcel_id, v_agent, v_uid, p_rating, nullif(btrim(p_comment), ''))
  returning * into v_review;

  return v_review;
end;
$$;

comment on function public.create_review is
  '完了済み荷物に対し受取人が代理人を評価。agent_id は parcels.assigned_agent_id から導出（任意指定不可）。1荷物1評価。';

-- ---------------------------------------------------------------------------
-- 4. RPC: get_agent_rating
--    代理人の平均評価（avg::numeric）と件数を返す。集計のため security definer。
-- ---------------------------------------------------------------------------
create or replace function public.get_agent_rating(
  p_agent_id uuid
)
returns table (
  avg_rating   numeric,
  review_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    avg(r.rating)::numeric as avg_rating,
    count(*)::int          as review_count
  from public.agent_reviews r
  where r.agent_id = p_agent_id;
$$;

comment on function public.get_agent_rating is
  '代理人の平均評価(avg::numeric)と件数を返す。評価0件なら avg_rating は null。';

-- ---------------------------------------------------------------------------
-- 5. 既存 get_agent_locations の拡張（CREATE OR REPLACE）
--    ★元の get_agent_locations 定義はリポジトリ内に見当たらないため、推薦RPC
--      (get_recommendation_candidates) の列構成と features/parcels.ts の戻り型から
--      再構成している。適用前に実DBの元定義を pg_get_functiondef 等で確認し、
--      元の戻り列（user_id/full_name/address/address_detail/latitude/longitude/
--      available_days/start_time/end_time/level/completed_deliveries）を維持したまま
--      avg_rating / review_count の追加分のみをマージすること。
-- ---------------------------------------------------------------------------
create or replace function public.get_agent_locations()
returns table (
  user_id              uuid,
  full_name            text,
  address              text,
  address_detail       text,
  latitude             double precision,
  longitude            double precision,
  available_days       text[],
  start_time           time,
  end_time             time,
  level                integer,
  completed_deliveries integer,
  avg_rating           numeric,
  review_count         integer
)
language sql
stable
set search_path = public
as $$
  select
    ap.user_id,
    pr.full_name,
    ap.address,
    ap.address_detail,
    st_y(ap.location::geometry)          as latitude,
    st_x(ap.location::geometry)          as longitude,
    ap.available_days,
    ap.start_time,
    ap.end_time,
    coalesce(ap.level, 1)                as level,
    coalesce(ap.completed_deliveries, 0) as completed_deliveries,
    rev.avg_rating                       as avg_rating,
    coalesce(rev.review_count, 0)        as review_count
  from public.agent_profiles ap
  join public.profiles pr on pr.id = ap.user_id
  left join (
    select agent_id,
           avg(rating)::numeric as avg_rating,
           count(*)::int        as review_count
    from public.agent_reviews
    group by agent_id
  ) rev on rev.agent_id = ap.user_id
  where ap.location is not null;
$$;

comment on function public.get_agent_locations is
  '代理人の位置・対応条件・実績に加え、平均評価(avg_rating)/評価件数(review_count)を返す。';

-- =============================================================================
-- ★未適用: このマイグレーションは作成のみ。レビュー後に手動適用すること。
--   - DB へ未適用（supabase db push / apply_migration は未実行）。
--   - get_agent_locations は実DBの元定義を確認の上、追加2列のみをマージして適用。
-- =============================================================================
