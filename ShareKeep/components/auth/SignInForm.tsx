import { useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import { signIn } from '../../features/auth';
import { colors } from '../../lib/theme';
import { PrimaryButton } from '../ui';
import { AuthLogo } from './AuthLogo';
import { AuthTextField } from './AuthTextField';

// 受取人 / 配達員 共通のサインインフォーム。
// ロゴ・サブタイトル・入力欄・ログインボタンまでを担当する。
// 戻るリンク / フッターリンク / 「配達員はこちら」などの差分は
// header / footer スロット（親が制御）で出し分ける。
export function SignInForm({
  variant = 'recipient',
  subtitle,
  header,
  footer,
}: {
  variant?: 'recipient' | 'driver';
  subtitle: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
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
    <>
      {header}

      <AuthLogo size="lg" />
      <Text style={variant === 'driver' ? styles.subtitleDriver : styles.subtitle}>{subtitle}</Text>

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

      <PrimaryButton
        label="ログイン"
        onPress={handleSignIn}
        loading={loading}
        style={[styles.primaryButton, variant === 'driver' && styles.primaryButtonDriver]}
      />

      {footer}
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.gray, marginBottom: 40 },
  subtitleDriver: { fontSize: 16, fontWeight: '600', color: colors.gray, marginBottom: 40 },
  primaryButton: { height: 52, width: '100%', marginTop: 8, borderRadius: 12 },
  primaryButtonDriver: { backgroundColor: colors.driver },
});
