import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';

// ロゴ行（葉アイコン + ShareKeep）。size='lg'(ログイン)/'md'(登録) で寸法を切替。
export function AuthLogo({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const lg = size === 'lg';
  return (
    <View style={[styles.logoRow, { marginBottom: lg ? 8 : 4 }]}>
      <Ionicons name="leaf" size={lg ? 32 : 26} color={colors.green} />
      <Text style={[styles.logo, { fontSize: lg ? 36 : 28 }]}> ShareKeep</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { fontWeight: '800', color: colors.green },
});
