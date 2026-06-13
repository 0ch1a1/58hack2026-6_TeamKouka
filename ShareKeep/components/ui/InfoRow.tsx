import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

// 「ラベル : 値」の1行。delivery-complete で使用（pickup-ready 等にも展開予定）。
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: colors.gray, width: 72 },
  value: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
});
