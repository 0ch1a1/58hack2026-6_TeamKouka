import type { ParcelStatus } from './database.types';

// ===== DB status 定数（バックエンド parcel_status enum・唯一の正）=====
export const PARCEL_STATUS = {
  CREATED: 'created',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERY_FAILED: 'delivery_failed',
  AGENT_ASSIGNED: 'agent_assigned',
  DELIVERED_TO_AGENT: 'delivered_to_agent',
  HANDED_TO_RECIPIENT: 'handed_to_recipient',
  COMPLETED: 'completed',
} as const satisfies Record<string, ParcelStatus>;

// ===== UI 表示ステータス（受取人リストは 3 状態）=====
export type UIStatus = 'waiting' | 'stored' | 'completed';

// 受取人リストは 3 状態に集約する設計のため、複数の DB status が 'waiting' に潰れる。
// 例: created / out_for_delivery / delivery_failed / agent_assigned はすべて 'waiting'。
// → delivery_failed（再配達待ち）も UI 上は「配達待ち」表示になる点は意図的な簡略化。
//   失敗を区別表示したい場合は UIStatus を増やさず、画面側で生 status を併用すること。
export function toUIStatus(s: ParcelStatus | string | null): UIStatus {
  if (s === 'completed' || s === 'handed_to_recipient') return 'completed';
  if (s === 'delivered_to_agent') return 'stored';
  return 'waiting';
}

export const UI_STATUS_LABEL: Record<UIStatus, string> = {
  waiting: '配達待ち',
  stored: '保管中',
  completed: '受取完了',
};

// ===== 遷移判定ヘルパ（B1/B2/B3 は生 status を直接比較するため集約）=====

// 代理人が保管中＝受取人が取りに行ける（matching → pickup-ready の遷移契機）
export function isStoredAtAgent(s: ParcelStatus | string | null): boolean {
  return s === 'delivered_to_agent';
}

// 引き渡し完了（pickup-ready → delivery-complete の遷移契機）。
// A0 裏取り: verify_recipient_qr は completed に直行するが handed_to_recipient も完了扱い。
export function isHandedOff(s: ParcelStatus | string | null): boolean {
  return s === 'handed_to_recipient' || s === 'completed';
}
