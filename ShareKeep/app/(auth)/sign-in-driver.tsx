import { useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { signIn } from '../../features/auth';
import { colors } from '../../lib/theme';
import { PrimaryButton } from '../../components/ui';
import { AuthLayout, AuthLogo, AuthTextField, AuthBackLink, AuthFooterLink } from '../../components/auth';

export default function SignInDriverScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
    } catch {
      Alert.alert('ログイン失敗', 'メールアドレスまたはパスワードが正しくありません。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthBackLink />

      <AuthLogo size="lg" />
      <Text style={styles.subtitle}>配達員ログイン</Text>

      <AuthTextField
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <AuthTextField
        placeholder="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <PrimaryButton label="ログイン" onPress={handleSignIn} loading={loading} style={styles.primaryButton} />

      <AuthFooterLink
        prompt="アカウントをお持ちでない方は"
        linkLabel="配達員登録"
        onPress={() => router.push('/(auth)/sign-up-driver')}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 16, fontWeight: '600', color: colors.gray, marginBottom: 40 },
  primaryButton: { height: 52, width: '100%', marginTop: 8, backgroundColor: colors.driver, borderRadius: 12 },
});
