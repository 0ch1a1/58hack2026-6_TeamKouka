// QRデモトークン用ヘルパ。
// agent/parcels.tsx と driver/scan.tsx が同じトークン形式を参照することで
// QR表示→スキャンのデモフローを Edge Function なしで動作させる。

/** モックQRトークンを生成 */
export function buildMockQrToken(trackingNo: string): string {
  return `DEMO:${trackingNo}`;
}

/** デモ用QRトークンか判定（配達員スキャン画面で使用） */
export function isDemoQrToken(token: string): boolean {
  return token.startsWith('DEMO:');
}
