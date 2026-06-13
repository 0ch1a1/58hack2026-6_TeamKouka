-- セキュリティ強化（最小スコープ: B / D / get_agent_locations）
-- 計画: maki-docs/security-hardening-plan.md
-- スコープ判断: A(agent_profiles PII RLS) と C(QR二重消費の原子化) はデモ事故リスクのため見送り。
--   本migrationは追加的・低リスクで、QR受け渡し・pickup-ready.tsx・find_nearby_agents の経路に非接触。
-- 適用前確認(2026-06-13, read-only):
--   grant_agent_points  : proacl = {authenticated, service_role}（anon無し）。クライアント直接呼び出し口なし＝内部専用。
--   consume_agent_points: proacl = {authenticated, service_role}。parcels.ts:330 でリワード消費に使用＝残す＋本人ガード。
--   get_agent_locations : proacl = {anon, PUBLIC, authenticated, service_role}＝未認証でREST実行可。
--                         `auth.uid() is not null and ...` のため anon が役割チェックを素通りし全代理人の氏名/住所/座標が返る。

-- =============================================================================
-- B: grant_agent_points を内部専用化（verify_recipient_qr(SECURITY DEFINER)経由のみ）
--    内部呼び出しはdefiner(owner)権限で実行されるため、authenticated剥奪後も継続動作する。
revoke execute on function public.grant_agent_points(uuid, integer) from authenticated;

-- =============================================================================
-- D: consume_agent_points に本人ガードを追加（リワード消費はクライアント本人操作なので関数自体は残す）
create or replace function public.consume_agent_points(
  p_agent_id uuid,
  p_points integer,
  p_transaction_type text default 'reward_redeem'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_points integer;
  v_new_points integer;
begin
  -- ★追加: 他人のポイント消費（残高ドレインの嫌がらせ）を防ぐ
  if auth.uid() is null or auth.uid() <> p_agent_id then
    raise exception 'cannot consume points for another user';
  end if;

  if p_points <= 0 then
    raise exception 'points must be positive';
  end if;

  select points
  into v_current_points
  from public.agent_profiles
  where user_id = p_agent_id
  for update;

  if not found then
    raise exception 'agent profile not found';
  end if;

  if v_current_points < p_points then
    raise exception 'insufficient points';
  end if;

  v_new_points := v_current_points - p_points;

  update public.agent_profiles
  set points = v_new_points
  where user_id = p_agent_id;

  insert into public.point_transactions(user_id, points, transaction_type)
  values(p_agent_id, -p_points, p_transaction_type);

  return v_new_points;
end;
$function$;

-- =============================================================================
-- get_agent_locations: anon素通りを是正
--   (1) 役割チェックを `auth.uid() is null or ...` にして未認証を必ず弾く
--   (2) anon / public からEXECUTEを剥奪（delivery_company=authenticated の正規利用は維持）
create or replace function public.get_agent_locations()
returns table(
  user_id uuid,
  full_name text,
  address text,
  address_detail text,
  latitude double precision,
  longitude double precision,
  available_days text[],
  start_time time without time zone,
  end_time time without time zone,
  level integer,
  completed_deliveries integer,
  avg_rating numeric,
  review_count integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.user_role;
begin
  select role
    into v_role
  from public.profiles
  where id = auth.uid();

  -- ★修正: `is not null and` → `is null or`。未認証(anon)を必ず弾く。
  if auth.uid() is null or v_role <> 'delivery_company' then
    raise exception 'only delivery company users can read agent locations';
  end if;

  return query
  select
    ap.user_id,
    p.full_name,
    ap.address,
    ap.address_detail,
    st_y(ap.location::geometry) as latitude,
    st_x(ap.location::geometry) as longitude,
    ap.available_days,
    ap.start_time,
    ap.end_time,
    ap.level,
    ap.completed_deliveries,
    rev.avg_rating,
    coalesce(rev.review_count, 0)::int as review_count
  from public.agent_profiles ap
  join public.profiles p
    on p.id = ap.user_id
  left join (
    select
      agent_id,
      avg(rating)::numeric as avg_rating,
      count(*)::int        as review_count
    from public.agent_reviews
    group by agent_id
  ) rev
    on rev.agent_id = ap.user_id
  where ap.location is not null
  order by
    ap.completed_deliveries desc,
    p.full_name;
end;
$function$;

revoke execute on function public.get_agent_locations() from anon, public;
