import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';
import { AuthLayout, AuthFooterLink, SignInForm } from '../../components/auth';

export default function SignInScreen() {
  return (
    <AuthLayout>
      <SignInForm
        variant="recipient"
        subtitle="近所でキープ、地球に優しく。"
        footer={
          <>
            <AuthFooterLink
              prompt="アカウントをお持ちでない方は"
              linkLabel="新規登録"
              onPress={() => router.push('/(auth)/sign-up')}
            />
            <TouchableOpacity style={styles.driverLink} onPress={() => router.push('/(auth)/sign-in-driver')}>
              <Text style={styles.driverLinkText}>配達員の方はこちら</Text>
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
