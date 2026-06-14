-- delivery_matches: 受取人が自分の荷物のマッチを読めるようにする
-- pickup-ready.tsx の getDeliveryMatch が recipient として呼ぶため必要。
-- 既存ポリシー（agent 自身の読み取り）は変更しない。

drop policy if exists delivery_matches_recipient_read on public.delivery_matches;
create policy delivery_matches_recipient_read on public.delivery_matches
  for select
  using (
    exists (
      select 1 from public.parcels p
      where p.id = parcel_id
        and p.recipient_id = auth.uid()
    )
  );
