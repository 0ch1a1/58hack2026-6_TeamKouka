// 代理人スコアリング（ルールベース・説明可能）。
// feature-ideas.md「## 案2 … スコア関数の定義」を実装:
//   S(a) = 100 * (0.45*T + 0.30*D + 0.25*R)
// 「予測」「最適化」ではなく、自己申告データ（available_days/start_time/end_time）と
// 距離・実績の重み付き合算。各因子(0–1)を内訳として返し UI でバー表示できるようにする。
//
// 純ロジック（副作用なし・I/O なし）。テスト対象。

import {
  SCORING_WEIGHTS,
  DISTANCE_MAX_M,
  AVAILABILITY_FLOOR,
  RELIABILITY,
} from './scoring.config';

// スコアの算出に必要な代理人入力。database.types.ts の AgentProfile 実在カラムに対応:
//   available_days(text[]) / start_time / end_time / level / completed_deliveries
// 距離は delivery_matches.distance_meters（または location 計算）由来。
export type ScoringAgentInput = {
  availableDays: string[] | null;
  startTime: string | null; // 'HH:MM' or 'HH:MM:SS'
  endTime: string | null;
  level: number | null;
  completedDeliveries: number | null;
  distanceMeters: number | null;
};

// 評価時刻（既定は現在時刻）。曜日と分換算時刻を切り出す。
export type ScoringClock = {
  // 0=日, 1=月, ... 6=土（Date.getDay と同じ）
  dayOfWeek: number;
  // 0–1439（h*60+m）
  minutesOfDay: number;
};

export type ScoreFactors = {
  /** 距離近接度 D (0–1) */
  distance: number;
  /** 時間帯マッチ度 T (0–1) */
  availability: number;
  /** 実績・信頼 R (0–1) */
  reliability: number;
};

export type ScoreResult = {
  /** 総合スコア 0–100 */
  total: number;
  factors: ScoreFactors;
};

// 曜日 index → available_days に入りうる表記の候補。
// 自己申告データは英語(mon/monday)・日本語(月)どちらの可能性もあるため両対応で緩く判定。
const DAY_ALIASES: string[][] = [
  ['sun', 'sunday', '日', '日曜', '日曜日'],
  ['mon', 'monday', '月', '月曜', '月曜日'],
  ['tue', 'tuesday', '火', '火曜', '火曜日'],
  ['wed', 'wednesday', '水', '水曜', '水曜日'],
  ['thu', 'thursday', '木', '木曜', '木曜日'],
  ['fri', 'friday', '金', '金曜', '金曜日'],
  ['sat', 'saturday', '土', '土曜', '土曜日'],
];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const nowClock = (date: Date = new Date()): ScoringClock => ({
  dayOfWeek: date.getDay(),
  minutesOfDay: date.getHours() * 60 + date.getMinutes(),
});

// 'HH:MM' / 'HH:MM:SS' を分換算(0–1439)へ。不正値は null。
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// 指定曜日が available_days に含まれるか（英/日表記を緩く判定）。
function isDayAvailable(availableDays: string[] | null, dayOfWeek: number): boolean {
  if (!availableDays || availableDays.length === 0) return false;
  const aliases = DAY_ALIASES[dayOfWeek] ?? [];
  const normalized = availableDays.map((d) => d.trim().toLowerCase());
  return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
}

// 時間帯マッチ度 T (0–1)。
// 現在の曜日が available_days に含まれ、現在時刻が start〜end の窓内なら、
// 窓中心に近いほど高得点（最低 AVAILABILITY_FLOOR でクランプ）。窓外は 0。
// start > end は深夜跨ぎ（例 22:00〜05:00）として別枝で扱う。
export function availabilityScore(agent: ScoringAgentInput, clock: ScoringClock): number {
  if (!isDayAvailable(agent.availableDays, clock.dayOfWeek)) return 0;

  const start = parseTimeToMinutes(agent.startTime);
  const end = parseTimeToMinutes(agent.endTime);
  if (start == null || end == null) return 0;

  const now = clock.minutesOfDay;

  // 窓の長さと「窓内での現在位置」を求める。深夜跨ぎは時間軸を 1440 でラップして連続化。
  let span: number;
  let offset: number; // 窓開始からの経過(分)
  if (start === end) {
    // 24時間対応扱い（同時刻指定）。窓内とみなし中心からの距離は 0。
    span = 1440;
    offset = 720;
  } else if (start < end) {
    // 通常の窓
    if (now < start || now > end) return 0;
    span = end - start;
    offset = now - start;
  } else {
    // 深夜跨ぎ: start > end（例 22:00〜05:00）。now が start..1440 か 0..end のとき窓内。
    const inWindow = now >= start || now <= end;
    if (!inWindow) return 0;
    span = 1440 - start + end;
    offset = now >= start ? now - start : 1440 - start + now;
  }

  if (span <= 0) return AVAILABILITY_FLOOR;

  // 中心(span/2)に近いほど 1、端ほど AVAILABILITY_FLOOR。
  const center = span / 2;
  const distFromCenter = Math.abs(offset - center) / center; // 0(中心)..1(端)
  const score = 1 - (1 - AVAILABILITY_FLOOR) * clamp01(distFromCenter);
  return clamp01(score);
}

// 距離近接度 D (0–1)。D = 1 - min(distance, MAX)/MAX。距離不明は 0（情報なし＝近接寄与なし）。
export function distanceScore(distanceMeters: number | null | undefined): number {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return 0;
  const d = Math.max(0, distanceMeters);
  return clamp01(1 - Math.min(d, DISTANCE_MAX_M) / DISTANCE_MAX_M);
}

// 実績・信頼 R (0–1)。
// R = 0.7 * min(completed,10)/10 + 0.3 * min(level,5)/5
export function reliabilityScore(agent: ScoringAgentInput): number {
  const done = Math.max(0, agent.completedDeliveries ?? 0);
  const level = Math.max(0, agent.level ?? 0);
  const completedPart =
    RELIABILITY.completedWeight * (Math.min(done, RELIABILITY.completedCap) / RELIABILITY.completedCap);
  const levelPart = RELIABILITY.levelWeight * (Math.min(level, RELIABILITY.levelMax) / RELIABILITY.levelMax);
  return clamp01(completedPart + levelPart);
}

// 総合スコア S(a)=100*(0.45T+0.30D+0.25R) と内訳因子。
export function scoreAgent(agent: ScoringAgentInput, clock: ScoringClock = nowClock()): ScoreResult {
  const factors: ScoreFactors = {
    distance: distanceScore(agent.distanceMeters),
    availability: availabilityScore(agent, clock),
    reliability: reliabilityScore(agent),
  };
  const w = SCORING_WEIGHTS;
  const raw =
    100 *
    (w.availability * factors.availability + w.distance * factors.distance + w.reliability * factors.reliability);
  const total = Math.round(Math.max(0, Math.min(100, raw)));
  return { total, factors };
}

// 推薦サービス（recommendation-api）の breakdown（特徴量名→0–1）を、UI 表示用の
// 3 因子（距離近接 / 対応時間 / 実績信頼）に集約する。サービスはモデル次第で
// 特徴量キーが増減するため、既知キーを 3 因子へマップして重複バーを作らない。
//   距離近接   ← distance_score
//   対応時間   ← time_score, day_match の平均（存在するものだけ）
//   実績信頼   ← experience, level_score, capacity_score の平均（存在するものだけ）
const BREAKDOWN_GROUPS: Record<keyof ScoreFactors, string[]> = {
  distance: ['distance_score'],
  availability: ['time_score', 'day_match'],
  reliability: ['experience', 'level_score', 'capacity_score'],
};

export function factorsFromBreakdown(breakdown: Record<string, number>): ScoreFactors {
  const avgOf = (keys: string[]): number => {
    const vals = keys
      .map((k) => breakdown[k])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .map((v) => clamp01(v));
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    distance: avgOf(BREAKDOWN_GROUPS.distance),
    availability: avgOf(BREAKDOWN_GROUPS.availability),
    reliability: avgOf(BREAKDOWN_GROUPS.reliability),
  };
}
