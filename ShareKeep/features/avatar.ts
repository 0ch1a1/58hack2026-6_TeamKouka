import { supabase } from '../lib/supabase';

// 機能7': 代理人の顔写真（任意・全員閲覧・本人のみ登録）。
// アバターは非公開バケット `agent-avatars` に `{userId}/avatar.jpg` で保存し、
// agent_profiles.avatar_url にオブジェクトパスを保持する（null=未設定＝オプトアウト）。
// agent_profiles の RLS は SELECT=全員 / UPDATE=本人 のため、本人のみ登録・全員閲覧が成立する。

const BUCKET = 'agent-avatars';
// 署名URLの有効期限（秒）。表示の都度発行するため短めで足りる。
const SIGNED_URL_TTL = 3600;

// 本人パス。Storage の RLS が (foldername(name))[1] = auth.uid() を要求するため userId 先頭。
function avatarPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

// ローカル画像URIを agent-avatars にアップロードし、agent_profiles.avatar_url を更新してパスを返す。
// RN では Blob/File が不安定なため fetch(uri).arrayBuffer() でバイト列を取得して渡す。
export async function uploadAgentAvatar(userId: string, localUri: string): Promise<string> {
  if (!userId) throw new Error('userId is required');
  if (!localUri) throw new Error('localUri is required');

  const res = await fetch(localUri);
  const bytes = await res.arrayBuffer();

  const path = avatarPath(userId);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  // update ではなく upsert にする：プロファイル未保存の新規代理人は agent_profiles 行が
  // まだ無く、update だと 0 行マッチ（エラーなし）で avatar_url が永続化されずリロードで消える。
  // user_id 以外は nullable / default あり（level=1, points=0 等）のため最小ペイロードで安全。
  const { error: updateError } = await supabase
    .from('agent_profiles')
    .upsert({ user_id: userId, avatar_url: path }, { onConflict: 'user_id' });
  if (updateError) throw updateError;

  return path;
}

// オプトアウト。Storage オブジェクトを削除し avatar_url を null に戻す。
export async function removeAgentAvatar(userId: string): Promise<void> {
  if (!userId) throw new Error('userId is required');

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([avatarPath(userId)]);
  if (removeError) throw removeError;

  const { error: updateError } = await supabase
    .from('agent_profiles')
    .update({ avatar_url: null })
    .eq('user_id', userId);
  if (updateError) throw updateError;
}

// 代理人IDの配列から { agentId: 署名URL } を一括取得する（matching 画面等での表示用）。
// avatar_url 未設定や署名失敗分は結果から除外する。空配列は {} を返す。
export async function getAgentAvatarUrls(
  agentIds: string[],
): Promise<Record<string, string>> {
  if (!agentIds || agentIds.length === 0) return {};

  const { data, error } = await supabase
    .from('agent_profiles')
    .select('user_id, avatar_url')
    .in('user_id', agentIds);
  if (error) throw error;

  // パス -> agentId の対応表。署名URL結果をエージェントにひも付け直すため。
  const pathToAgent = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.avatar_url) pathToAgent.set(row.avatar_url, row.user_id);
  }

  const paths = [...pathToAgent.keys()];
  if (paths.length === 0) return {};

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (signError) throw signError;

  const result: Record<string, string> = {};
  for (const item of signed ?? []) {
    if (item.error || !item.signedUrl || !item.path) continue;
    const agentId = pathToAgent.get(item.path);
    if (agentId) result[agentId] = item.signedUrl;
  }
  return result;
}
