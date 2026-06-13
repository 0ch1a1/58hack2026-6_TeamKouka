import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';
import { AuthLayout, AuthFooterLink, SignUpForm } from '../../components/auth';

export default function SignUpScreen() {
  return (
    <AuthLayout>
      <SignUpForm
        variant="recipient"
        role="recipient"
        title="新規登録"
        submitLabel="登録する"
        footer={
          <>
            <AuthFooterLink
              prompt="すでにアカウントをお持ちの方は"
              linkLabel="ログイン"
              onPress={() => router.back()}
            />
            <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-up-driver')}>
              <Text style={styles.driverLinkText}>配達員として登録する場合はこちら</Text>
            </TouchableOpacity>
          </>
        }
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  driverLink: { marginTop: 32 },
  driverLinkText: { fontSize: 12, color: colors.grayLight, textDecorationLine: 'underline' },
});
