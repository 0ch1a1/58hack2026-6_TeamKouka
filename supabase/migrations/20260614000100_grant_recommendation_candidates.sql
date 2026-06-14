-- get_recommendation_candidates を認証ユーザーから呼び出せるようにする。
-- 元の migration (20260613160100) では service_role のみに制限されていたため、
-- 受取人の候補取得フローで RPC が失敗していた。
grant execute on function public.get_recommendation_candidates(
  double precision, double precision, integer, text[]
) to authenticated;
