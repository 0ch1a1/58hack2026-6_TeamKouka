import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';

// 戻るボタン + 中央タイトル + 右スペーサー。全画面で重複していたヘッダー。
export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack ?? (() => router.back())} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.green} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.ink },
  right: { width: 36 },
});
