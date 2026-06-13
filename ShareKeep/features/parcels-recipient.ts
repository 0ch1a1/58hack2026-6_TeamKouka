import { supabase } from '../lib/supabase'
import type { Parcel } from './parcels-types'

// 受取人（recipient）向けの parcel API。

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

// 単一 parcel を id で取得（一覧の全件取得→filter を避けるための軽量版）
export async function fetchParcel(parcelId: string) {
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
    .eq('id', parcelId)
    .maybeSingle()

  if (error) throw error
  return data as unknown as Parcel | null
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
