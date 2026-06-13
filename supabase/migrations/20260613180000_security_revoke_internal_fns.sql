-- セキュリティ強化（追補）: 内部専用関数の EXECUTE 剥奪
-- 計画: maki-docs/security-hardening-plan.md（P1-2 の残り）
-- 背景: record_agent_delivery_completion / save_co2_reduction は verify_recipient_qr(SECURITY DEFINER)
--   から内部呼び出しされる内部専用関数だが、authenticated に EXECUTE が残っており、
--   REST 経由で任意 agent_id の配達実績カウンタ水増し等が可能（影響は軽微だが衛生上塞ぐ）。
-- 適用前確認(2026-06-13, read-only):
--   record_agent_delivery_completion(uuid)       proacl={authenticated, service_role}（anon無）
--   save_co2_reduction(uuid, integer)            proacl={authenticated, service_role}（anon無）
--   クライアント(app/)からの直接呼び出しは無し（recordAgentDeliveryCompletion ラッパーは未使用）。
--   いずれも verify_recipient_qr から内部呼び出し → DEFINER 実行のため剥奪後も正規フロー継続。
-- 適用方法: db push は履歴不一致のため不可。Supabase Dashboard → SQL Editor で直接実行（B/D と同じ運用）。

revoke execute on function public.record_agent_delivery_completion(uuid) from authenticated;
revoke execute on function public.save_co2_reduction(uuid, integer) from authenticated;
