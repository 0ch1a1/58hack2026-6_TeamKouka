import { supabase } from '../lib/supabase'
import type { DeliveryLocation } from '../lib/database.types'

export type DeliveryLocationInput = {
  lat: number
  lng: number
  progress: number
}

export type DeliveryLocationSubscriber = (location: DeliveryLocation | null) => void

export function clampDeliveryProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, Math.round(progress)))
}

export async function upsertDeliveryLocation(
  parcelId: string,
  { lat, lng, progress }: DeliveryLocationInput,
) {
  const payload = {
    parcel_id: parcelId,
    lat,
    lng,
    progress: clampDeliveryProgress(progress),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('delivery_locations')
    .upsert(payload, { onConflict: 'parcel_id' })
    .select()
    .single()

  if (error) throw error
  return data as DeliveryLocation
}

export async function fetchDeliveryLocation(parcelId: string) {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .eq('parcel_id', parcelId)
    .maybeSingle()

  if (error) throw error
  return (data as DeliveryLocation | null) ?? null
}

// 注意: parcelId は呼び出し側で UUID 形式を保証すること（filter に文字列補間するため）。
export function subscribeDeliveryLocation(
  parcelId: string,
  onChange: DeliveryLocationSubscriber,
) {
  const channel = supabase
    .channel(`delivery_locations:${parcelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'delivery_locations',
        filter: `parcel_id=eq.${parcelId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onChange(null)
          return
        }
        onChange(payload.new as DeliveryLocation)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
