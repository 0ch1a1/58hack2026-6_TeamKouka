import type { ParcelStatus } from '../lib/database.types'

// parcels ドメインの共通型定義。
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
  // 機能6: 保管期限（delivered_to_agent 遷移時に DBトリガが自動セット）。
  storage_started_at?: string | null
  storage_deadline_at?: string | null
  storage_overdue_notified_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  // fetchMyParcels の JOIN で取得する表示名（A3拡張）
  delivery_companies?: { name: string } | null
  assigned_agent?: { full_name: string | null } | null
}

// 配達員リストに表示する荷物。Parcel に受取人名を加えた表示用の型。
export type DriverParcel = Parcel & {
  recipient?: { full_name: string | null } | null
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
