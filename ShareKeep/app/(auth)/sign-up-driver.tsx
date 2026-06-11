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

export default function SignUpDriverScreen() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSignUp = () => {
    if (!name || !companyName || !employeeId || !email || !password || !confirmPassword) {
      Alert.alert('入力エラー', 'すべての項目を入力してください。');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('入力エラー', 'パスワードが一致しません。');
      return;
    }
    // TODO: Supabase 認証と接続（role: 'driver', company_name, employee_id）
    router.replace('/(app)');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#1A7A4C" />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>

        <View style={styles.logoRow}>
          <Ionicons name="leaf" size={26} color="#1A7A4C" />
          <Text style={styles.logo}> ShareKeep</Text>
        </View>
        <Text style={styles.title}>配達員登録</Text>

        <Text style={styles.sectionLabel}>基本情報</Text>
        <TextInput
          style={styles.input}
          placeholder="お名前"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.sectionLabel}>所属情報</Text>
        <TextInput
          style={styles.input}
          placeholder="配送会社名（例：ヤマト運輸）"
          placeholderTextColor="#9CA3AF"
          value={companyName}
          onChangeText={setCompanyName}
        />
        <TextInput
          style={styles.input}
          placeholder="社員番号 / ドライバーID"
          placeholderTextColor="#9CA3AF"
          value={employeeId}
          onChangeText={setEmployeeId}
          autoCapitalize="none"
        />

        <Text style={styles.sectionLabel}>ログイン情報</Text>
        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（6文字以上）"
          placeholderTextColor="#9CA3AF"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（確認）"
          placeholderTextColor="#9CA3AF"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleSignUp}>
          <Text style={styles.primaryButtonText}>配達員として登録する</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#F0FAF4',
  },
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
  backText: {
    fontSize: 14,
    color: '#1A7A4C',
    fontWeight: '600',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A7A4C',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 28,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  primaryButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#4B5563',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
