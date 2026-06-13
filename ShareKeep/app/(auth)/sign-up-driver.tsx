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
    if (password !== confirmPassword) {
      Alert.alert('入力エラー', 'パスワードが一致しません。');
      return;
    }
    if (password.length < 6) {
      Alert.alert('入力エラー', 'パスワードは6文字以上で入力してください。');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setLoading(false);
      if (error.message.includes('already registered')) {
        Alert.alert('登録エラー', 'このメールアドレスはすでに登録されています。');
      } else {
        Alert.alert('登録エラー', error.message);
      }
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        role: 'driver',
        full_name: name,
        company_name: companyName,
        employee_id: employeeId,
      });

      if (profileError) {
        setLoading(false);
        Alert.alert('エラー', 'プロフィールの作成に失敗しました。');
        return;
      }
    }

    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.green} />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>

        <View style={styles.logoRow}>
          <Ionicons name="leaf" size={26} color={colors.green} />
          <Text style={styles.logo}> ShareKeep</Text>
        </View>
        <Text style={styles.title}>配達員登録</Text>

        <Text style={styles.sectionLabel}>基本情報</Text>
        <TextInput
          style={styles.input}
          placeholder="お名前"
          placeholderTextColor={colors.grayLight}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.sectionLabel}>所属情報</Text>
        <TextInput
          style={styles.input}
          placeholder="配送会社名（例：ヤマト運輸）"
          placeholderTextColor={colors.grayLight}
          value={companyName}
          onChangeText={setCompanyName}
        />
        <TextInput
          style={styles.input}
          placeholder="社員番号 / ドライバーID"
          placeholderTextColor={colors.grayLight}
          value={employeeId}
          onChangeText={setEmployeeId}
          autoCapitalize="none"
        />

        <Text style={styles.sectionLabel}>ログイン情報</Text>
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
          placeholder="パスワード（6文字以上）"
          placeholderTextColor={colors.grayLight}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（確認）"
          placeholderTextColor={colors.grayLight}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <PrimaryButton
          label="配達員として登録する"
          onPress={handleSignUp}
          loading={loading}
          style={{ height: 52, width: '100%', marginTop: 16, backgroundColor: colors.driver, borderRadius: 12 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 24,
    gap: 2,
  },
  backText: { fontSize: 14, color: colors.green, fontWeight: '600' },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  logo: { fontSize: 28, fontWeight: '800', color: colors.green },
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
});
