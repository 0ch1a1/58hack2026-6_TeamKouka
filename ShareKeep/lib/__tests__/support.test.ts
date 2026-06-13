import type { SupportCategory } from '../database.types';

// supabase はモック。実行時 DB アクセスはしない（型・整形の検証のみ）。
// jest.mock の factory は hoist されるため、out-of-scope 変数を参照できない。
// jest.fn を factory 内で生成し、テストからは mocked module 経由で取り出す。
jest.mock('../supabase', () => {
  const order = jest.fn();
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  const insert = jest.fn();
  const from = jest.fn((_table: string) => ({ insert, select }));
  const getUser = jest.fn();
  return {
    supabase: { auth: { getUser }, from },
    __mocks: { order, eq, select, insert, from, getUser },
  };
});

import {
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
  createSupportReport,
  fetchSupportReports,
} from '../../features/support';

// factory 内で生成した jest.fn を取り出す。
const { order, eq, insert, from, getUser } = (
  jest.requireMock('../supabase') as { __mocks: Record<string, jest.Mock> }
).__mocks;

const EXPECTED: SupportCategory[] = ['damaged', 'opened', 'wet', 'overdue', 'lost', 'other'];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SUPPORT_CATEGORIES', () => {
  it('6 カテゴリを過不足なく持つ', () => {
    expect(SUPPORT_CATEGORIES.map((c) => c.value)).toEqual(EXPECTED);
  });

  it('全カテゴリに非空の日本語ラベルがある', () => {
    for (const c of SUPPORT_CATEGORIES) {
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('value は重複しない', () => {
    const values = SUPPORT_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('supportCategoryLabel', () => {
  it('既知の値を日本語ラベルに変換する', () => {
    expect(supportCategoryLabel('damaged')).toBe('破損');
    expect(supportCategoryLabel('other')).toBe('その他');
  });

  it('未知の値はそのまま返す', () => {
    expect(supportCategoryLabel('unknown')).toBe('unknown');
  });
});

describe('createSupportReport', () => {
  it('reporter_id を埋め、空白メモは null に正規化して insert する', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    insert.mockResolvedValue({ error: null });

    await createSupportReport({ parcelId: 'p-1', category: 'wet', note: '   ' });

    expect(from).toHaveBeenCalledWith('support_reports');
    expect(insert).toHaveBeenCalledWith({
      parcel_id: 'p-1',
      reporter_id: 'u-1',
      category: 'wet',
      note: null,
    });
  });

  it('メモがあれば trim して保持する', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });
    insert.mockResolvedValue({ error: null });

    await createSupportReport({ parcelId: 'p-2', category: 'damaged', note: '  箱が潰れていた  ' });

    expect(insert).toHaveBeenCalledWith({
      parcel_id: 'p-2',
      reporter_id: 'u-2',
      category: 'damaged',
      note: '箱が潰れていた',
    });
  });

  it('未ログインなら throw する', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      createSupportReport({ parcelId: 'p-3', category: 'lost' }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it('insert エラーを throw する', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-3' } }, error: null });
    insert.mockResolvedValue({ error: new Error('insert failed') });
    await expect(
      createSupportReport({ parcelId: 'p-4', category: 'opened' }),
    ).rejects.toThrow('insert failed');
  });
});

describe('fetchSupportReports', () => {
  it('parcel_id でフィルタし created_at 降順で取得する', async () => {
    const rows = [{ id: 'r-1' }];
    order.mockResolvedValue({ data: rows, error: null });

    const result = await fetchSupportReports('p-9');

    expect(from).toHaveBeenCalledWith('support_reports');
    expect(eq).toHaveBeenCalledWith('parcel_id', 'p-9');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toBe(rows);
  });

  it('data が null なら空配列を返す', async () => {
    order.mockResolvedValue({ data: null, error: null });
    expect(await fetchSupportReports('p-0')).toEqual([]);
  });

  it('エラーを throw する', async () => {
    order.mockResolvedValue({ data: null, error: new Error('select failed') });
    await expect(fetchSupportReports('p-x')).rejects.toThrow('select failed');
  });
});
