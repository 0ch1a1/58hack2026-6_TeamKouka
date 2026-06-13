import { supabase } from '../lib/supabase'

export type ParcelStatus =
  | 'created'
  | 'out_for_delivery'
  | 'delivery_failed'
  | 'agent_assigned'
  | 'delivered_to_agent'
  | 'handed_to_recipient'
  | 'completed'

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
      updated_at
    `,
    )
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Parcel[]
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

  if (error) throw error
  return data as { success: boolean; error?: unknown }
}

export async function verifyRecipientQr(token: string) {
  const { data, error } = await supabase.functions.invoke('verify-recipient-qr', {
    body: { token },
  })

  if (error) throw error
  return data as { success: boolean; error?: unknown }
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

export async function fetchMyNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
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
