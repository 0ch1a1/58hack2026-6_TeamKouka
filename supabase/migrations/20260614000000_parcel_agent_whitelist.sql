-- 受取人が設定する代理人ホワイトリスト。priority 順に配達員へ提示する。
CREATE TABLE IF NOT EXISTS public.parcel_agent_whitelist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id   UUID        NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  agent_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  priority    INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parcel_id, agent_id)
);

ALTER TABLE public.parcel_agent_whitelist ENABLE ROW LEVEL SECURITY;

-- 受取人は自分の荷物のホワイトリストを操作できる
CREATE POLICY "whitelist_recipient_all" ON public.parcel_agent_whitelist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.parcels
      WHERE id = parcel_id AND recipient_id = auth.uid()
    )
  );

-- 認証ユーザー（配達員含む）は読み取り可能
CREATE POLICY "whitelist_authenticated_read" ON public.parcel_agent_whitelist
  FOR SELECT USING (auth.role() = 'authenticated');
