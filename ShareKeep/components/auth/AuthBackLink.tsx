import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';

// 「< 戻る」リンク（左上）。配達員ログイン/登録で使用。
export function AuthBackLink({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.backButton} onPress={onPress ?? (() => router.back())}>
      <Ionicons name="chevron-back" size={20} color={colors.green} />
      <Text style={styles.backText}>戻る</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 24, gap: 2 },
  backText: { fontSize: 14, color: colors.green, fontWeight: '600' },
});
