import { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';
import { validatePassword, signUpWithProfile } from '../../lib/auth';
import { PrimaryButton } from '../../components/ui';
import { AuthLayout, AuthLogo, AuthTextField, AuthFooterLink } from '../../components/auth';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('入力エラー', 'すべての項目を入力してください。');
      return;
    }
    const passwordError = validatePassword(password, confirmPassword);
    if (passwordError) {
      Alert.alert('入力エラー', passwordError);
      return;
    }

    setLoading(true);
    const result = await signUpWithProfile(email, password, { role: 'recipient', full_name: name });
    setLoading(false);

    if (result) {
      Alert.alert(result.title, result.message);
    }
  };

  return (
    <AuthLayout>
      <AuthLogo size="md" />
      <Text style={styles.title}>新規登録</Text>

      <AuthTextField placeholder="お名前" value={name} onChangeText={setName} />
      <AuthTextField
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <AuthTextField
        placeholder="パスワード（6文字以上）"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <AuthTextField
        placeholder="パスワード（確認）"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      <PrimaryButton label="登録する" onPress={handleSignUp} loading={loading} style={styles.primaryButton} />

      <AuthFooterLink prompt="すでにアカウントをお持ちの方は" linkLabel="ログイン" onPress={() => router.back()} />

      <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-up-driver')}>
        <Text style={styles.driverLinkText}>配達員として登録する場合はこちら</Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 32 },
  driverLink: { marginTop: 32 },
  driverLinkText: { fontSize: 12, color: colors.grayLight, textDecorationLine: 'underline' },
  primaryButton: { height: 52, width: '100%', marginTop: 8, borderRadius: 12 },
});
