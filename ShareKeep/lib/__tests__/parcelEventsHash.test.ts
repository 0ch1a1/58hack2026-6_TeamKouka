import type { ParcelEvent } from '../database.types';

// expo-crypto は実機/Expo ランタイム依存のため、jest では決定的な純 JS 実装でモックする。
// digestStringAsync を「入力文字列に対し決定的なダイジェストを返す」関数に差し替えることで、
// verifyChain の「再計算 hash と保存 hash の突合」「prev_hash 連鎖」のロジックを検証できる。
// jest.mock の factory は hoist されるため、外部変数を参照せず自己完結で実装する。
jest.mock('expo-crypto', () => {
  // 単純な決定的ハッシュ（FNV-1a 32bit を 16 進表現）。暗号強度は不要で、
  // 「同じ入力 → 同じ出力 / 異なる入力 → 異なる出力（衝突は実用上無視）」だけ満たせばよい。
  const fnv1a = (s: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // 符号なし 32bit を 8 桁 16 進に。
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algo: string, data: string) => fnv1a(data)),
    randomUUID: jest.fn(() => 'mock-uuid'),
  };
});

import { computeHash, verifyChain } from '../parcelEventsHash';

// ParcelEvent の最小ファクトリ。テストで必要なフィールドのみ指定し残りは既定値。
function ev(partial: Partial<ParcelEvent>): ParcelEvent {
  return {
    id: partial.id ?? 'id',
    parcel_id: partial.parcel_id ?? 'parcel-1',
    event_type: partial.event_type ?? 'registered',
    actor_id: partial.actor_id ?? 'actor-1',
    client_event_id: partial.client_event_id ?? 'cev',
    payload_text: partial.payload_text ?? '{}',
    payload: partial.payload ?? null,
    prev_hash: partial.prev_hash ?? null,
    hash: partial.hash ?? '',
    created_at: partial.created_at ?? '2026-06-13T00:00:00.000Z',
  };
}

// 正しいチェーンを構築する。各行の hash を computeHash で確定し、次行の prev_hash に渡す。
async function buildValidChain(count: number): Promise<ParcelEvent[]> {
  const events: ParcelEvent[] = [];
  let prevHash: string | null = null;
  for (let i = 0; i < count; i++) {
    const base = ev({
      id: `id-${i}`,
      parcel_id: 'parcel-1',
      event_type: 'registered',
      actor_id: `actor-${i}`,
      payload_text: `{"i":${i}}`,
      prev_hash: prevHash,
      created_at: `2026-06-13T00:00:0${i}.000Z`,
    });
    const hash = await computeHash({
      prevHash: base.prev_hash,
      parcelId: base.parcel_id,
      eventType: base.event_type,
      actorId: base.actor_id,
      createdAt: base.created_at,
      payloadText: base.payload_text,
    });
    base.hash = hash;
    events.push(base);
    prevHash = hash;
  }
  return events;
}

describe('computeHash', () => {
  it('同じ入力なら決定的に同じ hash を返す', async () => {
    const input = {
      prevHash: null,
      parcelId: 'p',
      eventType: 'registered',
      actorId: 'a',
      createdAt: '2026-06-13T00:00:00.000Z',
      payloadText: '{}',
    };
    const a = await computeHash(input);
    const b = await computeHash(input);
    expect(a).toBe(b);
  });

  it('入力が 1 文字でも変われば hash が変わる', async () => {
    const base = {
      prevHash: null,
      parcelId: 'p',
      eventType: 'registered' as const,
      actorId: 'a',
      createdAt: '2026-06-13T00:00:00.000Z',
      payloadText: '{}',
    };
    const a = await computeHash(base);
    const b = await computeHash({ ...base, payloadText: '{"x":1}' });
    expect(a).not.toBe(b);
  });

  it('prevHash が null と空文字で同じ連結結果になる（先頭の正規化）', async () => {
    const base = {
      parcelId: 'p',
      eventType: 'registered' as const,
      actorId: 'a',
      createdAt: '2026-06-13T00:00:00.000Z',
      payloadText: '{}',
    };
    const withNull = await computeHash({ ...base, prevHash: null });
    const withEmpty = await computeHash({ ...base, prevHash: '' });
    expect(withNull).toBe(withEmpty);
  });
});

describe('verifyChain', () => {
  it('正常なチェーンは全行 OK で firstBrokenIndex は null', async () => {
    const events = await buildValidChain(4);
    const results = await verifyChain(events);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.every((r) => r.firstBrokenIndex === null)).toBe(true);
  });

  it('空配列は空結果を返す', async () => {
    const results = await verifyChain([]);
    expect(results).toEqual([]);
  });

  it('途中の payload を改変すると、その行以降が NG（hash 不一致 ＋ 連鎖 NG）', async () => {
    const events = await buildValidChain(4);
    // index 2 の payload_text を改変。hash は保存値のまま → 再計算と不一致。
    // さらに index 3 の prev_hash は元の index 2 の hash を指すが、改変後の検証では
    // index 2 自身が NG であり、index 3 の prev リンクは元 hash と一致するため、
    // 「最初に壊れた位置」は index 2 になる。
    events[2] = { ...events[2], payload_text: '{"i":999}' };

    const results = await verifyChain(events);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(results[2].ok).toBe(false);
    expect(results.every((r) => r.firstBrokenIndex === 2)).toBe(true);
  });

  it('prev_hash の不整合（連鎖切れ）を検知する', async () => {
    const events = await buildValidChain(3);
    // index 1 の prev_hash を別の値に差し替え（hash 自体は保存値のままなので再計算とは一致するが、
    // prev リンクが index 0 の hash と一致しなくなる）。
    // ただし hash は prev_hash を含めて計算されているため、prev_hash を変えると hash 再計算も
    // 不一致になる。いずれにせよ index 1 が最初に壊れた位置。
    events[1] = { ...events[1], prev_hash: 'tampered-prev' };

    const results = await verifyChain(events);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].firstBrokenIndex).toBe(1);
  });

  it('先頭行の prev_hash が非空だと NG（先頭は null/空であるべき）', async () => {
    const events = await buildValidChain(2);
    // 先頭の prev_hash を非空に。hash は保存値のままだが、先頭の連鎖条件 (null/空) を満たさない。
    events[0] = { ...events[0], prev_hash: 'unexpected' };

    const results = await verifyChain(events);
    expect(results[0].ok).toBe(false);
    expect(results[0].firstBrokenIndex).toBe(0);
  });
});
