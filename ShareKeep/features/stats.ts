import { supabase } from '../lib/supabase'
import type { ParcelStatus } from '../lib/database.types'

// 地域貢献カード（機能③）の集計層。画面から supabase.from(...) を直叩きせず
// ここに集約する（features/parcels.ts と同じ方針）。
//
// MVP は「全体集計カード1枚」。地域絞り込み（location 近接 / area_id）は将来枠。
// 実テーブル・実カラムのみ使用（lib/database.types.ts / 実スキーマで裏取り済み）:
//   parcels.status (parcel_status enum) / parcels.co2_saved_kg (numeric)
//   parcels.assigned_agent_id (uuid, nullable)
//
// 完了相当の status は 'completed' と 'handed_to_recipient'（lib/status.ts toUIStatus 準拠）。
const COMPLETED_STATUSES: ParcelStatus[] = ['completed', 'handed_to_recipient']

export type RegionalStats = {
  // 再配達防止件数 = 完了した代理受取の件数
  preventedRedeliveries: number
  // CO2削減kg合計（parcels.co2_saved_kg の合算）
  totalCo2SavedKg: number
  // 協力者数 = 完了荷物に紐づく assigned_agent_id の distinct 件数
  helperCount: number
}

// 全体集計を1回のクエリで取得する。
// RLS 環境下では呼び出し元が参照できる行のみが集計対象になる（防御的に集計はクライアント側で実施）。
export async function fetchRegionalStats(): Promise<RegionalStats> {
  const { data, error } = await supabase
    .from('parcels')
    .select('co2_saved_kg, assigned_agent_id, status')
    .in('status', COMPLETED_STATUSES)

  if (error) throw error

  const rows = (data ?? []) as Array<{
    co2_saved_kg: number | string | null
    assigned_agent_id: string | null
    status: ParcelStatus | string | null
  }>

  let totalCo2SavedKg = 0
  const agents = new Set<string>()
  for (const r of rows) {
    totalCo2SavedKg += Number(r.co2_saved_kg ?? 0)
    if (r.assigned_agent_id) agents.add(r.assigned_agent_id)
  }

  return {
    preventedRedeliveries: rows.length,
    // 浮動小数の累積誤差を抑えるため小数2桁に丸める
    totalCo2SavedKg: Math.round(totalCo2SavedKg * 100) / 100,
    helperCount: agents.size,
  }
}
