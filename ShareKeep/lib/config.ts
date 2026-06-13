// デモ用の固定定数（A8）。A0 で remote `zbmrmblakoszzecdnptn` の実在 seed を確認済み。

// 受取人の荷物登録（create_parcel）に必須の delivery_company_id。
// 配送会社選択 UI は作らず、既存 seed の "Test Delivery" を固定で使う。
// 確認: delivery_companies に実在（2026-06-13 時点 / project zbmrmblakoszzecdnptn）。
//
// ⚠️ DB を作り直す・seed が変わるとこの UUID は無効になり、create_parcel が
//    静かに FK エラー（'delivery company not found'）になる。
//    その場合は `supabase db query --linked "select id,name from delivery_companies"` で
//    新しい ID を取得すること。
//
// env `EXPO_PUBLIC_DEMO_DELIVERY_COMPANY_ID` で上書き可能（Expo は EXPO_PUBLIC_
//    プレフィックスの env をクライアントに露出する）。DB 再作成時はコード変更せず
//    env で新 ID を渡せばよい。未設定・空（.env.example をそのままコピーした空値含む）
//    なら下記の既定 UUID にフォールバックする。
//    ※ `??` ではなく `.trim() ||` を使うのは、空文字 '' は nullish ではないため
//      `??` ではフォールバックされず、空 ID が create_parcel に渡って壊れるのを防ぐため。
export const DEMO_DELIVERY_COMPANY_ID =
  process.env.EXPO_PUBLIC_DEMO_DELIVERY_COMPANY_ID?.trim() ||
  'd98697e6-e71d-463f-9d59-a706817db938';
