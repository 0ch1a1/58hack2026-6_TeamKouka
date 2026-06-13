// 機能7' getAgentAvatarUrls のマッピング整形を検証する。supabase は完全モック。
// agent_profiles から (user_id, avatar_url) を取り、createSignedUrls の結果を
// {agentId: signedUrl} に組み直す部分（null/空/失敗の除外、パス->agent 復元）が要点。
// 変数名は jest の hoist 規約により mock* 接頭辞が必要（factory 内から参照するため）。

const mockIn = jest.fn();
const mockSelect = jest.fn(() => ({ in: mockIn }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));
const mockCreateSignedUrls = jest.fn();
const mockStorageFrom = jest.fn((_bucket: string) => ({ createSignedUrls: mockCreateSignedUrls }));

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    storage: { from: (bucket: string) => mockStorageFrom(bucket) },
  },
}));

import { getAgentAvatarUrls } from '../../features/avatar';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAgentAvatarUrls', () => {
  it('空配列なら DB/Storage を呼ばず {} を返す', async () => {
    const result = await getAgentAvatarUrls([]);
    expect(result).toEqual({});
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('avatar_url がパス、署名URLを agentId にひも付けて返す', async () => {
    mockIn.mockResolvedValue({
      data: [
        { user_id: 'a1', avatar_url: 'a1/avatar.jpg' },
        { user_id: 'a2', avatar_url: 'a2/avatar.jpg' },
      ],
      error: null,
    });
    mockCreateSignedUrls.mockResolvedValue({
      data: [
        { path: 'a1/avatar.jpg', signedUrl: 'https://signed/a1', error: null },
        { path: 'a2/avatar.jpg', signedUrl: 'https://signed/a2', error: null },
      ],
      error: null,
    });

    const result = await getAgentAvatarUrls(['a1', 'a2']);

    expect(result).toEqual({ a1: 'https://signed/a1', a2: 'https://signed/a2' });
    expect(mockFrom).toHaveBeenCalledWith('agent_profiles');
    expect(mockIn).toHaveBeenCalledWith('user_id', ['a1', 'a2']);
    expect(mockStorageFrom).toHaveBeenCalledWith('agent-avatars');
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['a1/avatar.jpg', 'a2/avatar.jpg'], 3600);
  });

  it('avatar_url が null/空の行は除外する', async () => {
    mockIn.mockResolvedValue({
      data: [
        { user_id: 'a1', avatar_url: 'a1/avatar.jpg' },
        { user_id: 'a2', avatar_url: null },
        { user_id: 'a3', avatar_url: '' },
      ],
      error: null,
    });
    mockCreateSignedUrls.mockResolvedValue({
      data: [{ path: 'a1/avatar.jpg', signedUrl: 'https://signed/a1', error: null }],
      error: null,
    });

    const result = await getAgentAvatarUrls(['a1', 'a2', 'a3']);

    expect(result).toEqual({ a1: 'https://signed/a1' });
    // 署名対象は実パスのみ
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['a1/avatar.jpg'], 3600);
  });

  it('全員未設定なら署名を呼ばず {} を返す', async () => {
    mockIn.mockResolvedValue({
      data: [{ user_id: 'a1', avatar_url: null }],
      error: null,
    });

    const result = await getAgentAvatarUrls(['a1']);

    expect(result).toEqual({});
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('署名に失敗した item（error あり / signedUrl null）は除外する', async () => {
    mockIn.mockResolvedValue({
      data: [
        { user_id: 'a1', avatar_url: 'a1/avatar.jpg' },
        { user_id: 'a2', avatar_url: 'a2/avatar.jpg' },
      ],
      error: null,
    });
    mockCreateSignedUrls.mockResolvedValue({
      data: [
        { path: 'a1/avatar.jpg', signedUrl: 'https://signed/a1', error: null },
        { path: 'a2/avatar.jpg', signedUrl: null, error: 'not found' },
      ],
      error: null,
    });

    const result = await getAgentAvatarUrls(['a1', 'a2']);

    expect(result).toEqual({ a1: 'https://signed/a1' });
  });

  it('DB エラー時は throw する', async () => {
    mockIn.mockResolvedValue({ data: null, error: new Error('db down') });
    await expect(getAgentAvatarUrls(['a1'])).rejects.toThrow('db down');
  });
});
