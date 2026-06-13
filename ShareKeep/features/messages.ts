import { supabase } from '../lib/supabase'

// 荷物ごとのメッセージ（受取人 ⇆ 代理人）連携層。
// 型は lib/database.types.ts を触らず、features/parcels.ts の AppNotification パターンに倣い
// このファイル内で定義する（migration の handover_messages テーブルに対応）。

export type HandoverMessage = {
  id: string
  parcel_id: string
  sender_id: string
  body: string
  created_at: string
}

// メッセージ送信。sender_id は auth.getUser() の id を使う（RLS の with check と整合）。
export async function sendMessage(parcelId: string, body: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ログインが必要です')

  const { data, error } = await supabase
    .from('handover_messages')
    .insert({ parcel_id: parcelId, sender_id: user.id, body })
    .select()
    .single()

  if (error) throw error
  return data as HandoverMessage
}

// 荷物のメッセージ一覧（created_at 昇順）。
export async function fetchMessages(parcelId: string) {
  const { data, error } = await supabase
    .from('handover_messages')
    .select('*')
    .eq('parcel_id', parcelId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as HandoverMessage[]
}

// 注意: parcelId は呼び出し側で UUID 形式を保証すること（filter に文字列補間するため）。
// subscribeParcel（features/parcels.ts）を踏襲。
export function subscribeMessages(parcelId: string, onChange: () => void) {
  const channel = supabase
    .channel(`handover_messages:${parcelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'handover_messages',
        filter: `parcel_id=eq.${parcelId}`,
      },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
