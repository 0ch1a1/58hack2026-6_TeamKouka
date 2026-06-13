// バックエンド連携層（移植）。全 API を一括移植している。
// このファイルはドメイン別モジュール（parcels-types / parcels-recipient /
// parcels-driver / parcels-agent）を束ねる薄い barrel。公開シンボル集合を
// 分割前と完全一致させ、既存 importer（app 画面・テスト等）と
// features/notifications.ts の re-export を一切変更不要に保つ。
//
// STAGE B(Wave1〜2) で実際に使うのは:
//   createParcel / fetchMyParcels / subscribeParcel / matchNearbyAgent /
//   findNearbyAgents / updateParcelStatus / generateQrToken / verifyRecipientQr /
//   verifyAgentQr / geocodeAgentAddress / fetchMyNotifications / markNotificationRead
// 下記は B 計画(Wave1)では未参照・B以降/将来用（消さず残置）:
//   createDeliveryCompany / updateDeliveryCompany / deleteDeliveryCompany /
//   listDeliveryCompanies / getAgentLocations / consumeAgentPoints /
//   recordAgentDeliveryCompletion / assignAgentToParcel / upsertAgentProfile

// 型定義（ParcelStatus は database.types.ts を唯一の正とする / A4）
export type {
  ParcelStatus,
  Parcel,
  DriverParcel,
  NearbyAgent,
  AppNotification,
} from './parcels-types'

// 受取人（recipient）向け API
export {
  createParcel,
  fetchMyParcels,
  fetchParcel,
  subscribeParcel,
  matchNearbyAgent,
  assignAgentToParcel,
  upsertRecipientProfile,
  fetchRecipientHome,
  fetchRecipientCoordinates,
} from './parcels-recipient'

// 配達員（delivery_company）向け API
export {
  fetchDriverParcels,
  startDelivery,
  reportDeliveryFailed,
  updateParcelStatus,
} from './parcels-driver'

// 代理人（agent）・配送会社管理・通知 API
export {
  generateQrToken,
  verifyAgentQr,
  verifyRecipientQr,
  findNearbyAgents,
  upsertAgentProfile,
  geocodeAgentAddress,
  getAgentLocations,
  consumeAgentPoints,
  recordAgentDeliveryCompletion,
  createDeliveryCompany,
  updateDeliveryCompany,
  deleteDeliveryCompany,
  listDeliveryCompanies,
  fetchMyNotifications,
  markNotificationRead,
} from './parcels-agent'
