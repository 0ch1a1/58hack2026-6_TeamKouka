// デモ用の固定定数（A8）。A0 で remote `zbmrmblakoszzecdnptn` の実在 seed を確認済み。

// 受取人の荷物登録（create_parcel）に必須の delivery_company_id。
// 配送会社選択 UI は作らず、既存 seed の "Test Delivery" を固定で使う。
// 確認: delivery_companies に実在（2026-06-13 時点 / project zbmrmblakoszzecdnptn）。
//
// ⚠️ DB を作り直す・seed が変わるとこの UUID は無効になり、create_parcel が
//    静かに FK エラー（'delivery company not found'）になる。
//    その場合は `supabase db query --linked "select id,name from delivery_companies"` で
//    新しい ID を取得し、ここを更新すること。
export const DEMO_DELIVERY_COMPANY_ID = 'd98697e6-e71d-463f-9d59-a706817db938';
