import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { getMyRole } from '../../../features/auth';
import { colors } from '../../../lib/theme';

// 配達員（delivery_company）画面の Stack。
// ロールガード: delivery_company 以外（recipient/agent が手動遷移した等）はここで弾き、
// 通常ホームへ戻す。(app)/index の「送り込み」だけだと driver 配下に直接入れてしまうため。
export default function DriverLayout() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const role = await getMyRole();
        if (!active) return;
        if (role === 'delivery_company') {
          setAllowed(true);
        } else {
          router.replace('/(app)'); // 非配達員は通常ホームへ
        }
      } catch {
        if (active) router.replace('/(app)'); // 取得失敗時も driver 配下には入れない
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (allowed !== true) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.driver} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
});
