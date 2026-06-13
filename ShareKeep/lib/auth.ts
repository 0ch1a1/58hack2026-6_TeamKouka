import { supabase } from './supabase';
import type { Role } from './database.types';

// パスワードの一致・長さチェック。問題があればユーザー向けメッセージ、無ければ null。
export function validatePassword(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) return 'パスワードが一致しません。';
  if (password.length < 6) return 'パスワードは6文字以上で入力してください。';
  return null;
}

type ProfileFields = {
  role: Role;
  full_name: string;
  company_name?: string;
  employee_id?: string;
};

// サインアップ + profiles へのプロフィール作成をまとめて行う。
// 失敗時は Alert 表示用の { title, message } を返す（成功時は null）。
export async function signUpWithProfile(
  email: string,
  password: string,
  profile: ProfileFields
): Promise<{ title: string; message: string } | null> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message.includes('already registered')) {
      return { title: '登録エラー', message: 'このメールアドレスはすでに登録されています。' };
    }
    return { title: '登録エラー', message: error.message };
  }

  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      ...profile,
    });
    if (profileError) {
      return { title: 'エラー', message: 'プロフィールの作成に失敗しました。' };
    }
  }

  return null;
}
