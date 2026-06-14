-- 注: full_name はライブDBの実データに合わせて要調整。該当行が無ければ統合時に対象を確認する。
-- =============================================================================
-- デモ用スポット属性シード（冪等 / 再実行安全）
--   agent_profiles.user_id は profiles(id) を参照し、表示名(full_name)は profiles 側にある。
--   そのため profiles.full_name で対象代理人を特定して agent_profiles を UPDATE する。
--   各 UPDATE は値を上書きするだけなので何度実行しても結果は同じ（冪等）。
-- =============================================================================

-- 山田さん宅: 個人宅 / 最大2・現在1（空き1）/ 承認済 / 本日可 / 18:00-22:00
update public.agent_profiles ap
set spot_type             = 'individual',
    max_storage_count     = 2,
    current_storage_count = 1,
    review_status         = 'approved',
    is_available_today    = true,
    start_time            = time '18:00',
    end_time              = time '22:00'
from public.profiles pr
where pr.id = ap.user_id
  and pr.full_name = '山田さん宅';

-- みどり商店: 店舗 / 最大5・現在3（空き2）/ 承認済 / 本日可 / 18:00-21:00
update public.agent_profiles ap
set spot_type             = 'store',
    max_storage_count     = 5,
    current_storage_count = 3,
    review_status         = 'approved',
    is_available_today    = true,
    start_time            = time '18:00',
    end_time              = time '21:00'
from public.profiles pr
where pr.id = ap.user_id
  and pr.full_name = 'みどり商店';

-- さくら管理人室: 管理人室 / 最大3・現在2（空き1）/ 承認済 / 本日可 / 09:00-18:00
update public.agent_profiles ap
set spot_type             = 'manager_room',
    max_storage_count     = 3,
    current_storage_count = 2,
    review_status         = 'approved',
    is_available_today    = true,
    start_time            = time '09:00',
    end_time              = time '18:00'
from public.profiles pr
where pr.id = ap.user_id
  and pr.full_name = 'さくら管理人室';

-- コワーキングA: 施設 / 最大10・現在6（空き4）/ 承認済 / 本日可 / 10:00-22:00
update public.agent_profiles ap
set spot_type             = 'facility',
    max_storage_count     = 10,
    current_storage_count = 6,
    review_status         = 'approved',
    is_available_today    = true,
    start_time            = time '10:00',
    end_time              = time '22:00'
from public.profiles pr
where pr.id = ap.user_id
  and pr.full_name = 'コワーキングA';
