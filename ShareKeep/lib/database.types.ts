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
  // 機能7': 代理人の顔写真（任意）。Storage `agent-avatars` のオブジェクトパス。null=未設定（オプトアウト）。
  avatar_url: string | null;
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
  // 機能6: 保管期限。delivered_to_agent 遷移時に DBトリガが started/deadline を自動セット。
  storage_started_at: string | null;
  storage_deadline_at: string | null;
  storage_overdue_notified_at: string | null;
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

// 機能8: 簡易トラブル報告。報告記録のみ（責任判定・補償は対象外）。
export type SupportCategory = 'damaged' | 'opened' | 'wet' | 'overdue' | 'lost' | 'other';
export type SupportReportStatus = 'open' | 'reviewing' | 'resolved';

export interface SupportReport {
  id: string;
  parcel_id: string | null;
  reporter_id: string | null;
  category: SupportCategory | string;
  status: SupportReportStatus | string;
  note: string | null;
  created_at: string;
}

// 機能8: 配達員ライブ位置トラッキング（ダミー座標＋Realtime）
export interface DeliveryLocation {
  parcel_id: string;
  lat: number | null;
  lng: number | null;
  progress: number;        // 0..100
  updated_at: string;
}

// 機能9: 追記専用監査ログ（append-onlyハッシュチェーン）
export type ParcelEventType =
  | 'registered'
  | 'absence_reported'
  | 'matched'
  | 'handoff_primary'
  | 'handoff_secondary'
  | 'completed';

export interface ParcelEvent {
  id: string;
  parcel_id: string | null;
  event_type: ParcelEventType | string;
  actor_id: string | null;
  client_event_id: string;
  payload_text: string;
  payload: Record<string, unknown> | null;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}
