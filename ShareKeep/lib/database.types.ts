// バックエンド user_role enum と一致（A4）。'driver' は廃止 → 'delivery_company'
export type Role = 'recipient' | 'agent' | 'delivery_company';

// バックエンド parcel_status enum と一致（A4）。UI 3状態への変換は lib/status.ts を使う
export type ParcelStatus =
  | 'created'
  | 'out_for_delivery'
  | 'delivery_failed'
  | 'agent_assigned'
  | 'delivered_to_agent'
  | 'handed_to_recipient'
  | 'completed';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  company_name: string | null;
  employee_id: string | null;
  created_at: string;
}

export interface AgentProfile {
  user_id: string;
  address: string | null;
  location: unknown | null;
  available_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  level: number | null;
  points: number | null;
  completed_deliveries: number | null;
}

export interface Parcel {
  id: string;
  tracking_no: string;
  recipient_id: string | null;
  delivery_company_id: string | null;
  assigned_agent_id: string | null;
  status: ParcelStatus | null;
  retry_count: number | null;
  co2_saved_kg: number | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryMatch {
  id: string;
  parcel_id: string | null;
  recipient_id: string | null;
  agent_id: string | null;
  distance_meters: number | null;
  status: string | null;
  created_at: string;
}

export interface QrToken {
  id: string;
  parcel_id: string | null;
  user_id: string | null;
  qr_type: string;
  token: string;
  expires_at: string;
  used: boolean | null;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  user_id: string | null;
  points: number;
  transaction_type: string;
  created_at: string;
}

export interface Co2ReductionLog {
  id: string;
  parcel_id: string | null;
  retry_saved: number | null;
  co2_saved_kg: number | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  user_id: string | null;
  achievement_type: string;
  created_at: string;
}

export interface DeliveryCompany {
  id: string;
  name: string;
  created_at: string;
}
