import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../lib/theme';
import { presets } from './styles';

// リストが空のときの中央寄せプレースホルダ。各画面の `center` + `emptyText` の重複を置き換える。
export function EmptyState({
  message,
  icon,
}: {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.container}>
      {icon && <Ionicons name={icon} size={40} color={colors.grayLight} />}
      <Text style={presets.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: 60 },
});
