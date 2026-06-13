import { supabase } from '../lib/supabase'
import type { AppNotification, NearbyAgent } from './parcels-types'

// 代理人（agent）・配送会社管理・通知まわりの parcel API。

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
    // 評価機能（F-REVIEW-01）。RPC 側は migration 20260613150100 で対応。
    // 評価0件の代理人は avg_rating が null。一覧で集約し N+1 を避ける。
    avg_rating: number | null
    review_count: number
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
