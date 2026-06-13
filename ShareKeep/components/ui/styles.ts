import { StyleSheet } from 'react-native';
import { colors, spacing } from '../../lib/theme';

// 各画面の StyleSheet に重複していたレイアウト/テキストのプリセット集。
// 画面側はこれを import して `style={[presets.screen, ...]}` のように使う（生数値・生hexの再宣言を排除）。
// ※レイアウト微調整は呼び出し側で配列マージして上書きする想定。
export const presets = StyleSheet.create({
  // --- 画面コンテナ ---
  // SafeAreaView 等のルート。各画面の `safe`（flex:1 + 背景）に相当。
  screen: { flex: 1, backgroundColor: colors.bg },
  // ローディング/空状態などの中央寄せコンテナ。各画面の `center` に相当。
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  // --- スクロール/リスト ---
  // ⚠️ paddingTop/paddingBottom は画面ごとに差がある（例: delivery-complete は paddingTop:40、
  // packages のリストは paddingBottom:100）。ここは「標準値」であり、画面別差分は呼び出し側で配列マージ上書きする。
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },

  // --- テキスト ---
  // 画面見出し。実画面の `title`（fontSize:22/700/ink）に相当。marginBottom 等は画面差があるので上書き。
  screenTitle: { fontSize: 22, fontWeight: '700', color: colors.ink },
  // カード内/セクションの小見出し（大文字・字間広め）。`sectionTitle`/`cardSectionTitle` に相当。
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.grayLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { fontSize: 15, color: colors.grayLight },

  // --- モーダル ---
  // ⚠️ 実画面で overlay 濃度(0.5/0.6)・modalTitle の fontSize(16/18)・marginBottom 有無が割れている。
  // ここは多数派を採った標準値。視覚差を保ちたい画面は配列マージで上書きする。
  // 中央表示モーダルの背景オーバーレイ。
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  // 下からせり上がるシート型モーダルの背景オーバーレイ。
  modalOverlaySheet: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  // 中央モーダルの中身。
  modalContentCenter: { backgroundColor: colors.white, borderRadius: 24, padding: 28, alignItems: 'center', gap: spacing.md, width: '80%' },
  // シート型モーダルの中身（下端固定・上角丸）。
  modalContentSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
});
