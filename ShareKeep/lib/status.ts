import type { ParcelStatus } from './database.types';
import type { Ionicons } from '@expo/vector-icons';

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

// ===== 配達員（delivery_company）用 =====
// 受取人リストは 3 状態に集約するが、配達員は生 status をそのまま見るため
// DB status を 1:1 で日本語化する（toUIStatus とは別物・分離して持つ）。
export const DRIVER_STATUS_LABEL: Record<ParcelStatus, string> = {
  created: '配達前',
  out_for_delivery: '配達中',
  delivery_failed: '不在（代理受付待ち）',
  agent_assigned: '代理人決定',
  delivered_to_agent: '代理人へ受け渡し済み',
  handed_to_recipient: '受取人へ引き渡し済み',
  completed: '完了',
};

// 配達員画面で status に応じて出すアクション種別。画面側の分岐をここに集約。
//   start  : 配達開始（created → out_for_delivery）
//   fail   : 不在報告（out_for_delivery → delivery_failed）
//   match  : 代理人を探す（delivery_failed → agent_assigned）
//   scan   : 代理人QRを読む（agent_assigned → delivered_to_agent）
// 配達員の操作が無い状態（受取人/代理人フェーズ）は空配列を返す。
// 画面側は actions.map(...) するだけでよく、'none' の special-case が不要。
export type DriverAction = 'start' | 'fail' | 'match' | 'scan';

export function driverActionsFor(s: ParcelStatus | string | null): DriverAction[] {
  switch (s) {
    case 'created':
      return ['start'];
    case 'out_for_delivery':
      return ['fail'];
    case 'delivery_failed':
      return ['match'];
    case 'agent_assigned':
      return ['scan'];
    default:
      return [];
  }
}

// ===== クエスト風ステータス表示（UI 表示のみ・内部 status は不変）=====
// 機能①: 生 ParcelStatus(7種) を「クエスト風」の文言/アイコン/色に変換する表示専用マップ。
// toUIStatus（3状態集約）/ DRIVER_STATUS_LABEL（1:1日本語）とは別レイヤで、
// 受取人・代理人・配達員の各画面が共通の遊び心ある表示に寄せるための層。
// 内部の status 遷移ロジックには一切影響しない。
type QuestMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

export const QUEST_STATUS_META: Record<ParcelStatus, QuestMeta> = {
  created:             { label: 'クエスト準備中',           icon: 'sparkles-outline',          color: '#9CA3AF' },
  out_for_delivery:    { label: 'お届けに向かっています',     icon: 'rocket-outline',            color: '#2563EB' },
  delivery_failed:     { label: 'キーパー探索中',           icon: 'search-outline',            color: '#B45309' },
  agent_assigned:      { label: 'キーパー決定！',           icon: 'people-outline',            color: '#7C3AED' },
  delivered_to_agent:  { label: 'ご近所さんが預かり中',       icon: 'home-outline',              color: '#1A7A4C' },
  handed_to_recipient: { label: 'クエストクリア目前！',       icon: 'gift-outline',              color: '#059669' },
  completed:           { label: 'クエストクリア！',          icon: 'trophy-outline',            color: '#059669' },
};

// 生 status → クエスト風ラベル。未知値は無難なフォールバック。
export function questStatusLabel(s: ParcelStatus | string | null): string {
  return QUEST_STATUS_META[s as ParcelStatus]?.label ?? 'クエスト準備中';
}

// 生 status → クエスト風 meta（label/icon/color）。
export function questStatusMeta(s: ParcelStatus | string | null): QuestMeta {
  return QUEST_STATUS_META[s as ParcelStatus] ?? QUEST_STATUS_META.created;
}

// ステップバー用の進行マイルストーン（横並び表示の各段）。
// 7種の生 status を 4 つの物語的マイルストーンに集約する。
//   delivery_failed（再配達待ち）は journey 上は「配達中」段に留める扱い。
//   agent_assigned はまだ受取人の手元に届く前なので「預かり」段の手前＝「配達中」段に含める。
export type QuestStep = {
  key: 'delivery' | 'matched' | 'stored' | 'done';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const QUEST_STEPS: readonly QuestStep[] = [
  { key: 'delivery', label: 'お届け中',   icon: 'rocket-outline' },
  { key: 'matched',  label: 'キーパー決定', icon: 'people-outline' },
  { key: 'stored',   label: '預かり中',   icon: 'home-outline' },
  { key: 'done',     label: 'クリア',     icon: 'trophy-outline' },
] as const;

// 生 status → 現在地のステップ index（0..QUEST_STEPS.length-1）。
// created / out_for_delivery / delivery_failed → 0（お届け中）
// agent_assigned                               → 1（キーパー決定）
// delivered_to_agent                           → 2（預かり中）
// handed_to_recipient / completed              → 3（クリア）
export function questStepIndex(s: ParcelStatus | string | null): number {
  switch (s) {
    case 'agent_assigned':
      return 1;
    case 'delivered_to_agent':
      return 2;
    case 'handed_to_recipient':
    case 'completed':
      return 3;
    default:
      // created / out_for_delivery / delivery_failed / 未知値
      return 0;
  }
}

// ステップ配列と現在地を一括で返すヘルパ（コンポーネントが map するだけで済む）。
export function questSteps(s: ParcelStatus | string | null): {
  steps: readonly QuestStep[];
  currentIndex: number;
} {
  return { steps: QUEST_STEPS, currentIndex: questStepIndex(s) };
}
