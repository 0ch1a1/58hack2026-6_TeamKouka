import { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { signIn } from '../../features/auth';
import { colors } from '../../lib/theme';
import { PrimaryButton } from '../../components/ui';
import { AuthLayout, AuthLogo, AuthTextField, AuthFooterLink } from '../../components/auth';

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
      <AuthLogo size="lg" />
      <Text style={styles.subtitle}>近所でキープ、地球に優しく。</Text>

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
        linkLabel="新規登録"
        onPress={() => router.push('/(auth)/sign-up')}
      />

      <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-in-driver')}>
        <Text style={styles.driverLinkText}>配達員の方はこちら</Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.gray, marginBottom: 40 },
  driverLink: { marginTop: 32 },
  driverLinkText: { fontSize: 12, color: colors.grayLight, textDecorationLine: 'underline' },
  primaryButton: { height: 52, width: '100%', marginTop: 8, borderRadius: 12 },
});
