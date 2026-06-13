import {
  parseTimeToMinutes,
  distanceScore,
  reliabilityScore,
  availabilityScore,
  scoreAgent,
  factorsFromBreakdown,
  type ScoringAgentInput,
  type ScoringClock,
} from '../scoring';
import { DISTANCE_MAX_M, AVAILABILITY_FLOOR } from '../scoring.config';

const baseAgent: ScoringAgentInput = {
  availableDays: ['mon'],
  startTime: '09:00',
  endTime: '17:00',
  level: 0,
  completedDeliveries: 0,
  distanceMeters: null,
};

// 月曜(getDay=1)。
const monday = (minutes: number): ScoringClock => ({ dayOfWeek: 1, minutesOfDay: minutes });

describe('parseTimeToMinutes', () => {
  it('HH:MM を分換算する', () => {
    expect(parseTimeToMinutes('09:30')).toBe(9 * 60 + 30);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });
  it('HH:MM:SS も受ける', () => {
    expect(parseTimeToMinutes('17:00:00')).toBe(17 * 60);
  });
  it('不正値は null', () => {
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('abc')).toBeNull();
  });
});

describe('distanceScore', () => {
  it('距離0で1、MAX以上で0', () => {
    expect(distanceScore(0)).toBe(1);
    expect(distanceScore(DISTANCE_MAX_M)).toBe(0);
    expect(distanceScore(DISTANCE_MAX_M + 5000)).toBe(0);
  });
  it('中間は線形', () => {
    expect(distanceScore(DISTANCE_MAX_M / 2)).toBeCloseTo(0.5, 5);
  });
  it('距離不明は0', () => {
    expect(distanceScore(null)).toBe(0);
    expect(distanceScore(undefined)).toBe(0);
    expect(distanceScore(NaN)).toBe(0);
  });
});

describe('reliabilityScore', () => {
  it('実績10件以上 + level5以上で1', () => {
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: 10, level: 5 })).toBeCloseTo(1, 5);
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: 50, level: 9 })).toBeCloseTo(1, 5);
  });
  it('実績0 level0 で0', () => {
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: 0, level: 0 })).toBe(0);
  });
  it('null は0扱い', () => {
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: null, level: null })).toBe(0);
  });
  it('実績寄与0.7・level寄与0.3で合成', () => {
    // completed=10(満点), level=0 → 0.7
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: 10, level: 0 })).toBeCloseTo(0.7, 5);
    // completed=0, level=5(満点) → 0.3
    expect(reliabilityScore({ ...baseAgent, completedDeliveries: 0, level: 5 })).toBeCloseTo(0.3, 5);
  });
});

describe('availabilityScore', () => {
  it('曜日が含まれないと0', () => {
    const agent = { ...baseAgent, availableDays: ['tue'] };
    expect(availabilityScore(agent, monday(12 * 60))).toBe(0);
  });
  it('窓外は0', () => {
    expect(availabilityScore(baseAgent, monday(8 * 60))).toBe(0); // 08:00 < 09:00
    expect(availabilityScore(baseAgent, monday(18 * 60))).toBe(0); // 18:00 > 17:00
  });
  it('窓中心(13:00)で最高、端でフロア', () => {
    const center = availabilityScore(baseAgent, monday(13 * 60)); // 09-17 の中心
    expect(center).toBeCloseTo(1, 5);
    const edge = availabilityScore(baseAgent, monday(9 * 60)); // 開始端
    expect(edge).toBeCloseTo(AVAILABILITY_FLOOR, 5);
  });
  it('深夜跨ぎ(22:00-05:00)を別枝で扱う', () => {
    const night = { ...baseAgent, startTime: '22:00', endTime: '05:00' };
    // 月曜の 23:00 は窓内
    expect(availabilityScore(night, monday(23 * 60))).toBeGreaterThan(0);
    // 月曜の 03:00 も窓内
    expect(availabilityScore(night, monday(3 * 60))).toBeGreaterThan(0);
    // 月曜の 12:00 は窓外
    expect(availabilityScore(night, monday(12 * 60))).toBe(0);
    // 中心(=深夜1:30付近)で最高
    const mid = availabilityScore(night, monday(90)); // 01:30
    expect(mid).toBeCloseTo(1, 1);
  });
  it('時刻が不正なら0', () => {
    expect(availabilityScore({ ...baseAgent, startTime: null }, monday(12 * 60))).toBe(0);
  });
  it('英/日表記どちらの曜日も判定', () => {
    const jp = { ...baseAgent, availableDays: ['月'] };
    expect(availabilityScore(jp, monday(13 * 60))).toBeGreaterThan(0);
  });
});

describe('scoreAgent', () => {
  it('全因子満点で100点・factorsも返す', () => {
    const agent: ScoringAgentInput = {
      availableDays: ['mon'],
      startTime: '09:00',
      endTime: '17:00',
      level: 5,
      completedDeliveries: 10,
      distanceMeters: 0,
    };
    const r = scoreAgent(agent, monday(13 * 60));
    expect(r.total).toBe(100);
    expect(r.factors.distance).toBeCloseTo(1, 5);
    expect(r.factors.availability).toBeCloseTo(1, 5);
    expect(r.factors.reliability).toBeCloseTo(1, 5);
  });
  it('全因子0で0点', () => {
    const agent: ScoringAgentInput = {
      availableDays: ['tue'],
      startTime: '09:00',
      endTime: '17:00',
      level: 0,
      completedDeliveries: 0,
      distanceMeters: DISTANCE_MAX_M,
    };
    expect(scoreAgent(agent, monday(13 * 60)).total).toBe(0);
  });
  it('total は 0–100 にクランプされる', () => {
    const r = scoreAgent({ ...baseAgent, distanceMeters: -100, level: 99, completedDeliveries: 999 });
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });
});

describe('factorsFromBreakdown', () => {
  it('既知キーを3因子に集約', () => {
    const f = factorsFromBreakdown({
      distance_score: 0.8,
      time_score: 0.6,
      day_match: 1,
      experience: 0.5,
      level_score: 0.5,
      capacity_score: 0.5,
    });
    expect(f.distance).toBeCloseTo(0.8, 5);
    expect(f.availability).toBeCloseTo(0.8, 5); // (0.6+1)/2
    expect(f.reliability).toBeCloseTo(0.5, 5);
  });
  it('欠損キーは0', () => {
    const f = factorsFromBreakdown({ distance_score: 0.9 });
    expect(f.distance).toBeCloseTo(0.9, 5);
    expect(f.availability).toBe(0);
    expect(f.reliability).toBe(0);
  });
  it('0–1にクランプ', () => {
    const f = factorsFromBreakdown({ distance_score: 1.5 });
    expect(f.distance).toBe(1);
  });
});
