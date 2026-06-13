-- セキュリティ強化（P4-2）: 入力最大長を DB CHECK でサーバ強制
-- 計画: maki-docs/security-hardening-plan.md（P4-2）
-- 背景: 最大長はクライアント(features/messages.ts=1000, features/reviews.ts=500)で検証済みだが、
--   PostgREST 直叩きでバイパス可能。最終防衛線として DB 側にも上限を入れる。
-- 適用前確認(2026-06-13, read-only):
--   handover_messages: 0 行 / 既存 CHECK は body>0 のみ。agent_reviews: 0 行 / 既存 CHECK は rating 1-5 のみ。
--   → 既存行違反なし。最大長 CHECK を新規追加しても安全。
-- 値の根拠: クライアントは trim 後の値で検証し trim 後の値を保存するため、保存値の char_length は
--   本文 ≤ 1000 / コメント ≤ 500 に収まる。DB 側も同値で揃える（comment は NULL 許容）。
-- 適用方法: db push は履歴不一致のため不可。Supabase Dashboard → SQL Editor で直接実行。

alter table public.handover_messages
  add constraint handover_messages_body_max_len check (char_length(body) <= 1000);

alter table public.agent_reviews
  add constraint agent_reviews_comment_max_len check (comment is null or char_length(comment) <= 500);
