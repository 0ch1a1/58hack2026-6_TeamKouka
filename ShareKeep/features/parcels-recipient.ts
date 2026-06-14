import { supabase } from '../lib/supabase'
import { toOne } from './parcels-types'
import type { Embed, Parcel } from './parcels-types'

// Supabase の生の parcels 行型。to-one 埋め込み（delivery_companies / assigned_agent）は
// 生成型なしでは配列推論されるため Embed<T> で受け、toOne で単一化して Parcel に正規化する。
type ParcelRow = Omit<Parcel, 'delivery_companies' | 'assigned_agent'> & {
  delivery_companies: Embed<{ name: string }>
  assigned_agent: Embed<{ full_name: string | null }>
}

// 生の行を Parcel に正規化（埋め込みを toOne で単一化）。実行時は埋め込みが既に単一
// オブジェクトなので toOne は恒等であり、値・null 性を一切変えない no-op 正規化。
const normalizeParcel = (row: ParcelRow): Parcel => ({
  ...row,
  delivery_companies: toOne(row.delivery_companies),
  assigned_agent: toOne(row.assigned_agent),
})

// 受取人（recipient）向けの parcel API。

// 受取人の自宅プロファイル（距離の起点）。recipient_profiles に対応。
export type RecipientHome = {
  address: string | null
  address_detail: string | null
}

export type RecipientCoordinates = {
  latitude: number
  longitude: number
}

// 自宅住所＋座標を保存（距離の起点）。座標はクライアント側（GPS or ジオコーディング）で解決して渡す。
export async function upsertRecipientProfile(params: {
  userId: string
  address: string
  latitude: number
  longitude: number
  addressDetail?: string | null
}) {
  const { error } = await supabase.rpc('upsert_recipient_profile', {
    p_user_id: params.userId,
    p_address: params.address,
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_address_detail: params.addressDetail ?? null,
  })

  if (error) throw error
}

// 登録済みの自宅住所（表示用テキスト）。未登録なら null。RLS により本人の行のみ。
export async function fetchRecipientHome(userId: string): Promise<RecipientHome | null> {
  const { data, error } = await supabase
    .from('recipient_profiles')
    .select('address, address_detail')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as RecipientHome | null) ?? null
}

// 登録済みの自宅座標（距離の起点）。get_recipient_coordinates RPC（lat/lng を返す）経由。
// 未登録なら null。
export async function fetchRecipientCoordinates(
  recipientId: string,
): Promise<RecipientCoordinates | null> {
  const { data, error } = await supabase.rpc('get_recipient_coordinates', {
    p_recipient_id: recipientId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row || row.lat == null || row.lng == null) return null
  return { latitude: Number(row.lat), longitude: Number(row.lng) }
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
      storage_started_at,
      storage_deadline_at,
      created_at,
      updated_at,
      delivery_companies(name),
      assigned_agent:profiles!assigned_agent_id(full_name)
    `,
    )
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  // to-one 埋め込み（delivery_companies / assigned_agent）は実行時は単一オブジェクトだが
  // 生成型なしでは配列推論になる。各行を toOne で単一化して Parcel に正規化する（no-op）。
  return ((data ?? []) as ParcelRow[]).map(normalizeParcel)
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
      storage_started_at,
      storage_deadline_at,
      created_at,
      updated_at,
      delivery_companies(name),
      assigned_agent:profiles!assigned_agent_id(full_name)
    `,
    )
    .eq('id', parcelId)
    .maybeSingle()

  if (error) throw error
  // 単一行版。埋め込みを toOne で単一化して Parcel に正規化（no-op、値・null 性は不変）。
  return data ? normalizeParcel(data as ParcelRow) : null
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

// 距離のみで絞った代理人候補一覧（曜日・時間帯フィルタなし）。受取人の選択UIで使用。
export async function fetchAgentCandidates(params: {
  latitude: number
  longitude: number
  radiusMeters?: number
}): Promise<Array<{ user_id: string; full_name: string | null; distance_meters: number }>> {
  const { data, error } = await supabase.rpc('get_recommendation_candidates', {
    p_lat: params.latitude,
    p_lng: params.longitude,
    p_radius_m: params.radiusMeters ?? 5000,
  })
  if (error) throw error
  return (data ?? []) as Array<{ user_id: string; full_name: string | null; distance_meters: number }>
}

// 代理人ホワイトリストを一括保存し、parcel を agent_assigned 状態に移行する。
// 既存のホワイトリストは全削除してから再挿入（replace semantics）。
export async function setAgentWhitelist(parcelId: string, agentIds: string[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('parcel_agent_whitelist')
    .delete()
    .eq('parcel_id', parcelId)
  if (delErr) throw delErr

  if (agentIds.length > 0) {
    const { error: insErr } = await supabase
      .from('parcel_agent_whitelist')
      .insert(agentIds.map((agentId, i) => ({ parcel_id: parcelId, agent_id: agentId, priority: i + 1 })))
    if (insErr) throw insErr
  }

  const { error: statusErr } = await supabase
    .from('parcels')
    .update({ status: 'agent_assigned' })
    .eq('id', parcelId)
  if (statusErr) throw statusErr
}

// 荷物に設定されたホワイトリストを priority 順で取得する。
export async function fetchParcelWhitelist(
  parcelId: string,
): Promise<{ agent_id: string; priority: number }[]> {
  const { data, error } = await supabase
    .from('parcel_agent_whitelist')
    .select('agent_id, priority')
    .eq('parcel_id', parcelId)
    .order('priority', { ascending: true })
  if (error) throw error
  return data ?? []
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
