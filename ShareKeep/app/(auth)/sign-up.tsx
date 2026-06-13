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
        role: 'recipient',
        full_name: name,
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
        <View style={styles.logoRow}>
          <Ionicons name="leaf" size={26} color={colors.green} />
          <Text style={styles.logo}> ShareKeep</Text>
        </View>
        <Text style={styles.title}>新規登録</Text>

        <TextInput
          style={styles.input}
          placeholder="お名前"
          placeholderTextColor={colors.grayLight}
          value={name}
          onChangeText={setName}
        />
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
          label="登録する"
          onPress={handleSignUp}
          loading={loading}
          style={{ height: 52, width: '100%', marginTop: 8, borderRadius: 12 }}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>すでにアカウントをお持ちの方は</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.linkText}>ログイン</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-up-driver')}>
          <Text style={styles.driverLinkText}>配達員として登録する場合はこちら</Text>
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
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  logo: { fontSize: 28, fontWeight: '800', color: colors.green },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 32 },
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
