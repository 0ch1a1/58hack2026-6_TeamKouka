export type Role = 'recipient' | 'agent' | 'driver';

export type ParcelStatus =
  | 'pending'
  | 'waiting'
  | 'matched'
  | 'stored'
  | 'delivering'
  | 'completed';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
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
