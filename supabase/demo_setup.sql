-- =============================================================================
-- デモ用セットアップ（通し経路: 不在→候補→個人NG除外→みどり商店1位→保管→完了）
--   前提: migration 20260614000000_spot_attributes.sql 適用済み。
--   read-only MCP のため Claude からは適用不可 → Supabase SQL Editor で実行するか
--   MCP を write モードにして適用すること。
--
--   受取人 T (d4890a29-1251-4ff5-a4b6-3c75d910c76c, lat 34.6871894512947 / lng 135.539585102906)
--   を基準に、既存デモ代理人8体のうち4体をナラティブ名へ寄せて再配置する。
--   ST_Project(geography, 距離m, 方位rad) で T からの距離を再現（座標ベタ書き不要）。
--   再実行安全: 代理人は現行名 or 新名のどちらでもマッチさせる。
--
--   ★ 複数端末 Approach A デモ前提:
--     3ロール（受取人T / 代理人みどり商店 / 配達員田中渓都）が同じ実DB行を読み書きする。
--     配達員画面は delivery_company_id だけで荷物を絞り込む（features/parcels-driver.ts）。
--     アプリ定数 DEMO_DELIVERY_COMPANY_ID = 'd98697e6-e71d-463f-9d59-a706817db938'
--     （lib/config.ts）。デモ荷物はこの会社IDで作らないと配達員に表示されない。
--   全体は再実行安全(idempotent)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) クリーンアップ（冪等・安全）
--   整合崩れ: delivery_matches に「受取人T(d4890a29) が agent_id に入った行（ロール衝突）」
--   と「同一 parcel_id の重複行」が存在する。デモ前に掃除する。
--   本番無関係データを巻き込まないよう、対象を以下に限定する:
--     A-1) agent_id が role='recipient' の profile を指す行（= ロール衝突。代理人ではない）
--     A-2) 残った正常行のうち、同一 parcel_id の重複（最古1行だけ残す）
--   ※ DELETE 条件はいずれも「不正/重複」に限定。やりすぎない。
-- -----------------------------------------------------------------------------

-- A-1) ロール衝突: agent_id が recipient ロールを指す delivery_matches を全削除。
--   （代理人は role='agent' のはず。recipient が agent_id に入っているのは不正データ。）
delete from public.delivery_matches dm
using public.profiles p
where dm.agent_id = p.id
  and p.role = 'recipient';

-- A-2) 重複掃除: 同一 parcel_id について最古(created_at 昇順, 同時刻は id)1行だけ残す。
--   A-1 で大半が消えた後の保険。冪等（重複が無ければ no-op）。
delete from public.delivery_matches dm
where dm.id in (
  select id from (
    select id,
           row_number() over (
             partition by parcel_id
             order by created_at asc, id asc
           ) as rn
    from public.delivery_matches
  ) ranked
  where ranked.rn > 1
);

-- -----------------------------------------------------------------------------
-- B) 受取人 T の recipient_profiles を用意（推薦の origin 解決用。get_recipient_coordinates が参照）
-- -----------------------------------------------------------------------------
insert into public.recipient_profiles (user_id, address, location, updated_at)
select 'd4890a29-1251-4ff5-a4b6-3c75d910c76c',
       'デモ拠点（受取人T自宅）',
       st_setsrid(st_makepoint(135.539585102906, 34.6871894512947), 4326)::geography,
       now()
on conflict (user_id) do update
  set location = excluded.location, updated_at = now();

-- T の基準点を一時利用する CTE 代わりに、各 UPDATE 内で T 位置を直接参照する。
-- 方位: 北=0, 東=pi/2≈1.5708, 南=pi≈3.14159, 西=3pi/2≈4.71239

-- 1) みどり商店（店舗 / 650m 東 / 18:00-21:00 / 空き2(5-3)）= 1位想定
update public.agent_profiles ap
set spot_type='store', max_storage_count=5, current_storage_count=3,
    review_status='approved', is_available_today=true,
    start_time=time '18:00', end_time=time '21:00',
    location = st_project(
      st_setsrid(st_makepoint(135.539585102906, 34.6871894512947),4326)::geography,
      650, radians(90))
from public.profiles pr
where pr.id=ap.user_id and pr.full_name in ('ShareKeep Demo Agent 01 Main','みどり商店');
update public.profiles set full_name='みどり商店'
where full_name='ShareKeep Demo Agent 01 Main';

-- 2) 山田さん宅（個人 / 150m 北 / 18:00-22:00 / 空き1(2-1)）= 個人NGで除外想定（最短だが除外）
update public.agent_profiles ap
set spot_type='individual', max_storage_count=2, current_storage_count=1,
    review_status='approved', is_available_today=true,
    start_time=time '18:00', end_time=time '22:00',
    location = st_project(
      st_setsrid(st_makepoint(135.539585102906, 34.6871894512947),4326)::geography,
      150, radians(0))
from public.profiles pr
where pr.id=ap.user_id and pr.full_name in ('ShareKeep Demo Agent 03 Average South','山田さん宅');
update public.profiles set full_name='山田さん宅'
where full_name='ShareKeep Demo Agent 03 Average South';

-- 3) さくら管理人室（管理人室 / 400m 南 / 09:00-18:00 / 空き1(3-2)）= 受取時間外で低順位想定
update public.agent_profiles ap
set spot_type='manager_room', max_storage_count=3, current_storage_count=2,
    review_status='approved', is_available_today=true,
    start_time=time '09:00', end_time=time '18:00',
    location = st_project(
      st_setsrid(st_makepoint(135.539585102906, 34.6871894512947),4326)::geography,
      400, radians(180))
from public.profiles pr
where pr.id=ap.user_id and pr.full_name in ('ShareKeep Demo Agent 05 Weekday Balanced','さくら管理人室');
update public.profiles set full_name='さくら管理人室'
where full_name='ShareKeep Demo Agent 05 Weekday Balanced';

-- 4) コワーキングA（施設 / 1200m 西 / 10:00-22:00 / 空き4(10-6)）= 2位想定
update public.agent_profiles ap
set spot_type='facility', max_storage_count=10, current_storage_count=6,
    review_status='approved', is_available_today=true,
    start_time=time '10:00', end_time=time '22:00',
    location = st_project(
      st_setsrid(st_makepoint(135.539585102906, 34.6871894512947),4326)::geography,
      1200, radians(270))
from public.profiles pr
where pr.id=ap.user_id and pr.full_name in ('ShareKeep Demo Agent 06 Weekend Runner','コワーキングA');
update public.profiles set full_name='コワーキングA'
where full_name='ShareKeep Demo Agent 06 Weekend Runner';

-- 5) 残り4体はデモ候補に出さないため半径外(5km北東)へ退避
update public.agent_profiles ap
set location = st_project(
      st_setsrid(st_makepoint(135.539585102906, 34.6871894512947),4326)::geography,
      5000, radians(45))
from public.profiles pr
where pr.id=ap.user_id
  and pr.full_name in (
    'ShareKeep Demo Agent 02 Off Window',
    'ShareKeep Demo Agent 04 Low History',
    'ShareKeep Demo Agent 07 North Average',
    'ShareKeep Demo Agent 08 Far Reliable');

-- -----------------------------------------------------------------------------
-- 6) 通し用 parcel を T 向けに用意（冪等）
--   ★ delivery_company_id はアプリ定数 d98697e6-... に統一（旧 b82ef944-... はバグ）。
--     配達員画面は会社IDのみで絞り込むため、この会社IDでないと配達員に出ない。
--   開始状態 'created' = 配達員が「配達開始」できる初期状態。
--     通し: created →(配達員:開始) out_for_delivery →(配達員:不在報告) delivery_failed
--          →(受取人:候補選択/whitelist保存・代理人マッチ) agent_assigned
--          →(代理人:受領 / 受取人QRスキャン手前) delivered_to_agent
--          →(受取人:QR提示で受け渡し) handed_to_recipient → completed
--   再実行時は会社ID/状態/代理人クリアを既知の初期値へ巻き戻す（idempotent reset）。
-- -----------------------------------------------------------------------------
insert into public.parcels (tracking_no, recipient_id, delivery_company_id, status)
select 'DEMO-SPOT-0001',
       'd4890a29-1251-4ff5-a4b6-3c75d910c76c',
       'd98697e6-e71d-463f-9d59-a706817db938',
       'created'
where not exists (
  select 1 from public.parcels where tracking_no='DEMO-SPOT-0001'
);

-- 既存の DEMO-SPOT-0001 を初期状態へリセット（再実行安全。会社ID修正もここで反映）。
update public.parcels
set recipient_id='d4890a29-1251-4ff5-a4b6-3c75d910c76c',
    delivery_company_id='d98697e6-e71d-463f-9d59-a706817db938',
    assigned_agent_id=null,
    status='created',
    storage_started_at=null,
    storage_deadline_at=null,
    updated_at=now()
where tracking_no='DEMO-SPOT-0001';

-- 確認用
-- select pr.full_name, ap.spot_type, ap.review_status, ap.is_available_today,
--        ap.max_storage_count, ap.current_storage_count, ap.start_time, ap.end_time,
--        round(st_distance(ap.location, (select location from public.recipient_profiles
--          where user_id='d4890a29-1251-4ff5-a4b6-3c75d910c76c'))) as dist_m
-- from public.agent_profiles ap join public.profiles pr on pr.id=ap.user_id
-- where pr.role='agent' order by dist_m;
--
-- select tracking_no, status, delivery_company_id, assigned_agent_id
-- from public.parcels where tracking_no='DEMO-SPOT-0001';
--
-- select count(*) total, count(*) filter (where p.role='recipient') agent_is_recipient
-- from public.delivery_matches dm left join public.profiles p on p.id=dm.agent_id;
