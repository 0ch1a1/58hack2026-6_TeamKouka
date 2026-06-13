import { useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import { colors } from '../../lib/theme';
import { validatePassword, signUpWithProfile } from '../../lib/auth';
import { PrimaryButton } from '../../components/ui';
import { AuthLayout, AuthLogo, AuthTextField, AuthBackLink } from '../../components/auth';

export default function SignUpDriverScreen() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !companyName || !employeeId || !email || !password || !confirmPassword) {
      Alert.alert('入力エラー', 'すべての項目を入力してください。');
      return;
    }
    const passwordError = validatePassword(password, confirmPassword);
    if (passwordError) {
      Alert.alert('入力エラー', passwordError);
      return;
    }

    setLoading(true);
    const result = await signUpWithProfile(email, password, {
      role: 'delivery_company',
      full_name: name,
      company_name: companyName,
      employee_id: employeeId,
    });
    setLoading(false);

    if (result) {
      Alert.alert(result.title, result.message);
    }
  };

  return (
    <AuthLayout centered={false}>
      <AuthBackLink />

      <AuthLogo size="md" />
      <Text style={styles.title}>配達員登録</Text>

      <Text style={styles.sectionLabel}>基本情報</Text>
      <AuthTextField placeholder="お名前" value={name} onChangeText={setName} />

      <Text style={styles.sectionLabel}>所属情報</Text>
      <AuthTextField
        placeholder="配送会社名（例：ヤマト運輸）"
        value={companyName}
        onChangeText={setCompanyName}
      />
      <AuthTextField
        placeholder="社員番号 / ドライバーID"
        value={employeeId}
        onChangeText={setEmployeeId}
        autoCapitalize="none"
      />

      <Text style={styles.sectionLabel}>ログイン情報</Text>
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

      <PrimaryButton
        label="配達員として登録する"
        onPress={handleSignUp}
        loading={loading}
        style={styles.primaryButton}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 28 },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  primaryButton: { height: 52, width: '100%', marginTop: 16, backgroundColor: colors.driver, borderRadius: 12 },
});
