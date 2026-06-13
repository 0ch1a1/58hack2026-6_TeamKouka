// 機能6 保管期限（表示専用）の純ロジック。I/O・DB・status 遷移には一切関与しない。
// 期限列（storage_deadline_at）は DB トリガがサーバ側でセットする。ここでは受け取った値を
// 「残り時間の整形」「超過判定」「表示状態（色分け用）」に変換するだけ。

// soon（残り少なめ＝橙表示）と判定するしきい値。残りがこれ以下で 'soon'。
export const SOON_THRESHOLD_MS = 60 * 60 * 1000; // 1時間

// 表示状態。null→'none'（非表示）, 正常→'normal', 残り1時間以内→'soon', 超過→'overdue'。
export type DeadlineState = 'none' | 'normal' | 'soon' | 'overdue';

// 期限までの残りミリ秒。負値=超過。deadlineAt が null/不正なら null。
// now を省略した場合は現在時刻を使う（テストでは固定 Date を渡す）。
export function remainingMs(deadlineAt: string | null, now: Date = new Date()): number | null {
  if (!deadlineAt) return null;
  const deadline = Date.parse(deadlineAt);
  if (Number.isNaN(deadline)) return null;
  return deadline - now.getTime();
}

// 残り時間の人間向け整形。
//   null（期限なし）→ ''（空文字）
//   残り>0          → 「残り3時間20分」/「残り20分」/「残り1分未満」
//   残り<=0（同時刻含む） → 「期限超過」
export function formatRemaining(deadlineAt: string | null, now: Date = new Date()): string {
  const ms = remainingMs(deadlineAt, now);
  if (ms === null) return '';
  if (ms <= 0) return '期限超過';

  const totalMinutes = Math.floor(ms / (60 * 1000));
  if (totalMinutes < 1) return '残り1分未満';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `残り${hours}時間${minutes}分`;
  if (hours > 0) return `残り${hours}時間`;
  return `残り${minutes}分`;
}

// 期限超過か。同時刻（残り0）も超過扱い。null/不正は false（超過ではない）。
export function isOverdue(deadlineAt: string | null, now: Date = new Date()): boolean {
  const ms = remainingMs(deadlineAt, now);
  if (ms === null) return false;
  return ms <= 0;
}

// 表示状態を返す。バッジの色・文言の出し分けに使う。
//   null/不正 → 'none'
//   残り<=0    → 'overdue'
//   残り<=しきい値 → 'soon'
//   それ以外   → 'normal'
export function deadlineState(deadlineAt: string | null, now: Date = new Date()): DeadlineState {
  const ms = remainingMs(deadlineAt, now);
  if (ms === null) return 'none';
  if (ms <= 0) return 'overdue';
  if (ms <= SOON_THRESHOLD_MS) return 'soon';
  return 'normal';
}
