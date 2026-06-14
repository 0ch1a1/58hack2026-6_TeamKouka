// アプリ全体で共有するマジックナンバーの集約先（純粋リファクタリング。値は不変）。

// 地図初期表示などで使うフォールバック座標（東京駅周辺）。
// 代理人が居ない／緯度経度が無い時に使う。
export const FALLBACK_LOCATION = {
  latitude: 35.681236,
  longitude: 139.767125,
} as const;

// 候補探索の半径。実機 GPS 誤差で「見つからない」事故を避けるため広めに取る（既存の自動マッチと同値）。
export const SEARCH_RADIUS_M = 5000;
