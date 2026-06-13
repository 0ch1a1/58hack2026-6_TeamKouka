import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { PrimaryButton } from '../../components/ui';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('ログイン失敗', 'メールアドレスまたはパスワードが正しくありません。');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <Ionicons name="leaf" size={32} color={colors.green} />
          <Text style={styles.logo}> ShareKeep</Text>
        </View>
        <Text style={styles.subtitle}>近所でキープ、地球に優しく。</Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          placeholderTextColor={colors.grayLight}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード"
          placeholderTextColor={colors.grayLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <PrimaryButton
          label="ログイン"
          onPress={handleSignIn}
          loading={loading}
          style={{ height: 52, width: '100%', marginTop: 8, borderRadius: 12 }}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>アカウントをお持ちでない方は</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={styles.linkText}>新規登録</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-in-driver')}>
          <Text style={styles.driverLinkText}>配達員の方はこちら</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  logo: { fontSize: 36, fontWeight: '800', color: colors.green },
  subtitle: { fontSize: 14, color: colors.gray, marginBottom: 40 },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 4 },
  footerText: { fontSize: 14, color: colors.gray },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.green },
  driverLink: { marginTop: 32 },
  driverLinkText: { fontSize: 12, color: colors.grayLight, textDecorationLine: 'underline' },
});
