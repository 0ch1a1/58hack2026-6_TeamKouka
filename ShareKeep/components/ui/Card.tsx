import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, cardShadow, radius } from '../../lib/theme';

// 白背景・角丸・標準シャドウのカード。gap や padding は style で上書き可。
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 16,
    gap: 12,
    ...cardShadow,
  },
});
