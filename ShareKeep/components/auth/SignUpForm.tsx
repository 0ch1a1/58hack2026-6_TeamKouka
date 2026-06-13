import { useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import type { Role } from '../../lib/database.types';
import { colors } from '../../lib/theme';
import { validatePassword, signUpWithProfile } from '../../lib/auth';
import { PrimaryButton } from '../ui';
import { AuthLogo } from './AuthLogo';
import { AuthTextField } from './AuthTextField';

// signUpWithProfile に渡す追加プロフィール項目（role / full_name 以外）。
type ExtraProfile = {
  phone?: string;
  company_name?: string;
  employee_id?: string;
};

// 受取人 / 配達員 共通のサインアップフォーム。
// 共通項目（お名前 / メール / パスワード / 確認）と、
// バリデーション（必須・パスワード一致）・signUpWithProfile 呼び出しを担当する。
//
// 配達員固有のフィールド（company_name, employee_id 等）は親が状態を持ち、
// extraFields スロット（お名前の後ろに差し込む）と extraProfile / extraValid で出し分ける。
export function SignUpForm({
  variant = 'recipient',
  role,
  title,
  submitLabel,
  nameSectionLabel,
  loginSectionLabel,
  extraFields,
  extraProfile,
  extraValid,
  header,
  footer,
}: {
  variant?: 'recipient' | 'driver';
  role: Role;
  title: string;
  submitLabel: string;
  // 配達員レイアウト用のセクション見出し（省略時は非表示）。
  nameSectionLabel?: string;
  loginSectionLabel?: string;
  // お名前フィールドの直後に差し込む追加フィールド（所属情報など）。
  extraFields?: React.ReactNode;
  // signUpWithProfile に渡す追加プロフィール項目。
  extraProfile?: ExtraProfile;
  // 追加フィールドが必須を満たすか（false なら必須エラー）。
  extraValid?: boolean;
  // 戻るリンクなど（ロゴより前）。
  header?: React.ReactNode;
  // ログインリンク・配達員リンクなど（送信ボタンより後）。
  footer?: React.ReactNode;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword || extraValid === false) {
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
      role,
      full_name: name,
      ...extraProfile,
    });
    setLoading(false);

    if (result) {
      Alert.alert(result.title, result.message);
    }
  };

  return (
    <>
      {header}

      <AuthLogo size="md" />
      <Text style={[styles.title, variant === 'driver' ? styles.titleDriver : styles.titleRecipient]}>
        {title}
      </Text>

      {nameSectionLabel ? <Text style={styles.sectionLabel}>{nameSectionLabel}</Text> : null}
      <AuthTextField placeholder="お名前" value={name} onChangeText={setName} />

      {extraFields}

      {loginSectionLabel ? <Text style={styles.sectionLabel}>{loginSectionLabel}</Text> : null}
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
        label={submitLabel}
        onPress={handleSignUp}
        loading={loading}
        style={[
          styles.primaryButton,
          variant === 'driver' ? styles.primaryButtonDriver : styles.primaryButtonRecipient,
        ]}
      />

      {footer}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  titleRecipient: { marginBottom: 32 },
  titleDriver: { marginBottom: 28 },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  primaryButton: { height: 52, width: '100%', borderRadius: 12 },
  primaryButtonRecipient: { marginTop: 8 },
  primaryButtonDriver: { marginTop: 16, backgroundColor: colors.driver },
});
