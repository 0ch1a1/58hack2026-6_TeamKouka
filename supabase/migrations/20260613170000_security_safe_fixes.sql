-- =============================================================================
-- セキュリティ強化（安全3点）— security-hardening-plan.md のうち低リスク部分のみ。
--   B: grant_agent_points を内部専用化（authenticated から EXECUTE 剥奪）
--   D: consume_agent_points に本人ガード追加
--   get_agent_locations の anon 素通り修正 ＋ anon の EXECUTE 剥奪
--
-- 実DB検証済み（2026-06-13, project zbmrmblakoszzecdnptn）:
--   * grant_agent_points  : auth.uid ガード無し / acl: authenticated=X（＝権限昇格）
--   * consume_agent_points: 本人ガード無し / acl: authenticated=X（＝他人残高ドレイン）
--   * get_agent_locations : acl に anon=X、かつ `auth.uid() is not null and ...` のため
--                           未認証(auth.uid() is null)だと raise を通過し全代理人PIIを返す
--   * verify_recipient_qr : SECURITY DEFINER(owner=postgres) で grant_agent_points を
--                           内部呼び出し → B の revoke 後も QR完了→ポイント付与は継続
--   * クライアント(ShareKeep)は grant_agent_points を直接呼ばない（revoke 安全）
--
-- 本migrationに含めない（別途・要影響評価）:
--   A（agent_profiles の SELECT が qual:true ＝全公開）… RLS絞りは pickup-ready 等に影響
--   C（QR検証の TOCTOU 原子化）… デモ最重要経路の書き換えのため見送り
-- =============================================================================

-- ---------------------------------------------------------------------------
-- B: grant_agent_points は verify_recipient_qr(DEFINER/postgres) からのみ呼ぶ内部関数。
--    クライアント(authenticated)からの直接実行を禁止し、自己ポイント付与を封じる。
--    （anon は元々 EXECUTE 無し。service_role / postgres は保持＝内部呼び出し継続）
-- ---------------------------------------------------------------------------
revoke execute on function public.grant_agent_points(uuid, integer) from authenticated;

-- ---------------------------------------------------------------------------
-- D: consume_agent_points に本人ガード。リワード消費は代理人本人の操作なので、
--    service_role(信頼サーバ)はバイパス、それ以外は auth.uid() = p_agent_id のみ許可。
--    （関数本体は現行定義を踏襲し、先頭にガードのみ追加）
-- ---------------------------------------------------------------------------
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
  -- 本人 or service_role のみ（他人のポイントを消費する嫌がらせを防ぐ）
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_agent_id) then
    raise exception 'not authorized to consume another agent''s points';
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

-- ---------------------------------------------------------------------------
-- get_agent_locations: delivery_company 専用のはずが、未認証(auth.uid() is null)だと
--   `auth.uid() is not null and v_role <> 'delivery_company'` が偽になり raise を通過、
--   全代理人の氏名・住所・座標を返してしまう。条件を是正し anon を一律拒否。
--   （本体は現行定義を踏襲し、判定行のみ修正）
-- ---------------------------------------------------------------------------
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

  -- delivery_company 以外（未認証 anon を含む）は拒否
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

-- 多層防御: get_agent_locations は delivery_company 専用。anon の EXECUTE を剥奪。
revoke execute on function public.get_agent_locations() from anon;
