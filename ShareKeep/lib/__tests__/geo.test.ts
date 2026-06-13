import {
  encodeGeohash,
  geohashCenter,
  roundToCell,
  discloseAddress,
  STAGE_PRECISION,
} from '../geo';

// 東京駅付近の座標。
const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

describe('encodeGeohash', () => {
  it('precision の桁数だけ geohash を返す', () => {
    expect(encodeGeohash(TOKYO, 6)).toHaveLength(6);
    expect(encodeGeohash(TOKYO, 5)).toHaveLength(5);
  });
  it('precision が低いほど粗い（先頭が一致する prefix 関係）', () => {
    const p6 = encodeGeohash(TOKYO, 6);
    const p5 = encodeGeohash(TOKYO, 5);
    expect(p6.startsWith(p5)).toBe(true);
  });
});

describe('geohashCenter / roundToCell', () => {
  it('丸めた座標は元座標の近傍に入る（precision5 で誤差数km以内）', () => {
    const rounded = roundToCell(TOKYO, 5);
    expect(Math.abs(rounded.latitude - TOKYO.latitude)).toBeLessThan(0.05);
    expect(Math.abs(rounded.longitude - TOKYO.longitude)).toBeLessThan(0.05);
  });
  it('precision が高いほど元座標に近づく', () => {
    const coarse = roundToCell(TOKYO, 5);
    const fine = roundToCell(TOKYO, 8);
    const errCoarse = Math.abs(coarse.latitude - TOKYO.latitude);
    const errFine = Math.abs(fine.latitude - TOKYO.latitude);
    expect(errFine).toBeLessThanOrEqual(errCoarse);
  });
  it('geohashCenter は decode 中心を返す', () => {
    const hash = encodeGeohash(TOKYO, 6);
    const center = geohashCenter(hash);
    expect(typeof center.latitude).toBe('number');
    expect(typeof center.longitude).toBe('number');
  });
});

describe('discloseAddress', () => {
  it('after は詳細住所をそのまま開示', () => {
    expect(discloseAddress({ stage: 'after', detailAddress: '東京都千代田区丸の内1-1' })).toBe(
      '東京都千代田区丸の内1-1',
    );
  });
  it('after で詳細が無ければフォールバック', () => {
    expect(discloseAddress({ stage: 'after', detailAddress: null })).toBe('このエリア');
  });
  it('before は詳細住所を出さず概略ラベル', () => {
    expect(discloseAddress({ stage: 'before', detailAddress: '東京都千代田区丸の内1-1' })).not.toContain(
      '丸の内1-1',
    );
  });
  it('before で roundedLabel があれば優先', () => {
    expect(
      discloseAddress({ stage: 'before', detailAddress: '詳細住所', roundedLabel: '500m ほど先' }),
    ).toBe('500m ほど先');
  });
  it('proposing も詳細住所を出さない', () => {
    const out = discloseAddress({ stage: 'proposing', detailAddress: '詳細住所' });
    expect(out).not.toContain('詳細住所');
  });
});

describe('STAGE_PRECISION', () => {
  it('before(確定前)は proposing より粗い', () => {
    expect(STAGE_PRECISION.before).toBeLessThan(STAGE_PRECISION.proposing);
  });
});
