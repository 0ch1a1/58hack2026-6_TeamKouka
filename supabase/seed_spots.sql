-- =============================================================================
-- デモ用スポット属性シード（冪等 / 再実行安全）
-- =============================================================================
-- 目的:
--   recommendation-service は候補の spot_type='individual' を「個人NG設定」で除外し、
--   フロントは「除外された候補」セクションに理由を表示する。本番DBの代理人は全員
--   spot_type='store'（列デフォルト）のため除外が発火せずデモが成立しない。
--   本ファイルで実在の代理人に個人/店舗/施設/管理人室を割り当て、除外と順位付けを再現する。
--
-- 安定キー:
--   profiles.full_name はデモ名へ書き換えるため WHERE 条件には使えない（再実行で壊れる）。
--   employee_id は全員 NULL。よって安定キーは auth.users.email を採用する。
--   email は 'sharekeep-seed-agent-N@example.com' で固定（読み取り確認済み）。
--   agent_profiles.user_id = profiles.id = auth.users.id の関係で結合する。
--   ※ profiles.full_name の書き換えも同じ email キーで特定するため冪等。
--
-- CHECK制約（確認済み・本ファイルは全行これを満たす）:
--   spot_type     ∈ (store, facility, manager_room, individual)
--   review_status ∈ (pending_review, approved, rejected, suspended)
--   0 <= current_storage_count <= max_storage_count
--
-- recommendation-service のハードフィルタ判定順（recommendation_service.py）:
--   1) review_status が approved 以外     → 除外
--   2) is_available_today = false          → 除外
--   3) current >= max（空き枠なし）        → 除外
--   4) spot_type='individual' かつ個人NG   → 除外（本デモの見せ場）
--
-- -----------------------------------------------------------------------------
-- エージェント → スポット割り当て表
-- -----------------------------------------------------------------------------
-- email (安定キー)                       | 表示名(full_name)   | spot_type    | max/cur(空き) | 受取時間     | デモ上の役割
-- sharekeep-seed-agent-1@example.com    | 山田さん宅          | individual   | 2/1 (空1)     | 18:00-22:00 | 個人NGで除外（主役）
-- sharekeep-seed-agent-2@example.com    | みどり商店          | store        | 5/3 (空2)     | 18:00-21:00 | 有力候補
-- sharekeep-seed-agent-3@example.com    | さくら管理人室      | manager_room | 3/2 (空1)     | 09:00-18:00 | 候補
-- sharekeep-seed-agent-4@example.com    | グリーンコワーキング| facility     | 10/6 (空4)    | 10:00-22:00 | 候補（空き多）
-- sharekeep-seed-agent-5@example.com    | 駅前ロッカー店      | store        | 4/4 (満枠)    | 08:00-18:00 | 空き枠なしで除外
-- sharekeep-seed-agent-6@example.com    | ひまわり薬局        | store        | 5/2 (空3)     | 10:00-22:00 | 候補
-- sharekeep-seed-agent-7@example.com    | きたまちカフェ      | facility     | 6/1 (空5)     | 07:00-19:00 | 候補
-- sharekeep-seed-agent-8@example.com    | おとなり個人宅      | individual   | 1/0 (空1)     | 00:00-23:59 | 個人NGで除外（2人目）
--   ※ 'T'(test@test.com) は recipient のため対象外。
--
-- -----------------------------------------------------------------------------
-- 適用コマンド例（本番への適用は別途承認のうえ実行すること）:
--   # Supabase CLI 経由:
--   supabase db execute --file supabase/seed_spots.sql
--   # もしくは psql 直叩き:
--   psql "$DATABASE_URL" -f supabase/seed_spots.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) 表示名(profiles.full_name) をデモ名へ。安定キー = auth.users.email。
-- -----------------------------------------------------------------------------
update public.profiles pr
set full_name = v.full_name
from (values
    ('sharekeep-seed-agent-1@example.com', '山田さん宅'),
    ('sharekeep-seed-agent-2@example.com', 'みどり商店'),
    ('sharekeep-seed-agent-3@example.com', 'さくら管理人室'),
    ('sharekeep-seed-agent-4@example.com', 'グリーンコワーキング'),
    ('sharekeep-seed-agent-5@example.com', '駅前ロッカー店'),
    ('sharekeep-seed-agent-6@example.com', 'ひまわり薬局'),
    ('sharekeep-seed-agent-7@example.com', 'きたまちカフェ'),
    ('sharekeep-seed-agent-8@example.com', 'おとなり個人宅')
) as v(email, full_name)
join auth.users au on au.email = v.email
where pr.id = au.id;

-- -----------------------------------------------------------------------------
-- 2) スポット属性(agent_profiles) を一括 UPDATE。安定キー = auth.users.email。
--    値を上書きするだけなので再実行しても結果は同じ（冪等）。
-- -----------------------------------------------------------------------------
update public.agent_profiles ap
set spot_type             = v.spot_type,
    max_storage_count     = v.max_storage_count,
    current_storage_count = v.current_storage_count,
    review_status         = 'approved',
    is_available_today    = true,
    start_time            = v.start_time,
    end_time              = v.end_time
from (values
    -- email,                                 spot_type,      max, cur, start,       end
    ('sharekeep-seed-agent-1@example.com', 'individual',     2,   1, time '18:00', time '22:00'),
    ('sharekeep-seed-agent-2@example.com', 'store',          5,   3, time '18:00', time '21:00'),
    ('sharekeep-seed-agent-3@example.com', 'manager_room',   3,   2, time '09:00', time '18:00'),
    ('sharekeep-seed-agent-4@example.com', 'facility',      10,   6, time '10:00', time '22:00'),
    ('sharekeep-seed-agent-5@example.com', 'store',          4,   4, time '08:00', time '18:00'),
    ('sharekeep-seed-agent-6@example.com', 'store',          5,   2, time '10:00', time '22:00'),
    ('sharekeep-seed-agent-7@example.com', 'facility',       6,   1, time '07:00', time '19:00'),
    ('sharekeep-seed-agent-8@example.com', 'individual',     1,   0, time '00:00', time '23:59')
) as v(email, spot_type, max_storage_count, current_storage_count, start_time, end_time)
join auth.users au on au.email = v.email
where ap.user_id = au.id;

-- -----------------------------------------------------------------------------
-- 3) 適用結果の確認（読み取り専用・任意）。
-- -----------------------------------------------------------------------------
-- select pr.full_name, ap.spot_type, ap.current_storage_count, ap.max_storage_count,
--        ap.review_status, ap.is_available_today, ap.start_time, ap.end_time
-- from public.agent_profiles ap
-- join public.profiles pr on pr.id = ap.user_id
-- join auth.users au on au.id = ap.user_id
-- where au.email like 'sharekeep-seed-agent-%@example.com'
-- order by au.email;

commit;
