import { router } from 'expo-router';
import { AuthLayout, AuthBackLink, AuthFooterLink, SignInForm } from '../../components/auth';

export default function SignInDriverScreen() {
  return (
    <AuthLayout>
      <SignInForm
        variant="driver"
        subtitle="配達員ログイン"
        header={<AuthBackLink />}
        footer={
          <AuthFooterLink
            prompt="アカウントをお持ちでない方は"
            linkLabel="配達員登録"
            onPress={() => router.push('/(auth)/sign-up-driver')}
          />
        }
      />
    </AuthLayout>
  );
}
