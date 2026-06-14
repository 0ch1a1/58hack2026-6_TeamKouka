-- =============================================================================
-- assign_agent_to_parcel: 配達員(delivery_company ロール)も代理人割当を実行できるよう
-- 権限チェックを緩和する。
--
-- 背景（本物のバグ）:
--   delivery_matches を作る唯一の経路が本RPCだが、従来は
--     if v_parcel.recipient_id is distinct from auth.uid() then raise ...
--   で「受取人本人」しか呼べなかった。ところが実際にこのRPCを呼ぶのは配達員
--   （ShareKeep/app/(app)/driver/agents.tsx の assignAgentToParcel）であり、
--   配達員の auth.uid() は recipient_id と一致しないため毎回 'not allowed' で失敗。
--   結果 delivery_matches が永遠に作られず、代理人の請負リストが空・
--   'agent_assigned' 通知（代理受取の依頼）も飛ばなかった。
--
-- 変更点は権限チェックの1箇所のみ。
--   match 生成 / parcels の status・assigned_agent_id 更新 / status 履歴 /
--   create_notification（代理人への agent_assigned 通知）は従来と完全に同一。
--
-- 注意（デモ妥当・本番要強化）:
--   delivery_companies に user 紐付け列が無いため、ここでは
--   「delivery_company ロールなら誰でも割当可」という粒度に留める。
--   本番では parcel.delivery_company_id と配達員アカウントの所属を突き合わせて
--   スコープを絞ること。
-- =============================================================================

create or replace function public.assign_agent_to_parcel(
  p_parcel_id uuid,
  p_agent_id uuid,
  p_distance_meters double precision default null::double precision
)
returns delivery_matches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parcel public.parcels;
  v_match public.delivery_matches;
begin
  select *
  into v_parcel
  from public.parcels
  where id = p_parcel_id;

  if not found then
    raise exception 'parcel not found';
  end if;

  -- 受取人本人、または delivery_company ロール（配達員）であれば割当を許可する。
  if v_parcel.recipient_id is distinct from auth.uid()
     and not exists (
       select 1
       from public.profiles
       where id = auth.uid()
         and role = 'delivery_company'
     )
  then
    raise exception 'not allowed to assign agent for this parcel';
  end if;

  if not exists (
    select 1
    from public.agent_profiles ap
    where ap.user_id = p_agent_id
  ) then
    raise exception 'agent profile not found';
  end if;

  insert into public.delivery_matches(parcel_id, recipient_id, agent_id, distance_meters, status)
  values(p_parcel_id, v_parcel.recipient_id, p_agent_id, p_distance_meters, 'selected')
  returning * into v_match;

  update public.parcels
  set
    assigned_agent_id = p_agent_id,
    status = 'agent_assigned',
    updated_at = now()
  where id = p_parcel_id;

  insert into public.parcel_status_histories(parcel_id, old_status, new_status)
  values(p_parcel_id, v_parcel.status::text, 'agent_assigned');

  perform public.create_notification(
    p_agent_id,
    p_parcel_id,
    'agent_assigned',
    '代理受取の依頼が届きました',
    '荷物の代理受取に選択されました。内容を確認してください。',
    jsonb_build_object(
      'parcel_id', p_parcel_id,
      'recipient_id', v_parcel.recipient_id,
      'distance_meters', p_distance_meters,
      'tracking_no', v_parcel.tracking_no
    )
  );

  return v_match;
end;
$function$;
