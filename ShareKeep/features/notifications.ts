import { supabase } from '../lib/supabase'
// 既存の通知 API は features/parcels.ts にあるため import して再利用する。
// （parcels.ts は編集禁止のため、新規関数のみここに追加し、既存分は re-export する。）
import {
  fetchMyNotifications,
  markNotificationRead,
  type AppNotification,
} from './parcels'

export { fetchMyNotifications, markNotificationRead }
export type { AppNotification }

// 未読件数。RPC 側で auth.uid() を使うため引数なし（クライアント渡しの userId を信用しない）。
export async function getUnreadNotificationCount() {
  const { data, error } = await supabase.rpc('get_unread_notification_count')

  if (error) throw error
  return (data ?? 0) as number
}

// 自分の未読通知を全て既読化。既読化した件数を返す。
export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_notifications_read')

  if (error) throw error
  return (data ?? 0) as number
}

// notifications テーブルの Realtime 購読（subscribeParcel を踏襲）。
// 注意: userId は呼び出し側で UUID 形式を保証すること（filter に文字列補間するため）。
// key: ベル(ホーム)と一覧画面が同名チャンネルを同時購読して衝突しないよう用途別に分ける
//      （例: 'bell' / 'list'）。
export function subscribeNotifications(userId: string, onChange: () => void, key = 'default') {
  const channel = supabase
    .channel(`notifications:${key}:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
