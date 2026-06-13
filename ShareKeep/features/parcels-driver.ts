import { supabase } from '../lib/supabase'
import { toOne } from './parcels-types'
import type { DriverParcel, Embed, ParcelStatus } from './parcels-types'

// Supabase の生の parcels 行型（配達員版）。to-one 埋め込み（delivery_companies /
// recipient / assigned_agent）は生成型なしでは配列推論されるため Embed<T> で受ける。
type DriverParcelRow = Omit<
  DriverParcel,
  'delivery_companies' | 'recipient' | 'assigned_agent'
> & {
  delivery_companies: Embed<{ name: string }>
  recipient: Embed<{ full_name: string | null }>
  assigned_agent: Embed<{ full_name: string | null }>
}

// 生の行を DriverParcel に正規化（埋め込みを toOne で単一化）。実行時は埋め込みが既に
// 単一オブジェクトなので toOne は恒等であり、値・null 性を一切変えない no-op 正規化。
const normalizeDriverParcel = (row: DriverParcelRow): DriverParcel => ({
  ...row,
  delivery_companies: toOne(row.delivery_companies),
  recipient: toOne(row.recipient),
  assigned_agent: toOne(row.assigned_agent),
})

// ===== 配達員（delivery_company）用 =====
// 画面から supabase.from(...) を直叩きせず、ここに集約する（統合方針に合わせる）。

// 配達員リストに出すステータス（completed は既定で除外し、配達導線上の荷物だけ表示）。
const DRIVER_VISIBLE_STATUSES: ParcelStatus[] = [
  'created',
  'out_for_delivery',
  'delivery_failed',
  'agent_assigned',
  'delivered_to_agent',
]

// 配送会社の担当荷物一覧。recipient_id でフィルタする fetchMyParcels の配達員版で、
// delivery_company_id でフィルタし受取人名・代理人名を JOIN で取得する。
export async function fetchDriverParcels(deliveryCompanyId: string) {
  const { data, error } = await supabase
    .from('parcels')
    .select(
      `
      id,
      tracking_no,
      recipient_id,
      delivery_company_id,
      assigned_agent_id,
      status,
      retry_count,
      co2_saved_kg,
      storage_started_at,
      storage_deadline_at,
      created_at,
      updated_at,
      delivery_companies(name),
      recipient:profiles!recipient_id(full_name),
      assigned_agent:profiles!assigned_agent_id(full_name)
    `,
    )
    .eq('delivery_company_id', deliveryCompanyId)
    .in('status', DRIVER_VISIBLE_STATUSES)
    .order('created_at', { ascending: false })

  if (error) throw error
  // to-one 埋め込み（recipient / assigned_agent 等）は実行時単一オブジェクトだが
  // 生成型なしでは配列推論になる。各行を toOne で単一化して正規化する（no-op）。
  return ((data ?? []) as DriverParcelRow[]).map(normalizeDriverParcel)
}

// 配達開始（created → out_for_delivery）。
export async function startDelivery(parcelId: string) {
  await updateParcelStatus(parcelId, 'out_for_delivery')
}

// 不在報告（→ delivery_failed）。代理人マッチングへ進む契機。
export async function reportDeliveryFailed(parcelId: string) {
  await updateParcelStatus(parcelId, 'delivery_failed')
}

export async function updateParcelStatus(parcelId: string, status: ParcelStatus) {
  const { error } = await supabase.rpc('update_parcel_status', {
    p_parcel_id: parcelId,
    p_status: status,
  })

  if (error) throw error
}
