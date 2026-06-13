import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../lib/theme';
import { questSteps } from '../../lib/status';
import type { ParcelStatus } from '../../lib/database.types';

// クエスト風ステータスの横並びステップバー（表示専用）。
// 生 ParcelStatus を渡すと questSteps() でマイルストーン配列＋現在地を解決し、
// 完了済み/現在地をハイライトする。内部 status ロジックには触れない。
// 既存 StatusBadge と同様、色は theme(colors) に揃える。
export function QuestStatusBar({ status }: { status: ParcelStatus | string | null }) {
  const { steps, currentIndex } = questSteps(status);

  return (
    <View style={styles.row}>
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const reached = done || active;
        const circleColor = reached ? colors.green : colors.fieldBg;
        const iconColor = reached ? colors.white : colors.grayLight;
        const labelColor = active ? colors.green : reached ? colors.gray : colors.grayLight;

        return (
          <View key={step.key} style={styles.stepWrap}>
            {/* 左側のつなぎ線（先頭以外）。到達済みなら緑。 */}
            {i > 0 && (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: i <= currentIndex ? colors.green : colors.border },
                ]}
              />
            )}
            <View style={styles.step}>
              <View style={[styles.circle, { backgroundColor: circleColor }, active && styles.circleActive]}>
                <Ionicons name={done ? 'checkmark' : step.icon} size={16} color={iconColor} />
              </View>
              <Text style={[styles.label, { color: labelColor }, active && styles.labelActive]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  // つなぎ線。円の中心高さ(14)に合わせて配置。
  connector: { height: 2, flex: 1, marginTop: 14, marginHorizontal: 2 },
  step: { alignItems: 'center', gap: spacing.xs, width: 56 },
  circle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  circleActive: { borderWidth: 2, borderColor: colors.greenDark },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  labelActive: { fontWeight: '700' },
});
