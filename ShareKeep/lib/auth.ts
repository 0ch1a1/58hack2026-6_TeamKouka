import { supabase } from './supabase';
import type { Role } from './database.types';
import { signUpRecipient, upsertProfile, getErrorMessage } from '../features/auth';

// パスワードの一致・長さチェック。問題があればユーザー向けメッセージ、無ければ null。
export function validatePassword(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) return 'パスワードが一致しません。';
  if (password.length < 6) return 'パスワードは6文字以上で入力してください。';
  return null;
}

type ProfileFields = {
  role: Role;
  full_name: string;
  phone?: string;
  company_name?: string;
  employee_id?: string;
};

// サインアップ + プロフィール作成をまとめて行う。
// profiles 行は auth トリガーが自動作成するため、直接 insert はしない。
// recipient は features/auth の signUpRecipient を利用。
// delivery_company は metadata 経由でプロフィール項目を渡し、
// company_name / employee_id など追加項目は upsertProfile で確実に永続化する。
// 失敗時は Alert 表示用の { title, message } を返す（成功時は null）。
export async function signUpWithProfile(
  email: string,
  password: string,
  profile: ProfileFields
): Promise<{ title: string; message: string } | null> {
  try {
    if (profile.role === 'recipient') {
      await signUpRecipient({
        email,
        password,
        fullName: profile.full_name,
        phone: profile.phone,
      });
      return null;
    }

    // delivery_company（および他ロール）: メタデータでプロフィール項目を渡す。
    // signUpRecipient のパターンをミラーする。
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: profile.role,
          full_name: profile.full_name,
          phone: profile.phone ?? null,
          company_name: profile.company_name ?? null,
          employee_id: profile.employee_id ?? null,
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('Failed to create user');

    // トリガーが設定しない追加項目（company_name / employee_id）を確実に永続化する。
    if (profile.company_name || profile.employee_id) {
      await upsertProfile({
        id: data.user.id,
        role: profile.role,
        fullName: profile.full_name,
        phone: profile.phone,
        companyName: profile.company_name,
        employeeId: profile.employee_id,
      });
    }

    return null;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('already registered')) {
      return { title: '登録エラー', message: 'このメールアドレスはすでに登録されています。' };
    }
    return { title: '登録エラー', message };
  }
}
