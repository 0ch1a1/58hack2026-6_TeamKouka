// デモ用モックデータの共通定義。
// agent/parcels.tsx と driver/scan.tsx が同じトークン形式を参照することで
// QR表示→スキャンのデモフローを Edge Function なしで動作させる。

export const MOCK_PARCEL_IDS = ['mock-parcel-1', 'mock-parcel-2'] as const;

/** モックparcelIDか判定 */
export function isMockParcelId(parcelId: string): boolean {
  return parcelId.startsWith('mock-');
}

/** モックQRトークンを生成 */
export function buildMockQrToken(trackingNo: string): string {
  return `DEMO:${trackingNo}`;
}

/** デモ用QRトークンか判定（配達員スキャン画面で使用） */
export function isDemoQrToken(token: string): boolean {
  return token.startsWith('DEMO:');
}

/** モック荷物の静的情報（受取人画面でのデモ表示用） */
export const MOCK_PARCEL_INFO: Record<string, {
  trackingNo: string;
  agentName: string;
  agentAddress: string;
  agentFloor: string;
  deadlineAt: string;
}> = {
  'mock-parcel-1': {
    trackingNo: 'PK20260614DEMO1',
    agentName: '田中 一郎',
    agentAddress: '東京都渋谷区神宮前1-1-1',
    agentFloor: '203号室',
    deadlineAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  'mock-parcel-2': {
    trackingNo: 'PK20260614DEMO2',
    agentName: '田中 一郎',
    agentAddress: '東京都渋谷区神宮前1-1-1',
    agentFloor: '203号室',
    deadlineAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
};
