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

// Supabase の to-one 埋め込み（FK 由来）は実行時は単一オブジェクトだが、生成型なしの
// 推論では配列になり得る。両方を許容する型と、単一化する no-op 正規化ヘルパ（PR #79 と同等）。
export type Embed<T> = T | T[] | null | undefined

// to-one 埋め込みが配列推論された場合に先頭要素を取り出す。実行時は単一オブジェクト
// （Array.isArray=false）なので値をそのまま返し、旧挙動と完全に等価。
export const toOne = <T>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

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
