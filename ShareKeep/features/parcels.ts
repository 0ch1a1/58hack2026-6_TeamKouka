import { supabase } from '../lib/supabase'
import type { ParcelStatus } from '../lib/database.types'

// バックエンド連携層（移植）。全 API を一括移植している。
// STAGE B(Wave1〜2) で実際に使うのは:
//   createParcel / fetchMyParcels / subscribeParcel / matchNearbyAgent /
//   findNearbyAgents / updateParcelStatus / generateQrToken / verifyRecipientQr /
//   verifyAgentQr / geocodeAgentAddress / fetchMyNotifications / markNotificationRead
// 下記は B 計画(Wave1)では未参照・B以降/将来用（消さず残置）:
//   createDeliveryCompany / updateDeliveryCompany / deleteDeliveryCompany /
//   listDeliveryCompanies / getAgentLocations / consumeAgentPoints /
//   recordAgentDeliveryCompletion / assignAgentToParcel / upsertAgentProfile

// ParcelStatus は database.types.ts を唯一の正とする（A4）
export type { ParcelStatus }

export type Parcel = {
  id: string
  tracking_no: string
  recipient_id?: string | null
  delivery_company_id?: string | null
  assigned_agent_id?: string | null
  status: ParcelStatus | string
  retry_count?: number | null
  co2_saved_kg?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  // fetchMyParcels の JOIN で取得する表示名（A3拡張）
  delivery_companies?: { name: string } | null
  assigned_agent?: { full_name: string | null } | null
}

export type NearbyAgent = {
  user_id: string
  address: string
  address_detail: string | null
  distance_meters: number
}

export type AppNotification = {
  id: string
  user_id: string
  parcel_id: string | null
  notification_type: string
  title: string
  body: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export async function createParcel(params: {
  recipientId: string
  deliveryCompanyId: string
}) {
  const { data, error } = await supabase.rpc('create_parcel', {
    p_recipient_id: params.recipientId,
    p_delivery_company_id: params.deliveryCompanyId,
  })

  if (error) throw error
  return data as Parcel
}

export async function fetchMyParcels(userId: string) {
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
      assigned_agent:profiles!assigned_agent_id(full_name)
    `,
    )
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  // Supabase は to-one 埋め込み（delivery_companies / assigned_agent）を実行時は
  // 単一オブジェクトで返すが、生成型なしでは配列推論になるため unknown 経由でキャスト
  return data as unknown as Parcel[]
}

export async function updateParcelStatus(parcelId: string, status: ParcelStatus) {
  const { error } = await supabase.rpc('update_parcel_status', {
    p_parcel_id: parcelId,
    p_status: status,
  })

  if (error) throw error
}

export async function generateQrToken(params: {
  parcelId: string
  userId: string
  qrType: 'agent' | 'recipient'
}) {
  const { data, error } = await supabase.rpc('generate_qr_token', {
    p_parcel_id: params.parcelId,
    p_user_id: params.userId,
    p_qr_type: params.qrType,
  })

  if (error) throw error
  return data as string
}

export async function verifyAgentQr(token: string) {
  const { data, error } = await supabase.functions.invoke('verify-agent-qr', {
    body: { token },
  })

  if (error) {
    throw new Error(getFunctionErrorMessage(error, data))
  }

  if (isFunctionFailure(data)) {
    throw new Error(String(data.error ?? 'Agent QR verification failed'))
  }

  return data as { success: boolean; error?: unknown }
}

export async function verifyRecipientQr(token: string) {
  const { data, error } = await supabase.functions.invoke('verify-recipient-qr', {
    body: { token },
  })

  if (error) {
    throw new Error(getFunctionErrorMessage(error, data))
  }

  if (isFunctionFailure(data)) {
    throw new Error(String(data.error ?? 'Recipient QR verification failed'))
  }

  return data as { success: boolean; error?: unknown }
}

function isFunctionFailure(data: unknown): data is { success: false; error?: unknown } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    (data as { success?: unknown }).success === false
  )
}

function getFunctionErrorMessage(error: unknown, data: unknown) {
  if (data && typeof data === 'object' && 'error' in data) {
    return String((data as { error: unknown }).error)
  }

  if (error instanceof Error) return error.message

  return String(error)
}

export async function findNearbyAgents(params: {
  latitude: number
  longitude: number
  radiusMeters?: number
  targetAt?: string
}) {
  const { data, error } = await supabase.rpc('find_nearby_agents', {
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_radius_m: params.radiusMeters ?? 50,
    p_target_at: params.targetAt ?? new Date().toISOString(),
  })

  if (error) throw error
  return data as NearbyAgent[]
}

export async function upsertAgentProfile(params: {
  userId: string
  address: string
  addressDetail?: string
  latitude: number
  longitude: number
  availableDays?: string[]
  startTime?: string
  endTime?: string
}) {
  const { data, error } = await supabase.rpc('upsert_agent_profile', {
    p_user_id: params.userId,
    p_address: params.address,
    p_address_detail: params.addressDetail ?? null,
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_available_days: params.availableDays ?? null,
    p_start_time: params.startTime ?? null,
    p_end_time: params.endTime ?? null,
  })

  if (error) throw error
  return data
}

export async function matchNearbyAgent(params: {
  parcelId: string
  latitude: number
  longitude: number
  radiusMeters?: number
  targetAt?: string
}) {
  const { data, error } = await supabase.rpc('match_nearby_agent', {
    p_parcel_id: params.parcelId,
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_radius_m: params.radiusMeters ?? 50,
    p_target_at: params.targetAt ?? new Date().toISOString(),
  })

  if (error) throw error
  return data
}

export async function assignAgentToParcel(params: {
  parcelId: string
  agentId: string
  distanceMeters?: number | null
}) {
  const { data, error } = await supabase.rpc('assign_agent_to_parcel', {
    p_parcel_id: params.parcelId,
    p_agent_id: params.agentId,
    p_distance_meters: params.distanceMeters ?? null,
  })

  if (error) throw error
  return data
}

export async function consumeAgentPoints(params: {
  agentId: string
  points: number
  transactionType?: string
}) {
  const { data, error } = await supabase.rpc('consume_agent_points', {
    p_agent_id: params.agentId,
    p_points: params.points,
    p_transaction_type: params.transactionType ?? 'reward_redeem',
  })

  if (error) throw error
  return data as number
}

export async function geocodeAgentAddress(params: {
  userId: string
  address: string
  addressDetail?: string
  availableDays?: string[]
  startTime?: string
  endTime?: string
}) {
  const { data, error } = await supabase.functions.invoke('geocode-agent-address', {
    body: {
      userId: params.userId,
      address: params.address,
      addressDetail: params.addressDetail ?? null,
      availableDays: params.availableDays ?? null,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
    },
  })

  if (error) throw error
  return data as {
    success: boolean
    address?: string
    addressDetail?: string | null
    latitude?: number
    longitude?: number
    profile?: unknown
    error?: string
  }
}

export async function getAgentLocations() {
  const { data, error } = await supabase.rpc('get_agent_locations')

  if (error) throw error
  return data as Array<{
    user_id: string
    full_name: string
    address: string
    address_detail: string | null
    latitude: number
    longitude: number
    available_days: string[] | null
    start_time: string | null
    end_time: string | null
    level: number
    completed_deliveries: number
  }>
}

export async function createDeliveryCompany(name: string) {
  const { data, error } = await supabase.rpc('create_delivery_company', {
    p_name: name,
  })

  if (error) throw error
  return data
}

export async function updateDeliveryCompany(companyId: string, name: string) {
  const { data, error } = await supabase.rpc('update_delivery_company', {
    p_company_id: companyId,
    p_name: name,
  })

  if (error) throw error
  return data
}

export async function deleteDeliveryCompany(companyId: string) {
  const { data, error } = await supabase.rpc('delete_delivery_company', {
    p_company_id: companyId,
  })

  if (error) throw error
  return data as boolean
}

export async function listDeliveryCompanies() {
  const { data, error } = await supabase.rpc('list_delivery_companies')

  if (error) throw error
  return data as Array<{
    id: string
    name: string
    created_at: string
  }>
}

export async function fetchMyNotifications(userId: string) {
  // RLS 頼みにせず user_id を明示フィルタ（fetchMyParcels と対称・防御的）
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as AppNotification[]
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  })

  if (error) throw error
  return data
}

export async function recordAgentDeliveryCompletion(agentId: string) {
  const { data, error } = await supabase.rpc('record_agent_delivery_completion', {
    p_agent_id: agentId,
  })

  if (error) throw error
  return data
}

// 注意: parcelId は呼び出し側で UUID 形式を保証すること（filter に文字列補間するため）。
export function subscribeParcel(parcelId: string, onChange: () => void) {
  const channel = supabase
    .channel(`parcel:${parcelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'parcels',
        filter: `id=eq.${parcelId}`,
      },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
