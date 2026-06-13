import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { deadlineState, formatRemaining, type DeadlineState } from '../lib/storageDeadline';

// 保管期限バッジ（表示専用）。期限値は DB トリガがセットしたものを prop で受け取るだけで、
// fetch や status 遷移には依存しない。deadlineState で色・文言を出し分ける。
// none（=null や不正値）の場合は何も描画しない。
//
// 配色: normal=緑（テーマ色）, soon=橙, overdue=赤。
// テーマ（lib/theme）に橙/赤が無いため、その2色のみここで定義する。
const STATE_STYLE: Record<
  Exclude<DeadlineState, 'none'>,
  { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  normal: { color: colors.green, bg: colors.greenLight, icon: 'time-outline' },
  soon: { color: '#B45309', bg: '#FEF3C7', icon: 'alarm-outline' },
  overdue: { color: '#B91C1C', bg: '#FEE2E2', icon: 'warning-outline' },
};

export function StorageDeadlineBadge({
  deadlineAt,
  now,
}: {
  deadlineAt: string | null;
  now?: Date;
}) {
  const state = deadlineState(deadlineAt, now);
  if (state === 'none') return null;

  const { color, bg, icon } = STATE_STYLE[state];
  // normal は当日中保管の意で「当日中」、それ以外は残り時間/超過文言。
  const label = state === 'normal' ? '当日中' : formatRemaining(deadlineAt, now);

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 11, fontWeight: '600' },
});
