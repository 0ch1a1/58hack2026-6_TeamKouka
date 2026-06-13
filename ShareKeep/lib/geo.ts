// プライバシー段階開示のための位置丸めユーティリティ（geohash ベース）。
// feature-ideas.md「### プライバシー段階開示」より:
//   候補一覧(確定前) … 代理人位置は geohash 丸め（precision 低）＋ラベル
//   確定後           … 詳細を開示
//
// ⚠️ k-匿名性は保証しない。代理人過疎エリアでは 1 セル 1 人が大半で、
//    geohash で丸めても結局その代理人だと特定され得る。本ユーティリティが提供するのは
//    あくまで「確定前は座標解像度を落として表示する」という運用上の段階開示のみで、
//    統計的開示制御（k-匿名性・l-多様性等）は一切満たさない。
//
// 純ロジック（I/O なし）。テスト対象。

import ngeohash from 'ngeohash';

// 開示段階。確定前ほど precision を落とす（粗くする）。
export type DisclosureStage = 'before' | 'proposing' | 'after';

// 段階ごとの geohash precision。precision 6 ≒ 約 1.2km×0.6km 四方、5 ≒ 約 5km 四方。
// 確定前(before)を最も粗く、提案中(proposing)を中間、確定後(after)は丸めない。
export const STAGE_PRECISION: Record<Exclude<DisclosureStage, 'after'>, number> = {
  before: 5,
  proposing: 6,
};

export type LatLng = { latitude: number; longitude: number };

// 緯度経度を指定 precision の geohash へ。
export function encodeGeohash(point: LatLng, precision: number): string {
  return ngeohash.encode(point.latitude, point.longitude, precision);
}

// geohash セルの中心座標を返す（丸め表示用ピン等に使う）。
export function geohashCenter(hash: string): LatLng {
  const { latitude, longitude } = ngeohash.decode(hash);
  return { latitude, longitude };
}

// 緯度経度を「セル中心」に丸めた座標へ（precision で粗さを指定）。
export function roundToCell(point: LatLng, precision: number): LatLng {
  return geohashCenter(encodeGeohash(point, precision));
}

// 住所文字列を段階に応じて開示する。
//   after  … 詳細住所をそのまま返す
//   before/proposing … geohash 丸め由来の概略ラベル（詳細住所は出さない）
// roundedLabel が渡されればそれを優先（例: 町名まで）。無ければ汎用文言。
export function discloseAddress(params: {
  stage: DisclosureStage;
  detailAddress: string | null | undefined;
  roundedLabel?: string | null;
}): string {
  const { stage, detailAddress, roundedLabel } = params;
  if (stage === 'after') {
    return detailAddress?.trim() || 'このエリア';
  }
  if (roundedLabel && roundedLabel.trim()) return roundedLabel.trim();
  // 確定前は詳細住所を出さない。地図上の丸めピンを補う汎用ラベル。
  return stage === 'before' ? 'この付近（おおよそのエリア）' : 'この付近';
}
