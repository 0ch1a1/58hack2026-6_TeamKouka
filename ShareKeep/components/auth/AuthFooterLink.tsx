import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

// 「○○の方は [リンク]」フッター行。
export function AuthFooterLink({
  prompt,
  linkLabel,
  onPress,
}: {
  prompt: string;
  linkLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{prompt}</Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.linkText}>{linkLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 4 },
  footerText: { fontSize: 14, color: colors.gray },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.green },
});
