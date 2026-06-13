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

// 受取人の自宅座標（距離の起点 / agent_profiles と対称）。
// migration 20260613140000_recommendation.sql の recipient_profiles に対応。
export interface RecipientProfile {
  user_id: string;
  address: string | null;
  address_detail: string | null;
  location: unknown | null; // geography(Point,4326)。型は不透明（AgentProfile.location と同じ扱い）
  updated_at: string;
}

// 推薦結果ログ（特徴量・スコア・選択/成否ラベル＝再学習の教師データ）。
// 書込は service_role(Python サービス)、選択ラベルは mark_recommendation_chosen で更新。
export interface RecommendationLog {
  id: string;
  parcel_id: string | null;
  recipient_id: string | null;
  candidate_agent_id: string | null;
  features: Record<string, unknown>;
  score: number | null;
  rank: number | null;
  model_version: string | null;
  chosen: boolean;
  outcome: string | null; // 'completed' | 'failed' | null
  created_at: string;
}
