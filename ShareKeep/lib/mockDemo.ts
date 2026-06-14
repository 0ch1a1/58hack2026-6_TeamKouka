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
