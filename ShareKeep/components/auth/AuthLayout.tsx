import { KeyboardAvoidingView, ScrollView, Platform, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

// 認証画面共通シェル（KeyboardAvoidingView + 中央寄せ ScrollView）。
// centered=false で縦中央寄せを外す（項目が多い配達員登録向け）。
export function AuthLayout({
  children,
  centered = true,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  centered: { justifyContent: 'center' },
});
