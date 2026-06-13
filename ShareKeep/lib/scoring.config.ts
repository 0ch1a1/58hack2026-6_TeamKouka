// 代理人スコアリングの重み・パラメータを外出し（デモ中に調整可能に）。
// feature-ideas.md「## 案2 … スコア関数の定義」より:
//   S(a) = 100 * (0.45*T + 0.30*D + 0.25*R)
// T=時間帯マッチ度 / D=距離近接度 / R=実績・信頼。すべて 0–1 に正規化してから合算する。
//
// ここを書き換えるだけで重み・しきい値を変えられる。重みの合計は 1.0 を想定するが、
// scoring.ts 側では合計が 1.0 でなくても 0–100 にクランプして返す（壊れない設計）。

export type ScoringWeights = {
  /** 時間帯マッチ度 T の重み */
  availability: number;
  /** 距離近接度 D の重み */
  distance: number;
  /** 実績・信頼 R の重み */
  reliability: number;
};

export const SCORING_WEIGHTS: ScoringWeights = {
  availability: 0.45,
  distance: 0.3,
  reliability: 0.25,
};

// 距離近接度 D の正規化上限（m）。distance_meters がこの値以上で D=0。
export const DISTANCE_MAX_M = 2000;

// 時間帯マッチ度 T：窓内にいるときの最低保証スコア（窓中心から離れていても下回らない）。
export const AVAILABILITY_FLOOR = 0.5;

// 実績・信頼 R の合成パラメータ。R = COMPLETED*min(done,CAP)/CAP + LEVEL*min(level,LMAX)/LMAX
export const RELIABILITY = {
  completedWeight: 0.7,
  completedCap: 10,
  levelWeight: 0.3,
  levelMax: 5,
} as const;
