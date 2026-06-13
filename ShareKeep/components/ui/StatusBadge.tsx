import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ステータス表示のピル型バッジ。色は呼び出し側から指定。
export function StatusBadge({
  label,
  color,
  bg,
  icon,
}: {
  label: string;
  color: string;
  bg: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 11, fontWeight: '600' },
});
