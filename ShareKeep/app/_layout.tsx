import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/(app)');
      } else {
        router.replace('/(auth)/sign-in');
      }
    });

    // 画面遷移はサインイン/サインアウトの確定イベントのみで行う。
    // TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION では replace しない
    // （初期遷移は上の getSession が担当。毎イベントで /(app) に戻すと、
    //   driver サブルートや代理人画面操作中にトークン更新で巻き戻る）。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/(app)');
      } else if (event === 'SIGNED_OUT') {
        router.replace('/(auth)/sign-in');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
