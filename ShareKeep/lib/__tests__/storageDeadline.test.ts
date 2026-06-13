import {
  remainingMs,
  formatRemaining,
  isOverdue,
  deadlineState,
  SOON_THRESHOLD_MS,
} from '../storageDeadline';

// 基準現在時刻（固定）。これを now として渡し、deadline を相対指定する。
const NOW = new Date('2026-06-13T12:00:00.000Z');
// NOW から offsetMs ずれた ISO 文字列を作るヘルパ。
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('remainingMs', () => {
  it('null は null を返す', () => {
    expect(remainingMs(null, NOW)).toBeNull();
  });

  it('不正な日付文字列は null を返す', () => {
    expect(remainingMs('not-a-date', NOW)).toBeNull();
  });

  it('未来の期限は正の残りミリ秒', () => {
    expect(remainingMs(at(3 * HOUR), NOW)).toBe(3 * HOUR);
  });

  it('過去の期限は負の残りミリ秒', () => {
    expect(remainingMs(at(-5 * MIN), NOW)).toBe(-5 * MIN);
  });

  it('同時刻はちょうど 0', () => {
    expect(remainingMs(at(0), NOW)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('null は空文字', () => {
    expect(formatRemaining(null, NOW)).toBe('');
  });

  it('不正な日付は空文字', () => {
    expect(formatRemaining('xxx', NOW)).toBe('');
  });

  it('時間と分の両方', () => {
    expect(formatRemaining(at(3 * HOUR + 20 * MIN), NOW)).toBe('残り3時間20分');
  });

  it('ちょうど時間（分=0）は時間のみ', () => {
    expect(formatRemaining(at(2 * HOUR), NOW)).toBe('残り2時間');
  });

  it('1時間未満は分のみ', () => {
    expect(formatRemaining(at(45 * MIN), NOW)).toBe('残り45分');
  });

  it('1分未満（残りわずか）は専用文言', () => {
    expect(formatRemaining(at(30 * 1000), NOW)).toBe('残り1分未満');
  });

  it('超過は「期限超過」', () => {
    expect(formatRemaining(at(-10 * MIN), NOW)).toBe('期限超過');
  });

  it('同時刻（残り0）は「期限超過」', () => {
    expect(formatRemaining(at(0), NOW)).toBe('期限超過');
  });
});

describe('isOverdue', () => {
  it('null は false', () => {
    expect(isOverdue(null, NOW)).toBe(false);
  });

  it('未来は false', () => {
    expect(isOverdue(at(1 * HOUR), NOW)).toBe(false);
  });

  it('過去は true', () => {
    expect(isOverdue(at(-1 * MIN), NOW)).toBe(true);
  });

  it('同時刻（残り0）は true', () => {
    expect(isOverdue(at(0), NOW)).toBe(true);
  });
});

describe('deadlineState', () => {
  it('null は none', () => {
    expect(deadlineState(null, NOW)).toBe('none');
  });

  it('不正な日付は none', () => {
    expect(deadlineState('bad', NOW)).toBe('none');
  });

  it('しきい値より十分先は normal', () => {
    expect(deadlineState(at(5 * HOUR), NOW)).toBe('normal');
  });

  it('しきい値ちょうど（境界）は soon', () => {
    expect(deadlineState(at(SOON_THRESHOLD_MS), NOW)).toBe('soon');
  });

  it('しきい値の僅か内側は soon', () => {
    expect(deadlineState(at(SOON_THRESHOLD_MS - 1), NOW)).toBe('soon');
  });

  it('しきい値の僅か外側は normal', () => {
    expect(deadlineState(at(SOON_THRESHOLD_MS + 1), NOW)).toBe('normal');
  });

  it('残り0（同時刻）は overdue', () => {
    expect(deadlineState(at(0), NOW)).toBe('overdue');
  });

  it('過去は overdue', () => {
    expect(deadlineState(at(-1 * MIN), NOW)).toBe('overdue');
  });
});
