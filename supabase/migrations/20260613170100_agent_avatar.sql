-- 機能7': 代理人の顔写真（任意・オプトアウト可）
-- 代理人が自分の顔写真を任意で登録し、全ログインユーザーが閲覧できる（信頼シグナル）。
-- agent_profiles.SELECT は既に true（全員読める）/ UPDATE は本人のみ のため、
-- avatar_url をここに置けば「全員閲覧・本人登録」が追加RPCなしで成立する。

alter table agent_profiles add column if not exists avatar_url text; -- Storageオブジェクトパス。null=未設定（オプトアウト）

insert into storage.buckets (id, name, public)
  values ('agent-avatars', 'agent-avatars', false)
  on conflict (id) do nothing;

-- 閲覧: 全ログインユーザー（=「全員」、未ログインには署名URLで出ない）。
-- 書込/更新/削除: 本人パス {user_id}/... のみ。
drop policy if exists agent_avatars_read   on storage.objects;
drop policy if exists agent_avatars_insert on storage.objects;
drop policy if exists agent_avatars_update on storage.objects;
drop policy if exists agent_avatars_delete on storage.objects;

create policy agent_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'agent-avatars');
create policy agent_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy agent_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy agent_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
