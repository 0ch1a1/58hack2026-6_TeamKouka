import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../lib/theme';
import { presets } from './styles';

// 空リストのプレースホルダ。各画面の `emptyContainer`（alignItems:center + paddingTop + gap）を置き換える。
// flex:1 / justifyContent は持たせない（FlatList の ListEmptyComponent としても使うため）。
// 全画面中央寄せにしたい場合は呼び出し側で style={[presets.centered, ...]} を合成する。
export function EmptyState({
  message,
  icon,
  style,
}: {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.container, style]}>
      {icon && <Ionicons name={icon} size={40} color={colors.grayLight} />}
      <Text style={presets.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
});
