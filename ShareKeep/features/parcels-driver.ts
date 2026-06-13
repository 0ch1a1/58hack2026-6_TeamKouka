import { supabase } from '../lib/supabase'
import type { DriverParcel, ParcelStatus } from './parcels-types'

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
  // 生成型なしでは配列推論になるため unknown 経由でキャスト（fetchMyParcels と同様）。
  return data as unknown as DriverParcel[]
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
